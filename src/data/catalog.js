// Единый каталог: предметы, их цвета, темы, все лабораторные работы и симуляции.

import { LESSONS as CHEMISTRY_LESSONS } from './lessons.js';
import { SIM_LESSONS } from './simLessons.js';
import { OHM } from '../sims/ohm.js';
import { PENDULUM } from '../sims/pendulum.js';
import { ARCHIMEDES } from '../sims/archimedes.js';
import { REFRACTION } from '../sims/refraction.js';
import { LEVER } from '../sims/lever.js';
import { LENS } from '../sims/lens.js';
import { HEAT } from '../sims/heat.js';
import { PHOTOSYNTHESIS } from '../sims/photosynthesis.js';
import { ENZYME } from '../sims/enzyme.js';
import { OSMOSIS } from '../sims/osmosis.js';
import { GENETICS } from '../sims/genetics.js';
import { TRANSPIRATION } from '../sims/transpiration.js';
import { PULSE } from '../sims/pulse.js';
import { YEAST } from '../sims/yeast.js';

export const SUBJECTS = [
  { id: 'chemistry', name: 'Химия', short: 'Х', color: '#1a5cff', soft: '#e9f0ff' },
  { id: 'physics', name: 'Физика', short: 'Ф', color: '#7c3aed', soft: '#f5f3ff' },
  { id: 'biology', name: 'Биология', short: 'Б', color: '#047857', soft: '#e6f8f0' },
];
export const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));

export const SIMS = Object.fromEntries(
  [OHM, PENDULUM, ARCHIMEDES, REFRACTION, LEVER, LENS, HEAT, PHOTOSYNTHESIS, ENZYME, OSMOSIS, GENETICS, TRANSPIRATION, PULSE, YEAST]
    .map((s) => [s.id, s]),
);

export const ALL_LESSONS = [
  ...CHEMISTRY_LESSONS.map((l) => ({ ...l, subject: 'chemistry' })),
  ...SIM_LESSONS,
];

// Темы внутри предметов — как разделы школьного учебника.
// В каждой теме: лабораторные работы (lessons) и свободные эксперименты на симуляциях (sims).
export const TOPICS = {
  chemistry: [
    { name: 'Металлы', lessons: ['activity', 'plating', 'sulfuric'] },
    { name: 'Кислоты, основания и соли', lessons: ['indicator', 'precipitate', 'carbonates'] },
    { name: 'Скорость химической реакции', lessons: ['speed'] },
  ],
  physics: [
    { name: 'Механика', lessons: ['pendulum', 'archimedes', 'lever'], sims: ['pendulum', 'archimedes', 'lever'] },
    { name: 'Электричество', lessons: ['ohm'], sims: ['ohm'] },
    { name: 'Оптика', lessons: ['refraction', 'lens'], sims: ['refraction', 'lens'] },
    { name: 'Тепловые явления', lessons: ['heat'], sims: ['heat'] },
  ],
  biology: [
    { name: 'Клетка', lessons: ['osmosis'], sims: ['osmosis'] },
    { name: 'Растения', lessons: ['photosynthesis', 'transpiration'], sims: ['photosynthesis', 'transpiration'] },
    { name: 'Человек', lessons: ['enzyme', 'pulse'], sims: ['enzyme', 'pulse'] },
    { name: 'Микроорганизмы', lessons: ['yeast'], sims: ['yeast'] },
    { name: 'Генетика', lessons: ['genetics'], sims: ['genetics'] },
  ],
};

// ---------- Классы 7–11 ----------

// Классы, для которых строится программа. Химия и физика в школах Казахстана начинаются с 7 класса.
export const GRADES = [7, 8, 9, 10, 11];

// Класс из профиля: ученик хранит «8», «8А» (validateRegistration убирает пробелы и приводит к верхнему регистру),
// учитель — название класса («8Б», «Физика-9»…). Берём ведущее число, только если это 7–11,
// иначе фильтр по умолчанию — «Все», а не случайный класс.
export function parseGrade(value) {
  const m = /^\s*(\d{1,2})(?!\d)/.exec(String(value ?? ''));
  const n = m ? Number(m[1]) : NaN;
  return GRADES.includes(n) ? n : null;
}

// Свободный опыт на симуляции относится к тому же классу, что и работа на этой симуляции:
// отдельного поля в src/sims нет, чтобы класс не приходилось держать в двух местах.
export const SIM_GRADE = Object.fromEntries(ALL_LESSONS.filter((l) => l.sim && l.grade).map((l) => [l.sim, l.grade]));
