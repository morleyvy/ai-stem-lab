// Проверки логики «Живого урока» без браузера и сети: node --test tests/live.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HINT_MAX, STUCK_MS, cleanHintText, computeStatus, createSim, createTracker, seededRng,
  simHint, simTick, stepNumber, stepTotal, summarize, validateHint, validatePresence,
} from '../src/liveCore.js';

// Короткая работа того же вида, что в src/data: мытьё не считается шагом
const lesson = {
  id: 'demo-lesson',
  steps: [
    { type: 'do' },
    { type: 'hypothesis', options: [{ ok: true }, { ok: false }, { ok: false }] },
    { type: 'do' },
    { type: 'wash' },
    { type: 'question', options: [{ ok: false }, { ok: true }, { ok: false }] },
    { type: 'conclusion' },
  ],
};
const TEACHER = '11111111-2222-4333-8444-555555555555';
const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('номер шага не считает мытьё', () => {
  assert.equal(stepTotal(lesson), 5);
  assert.equal(stepNumber(lesson, 2), 3);
  assert.equal(stepNumber(lesson, 3), 3);
  assert.equal(stepNumber(lesson, 4), 4);
});

test('статус: выполняет, застрял по времени и по ошибкам, завершил, не подключился, вышел', () => {
  const now = 1_000_000;
  const tr = createTracker(lesson);
  tr.apply({ type: 'step', index: 2 });
  assert.equal(computeStatus(tr.state, { seenAt: now - 1000, now }), 'working');
  assert.equal(computeStatus(tr.state, { seenAt: now - STUCK_MS - 1, now }), 'stuck');
  tr.apply({ type: 'miss', index: 2 });
  assert.equal(computeStatus(tr.state, { seenAt: now, now }), 'working');
  tr.apply({ type: 'miss', index: 2 });
  assert.equal(computeStatus(tr.state, { seenAt: now, now }), 'stuck');
  // Новый шаг — ошибки прошлого шага не в счёт
  tr.apply({ type: 'step', index: 4 });
  assert.equal(computeStatus(tr.state, { seenAt: now, now }), 'working');
  assert.equal(computeStatus(tr.state, { seenAt: now, now, left: true }), 'left');
  tr.apply({ type: 'finish' });
  assert.equal(computeStatus(tr.state, { seenAt: now - STUCK_MS * 10, now, left: true }), 'done');
  assert.equal(computeStatus(null, { now }), 'offline');
});

test('неверная гипотеза не делает ученика «застрявшим», неверный ответ на вопрос — да', () => {
  const tr = createTracker(lesson);
  tr.apply({ type: 'step', index: 1 });
  tr.apply({ type: 'answer', kind: 'hypothesis', index: 1, opt: 1, ok: false });
  tr.apply({ type: 'answer', kind: 'hypothesis', index: 1, opt: 2, ok: false });
  assert.equal(tr.state.e, 0);
  assert.equal(tr.state.ok, false);
  assert.deepEqual(tr.state.w, [[1, 1], [1, 2]]);
  tr.apply({ type: 'answer', kind: 'question', index: 1, opt: 0, ok: false });
  assert.equal(tr.state.e, 1);
});

test('presence: принимаем только числа и id, отвергаем текст и лишнее', () => {
  const tr = createTracker(lesson);
  tr.apply({ type: 'step', index: 2 });
  const ok = validatePresence({ ...tr.state, presence_ref: 'x', name: '<img onerror=alert(1)>' });
  assert.ok(ok);
  assert.equal(ok.name, undefined, 'посторонние поля отбрасываются');
  assert.equal(ok.presence_ref, undefined);
  const bad = [
    null, 'str', { ...tr.state, v: 2 }, { ...tr.state, lesson: 'Bad Id!' }, { ...tr.state, i: -1 },
    { ...tr.state, i: 1.5 }, { ...tr.state, n: 9, m: 5 }, { ...tr.state, st: 'hacked' }, { ...tr.state, ok: 'yes' },
    { ...tr.state, w: [[1, 'x']] }, { ...tr.state, w: Array.from({ length: 31 }, () => [0, 0]) }, { ...tr.state, e: 999 },
  ];
  for (const b of bad) assert.equal(validatePresence(b), null, JSON.stringify(b));
});

test('подсказка: только от учителя урока, только всем или мне, текст очищен и обрезан', () => {
  const ctx = { teacherId: TEACHER, selfId: ME };
  assert.deepEqual(validateHint({ from: TEACHER, to: null, kind: 'text', text: '  Проверь\n‮цвет  ' }, ctx), { kind: 'text', text: 'Проверь цвет', to: null });
  assert.equal(validateHint({ from: ME, to: null, kind: 'text', text: 'фальшивка' }, ctx), null);
  assert.equal(validateHint({ from: TEACHER, to: 'другой', kind: 'text', text: 'не мне' }, ctx), null);
  assert.equal(validateHint({ from: TEACHER, to: null, kind: 'text', text: '   ' }, ctx), null);
  assert.equal(validateHint({ from: TEACHER, to: null, kind: 'html', text: 'x' }, ctx), null);
  assert.equal(validateHint({ from: TEACHER, to: null, kind: 'text', text: 'x' }, { teacherId: 'not-uuid', selfId: ME }), null);
  assert.deepEqual(validateHint({ from: TEACHER, to: ME, kind: 'nudge', text: 'игнорируется' }, ctx), { kind: 'nudge', text: '', to: ME });
  assert.equal(validateHint({ from: TEACHER, to: null, kind: 'text', text: 'а'.repeat(HINT_MAX * 2 + 1) }, ctx), null);
  assert.equal(validateHint({ from: TEACHER, to: null, kind: 'text', text: 'а'.repeat(HINT_MAX + 50) }, ctx).text.length, HINT_MAX);
  assert.equal(cleanHintText('a\u0000b'), 'a b');
});

test('сводка: подключились, завершили, средний прогресс, частая ошибка на текущем шаге', () => {
  const mk = (events) => {
    const tr = createTracker(lesson);
    for (const e of events) tr.apply(e);
    return tr.state;
  };
  const wrong = (opt) => ({ type: 'answer', kind: 'question', index: 4, opt, ok: false });
  const students = [
    { state: mk([{ type: 'step', index: 4 }, wrong(0)]) },
    { state: mk([{ type: 'step', index: 4 }, wrong(0), wrong(0)]) },
    { state: mk([{ type: 'step', index: 4 }, wrong(2)]) },
    { state: mk([{ type: 'finish' }]) },
    { state: null },
  ].map((s) => ({ ...s, status: computeStatus(s.state, { now: 0, seenAt: 0 }) }));
  const sum = summarize(students, lesson);
  assert.equal(sum.joined, 4);
  assert.equal(sum.total, 5);
  assert.equal(sum.finished, 1);
  assert.equal(sum.current, 4);
  // Вариант 0 выбрали двое (повтор одного ученика не считается дважды)
  assert.deepEqual(sum.common, { i: 4, n: 4, opt: 0, count: 2 });
  assert.equal(sum.avg, Math.round(((4 / 5) * 3 + 1) / 4 * 100));
});

test('демо-класс: правдоподобный и детерминированный, подсказка «снимает» застрявшего', () => {
  const names = Array.from({ length: 12 }, (_, i) => `Ученик ${i + 1}`);
  const a = createSim(lesson, { names, now: 0, rng: seededRng(3) });
  const b = createSim(lesson, { names, now: 0, rng: seededRng(3) });
  assert.deepEqual(a.students.map((s) => s.state), b.students.map((s) => s.state));
  const statuses = a.students.map((s) => computeStatus(s.state, { seenAt: s.seenAt, now: 0 }));
  assert.equal(statuses.at(-1), 'offline');
  assert.equal(statuses[0], 'done');
  assert.ok(statuses.filter((s) => s === 'stuck').length >= 2, statuses.join());
  let now = 0;
  for (let k = 0; k < 200; k++) simTick(a, (now += 1000));
  assert.ok(a.students.filter((s) => s.state?.st === 'done').length > 1);
  const stalled = a.students.filter((s) => s.stalled);
  assert.ok(stalled.length > 0);
  simHint(a, stalled[0].uid, now);
  assert.equal(stalled[0].stalled, false);
  for (const s of a.students) if (s.state) assert.ok(validatePresence(s.state), 'демо-состояние проходит ту же проверку');
});
