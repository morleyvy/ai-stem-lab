// Работы, которые учитель собирает с ИИ («конструктор лабораторных»).
// Проверка общая для сервера и браузера: сервер проверяет ответ модели и уроки, присланные
// для опроса, браузер — работы, прочитанные из базы или localStorage, перед запуском.
// Работа строится только на существующей симуляции из src/sims: ход работы — это шаги set
// по её регуляторам, поэтому сгенерированная работа идёт в том же проигрывателе (src/lesson.js),
// что и встроенные. Химия в v1 не поддерживается: шаги химии завязаны на полку и 3D-стол,
// и честно проверить сгенерированный ход без запуска сцены мы пока не можем.

import { SIMS, ALL_LESSONS } from './data/catalog.js';
import { imageDistance } from './sims/lens.js';

export const CUSTOM_SUBJECTS = ['physics', 'biology'];
export const CUSTOM_GRADES = [7, 8, 9, 10, 11];
export const PROMPT_MAX = 400;
export const STEPS_MIN = 6;
export const STEPS_MAX = 14;
// Столько же проверяет база (supabase/004_custom_lessons.sql): работа крупнее туда не попадёт
export const LESSON_MAX_BYTES = 20000;
// 'c-' + 12 hex — как lesson_id, который база вычисляет из uuid строки; укладывается
// в results_lesson_fmt ^[a-z0-9_-]{1,40}$ (миграция 003) и в задания класса
export const CUSTOM_ID_RE = /^c-[0-9a-f]{12}$/;
// Проба работы до сохранения. Тоже в формате 'c-' + 12 hex — чтобы опрос ИИ работал и в пробе
export const PREVIEW_ID = 'c-000000000000';

const LIMITS = {
  title: [5, 120],
  short: [3, 40],
  topic: [3, 80],
  goal: [10, 300],
  equipment: [5, 300],
  safety: [5, 300],
  text: [5, 300],
  after: [5, 400],
  record: [1, 80],
  option: [1, 120],
  explain: [5, 400],
  point: [5, 250],
};
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 4;
const POINTS_MIN = 2;
const POINTS_MAX = 5;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Порядок действий на сцене берём из встроенной работы на той же симуляции: сцена не даёт,
// например, замкнуть ключ до сборки цепи или навести экран, пока свеча не горит.
// «Ведущие» действия (до первого регулятора во встроенной работе) без них опыт не начинается.
const ACTION_ORDER = {};
for (const l of ALL_LESSONS) {
  if (!l.sim || ACTION_ORDER[l.sim]) continue;
  const def = SIMS[l.sim];
  const isAction = (id) => def.controls.find((c) => c.id === id)?.action;
  const order = [];
  const leading = [];
  let sawSlider = false;
  for (const s of l.steps) {
    if (s.type !== 'set') continue;
    for (const id of Object.keys(s.targets ?? { [s.param]: s.to })) {
      if (isAction(id)) {
        if (!order.includes(id)) order.push(id);
        if (!sawSlider && !leading.includes(id)) leading.push(id);
      } else {
        sawSlider = true;
      }
    }
  }
  ACTION_ORDER[l.sim] = { order, leading };
}

export const actionOrder = (simId) => ACTION_ORDER[simId] ?? { order: [], leading: [] };

// Действия, которые сцена сама отменяет при смене других регуляторов: резкость на экране линзы
// пересчитывается по положению экрана (src/svg/scenes/lens.js), и после смены F или d изображение
// снова размыто. Для проверки хода работы считаем, что действие сброшено и его можно повторить.
export const SCENE_RESETS = { lens: { sharp: ['F', 'd'] } };

// Когда действие на сцене вообще выполнимо. Резкое изображение на экране линзы бывает только
// действительным и только там, куда доезжает экран: 3–62,5 см от линзы (src/svg/scenes/lens.js).
export const SCENE_REQUIRES = {
  lens: {
    sharp: {
      ok: (p) => {
        const f = imageDistance(p);
        return f !== null && f >= 3 && f <= 62.5;
      },
      why: 'резкое изображение на экране получается только при d > F и изображении в 3–62,5 см от линзы',
    },
  },
};

// Значение на сетке регулятора: min + k·step, без ошибок округления
function onGrid(c, v) {
  const k = Math.round((v - c.min) / c.step);
  return Math.abs(c.min + k * c.step - v) < 1e-6;
}

// Проверка и нормализация работы. Возвращает { lesson } или { errors: [...] } — тексты ошибок
// по-русски: они уходят модели при повторной попытке и в журнал сервера, ученику не показываются.
// expect — чего просил учитель: { simId, subject, grade }; несовпадение — тоже ошибка.
export function validateLesson(raw, expect = {}) {
  const errors = [];
  const err = (msg) => {
    if (errors.length < 20) errors.push(msg);
  };
  if (!isPlainObject(raw)) return { errors: ['Ответ должен быть JSON-объектом работы'] };

  const str = (value, [min, max], field, required = true) => {
    if (value == null || value === '') {
      if (required) err(`Поле ${field} обязательно`);
      return undefined;
    }
    if (typeof value !== 'string') {
      err(`Поле ${field} должно быть строкой`);
      return undefined;
    }
    // Управляющие символы в тексте работы не нужны, а в интерфейсе ломают вёрстку
    const s = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length < min || s.length > max) {
      err(`Поле ${field}: длина ${s.length}, допустимо ${min}–${max} символов`);
      return undefined;
    }
    return s;
  };

  const simId = raw.sim;
  const def = typeof simId === 'string' && Object.hasOwn(SIMS, simId) ? SIMS[simId] : null;
  if (!def) {
    return { errors: [`Неизвестная симуляция sim=${JSON.stringify(simId)}; допустимы: ${Object.keys(SIMS).join(', ')}`] };
  }
  if (!CUSTOM_SUBJECTS.includes(def.subject)) err(`Симуляция ${simId} не поддерживается`);
  if (expect.simId && expect.simId !== simId) err(`Нужна симуляция ${expect.simId}, а выбрана ${simId}`);
  if (expect.subject && expect.subject !== def.subject) err(`Нужен предмет ${expect.subject}, а симуляция ${simId} — ${def.subject}`);

  const control = (id) => def.controls.find((c) => c.id === id);
  const controlIds = def.controls.map((c) => c.id).join(', ');

  let grade = expect.grade ?? raw.grade;
  if (!CUSTOM_GRADES.includes(grade)) {
    err('Поле grade — целое число от 7 до 11');
    grade = undefined;
  }

  const lesson = {
    subject: def.subject,
    sim: simId,
    grade,
    // Работа пишется целиком на одном языке — на нём её и показываем, tr() текст не трогает
    lang: (expect.lang ?? raw.lang) === 'kk' ? 'kk' : 'ru',
    title: str(raw.title, LIMITS.title, 'title'),
    short: str(raw.short, LIMITS.short, 'short'),
    topic: str(raw.topic, LIMITS.topic, 'topic', false) ?? def.title,
    goal: str(raw.goal, LIMITS.goal, 'goal'),
    equipment: str(raw.equipment, LIMITS.equipment, 'equipment'),
    safety: str(raw.safety, LIMITS.safety, 'safety'),
    initial: {},
    formulaLabel: 'Расчёт',
    steps: [],
  };

  // Начальные параметры: только регуляторы этой симуляции, в пределах и на сетке.
  // Действия на сцене (собрать цепь, зажечь свечу) всегда начинаются «не сделано» — их делает ученик.
  const initial = raw.initial ?? {};
  if (!isPlainObject(initial)) err('Поле initial должно быть объектом');
  const state = {};
  for (const c of def.controls) {
    const v = isPlainObject(initial) && Object.hasOwn(initial, c.id) ? initial[c.id] : c.value;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < c.min || v > c.max || !onGrid(c, v)) {
      err(`initial.${c.id}=${JSON.stringify(v)}: допустимо от ${c.min} до ${c.max} с шагом ${c.step}`);
      state[c.id] = c.value;
    } else if (c.action && v !== c.value) {
      err(`initial.${c.id}: действие «${c.actionLabel}» выполняет ученик, начальное значение — ${c.value}`);
      state[c.id] = c.value;
    } else {
      state[c.id] = v;
    }
  }
  if (isPlainObject(initial)) {
    for (const key of Object.keys(initial)) if (!control(key)) err(`initial.${key}: у симуляции ${simId} нет такого регулятора (есть: ${controlIds})`);
  }
  lesson.initial = { ...state };

  const steps = raw.steps;
  if (!Array.isArray(steps)) {
    err('Поле steps должно быть массивом');
  } else if (steps.length < STEPS_MIN || steps.length > STEPS_MAX) {
    err(`В работе ${steps.length} шагов, нужно от ${STEPS_MIN} до ${STEPS_MAX}`);
  }

  const options = (list, where) => {
    if (!Array.isArray(list) || list.length < OPTIONS_MIN || list.length > OPTIONS_MAX) {
      err(`${where}: нужно от ${OPTIONS_MIN} до ${OPTIONS_MAX} вариантов ответа`);
      return [];
    }
    const out = list.map((o, k) => {
      if (!isPlainObject(o)) {
        err(`${where}: вариант ${k + 1} должен быть объектом { text, ok }`);
        return null;
      }
      const text = str(o.text, LIMITS.option, `${where}.options[${k}].text`);
      if (o.ok != null && typeof o.ok !== 'boolean') err(`${where}: ok варианта ${k + 1} — true или false`);
      return text ? { text, ok: o.ok === true } : null;
    }).filter(Boolean);
    if (out.filter((o) => o.ok).length !== 1) err(`${where}: ровно один вариант должен быть верным (ok: true)`);
    // Регистр значим: в генетике «Aa» и «aa» — разные ответы
    if (new Set(out.map((o) => o.text)).size !== out.length) err(`${where}: варианты ответа повторяются`);
    return out;
  };

  const { order, leading } = actionOrder(simId);
  const doneActions = [];
  let sawSlider = false;
  let setCount = 0;
  const counts = { hypothesis: 0, question: 0, conclusion: 0 };

  (Array.isArray(steps) ? steps.slice(0, STEPS_MAX) : []).forEach((s, i) => {
    const where = `steps[${i}]`;
    if (!isPlainObject(s)) return err(`${where} должен быть объектом`);
    const type = s.type;
    const last = i === steps.length - 1;
    if (type === 'set') {
      setCount++;
      const c = control(s.param);
      const text = str(s.text, LIMITS.text, `${where}.text`);
      const after = str(s.after, LIMITS.after, `${where}.after`);
      const record = str(s.record, LIMITS.record, `${where}.record`, false);
      if (!c) return err(`${where}.param=${JSON.stringify(s.param)}: у симуляции ${simId} нет такого регулятора (есть: ${controlIds})`);
      const to = s.to;
      if (typeof to !== 'number' || !Number.isFinite(to) || to < c.min || to > c.max || !onGrid(c, to)) {
        return err(`${where}: ${c.id}=${JSON.stringify(to)} недостижимо — допустимо от ${c.min} до ${c.max} с шагом ${c.step}${c.names ? ` (${c.names.map((n, k) => `${k} — ${n}`).join(', ')})` : ''}`);
      }
      // Шаг, который ничего не меняет, засчитался бы сам — ученик ничего бы не сделал
      if (state[c.id] === to) return err(`${where}: ${c.id} уже равно ${to} — шаг должен менять значение`);
      if (c.action) {
        if (to === c.value) return err(`${where}: действие «${c.actionLabel}» нельзя отменить, допустимо только ${c.id}=${c.max}`);
        const req = SCENE_REQUIRES[simId]?.[c.id];
        if (req && !req.ok(state)) err(`${where}: действие ${c.id} невыполнимо — ${req.why}`);
        const need = order.slice(0, order.indexOf(c.id)).filter((id) => !doneActions.includes(id));
        if (need.length) err(`${where}: сначала нужно действие ${need.join(', ')}`);
        if (!doneActions.includes(c.id)) doneActions.push(c.id);
      } else {
        const missing = leading.filter((id) => !doneActions.includes(id));
        if (!sawSlider && missing.length) err(`${where}: прежде чем менять регуляторы, ученик должен выполнить ${missing.map((id) => `${id} («${control(id).actionLabel}»)`).join(', ')}`);
        sawSlider = true;
      }
      state[c.id] = to;
      for (const [action, triggers] of Object.entries(SCENE_RESETS[simId] ?? {})) {
        if (triggers.includes(c.id)) state[action] = control(action).value;
      }
      lesson.steps.push({ type: 'set', param: c.id, to, ...(record && { record }), text, after });
    } else if (type === 'hypothesis') {
      counts.hypothesis++;
      const text = str(s.text, LIMITS.text, `${where}.text`);
      const opts = options(s.options, where);
      // Проигрыватель проверяет гипотезу следующим опытом: без шага set после неё вердикт потерялся бы
      if (steps[i + 1]?.type !== 'set') err(`${where}: сразу после гипотезы должен идти шаг set, который её проверяет`);
      lesson.steps.push({ type: 'hypothesis', text, options: opts });
    } else if (type === 'question') {
      counts.question++;
      const text = str(s.text, LIMITS.text, `${where}.text`);
      const opts = options(s.options, where);
      const explain = str(s.explain, LIMITS.explain, `${where}.explain`);
      lesson.steps.push({ type: 'question', text, options: opts, explain });
    } else if (type === 'conclusion') {
      counts.conclusion++;
      if (!last) err(`${where}: вывод (conclusion) должен быть последним шагом`);
      const pts = s.points;
      if (!Array.isArray(pts) || pts.length < POINTS_MIN || pts.length > POINTS_MAX) {
        err(`${where}: в выводе нужно от ${POINTS_MIN} до ${POINTS_MAX} пунктов`);
      }
      const points = (Array.isArray(pts) ? pts.slice(0, POINTS_MAX) : []).map((p, k) => str(p, LIMITS.point, `${where}.points[${k}]`)).filter(Boolean);
      lesson.steps.push({ type: 'conclusion', points });
    } else {
      err(`${where}.type=${JSON.stringify(type)}: допустимы set, hypothesis, question, conclusion`);
    }
  });

  if (Array.isArray(steps)) {
    if (counts.conclusion !== 1) err('Нужен ровно один шаг conclusion — последним');
    if (setCount < 2) err('Нужно хотя бы 2 шага set — опыт ученик проводит сам');
    if (!counts.hypothesis) err('Нужна хотя бы одна гипотеза (hypothesis)');
    if (!counts.question) err('Нужен хотя бы один контрольный вопрос (question)');
    const missing = leading.filter((id) => !doneActions.includes(id));
    if (setCount && missing.length) err(`Работа должна включать действие ${missing.join(', ')}`);
  }

  if (errors.length) return { errors };
  const size = new TextEncoder().encode(JSON.stringify(lesson)).length;
  if (size >= LESSON_MAX_BYTES) return { errors: [`Работа слишком большая: ${size} байт, допустимо до ${LESSON_MAX_BYTES}`] };
  return { lesson };
}

// Готовая к запуску работа: к проверенному содержимому добавляем id и отметку «от учителя».
// null — содержимое не прошло проверку (испорчено в хранилище или подделано).
export function toRunnable(id, raw, extra = {}) {
  if (!CUSTOM_ID_RE.test(String(id))) return null;
  const { lesson } = validateLesson(raw);
  return lesson ? { ...lesson, ...extra, id, custom: true } : null;
}
