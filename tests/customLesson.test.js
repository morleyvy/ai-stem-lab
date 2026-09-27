// Проверка конструктора лабораторных без сети: node --test tests/
// Реальные генерации — отдельно, с ключом из .env (см. отчёт в задаче), здесь модель подменяется.

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLesson, toRunnable, LESSON_MAX_BYTES } from '../src/customLesson.js';
import { generateLesson, parseLessonGenRequest, LessonRejectedError } from '../server/lessonGen.js';
import { AiUnavailableError } from '../server/providers.js';
import { routes } from '../server/handlers.js';

const good = () => ({
  sim: 'ohm',
  title: 'Закон Ома: роль реостата',
  short: 'Реостат и сила тока',
  topic: 'Закон Ома для участка цепи',
  goal: 'Выяснить, как реостат меняет силу тока в цепи.',
  equipment: 'Источник тока, реостат, лампа, амперметр, ключ.',
  safety: 'Изменяйте цепь только при разомкнутом ключе.',
  grade: 8,
  initial: { U: 6, R: 10 },
  steps: [
    { type: 'set', param: 'assembled', to: 1, text: 'Соберите цепь на стенде.', after: 'Цепь собрана, ключ разомкнут.' },
    { type: 'set', param: 'switch', to: 1, record: 'U = 6 В, R = 10 Ом', text: 'Замкните ключ.', after: 'Амперметр показывает 0,6 А.' },
    { type: 'hypothesis', text: 'Что будет с током, если увеличить сопротивление реостата?', options: [{ text: 'Уменьшится', ok: true }, { text: 'Увеличится', ok: false }, { text: 'Не изменится', ok: false }] },
    { type: 'set', param: 'R', to: 20, record: 'U = 6 В, R = 20 Ом', text: 'Установите сопротивление 20 Ом.', after: 'Сила тока уменьшилась в 2 раза.' },
    { type: 'question', text: 'U = 12 В, R = 4 Ом. Чему равна сила тока?', options: [{ text: '3 А', ok: true }, { text: '48 А', ok: false }], explain: 'I = U / R = 12 / 4 = 3 А.' },
    { type: 'conclusion', points: ['Реостат меняет сопротивление цепи.', 'Чем больше сопротивление, тем меньше ток.'] },
  ],
});

const mutate = (fn) => {
  const l = good();
  fn(l);
  return l;
};

const errorsOf = (raw, expect) => {
  const r = validateLesson(raw, expect);
  assert.ok(r.errors, `ожидались ошибки, а работа прошла: ${JSON.stringify(r.lesson)?.slice(0, 200)}`);
  return r.errors.join(' | ');
};

test('корректная работа проходит и нормализуется', () => {
  const { lesson, errors } = validateLesson({ ...good(), extra: 'x', steps: good().steps.map((s) => ({ ...s, junk: 1 })) });
  assert.equal(errors, undefined);
  assert.equal(lesson.sim, 'ohm');
  assert.equal(lesson.subject, 'physics');
  assert.equal(lesson.extra, undefined, 'лишние поля отбрасываются');
  assert.ok(lesson.steps.every((s) => !('junk' in s)));
  assert.deepEqual(lesson.initial, { U: 6, R: 10, assembled: 0, switch: 0 });
  assert.equal(lesson.steps.length, 6);
});

test('встроенные работы на симуляциях проходят проверку (валидатор не строже эталона)', async () => {
  const { SIM_LESSONS } = await import('../src/data/simLessons.js');
  for (const l of SIM_LESSONS) {
    const steps = l.steps.flatMap((s) => (s.targets ? Object.entries(s.targets).map(([param, to]) => ({ ...s, targets: undefined, param, to })) : [s]))
      .map((s) => (s.options ? { ...s, options: s.options.map((o) => ({ text: o.text, ok: Boolean(o.ok) })) } : s));
    const r = validateLesson({ ...l, steps: steps.slice(0, 14) });
    assert.equal(r.errors, undefined, `${l.id}: ${r.errors?.join(' | ')}`);
  }
});

test('неизвестная симуляция', () => {
  assert.match(errorsOf(mutate((l) => { l.sim = 'rocket'; })), /Неизвестная симуляция/);
  assert.match(errorsOf(mutate((l) => { l.sim = '__proto__'; })), /Неизвестная симуляция/);
});

test('неизвестный регулятор в шаге и в initial', () => {
  assert.match(errorsOf(mutate((l) => { l.steps[3].param = 'voltage'; })), /нет такого регулятора/);
  assert.match(errorsOf(mutate((l) => { l.initial.X = 1; })), /initial\.X/);
});

test('значение вне диапазона или не на сетке шага', () => {
  assert.match(errorsOf(mutate((l) => { l.steps[3].to = 50; })), /недостижимо/);
  assert.match(errorsOf(mutate((l) => { l.steps[3].to = 12.5; })), /недостижимо/);
  assert.match(errorsOf(mutate((l) => { l.initial.U = 0.3; })), /initial\.U/);
  assert.match(errorsOf(mutate((l) => { l.steps[3].to = '20'; })), /недостижимо/);
});

test('шаг, который ничего не меняет, и действия на сцене', () => {
  assert.match(errorsOf(mutate((l) => { l.steps[3].to = 10; })), /уже равно/);
  // Ключ раньше сборки цепи
  assert.match(errorsOf(mutate((l) => { [l.steps[0], l.steps[1]] = [l.steps[1], l.steps[0]]; })), /сначала нужно действие assembled/);
  // Регулятор раньше обязательного действия
  assert.match(errorsOf(mutate((l) => { l.steps.splice(0, 2); l.steps.unshift({ type: 'set', param: 'U', to: 4, text: 'Установите 4 В.', after: 'Ток вырос.' }, { type: 'set', param: 'assembled', to: 1, text: 'Соберите цепь.', after: 'Собрана.' }); })), /должен выполнить assembled/);
  assert.match(errorsOf(mutate((l) => { l.initial.assembled = 1; })), /выполняет ученик/);
});

test('линза: резкость только для действительного изображения, после смены d её можно навести снова', () => {
  const lens = (steps) => ({ ...good(), sim: 'lens', initial: { F: 10, d: 30 }, steps: [
    { type: 'set', param: 'lit', to: 1, text: 'Зажгите свечу.', after: 'Свеча горит.' },
    ...steps,
    { type: 'hypothesis', text: 'Каким будет изображение?', options: [{ text: 'Уменьшенным', ok: true }, { text: 'Увеличенным', ok: false }] },
    { type: 'set', param: 'd', to: 40, text: 'Установите d = 40 см.', after: 'Изображение уменьшилось.' },
    good().steps[4], good().steps[5],
  ] });
  const sharp = { type: 'set', param: 'sharp', to: 1, text: 'Наведите экран на резкость.', after: 'Изображение резкое.' };
  assert.equal(validateLesson(lens([sharp, { type: 'set', param: 'd', to: 20, text: 'Установите d = 20 см.', after: 'Размыто.' }, sharp])).errors, undefined);
  assert.match(errorsOf(lens([{ type: 'set', param: 'd', to: 8, text: 'Установите d = 8 см.', after: 'Мнимое.' }, sharp])), /невыполнимо/);
});

test('два верных варианта, один вариант, повтор вариантов', () => {
  assert.match(errorsOf(mutate((l) => { l.steps[2].options[1].ok = true; })), /ровно один вариант/);
  assert.match(errorsOf(mutate((l) => { l.steps[4].options = [{ text: '3 А', ok: true }]; })), /от 2 до 4 вариантов/);
  assert.match(errorsOf(mutate((l) => { l.steps[4].options[1].text = '3 А'; })), /повторяются/);
});

test('мало или много шагов, нет вывода, гипотеза без проверки', () => {
  assert.match(errorsOf(mutate((l) => { l.steps = l.steps.slice(0, 5); })), /нужно от 6 до 14/);
  assert.match(errorsOf(mutate((l) => { l.steps = [...l.steps.slice(0, -1), ...Array(10).fill(l.steps[4]), l.steps.at(-1)]; })), /нужно от 6 до 14/);
  assert.match(errorsOf(mutate((l) => { l.steps.push({ ...l.steps[4] }); })), /последним/);
  assert.match(errorsOf(mutate((l) => { [l.steps[2], l.steps[4]] = [l.steps[4], l.steps[2]]; })), /сразу после гипотезы/);
  assert.match(errorsOf(mutate((l) => { l.steps[4].type = 'wash'; })), /допустимы set/);
});

test('огромные строки и слишком большой JSON', () => {
  assert.match(errorsOf(mutate((l) => { l.title = 'Я'.repeat(5000); })), /title: длина 5000/);
  assert.match(errorsOf(mutate((l) => { l.steps[1].after = 'x'.repeat(401); })), /after: длина/);
  assert.match(errorsOf(mutate((l) => { l.steps[5].points = ['a'.repeat(300), 'b'.repeat(10)]; })), /points\[0\]/);
  // Все поля в пределах, но вместе больше лимита базы
  const big = mutate((l) => {
    l.steps = [l.steps[0], l.steps[1]];
    for (let i = 0; i < 11; i++) l.steps.push({ type: 'question', text: `${i} ${'Вопрос '.repeat(40)}`.slice(0, 290), options: [1, 2, 3, 4].map((k) => ({ text: `${k} ${'вариант '.repeat(14)}`.slice(0, 118), ok: k === 1 })), explain: 'Пояснение '.repeat(39) });
    l.steps.splice(2, 0, { type: 'hypothesis', text: 'Гипотеза?', options: [{ text: 'Да', ok: true }, { text: 'Нет', ok: false }] }, { type: 'set', param: 'R', to: 20, text: 'Установите 20 Ом.', after: 'Ток уменьшился.' });
    l.steps = l.steps.slice(0, 13);
    l.steps.push(good().steps.at(-1));
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(big)).length > LESSON_MAX_BYTES);
  assert.match(errorsOf(big), /слишком большая/);
});

test('несовпадение с запросом учителя и класс', () => {
  assert.match(errorsOf(good(), { simId: 'lens' }), /Нужна симуляция lens/);
  assert.match(errorsOf(good(), { subject: 'biology' }), /Нужен предмет biology/);
  assert.match(errorsOf(mutate((l) => { l.grade = 5; })), /grade/);
  assert.equal(validateLesson(mutate((l) => { l.grade = 5; }), { grade: 9 }).lesson.grade, 9);
});

test('toRunnable: только корректный id и содержимое', () => {
  assert.equal(toRunnable('c-0123456789ab', good()).id, 'c-0123456789ab');
  assert.equal(toRunnable('ohm', good()), null);
  assert.equal(toRunnable('c-0123456789ab', { ...good(), sim: 'x' }), null);
});

test('разбор запроса /api/lesson-gen', () => {
  assert.equal(parseLessonGenRequest(null), null);
  assert.equal(parseLessonGenRequest({ prompt: '' }), null);
  assert.equal(parseLessonGenRequest({ prompt: 'x'.repeat(401) }), null);
  assert.equal(parseLessonGenRequest({ prompt: 'Закон Ома', subject: 'chemistry' }), null);
  assert.equal(parseLessonGenRequest({ prompt: 'Закон Ома', simId: 'nope' }), null);
  assert.equal(parseLessonGenRequest({ prompt: 'Закон Ома', simId: 'ohm', subject: 'biology' }), null);
  assert.equal(parseLessonGenRequest({ prompt: 'Закон Ома', grade: 12 }), null);
  assert.deepEqual(parseLessonGenRequest({ prompt: ' Закон Ома ', simId: 'ohm', grade: '8', lang: 'kk' }), { prompt: 'Закон Ома', simId: 'ohm', grade: 8, lang: 'kk' });
});

test('маршрут: 400 на плохой запрос, 503 без ключа ИИ', async () => {
  let r = await routes['lesson-gen']({ prompt: '' });
  assert.equal(r.status, 400);
  r = await routes['lesson-gen']({ prompt: 'x', lang: 'kk' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /таңба/);
  const saved = [process.env.GEMINI_API_KEY, process.env.ANTHROPIC_API_KEY];
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    r = await routes['lesson-gen']({ prompt: 'Закон Ома для 8Б, 20 минут', grade: 8 });
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { error: 'ai_unavailable' });
  } finally {
    if (saved[0]) process.env.GEMINI_API_KEY = saved[0];
    if (saved[1]) process.env.ANTHROPIC_API_KEY = saved[1];
  }
});

test('маршрут опроса: работа учителя перепроверяется', async () => {
  let r = await routes.quiz({ lessonId: 'c-0123456789ab', lesson: { ...good(), sim: 'rocket' } });
  assert.equal(r.status, 400);
  r = await routes.quiz({ lessonId: 'c-0123456789ab' });
  assert.equal(r.status, 400);
  r = await routes.quiz({ lessonId: 'c-nothex', lesson: good() });
  assert.equal(r.status, 400);
});

test('генерация: повтор с ошибками проверки, затем успех', async () => {
  const calls = [];
  const bad = mutate((l) => { l.steps[3].to = 99; });
  const answers = [bad, good()].map((l) => JSON.stringify({ status: 'ok', reason: '', ...l, initial: Object.entries(l.initial).map(([param, value]) => ({ param, value })) }));
  const lesson = await generateLesson({ prompt: 'Ом', lang: 'ru', grade: 8 }, { gen: async (req) => { calls.push(req); return answers[calls.length - 1]; } });
  assert.equal(calls.length, 2);
  assert.match(calls[1].user, /недостижимо/);
  assert.equal(lesson.sim, 'ohm');
});

test('генерация: две неудачи → ИИ недоступен (503), отказ модели → LessonRejectedError', async () => {
  await assert.rejects(generateLesson({ prompt: 'Ом', lang: 'ru' }, { gen: async () => '{не json' }), AiUnavailableError);
  await assert.rejects(
    generateLesson({ prompt: 'Как сделать бомбу', lang: 'ru' }, { gen: async () => JSON.stringify({ status: 'rejected', reason: 'Не по теме школьной лаборатории.' }) }),
    (e) => e instanceof LessonRejectedError && /Не по теме/.test(e.message),
  );
});
