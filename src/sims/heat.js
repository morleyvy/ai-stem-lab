// Удельная теплоёмкость: одинаковый нагреватель (500 Вт) нагревает разные вещества.
// Q = P·t = c·m·Δt, поэтому вещества с меньшей теплоёмкостью нагреваются сильнее.

import { fmt } from './canvas.js';
import { heatScene } from '../svg/scenes/heat.js';

const POWER = 500; // Вт
const START_T = 20;
const SUBSTANCES = [
  { name: 'вода', verb: 'нагрелась', c: 4200, boil: 100, color: '#60a5fa', liquid: true },
  { name: 'масло', verb: 'нагрелось', c: 1700, boil: null, color: '#facc15', liquid: true },
  { name: 'алюминий', verb: 'нагрелся', c: 920, boil: null, color: '#cbd5e1', liquid: false },
];

export const substanceOf = (p) => SUBSTANCES[p.s];

// При выключенной плитке теплота не подводится — вещество остаётся комнатной температуры
export const heatSupplied = (p) => (p.power ? POWER * p.t : 0);

export function temperature(p) {
  const sub = substanceOf(p);
  if (!p.power) return START_T;
  const t = START_T + (POWER * p.t) / (sub.c * p.m);
  // Вода выше 100 °C не нагревается — энергия уходит на кипение
  return sub.boil ? Math.min(sub.boil, t) : t;
}

export const HEAT = {
  id: 'heat',
  subject: 'physics',
  title: 'Удельная теплоёмкость',
  freeTitle: 'Нагревание веществ',
  freeSub: 'Вещество, масса, время нагрева',
  freeIcon: 'teapot',
  controls: [
    { id: 's', label: 'Вещество', min: 0, max: 2, step: 1, unit: '', value: 0, names: SUBSTANCES.map((s) => `${s.name} (c = ${s.c})`) },
    { id: 'm', label: 'Масса', min: 0.1, max: 1, step: 0.1, unit: 'кг', value: 0.2 },
    { id: 't', label: 'Время нагрева', min: 0, max: 120, step: 10, unit: 'с', value: 0 },
    // Действие на сцене: тумблер на корпусе плитки. Пока плитка выключена, нагрева нет.
    { id: 'power', label: 'Плитка', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключена', 'включена'], action: true, actionLabel: 'Включить плитку' },
  ],
  formula: 'Q = c · m · Δt',
  hint: 'Включите плитку тумблером на её корпусе, затем меняйте вещество, массу и время нагрева регуляторами ниже и следите за термометром. Стеклянную палочку можно двигать — перемешивать жидкость.',
  chart: { x: 't', y: (p) => temperature(p), xLabel: 'время, с', yLabel: 'температура, °C', series: (p) => `${substanceOf(p).name}, ${fmt(p.m, 1)} кг` },
  theory: 'Количество теплоты, нужное для нагревания тела, Q = c·m·Δt, где c — удельная теплоёмкость вещества. При одинаковом подводе теплоты сильнее нагревается вещество с меньшей теплоёмкостью и меньшей массой.',

  readings(p) {
    const T = temperature(p);
    return [
      { label: 'Температура', value: `${fmt(T, 1)} °C` },
      { label: 'Подведено теплоты Q = P·t', value: `${fmt(heatSupplied(p) / 1000, 1)} кДж` },
      { label: 'Изменение температуры Δt', value: `${fmt(T - START_T, 1)} °C` },
    ];
  },

  describe(p) {
    if (!p.power) return `Плитка выключена: ${substanceOf(p).name} при ${START_T} °C`;
    const T = temperature(p);
    const boiling = substanceOf(p).boil && T >= substanceOf(p).boil;
    return `${substanceOf(p).name} ${substanceOf(p).verb} до ${fmt(T, 1)} °C${boiling ? ' и кипит' : ''}`;
  },

  create(container, params, set) {
    return heatScene(container, params, set, { temperature, substanceOf });
  },
};
