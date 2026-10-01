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
import { LAB_LESSONS, LAB_SIMS } from './labs/index.js';

// Из работ src/data/labs на сайте показываются только отобранные: остальные слишком сложные или с
// неудачной графикой. Их файлы, переводы и реестр остаются — чтобы вернуть работу, добавьте её id сюда.
// Темы и предметы, где не осталось работ, скрываются сами.
export const SHOWN_NEW_LABS = new Set([
  'states', 'solubility', 'atom',
  'density', 'work-power', 'dynamics10',
  'plant-reproduction', 'blood',
  // Информатика — только устройство компьютера и сети, без работ по программированию: код ученик пишет
  // в настоящем редакторе, а рисовать экран компьютера на экране компьютера незачем
  'it-pc-assembly', 'it-memory-units', 'it-logic-gates', 'it-network-topology', 'it-bandwidth',
]);
const NEW_LESSONS = LAB_LESSONS.filter((l) => SHOWN_NEW_LABS.has(l.id));
const NEW_SIMS = LAB_SIMS.filter((s) => SHOWN_NEW_LABS.has(s.id));

const ALL_SUBJECTS = [
  { id: 'chemistry', name: 'Химия', short: 'Х', color: '#1a5cff', soft: '#e9f0ff' },
  { id: 'physics', name: 'Физика', short: 'Ф', color: '#7c3aed', soft: '#f5f3ff' },
  { id: 'biology', name: 'Биология', short: 'Б', color: '#047857', soft: '#e6f8f0' },
  { id: 'informatics', name: 'Информатика', short: 'И', color: '#0e7490', soft: '#e3f6fa' },
];
// Справочник держит и скрытые предметы: на них могут ссылаться старые результаты и задания
export const SUBJECT_BY_ID = Object.fromEntries(ALL_SUBJECTS.map((s) => [s.id, s]));

export const SIMS = Object.fromEntries(
  [OHM, PENDULUM, ARCHIMEDES, REFRACTION, LEVER, LENS, HEAT, PHOTOSYNTHESIS, ENZYME, OSMOSIS, GENETICS, TRANSPIRATION, PULSE, YEAST, ...NEW_SIMS]
    .map((s) => [s.id, s]),
);

// Номера новых работ продолжают нумерацию предмета: сначала младшие классы, внутри класса — порядок реестра
function numbered(base, added) {
  const next = {};
  for (const l of base) next[l.subject] = Math.max(next[l.subject] ?? 0, l.number);
  return [...added]
    .sort((x, y) => x.grade - y.grade)
    .map((l) => ({ ...l, number: (next[l.subject] = (next[l.subject] ?? 0) + 1) }));
}

const BASE_LESSONS = [
  ...CHEMISTRY_LESSONS.map((l) => ({ ...l, subject: 'chemistry' })),
  ...SIM_LESSONS,
];
export const ALL_LESSONS = [...BASE_LESSONS, ...numbered(BASE_LESSONS, NEW_LESSONS)];

// Темы внутри предметов — как разделы школьного учебника.
// В каждой теме: лабораторные работы (lessons) и свободные эксперименты на симуляциях (sims).
const ALL_TOPICS = {
  chemistry: [
    { name: 'Вещества и смеси', lessons: ['mixtures', 'states'], sims: ['mixtures', 'states'] },
    { name: 'Воздух и кислород', lessons: ['combustion', 'gases'], sims: ['combustion', 'gases'] },
    { name: 'Металлы', lessons: ['activity', 'plating', 'sulfuric'] },
    { name: 'Кислоты, основания и соли', lessons: ['indicator', 'precipitate', 'carbonates'] },
    { name: 'Растворы', lessons: ['solubility'], sims: ['solubility'] },
    { name: 'Энергия в химических реакциях', lessons: ['thermochem'], sims: ['thermochem'] },
    { name: 'Скорость химической реакции', lessons: ['speed', 'kinetics', 'equilibrium'], sims: ['kinetics', 'equilibrium'] },
    { name: 'Строение атома', lessons: ['atom'], sims: ['atom'] },
    { name: 'Окислительно-восстановительные реакции', lessons: ['redox'], sims: ['redox'] },
    { name: 'Органическая химия', lessons: ['aromatic', 'carbonyl', 'amines', 'polymers'], sims: ['aromatic', 'carbonyl', 'amines', 'polymers'] },
  ],
  physics: [
    { name: 'Кинематика', lessons: ['motion', 'kinematics9', 'kinematics10'], sims: ['motion', 'kinematics9', 'kinematics10'] },
    { name: 'Динамика', lessons: ['dynamics9', 'dynamics10'], sims: ['dynamics9', 'dynamics10'] },
    { name: 'Механика', lessons: ['density', 'archimedes', 'lever', 'pendulum'], sims: ['density', 'archimedes', 'lever', 'pendulum'] },
    { name: 'Работа, энергия и импульс', lessons: ['work-power', 'conservation'], sims: ['work-power', 'conservation'] },
    { name: 'Тепловые явления', lessons: ['heat', 'gas-laws'], sims: ['heat', 'gas-laws'] },
    { name: 'Электричество', lessons: ['ohm', 'dc-circuit'], sims: ['ohm', 'dc-circuit'] },
    { name: 'Колебания и переменный ток', lessons: ['em-oscillations', 'ac-current'], sims: ['em-oscillations', 'ac-current'] },
    { name: 'Оптика', lessons: ['refraction', 'lens', 'wave-optics'], sims: ['refraction', 'lens', 'wave-optics'] },
    { name: 'Атомное ядро', lessons: ['nucleus9', 'nucleus11'], sims: ['nucleus9', 'nucleus11'] },
  ],
  biology: [
    { name: 'Клетка', lessons: ['osmosis', 'transport', 'mitosis'], sims: ['osmosis', 'transport', 'mitosis'] },
    { name: 'Растения', lessons: ['photosynthesis', 'respiration', 'plant-reproduction', 'transpiration', 'phototropism'], sims: ['photosynthesis', 'respiration', 'plant-reproduction', 'transpiration', 'phototropism'] },
    { name: 'Человек', lessons: ['digestion', 'blood', 'gas-exchange', 'pulse', 'enzyme', 'excretion'], sims: ['digestion', 'blood', 'gas-exchange', 'pulse', 'enzyme', 'excretion'] },
    { name: 'Регуляция и движение', lessons: ['nervous', 'musculoskeletal', 'glucose-regulation'], sims: ['nervous', 'musculoskeletal', 'glucose-regulation'] },
    { name: 'Микроорганизмы', lessons: ['yeast'], sims: ['yeast'] },
    { name: 'Генетика', lessons: ['genetics', 'variation'], sims: ['genetics', 'variation'] },
    { name: 'Биотехнология', lessons: ['electrophoresis'], sims: ['electrophoresis'] },
  ],
  informatics: [
    { name: 'Устройство компьютера', lessons: ['it-pc-assembly', 'it-memory-units', 'it-logic-gates'], sims: ['it-pc-assembly', 'it-memory-units', 'it-logic-gates'] },
    { name: 'Компьютерные сети', lessons: ['it-network-topology', 'it-bandwidth'], sims: ['it-network-topology', 'it-bandwidth'] },
    { name: 'Информация и её кодирование', lessons: ['it-binary-code', 'it-alphabet-approach', 'it-number-systems'], sims: ['it-binary-code', 'it-alphabet-approach', 'it-number-systems'] },
    { name: 'Алгоритмы и программы', lessons: ['it-robot-branching', 'it-loop-trace', 'it-array-sorting'], sims: ['it-robot-branching', 'it-loop-trace', 'it-array-sorting'] },
  ],
};

const SHOWN_LESSONS = new Set(ALL_LESSONS.map((l) => l.id));
export const TOPICS = Object.fromEntries(Object.entries(ALL_TOPICS).map(([subject, topics]) => [subject, topics
  .map((topic) => ({ ...topic, lessons: topic.lessons.filter((id) => SHOWN_LESSONS.has(id)), sims: topic.sims?.filter((id) => SIMS[id]) }))
  .filter((topic) => topic.lessons.length)]));
export const SUBJECTS = ALL_SUBJECTS.filter((s) => TOPICS[s.id].length);

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
