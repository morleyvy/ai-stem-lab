// Игровой прогресс ученика: опыт (XP), уровни, серия дней, значки.
// Всё считается из результатов работ — отдельно ничего не хранится, поэтому прогресс
// нельзя «накрутить» с клиента и он совпадает с тем, что видит учитель.

const BASE_XP = 100; // за выполненную работу
const Q_XP = 20; // за каждый верный контрольный вопрос
const HYP_XP = 10; // за каждую подтвердившуюся гипотезу
export const ON_TIME_XP = 50; // за задание, сданное в срок
export const REPEAT_XP = 10; // повторное прохождение — немного опыта за старание

// XP одной попытки
export function attemptXp(r) {
  return BASE_XP + Q_XP * (r.q_ok ?? 0) + HYP_XP * (r.hyp_ok ?? 0);
}

// Порог уровня n — 100·n·(n−1) XP: 0, 200, 600, 1200, 2000 … — каждый следующий уровень чуть дольше
const levelStart = (n) => 100 * n * (n - 1);
export function levelOf(xp) {
  let n = 1;
  while (levelStart(n + 1) <= xp) n++;
  return { level: n, from: levelStart(n), to: levelStart(n + 1) };
}

const TITLES = ['Лаборант-стажёр', 'Лаборант', 'Младший исследователь', 'Исследователь', 'Старший исследователь', 'Научный сотрудник', 'Ведущий учёный', 'Профессор'];
export const titleOf = (level) => TITLES[Math.min(level, TITLES.length) - 1];

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};

// Серия: сколько дней подряд (заканчивая сегодня или вчера) ученик выполнял работы
function streakOf(results) {
  const days = new Set(results.map((r) => dayKey(r.completed_at)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// results: [{ lesson_id, q_ok, q_total, hyp_ok, hyp_total, completed_at }]
// lessons: ALL_LESSONS; assignments: [{ lesson_id, due_date }]
export function computeProgress(results, lessons, assignments = []) {
  const best = new Map();
  let xp = 0;
  for (const r of results) {
    const prev = best.get(r.lesson_id);
    if (!prev) {
      xp += attemptXp(r);
      best.set(r.lesson_id, r);
    } else {
      xp += REPEAT_XP;
      if (attemptXp(r) > attemptXp(prev)) {
        xp += attemptXp(r) - attemptXp(prev);
        best.set(r.lesson_id, r);
      }
    }
  }
  // Бонус за задания, выполненные к сроку (первая попытка не позже конца дня срока)
  let onTime = 0;
  for (const a of assignments) {
    if (!a.due_date) continue;
    const first = results.find((r) => r.lesson_id === a.lesson_id);
    if (first && new Date(first.completed_at) <= new Date(`${a.due_date}T23:59:59`)) {
      onTime++;
      xp += ON_TIME_XP;
    }
  }

  const done = new Set(best.keys());
  const bySubject = (s) => {
    const all = lessons.filter((l) => l.subject === s);
    return { done: all.filter((l) => done.has(l.id)).length, total: all.length };
  };
  const perfect = [...best.values()].filter((r) => r.q_total > 0 && r.q_ok === r.q_total).length;
  const streak = streakOf(results);

  const badges = [
    { id: 'first', name: 'Первый опыт', desc: 'Выполнить первую работу', icon: '🧪', got: done.size >= 1 },
    { id: 'five', name: 'Практик', desc: 'Выполнить 5 работ', icon: '⚗️', got: done.size >= 5 },
    { id: 'ten', name: 'Знаток', desc: 'Выполнить 10 работ', icon: '🔬', got: done.size >= 10 },
    { id: 'chem', name: 'Химик', desc: 'Все работы по химии', icon: '🧫', got: bySubject('chemistry').done === bySubject('chemistry').total },
    { id: 'phys', name: 'Физик', desc: 'Все работы по физике', icon: '⚡', got: bySubject('physics').done === bySubject('physics').total },
    { id: 'bio', name: 'Биолог', desc: 'Все работы по биологии', icon: '🌱', got: bySubject('biology').done === bySubject('biology').total },
    { id: 'perfect', name: 'Без ошибок', desc: '3 работы со всеми верными ответами', icon: '🎯', got: perfect >= 3 },
    { id: 'streak', name: 'Три дня подряд', desc: 'Заниматься 3 дня подряд', icon: '🔥', got: streak >= 3 },
    { id: 'ontime', name: 'Точно в срок', desc: 'Сдать 3 задания вовремя', icon: '⏰', got: onTime >= 3 },
    { id: 'all', name: 'Магистр', desc: 'Выполнить все работы', icon: '🏆', got: done.size === lessons.length },
  ];

  return {
    xp,
    ...levelOf(xp),
    streak,
    done,
    best,
    badges,
    subjects: { chemistry: bySubject('chemistry'), physics: bySubject('physics'), biology: bySubject('biology') },
  };
}

// Статус задания для ученика
export function assignmentStatus(a, done) {
  if (done.has(a.lesson_id)) return { key: 'done', text: 'Выполнено' };
  if (!a.due_date) return { key: 'open', text: 'Без срока' };
  // Считаем в календарных днях: иначе в 00:30 срок «сегодня» выглядел бы как «завтра»
  const due = new Date(`${a.due_date}T00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return { key: 'late', text: 'Просрочено' };
  if (days === 0) return { key: 'soon', text: 'Сдать сегодня' };
  if (days === 1) return { key: 'soon', text: 'Сдать завтра' };
  return { key: 'open', text: `Срок: ${new Date(due).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` };
}
