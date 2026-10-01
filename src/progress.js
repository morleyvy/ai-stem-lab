// Прогресс ученика: баллы, уровни, серия дней, достижения.
// Всё считается из результатов работ — отдельно ничего не хранится, поэтому прогресс
// совпадает с тем, что видит учитель. Результаты присылает сам клиент: база ограничивает
// значения и частоту записей (миграция 003), так что сильно накрутить прогресс нельзя,
// но сами ответы остаются самоотчётом ученика.

import { locale, t } from './i18n.js';

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

// Звания уровней 1–8 — ключи title.1 … title.8 в src/i18n/ui.js
const TITLE_COUNT = 8;
export const titleOf = (level) => t(`title.${Math.min(level, TITLE_COUNT)}`);

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

  // Название и описание достижения — ключи badge.<id> и badge.<id>.desc в src/i18n/ui.js
  const badges = [
    { id: 'first', icon: 'flask', got: done.size >= 1 },
    { id: 'five', icon: 'beakers', got: done.size >= 5 },
    { id: 'ten', icon: 'microscope', got: done.size >= 10 },
    { id: 'chem', icon: 'acids', got: bySubject('chemistry').done === bySubject('chemistry').total },
    { id: 'phys', icon: 'electricity', got: bySubject('physics').done === bySubject('physics').total },
    { id: 'bio', icon: 'plants', got: bySubject('biology').done === bySubject('biology').total },
    { id: 'it', icon: 'code', got: bySubject('informatics').total > 0 && bySubject('informatics').done === bySubject('informatics').total },
    { id: 'perfect', icon: 'target', got: perfect >= 3 },
    { id: 'streak', icon: 'calendar', got: streak >= 3 },
    { id: 'ontime', icon: 'clock', got: onTime >= 3 },
    { id: 'all', icon: 'award', got: done.size === lessons.length },
  ]
    // Если работ по информатике на сайте нет, недостижимое достижение не показываем
    .filter((b) => b.id !== 'it' || bySubject('informatics').total > 0)
    .map((b) => ({ ...b, name: t(`badge.${b.id}`), desc: t(`badge.${b.id}.desc`) }));

  return {
    xp,
    ...levelOf(xp),
    streak,
    done,
    best,
    badges,
    subjects: Object.fromEntries([...new Set(lessons.map((l) => l.subject))].map((s) => [s, bySubject(s)])),
  };
}

// Статус задания для ученика
export function assignmentStatus(a, done) {
  if (done.has(a.lesson_id)) return { key: 'done', text: t('status.done') };
  if (!a.due_date) return { key: 'open', text: t('status.noDue') };
  // Считаем в календарных днях: иначе в 00:30 срок «сегодня» выглядел бы как «завтра»
  const due = new Date(`${a.due_date}T00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return { key: 'late', text: t('status.late') };
  if (days === 0) return { key: 'soon', text: t('status.today') };
  if (days === 1) return { key: 'soon', text: t('status.tomorrow') };
  return { key: 'open', text: t('status.due', { date: new Date(due).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) }) };
}
