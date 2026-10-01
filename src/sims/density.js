// Плотность твёрдого тела: массу находят на электронных весах, объём — по воде, вытесненной в мензурке
// (V = V₂ − V₁), плотность — по формуле ρ = m / V. Набор — как школьный «набор тел равного объёма»
// (алюминий, сталь, латунь, по 20 см³) и тело X из неизвестного вещества: его узнают по плотности.
// Масса тела считается из табличной плотности и объёма, а не задаётся числом на шаге работы,
// поэтому показания всегда согласованы с таблицей. Иллюстрация установки — в svg/scenes/density.js.

import { fmt } from './canvas.js';
import { densityScene } from '../svg/scenes/density.js';

// Плотности — по таблице учебника физики 7 класса (г/см³). Тела тонут в воде, поэтому объём
// можно измерить погружением. Размеры (d, h в см) подобраны под объём и ширину мензурки.
export const BODIES = [
  { name: 'алюминиевый цилиндр', title: 'Алюминиевый цилиндр', rho: 2.7, V: 20, d: 2.52, color: '#cbd5e1' },
  { name: 'стальной цилиндр', title: 'Стальной цилиндр', rho: 7.8, V: 20, d: 2.52, color: '#8a949f' },
  { name: 'латунный цилиндр', title: 'Латунный цилиндр', rho: 8.5, V: 20, d: 2.52, color: '#d4a72c' },
  { name: 'тело X', title: 'Тело X', rho: 7.1, V: 30, d: 3, color: '#9aa7b4' },
];

export const bodyOf = (p) => BODIES[p.body];
export const mass = (p) => bodyOf(p).rho * bodyOf(p).V; // г
export const level = (p) => p.V0 + (p.dipped ? bodyOf(p).V : 0); // мл — 1 мл = 1 см³
export const density = (p) => mass(p) / bodyOf(p).V; // г/см³

const rhoText = (p) => `${fmt(density(p), 2)} г/см³ = ${Math.round(density(p) * 1000)} кг/м³`;
const volText = (p) => `${level(p)} − ${p.V0} = ${bodyOf(p).V} см³`;

export default {
  id: 'density',
  subject: 'physics',
  title: 'Плотность вещества',
  freeTitle: 'Плотность тела',
  freeSub: 'Весы и мензурка',
  controls: [
    { id: 'body', label: 'Тело', min: 0, max: 3, step: 1, unit: '', value: 0, names: BODIES.map((b) => b.name), action: true, actionLabel: 'Выбрать тело на подставке' },
    { id: 'V0', label: 'Вода в мензурке до опыта V₁', min: 50, max: 150, step: 10, unit: 'мл', value: 100 },
    { id: 'weighed', label: 'Весы', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['тело не взвешено', 'тело взвешено'], action: true, actionLabel: 'Положить тело на весы' },
    { id: 'dipped', label: 'Мензурка', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['тело не в воде', 'тело опущено в воду'], action: true, actionLabel: 'Опустить тело в мензурку' },
  ],
  formula: 'ρ = m / V;  V = V₂ − V₁',
  hint: 'Нажимайте на тело или тащите его: подставка → весы → мензурка. Нажмите на другое тело, чтобы измерить его.',
  theory: 'Плотность вещества показывает, чему равна масса единицы объёма этого вещества: ρ = m / V. В СИ плотность измеряют в кг/м³, на практике часто в г/см³: 1 г/см³ = 1000 кг/м³. Объём тела неправильной формы измеряют мензуркой: тело, опущенное в воду, вытесняет столько воды, каков его объём, поэтому V = V₂ − V₁ (1 мл = 1 см³). Тела равного объёма из разных веществ имеют разную массу. Зная плотность, по таблице определяют, из какого вещества сделано тело.',

  readings(p) {
    return [
      { label: 'Тело', value: bodyOf(p).name },
      { label: 'Масса m', value: p.weighed ? `${fmt(mass(p), 1)} г` : 'не измерена' },
      { label: 'Объём V = V₂ − V₁', value: p.dipped ? volText(p) : 'не измерен' },
      { label: 'Плотность ρ', value: p.weighed && p.dipped ? rhoText(p) : 'нужны m и V' },
    ];
  },

  describe(p) {
    const b = bodyOf(p);
    if (p.weighed && p.dipped) return `${b.title}: m = ${fmt(mass(p), 1)} г, V = ${volText(p)}, ρ = m / V = ${rhoText(p)}`;
    if (p.weighed) return `${b.title}: весы показывают массу m = ${fmt(mass(p), 1)} г`;
    if (p.dipped) return `${b.title}: уровень воды поднялся с ${p.V0} до ${level(p)} мл, объём V = ${b.V} см³`;
    return `${b.title}: масса и объём ещё не измерены`;
  },

  create(container, params, set) {
    return densityScene(container, params, set, { BODIES, mass });
  },
};
