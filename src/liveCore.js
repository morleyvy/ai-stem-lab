// «Живой урок»: чистая логика без DOM и сети — статусы учеников, проверка входящих сообщений,
// сводка по классу и симуляция для демонстрации. Отдельно от src/live.js, чтобы проверять
// её тестами в Node (tests/live.test.mjs) без браузера и Supabase.

// Ученик «застрял», если на шаге дольше 2 минут или ошибся на нём дважды:
// за это время учитель ещё успевает помочь, пока ученик не бросил работу.
export const STUCK_MS = 2 * 60 * 1000;
export const STUCK_WRONG = 2;
export const HINT_MAX = 200;
// Забытый незавершённый урок (учитель закрыл вкладку) не должен висеть баннером у класса вечно.
// То же ограничение стоит в политике базы (supabase/005_live_lessons.sql).
export const LIVE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

// Формат id работы — как в ограничении results_lesson_fmt (миграция 003); свои работы 'c-…' тоже подходят.
export const LESSON_ID_RE = /^[a-z0-9_-]{1,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
export const topicFor = (classId) => `live:${classId}`;

// Номер шага «как в карточке шага»: мытьё посуды не считается шагом, на нём держим номер предыдущего.
export function stepNumber(lesson, index) {
  const steps = lesson?.steps ?? [];
  let n = 0;
  for (let i = 0; i <= Math.min(index, steps.length - 1); i++) if (steps[i].type !== 'wash') n++;
  return Math.max(n, 1);
}
export const stepTotal = (lesson) => Math.max((lesson?.steps ?? []).filter((s) => s.type !== 'wash').length, 1);

const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

// ---------- Состояние ученика (Presence) ----------
// Ученик публикует только числа и id — никакого свободного текста: payload видят все в канале,
// и так через него нельзя ни написать однокласснику, ни встроить разметку в экран учителя.
// Имя учитель берёт из своего списка класса (из базы), а не из сообщения ученика.
export function validatePresence(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  if (typeof raw.lesson !== 'string' || !LESSON_ID_RE.test(raw.lesson)) return null;
  const i = int(raw.i, 0, 199);
  const m = int(raw.m, 1, 200);
  const n = int(raw.n, 0, 200);
  const e = int(raw.e, 0, 50);
  if (i === null || m === null || n === null || e === null || n > m) return null;
  if (!['working', 'done'].includes(raw.st)) return null;
  if (raw.ok !== null && typeof raw.ok !== 'boolean') return null;
  if (!Array.isArray(raw.w) || raw.w.length > 30) return null;
  const w = [];
  for (const pair of raw.w) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [si, opt] = [int(pair[0], 0, 199), int(pair[1], 0, 9)];
    if (si === null || opt === null) return null;
    w.push([si, opt]);
  }
  return { v: 1, lesson: raw.lesson, i, n, m, st: raw.st, e, ok: raw.ok, w };
}

// Ход работы ученика → состояние для Presence. События приходят из src/lesson.js (onProgress).
export function createTracker(lesson) {
  const state = { v: 1, lesson: lesson.id, i: 0, n: 1, m: stepTotal(lesson), st: 'working', e: 0, ok: null, w: [] };
  return {
    state,
    apply(event) {
      if (!event || state.st === 'done') return state;
      if (event.type === 'step') {
        state.i = event.index;
        state.n = stepNumber(lesson, event.index);
        state.e = 0;
      } else if (event.type === 'answer') {
        state.ok = Boolean(event.ok);
        if (!event.ok) {
          // Предсказание-гипотеза — не ошибка ученика, а повод обсудить; «застрявшим» его не считаем
          if (event.kind === 'question') state.e = Math.min(state.e + 1, 50);
          if (Number.isInteger(event.opt) && event.opt >= 0 && event.opt <= 9) {
            state.w.push([event.index, event.opt]);
            if (state.w.length > 30) state.w.shift();
          }
        }
      } else if (event.type === 'miss') {
        state.e = Math.min(state.e + 1, 50);
      } else if (event.type === 'finish') {
        state.st = 'done';
        state.n = state.m;
      }
      return state;
    },
  };
}

// ---------- Статус на экране учителя ----------
// seenAt — когда учитель увидел текущий шаг ученика по своим часам: часы ученика могут врать или отставать.
export function computeStatus(state, { seenAt, now, left = false } = {}) {
  if (!state) return left ? 'left' : 'offline';
  if (state.st === 'done') return 'done';
  if (left) return 'left';
  if (state.e >= STUCK_WRONG) return 'stuck';
  if (Number.isFinite(seenAt) && now - seenAt > STUCK_MS) return 'stuck';
  return 'working';
}

// Сводка: сколько подключилось, сколько закончило, средний прогресс и самая частая ошибка.
// students: [{ state, status }]. «Текущий шаг класса» — тот, на котором сейчас больше всего учеников.
export function summarize(students, lesson) {
  const joined = students.filter((s) => s.state);
  const finished = students.filter((s) => s.status === 'done').length;
  const avg = joined.length
    ? Math.round((joined.reduce((sum, s) => sum + (s.state.st === 'done' ? 1 : s.state.n / s.state.m), 0) / joined.length) * 100)
    : 0;
  const active = joined.filter((s) => s.state.st !== 'done');
  const byStep = new Map();
  for (const s of active) byStep.set(s.state.i, (byStep.get(s.state.i) ?? 0) + 1);
  const current = [...byStep.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;

  const wrongAt = (pred) => {
    const counts = new Map();
    for (const s of joined) {
      // Один ученик — один голос за вариант, даже если выбрал его на шаге несколько раз
      const mine = new Set(s.state.w.filter(([i]) => pred(i)).map(([i, opt]) => `${i}:${opt}`));
      for (const k of mine) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (!best) return null;
    const [i, opt] = best[0].split(':').map(Number);
    return { i, n: lesson ? stepNumber(lesson, i) : null, opt, count: best[1] };
  };
  // Вопрос с ошибкой ученики уже прошли, поэтому «текущий шаг» — это ближайший вопрос до него
  const common = current !== null ? wrongAt((i) => i <= current && i >= lastQuestionBefore(lesson, current)) : null;
  return { joined: joined.length, total: students.length, finished, avg, current, common: common ?? wrongAt(() => true) };
}

function lastQuestionBefore(lesson, index) {
  const steps = lesson?.steps ?? [];
  for (let i = Math.min(index, steps.length - 1); i >= 0; i--) if (steps[i].options) return i;
  return 0;
}

// ---------- Подсказки учителя (Broadcast) ----------

// Управляющие символы и лишние пробелы убираем, длину режем: текст видит весь класс.
export function cleanHintText(raw) {
  // eslint-disable-next-line no-control-regex
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, HINT_MAX);
}

// Принимаем подсказку, только если её отправил учитель этого урока (id из базы, а не из сообщения)
// и она адресована всем или именно этому ученику.
export function validateHint(raw, { teacherId, selfId }) {
  if (!raw || typeof raw !== 'object' || !isUuid(teacherId) || raw.from !== teacherId) return null;
  if (raw.to !== null && raw.to !== selfId) return null;
  if (raw.kind === 'nudge') return { kind: 'nudge', text: '', to: raw.to };
  if (raw.kind !== 'text' || typeof raw.text !== 'string' || raw.text.length > HINT_MAX * 2) return null;
  const text = cleanHintText(raw.text);
  return text ? { kind: 'text', text, to: raw.to } : null;
}

// ---------- Демонстрация без учеников ----------
// Правдоподобный класс: разная скорость, кто-то ошибается в вопросах (чаще в одном и том же
// «популярном» неверном варианте — как в жизни), один застрял, один так и не подключился.

// Детерминированный генератор: одно и то же зерно — один и тот же класс (удобно для тестов и записи видео)
export function seededRng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(lesson, { names, now, rng = seededRng() }) {
  const last = lesson.steps.length - 1;
  const students = names.map((name, k) => {
    const uid = `demo-${k + 1}`;
    const tracker = createTracker(lesson);
    const s = { uid, name, tracker, state: null, seenAt: now, left: false, nextAt: now, pace: 7000 + rng() * 11000, acc: 0.55 + rng() * 0.4, stalled: false };
    if (k === names.length - 1) return s; // не подключился
    // Стартуем «посреди урока»: у доски сразу видна разница между учениками
    const start = Math.min(Math.floor(rng() * (last * 0.7)), last - 1);
    for (let i = 0; i <= start; i++) advance(s, lesson, i, rng);
    s.state = tracker.state;
    s.nextAt = now + 2000 + rng() * s.pace;
    return s;
  });
  // Двое с проблемами: один давно стоит на шаге, другой дважды ошибся
  const stalled = students[2];
  if (stalled?.state) {
    stalled.stalled = true;
    stalled.seenAt = now - STUCK_MS - 40_000;
  }
  const struggling = students[5];
  if (struggling?.state) {
    struggling.tracker.apply({ type: 'miss', index: struggling.state.i });
    struggling.tracker.apply({ type: 'miss', index: struggling.state.i });
    struggling.stalled = true;
  }
  const finisher = students[0];
  if (finisher?.state) {
    for (let i = finisher.state.i + 1; i <= last; i++) advance(finisher, lesson, i, rng);
    finisher.tracker.apply({ type: 'finish' });
  }
  return { lesson, students, rng };
}

// Ответ на вопрос текущего шага и переход на шаг index
function advance(s, lesson, index, rng) {
  const prev = lesson.steps[s.tracker.state.i];
  if (prev?.options && s.tracker.state.i !== index) {
    const wrong = prev.options.map((o, i) => (o.ok ? -1 : i)).filter((i) => i >= 0);
    const good = prev.options.findIndex((o) => o.ok);
    const miss = wrong.length > 0 && rng() > s.acc;
    // Первый неверный вариант — «популярная» ошибка, его выбирают чаще остальных
    const opt = miss ? (rng() < 0.7 ? wrong[0] : wrong[Math.floor(rng() * wrong.length)]) : good;
    s.tracker.apply({ type: 'answer', kind: prev.type, index: s.tracker.state.i, opt, ok: !miss });
  }
  s.tracker.apply({ type: 'step', index });
}

export function simTick(sim, now) {
  const last = sim.lesson.steps.length - 1;
  let changed = false;
  for (const s of sim.students) {
    if (!s.state || s.state.st === 'done' || s.stalled || now < s.nextAt) continue;
    const i = s.state.i;
    if (i >= last) {
      s.tracker.apply({ type: 'finish' });
    } else {
      // Иногда ученик берёт не тот реактив — шаг затягивается
      if (sim.rng() < 0.12) s.tracker.apply({ type: 'miss', index: i });
      advance(s, sim.lesson, i + 1, sim.rng);
      s.seenAt = now;
    }
    s.nextAt = now + s.pace * (0.6 + sim.rng() * 0.8);
    changed = true;
  }
  return changed;
}

// Подсказка учителя «помогает»: застрявший через несколько секунд идёт дальше
export function simHint(sim, uid, now) {
  for (const s of sim.students) {
    if (uid && s.uid !== uid) continue;
    if (!s.state || s.state.st === 'done' || !s.stalled) continue;
    s.stalled = false;
    s.nextAt = now + 3000 + sim.rng() * 3000;
  }
}
