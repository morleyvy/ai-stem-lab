// Закон Архимеда: тело подвешено к пружинному динамометру на штативе. Ученик взвешивает его
// в воздухе, затем опускает динамометр с телом в жидкость (dip = 1): показание уменьшается
// на величину выталкивающей силы, а плавающее тело всплывает, и нить провисает.
// Иллюстрация установки — в svg/scenes/archimedes.js.

import { fmt } from './canvas.js';
import { archimedesScene } from '../svg/scenes/archimedes.js';

const G = 9.8;
const LIQUIDS = [
  { name: 'вода', density: 1000, color: '#60a5fa' },
  { name: 'солёная вода', density: 1200, color: '#22d3ee' },
  { name: 'масло', density: 900, color: '#facc15' },
];

const liquidOf = (p) => LIQUIDS[p.liquid];
const floats = (p) => p.rho < liquidOf(p).density;
// Сила Архимеда в равновесии: для плавающего тела равна весу, для утонувшего — ρж·g·V
export function buoyancy(p) {
  const V = p.V * 1e-6;
  return floats(p) ? p.rho * G * V : liquidOf(p).density * G * V;
}
const weight = (p) => p.rho * G * p.V * 1e-6;
// Показание динамометра: в воздухе — вес, в жидкости — вес минус сила Архимеда (не меньше нуля)
const scaleReading = (p) => (p.dip ? Math.max(0, weight(p) - buoyancy(p)) : weight(p));

export const ARCHIMEDES = {
  id: 'archimedes',
  freeTitle: 'Тело в жидкости',
  freeSub: 'Плотность, объём, сила Архимеда',
  freeIcon: 'anchor',
  subject: 'physics',
  title: 'Выталкивающая сила',
  controls: [
    { id: 'rho', label: 'Плотность тела', min: 200, max: 8000, step: 100, unit: 'кг/м³', value: 2700 },
    { id: 'V', label: 'Объём тела', min: 50, max: 500, step: 50, unit: 'см³', value: 100 },
    { id: 'liquid', label: 'Жидкость', min: 0, max: 2, step: 1, unit: '', value: 0, names: LIQUIDS.map((l) => l.name) },
    { id: 'dip', label: 'Тело', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['в воздухе', 'в жидкости'], action: true, actionLabel: 'Опустить тело в жидкость' },
  ],
  formula: 'Fₐ = ρж · g · Vпогр',
  hint: 'Потяните динамометр вниз, чтобы опустить тело в жидкость, и отпустите; вверх — чтобы вынуть. Разница показаний динамометра в воздухе и в жидкости — это выталкивающая сила.',
  // Пока тело в воздухе, выталкивающей силы нет — на графике честный ноль
  chart: { x: 'V', y: (p) => (p.dip ? buoyancy(p) : 0), xLabel: 'V, см³', yLabel: 'Fₐ, Н', series: (p) => liquidOf(p).name },
  theory: 'На тело, погружённое в жидкость, действует выталкивающая сила, равная весу вытесненной жидкости: Fₐ = ρж·g·V. Её можно измерить динамометром как разность веса тела в воздухе и в жидкости. Тело плавает, если его плотность меньше плотности жидкости, и тонет, если больше.',

  readings(p) {
    if (!p.dip) {
      return [
        { label: 'Динамометр (в воздухе)', value: `${fmt(weight(p))} Н` },
        { label: 'Выталкивающая сила Fₐ', value: '0 Н — тело в воздухе' },
        { label: 'Сила тяжести mg', value: `${fmt(weight(p))} Н` },
      ];
    }
    return [
      { label: 'Динамометр (в жидкости)', value: `${fmt(scaleReading(p))} Н` },
      { label: 'Выталкивающая сила Fₐ', value: `${fmt(buoyancy(p))} Н` },
      { label: 'Состояние тела', value: floats(p) ? `плавает, погружено ${Math.round((p.rho / liquidOf(p).density) * 100)}%` : 'тонет, висит на нити' },
    ];
  },

  describe(p) {
    if (!p.dip) return `Тело в воздухе: динамометр показывает его вес P = ${fmt(weight(p))} Н`;
    return floats(p)
      ? `Тело плавает, нить провисла, динамометр показывает 0 Н; Fₐ = mg = ${fmt(buoyancy(p))} Н`
      : `Динамометр показывает ${fmt(scaleReading(p))} Н вместо ${fmt(weight(p))} Н в воздухе; выталкивающая сила Fₐ = ${fmt(buoyancy(p))} Н`;
  },

  create(container, params, set) {
    return archimedesScene(container, params, set, { liquidOf, weight, G });
  },
};
