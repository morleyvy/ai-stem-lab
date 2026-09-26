// Математический маятник: колебания в реальном времени, период T = 2π√(L/g).
// Масса на период не влияет — ученик должен убедиться в этом сам.
// Маятник неподвижен, пока ученик не отведёт груз и не отпустит его (released = 1);
// время колебаний он засекает сам ручным секундомером на столе.
// Иллюстрация установки — в svg/scenes/pendulum.js.

import { fmt } from './canvas.js';
import { pendulumScene } from '../svg/scenes/pendulum.js';

const G = 9.81;

export const period = (L) => 2 * Math.PI * Math.sqrt(L / G);

export const PENDULUM = {
  id: 'pendulum',
  freeTitle: 'Маятник',
  freeSub: 'Длина нити, масса, период',
  freeIcon: 'wave',
  subject: 'physics',
  title: 'Маятник',
  controls: [
    { id: 'L', label: 'Длина нити', min: 0.2, max: 2, step: 0.1, unit: 'м', value: 1 },
    { id: 'm', label: 'Масса груза', min: 0.1, max: 1, step: 0.1, unit: 'кг', value: 0.1 },
    { id: 'released', label: 'Маятник', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['висит неподвижно', 'колеблется'], action: true, actionLabel: 'Отвести и отпустить груз' },
  ],
  formula: 'T = 2π√(L / g)',
  hint: 'Отведите груз мышью в сторону и отпустите — маятник начнёт колебаться. Кнопка сверху на секундомере запускает и останавливает отсчёт, боковая — сбрасывает. Засеките время 10 колебаний и разделите на 10. Длину нити и массу груза меняйте регуляторами.',
  chart: { x: 'L', y: (p) => period(p.L), xLabel: 'L, м', yLabel: 'T, с', series: (p) => `m = ${fmt(p.m, 1)} кг` },
  theory: 'Период малых колебаний математического маятника зависит только от длины нити и ускорения свободного падения: T = 2π√(L/g). От массы груза он не зависит.',

  readings(p) {
    return [
      { label: 'Период T', value: `${fmt(period(p.L))} с` },
      { label: 'Частота ν = 1/T', value: `${fmt(1 / period(p.L))} Гц` },
      { label: 'Длина L', value: `${fmt(p.L, 1)} м` },
    ];
  },

  describe(p) {
    if (!p.released) return `Маятник висит неподвижно; расчётный период при L = ${fmt(p.L, 1)} м — T = ${fmt(period(p.L))} с`;
    return `Период колебаний T = ${fmt(period(p.L))} с`;
  },

  create(container, params, set) {
    return pendulumScene(container, params, set, { period });
  },
};
