// База частых вопросов Шоқана без интернета: каждая формулировка должна находить свой ответ.
// Без этой проверки новая запись может молча перехватывать чужие вопросы — база большая,
// а поиск идёт по корням слов, а не по точному тексту.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerOffline } from '../src/offlineChat.js';
import { OFFLINE_FAQ } from '../src/data/offlineFaq.js';
import { LAB_FAQ } from '../src/data/labs/index.js';
import { ALL_LESSONS, SIMS } from '../src/data/catalog.js';

const SUBJECTS = ['chemistry', 'physics', 'biology', 'informatics'];
// Работа на сайте → её предмет; скрытые работы в каталог не попадают и не проверяются
const SUBJECT_OF = Object.fromEntries(ALL_LESSONS.map((l) => [l.sim ?? l.id, l.subject]));

// Так же, как на сайте: открыта работа (scope) её предмета или, для общих ответов, главная.
// Симуляцию открываем по-настоящему, с начальными значениями регуляторов: в ней пересчёт
// «что будет, если…» отвечает раньше базы и может перехватить вопрос
function factsFor(scope) {
  const def = SIMS[scope];
  if (def) return { sim: { def, params: Object.fromEntries(def.controls.map((c) => [c.id, c.value])) }, subject: SUBJECT_OF[scope] };
  if (SUBJECT_OF[scope]) return { bench: true, result: null, lessonId: scope, subject: SUBJECT_OF[scope] };
  if (SUBJECTS.includes(scope)) return { subject: scope };
  return {};
}

const entries = [...OFFLINE_FAQ, ...LAB_FAQ].filter((e) => e.scope === 'general' || SUBJECTS.includes(e.scope) || SUBJECT_OF[e.scope]);

for (const [lang, field, answer] of [['ru', 'q', 'a'], ['kk', 'qk', 'ak']]) {
  test(`частые вопросы (${lang}): каждая формулировка находит свой ответ`, () => {
    const i18n = { t: (key) => `[${key}]`, tr: (s) => s, lang };
    const misses = [];
    for (const entry of entries) {
      for (const q of entry[field]) {
        const got = answerOffline(q, factsFor(entry.scope), i18n);
        if (got !== entry[answer]) misses.push(`${entry.scope}: «${q}» → ${got.slice(0, 70)}`);
      }
    }
    assert.deepEqual(misses, []);
  });
}
