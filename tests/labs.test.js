// Каждая работа на симуляции проходит ту же проверку, что и новая работа перед добавлением
// (scripts/labCheck.js): шаги выполнимы регуляторами, показания не ломаются, перевод полный.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_LESSONS, SIMS } from '../src/data/catalog.js';
import { LAB_LESSONS } from '../src/data/labs/index.js';
import LAB_KK, { patterns as LAB_PATTERNS } from '../src/i18n/kk/labs/index.js';
import { checkLab } from '../scripts/labCheck.js';

for (const lesson of ALL_LESSONS.filter((l) => l.sim)) {
  test(`работа ${lesson.id}`, () => {
    // Пределы ясности — для работ из src/data/labs; старые работы в них и так укладываются по духу
    const strict = LAB_LESSONS.some((l) => l.id === lesson.id);
    const { errors } = checkLab({ sim: SIMS[lesson.sim], lesson, kk: LAB_KK, kkPatterns: LAB_PATTERNS, strict });
    assert.deepEqual(errors, []);
  });
}
