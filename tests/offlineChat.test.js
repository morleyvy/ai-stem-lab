// Шоқан без интернета: ответы собираются из данных симуляций и движка реакций
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerOffline, detectIntent, newMemory } from '../src/offlineChat.js';
import { OHM } from '../src/sims/ohm.js';
import { runExperiment } from '../src/engine.js';

// Переводчики-заглушки: ключ виден в ответе, так проверяем, какую заготовку выбрал модуль
const i18n = { t: (key) => `[${key}]`, tr: (s) => s };
const ohm = { def: OHM, params: { U: 4, R: 10, assembled: 1, switch: 1 } };

test('вид вопроса: русский и казахский', () => {
  assert.equal(detectIntent('Что показывает амперметр?'), 'readings');
  assert.equal(detectIntent('Аспаптар не көрсетеді?'), 'readings');
  assert.equal(detectIntent('Какая здесь формула?'), 'formula');
  assert.equal(detectIntent('Что будет, если увеличить напряжение?'), 'change');
  assert.equal(detectIntent('Почему так?'), 'why');
  assert.equal(detectIntent('Неге олай?'), 'why');
  assert.equal(detectIntent('Что такое гипотеза?'), 'hypothesis');
  assert.equal(detectIntent('Как вступить в класс?'), 'joinClass');
  assert.equal(detectIntent('Расскажи анекдот'), 'other');
});

test('симуляция: показания берутся из самой симуляции, а не придумываются', () => {
  const text = answerOffline('Что показывают приборы?', { sim: ohm }, i18n);
  assert.match(text, /0,40 А/);
  assert.match(text, /4,0 В/);
});

test('симуляция: формула и теория', () => {
  const text = answerOffline('Какая формула?', { sim: ohm }, i18n);
  assert.match(text, /I = U \/ R/);
  assert.ok(text.includes(OHM.theory));
});

test('химия: объяснение и уравнение из движка', () => {
  const result = runExperiment({ substances: ['acid_hcl', 'metal_zn'], temperature: 20, concentration: 'dilute' });
  assert.equal(result.status, 'reaction');
  const text = answerOffline('Почему пошли пузырьки?', { bench: true, result }, i18n);
  assert.ok(text.includes(result.equation));
  assert.ok(text.includes(result.why));
});

test('химия: пустой стол — подсказка добавить вещества', () => {
  assert.equal(answerOffline('Почему?', { bench: true, result: null }, i18n), '[off.benchEmpty]');
});

test('миссия: ответ по результату не выдаёт вещества', () => {
  const result = runExperiment({ substances: ['acid_hcl', 'metal_zn'], temperature: 20, concentration: 'dilute' });
  const text = answerOffline('Почему пошёл газ?', { mission: true, bench: true, result }, i18n);
  assert.equal(text, '[off.mission]');
});

test('вопросы про сайт отвечаются на любом экране', () => {
  assert.equal(answerOffline('Как вступить в класс?', {}, i18n), '[off.faq.joinClass]');
  assert.equal(answerOffline('Что работает без интернета?', { sim: ohm }, i18n), '[off.faq.internet]');
});

test('без открытого опыта — честно говорим, что умеем без сети', () => {
  assert.equal(answerOffline('Кто такой Ньютон?', {}, i18n), '[off.noExperiment]');
});

const zincInAcid = () => runExperiment({ substances: ['acid_hcl', 'metal_zn'], temperature: 20, concentration: 'dilute' });

test('вопрос из базы задаётся один раз, на ответ ученика объяснение не повторяется по кругу', () => {
  const result = zincInAcid();
  const memory = newMemory();
  const first = answerOffline('Почему выделяется газ?', { bench: true, result }, i18n, memory);
  assert.ok(first.includes(result.hint));
  const second = answerOffline('Не знаю', { bench: true, result }, i18n, memory);
  assert.equal(second, '[off.again]');
  const third = answerOffline('Почему?', { bench: true, result }, i18n, memory);
  assert.ok(!third.includes(result.hint));
});

test('ученик называет другое вещество — ответ считает движок', () => {
  const result = zincInAcid();
  const copper = runExperiment({ substances: ['acid_hcl', 'metal_cu'], temperature: 20, concentration: 'dilute' });
  const text = answerOffline('С медью ничего не будет', { bench: true, result }, i18n);
  assert.match(text, /\[off\.whatIf\]/);
  assert.ok(text.includes(copper.why));
  assert.ok(!text.includes(result.equation));
  // Казахский: «мыс» — медь
  assert.ok(answerOffline('Мыспен не болады?', { bench: true, result }, i18n).includes(copper.why));
});

test('магний вместо цинка: газ и своё уравнение', () => {
  const text = answerOffline('А если взять магний?', { bench: true, result: zincInAcid() }, i18n);
  assert.match(text, /Mg/);
  assert.match(text, /H₂/);
});

test('симуляция: реплика после ответа — предложение проверить на опыте', () => {
  const memory = newMemory();
  answerOffline('Что показывают приборы?', { sim: ohm }, i18n, memory);
  assert.equal(answerOffline('Понятно', { sim: ohm }, i18n, memory), '[off.tryIt]');
});

import { PENDULUM } from '../src/sims/pendulum.js';
const pendulum = { def: PENDULUM, params: { L: 1, m: 0.1, released: 0 } };
const ru = { ...i18n, lang: 'ru' };

test('«что будет, если» в симуляции: пересчёт самой симуляцией', () => {
  const longer = answerOffline('Что будет, если увеличить длину нити в 2 раза?', { sim: pendulum }, ru);
  assert.match(longer, /2,01 с → 2,84 с/);
  // Масса на период не влияет — так и должен сказать пересчёт
  assert.match(answerOffline('А если увеличить массу груза?', { sim: pendulum }, ru), /\[off\.simSame\]/);
  assert.match(answerOffline('Кернеуді арттырсақ не болады?', { sim: ohm }, ru), /0,40 А → /);
});

test('частые вопросы: русский, казахский, другая формулировка', () => {
  const facts = { sim: pendulum, subject: 'physics' };
  assert.match(answerOffline('от массы зависит период?', facts, ru), /T = 2π√\(L\/g\)/);
  assert.match(answerOffline('для чего в цепи нужен реостат', { sim: ohm, subject: 'physics' }, ru), /^Реостат/);
  assert.match(answerOffline('Реостат не үшін керек?', { sim: ohm, subject: 'physics' }, { ...i18n, lang: 'kk' }), /кедергісін/);
});

test('частые вопросы: случайное совпадение первых букв не считается ответом', () => {
  assert.equal(answerOffline('Расскажи анекдот', { subject: 'physics' }, ru), '[off.noExperiment]');
});
