// Свободные электромагнитные колебания в колебательном контуре. Конденсатор (магазин конденсаторов)
// заряжают от источника 20 В, затем перекидной ключ замыкает его на катушку с железным сердечником
// через реостат. Осциллограф, подключённый к конденсатору, показывает затухающие колебания напряжения.
// Модель — последовательный RLC-контур без упрощений: при малом R период почти равен формуле Томсона
// T = 2π√(LC), а амплитуда убывает как e^(−βt), β = R / 2L. Во всём диапазоне регуляторов
// R < 2√(L/C) — колебания всегда есть (апериодического разряда в работе нет).
// Иллюстрация установки — в svg/scenes/em-oscillations.js.

import { fmt } from './canvas.js';
import { emOscillationsScene } from '../svg/scenes/em-oscillations.js';

export const U0 = 20; // В — напряжение источника, до которого заряжают конденсатор

const farads = (p) => p.C * 1e-6;
// Затухание β = R / 2L и собственная частота затухающих колебаний ω = √(1/LC − β²)
export const beta = (p) => p.R / (2 * p.L);
export const omega = (p) => Math.sqrt(1 / (p.L * farads(p)) - beta(p) ** 2);
// Период, который измеряют по осциллографу (с учётом затухания), и период по формуле Томсона
export const period = (p) => (2 * Math.PI) / omega(p);
export const thomson = (p) => 2 * Math.PI * Math.sqrt(p.L * farads(p));
export const energy = (p) => (farads(p) * U0 * U0) / 2; // Дж — энергия заряженного конденсатора
// Доля начальной амплитуды, оставшаяся через 10 полных колебаний
export const decay10 = (p) => Math.exp(-beta(p) * 10 * period(p));

// Напряжение на конденсаторе и ток разряда через t секунд после замыкания на катушку:
// q(t) = q₀·e^(−βt)·(cos ωt + β/ω·sin ωt), i = −dq/dt = U₀/(ωL)·e^(−βt)·sin ωt
export function state(p, t) {
  const w = omega(p);
  const b = beta(p);
  const e = Math.exp(-b * t);
  return {
    u: U0 * e * (Math.cos(w * t) + (b / w) * Math.sin(w * t)),
    i: (U0 / (w * p.L)) * e * Math.sin(w * t),
  };
}

const ms = (sec) => `${fmt(sec * 1000, 1)} мс`;
const mJ = (j) => `${fmt(j * 1000)} мДж`;
// Проценты: крупные — целыми, мелкие — с десятыми, совсем малые — «< 0,1»
function pct(x) {
  const v = x * 100;
  if (v < 0.1) return '< 0,1';
  return v >= 1 ? String(Math.round(v)) : fmt(v, 1);
}

const sim = {
  id: 'em-oscillations',
  subject: 'physics',
  title: 'Колебательный контур',
  freeTitle: 'Колебательный контур',
  freeSub: 'Конденсатор, катушка, осциллограф',
  controls: [
    { id: 'C', label: 'Ёмкость конденсатора C', min: 1, max: 16, step: 1, unit: 'мкФ', value: 4 },
    { id: 'L', label: 'Индуктивность катушки L', min: 0.05, max: 1, step: 0.05, unit: 'Гн', value: 0.25 },
    { id: 'R', label: 'Сопротивление контура R', min: 5, max: 100, step: 5, unit: 'Ом', value: 10 },
    { id: 'sw', label: 'Ключ', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['зарядка от источника', 'замкнут на катушку'], action: true, actionLabel: 'Переключить ключ на катушку' },
  ],
  formula: 'T = 2π√(LC);  ν = 1/T;  CU²/2 = LI²/2',
  hint: 'Щёлкните по ключу на стенде. Ёмкость меняйте ручкой магазина конденсаторов, индуктивность — сердечником катушки, сопротивление — ползунком реостата.',
  chart: { x: 'C', y: (p) => period(p) * 1000, xLabel: 'C, мкФ', yLabel: 'T, мс', series: (p) => `L = ${fmt(p.L)} Гн` },
  theory: 'Колебательный контур — цепь из конденсатора и катушки. Заряженный конденсатор разряжается через катушку, и энергия электрического поля конденсатора W = q²/2C переходит в энергию магнитного поля катушки W = Li²/2, а затем обратно. Период свободных колебаний находят по формуле Томсона T = 2π√(LC). В реальном контуре есть сопротивление R: часть энергии превращается во внутреннюю энергию проводов, и колебания затухают тем быстрее, чем больше R.',

  readings(p) {
    if (!p.sw) {
      return [
        { label: 'Ключ', value: 'зарядка от источника' },
        { label: 'Напряжение U', value: `${U0} В` },
        { label: 'Энергия W', value: mJ(energy(p)) },
        { label: 'Период по Томсону', value: ms(thomson(p)) },
      ];
    }
    return [
      { label: 'Период T', value: ms(period(p)) },
      { label: 'Частота ν', value: `${Math.round(1 / period(p))} Гц` },
      // Во время колебаний энергия контура убывает (её показывают столбики на сцене), здесь — запас при замыкании
      { label: 'Начальная энергия W', value: mJ(energy(p)) },
      { label: 'Амплитуда через 10 колебаний', value: `${pct(decay10(p))}% от начальной` },
    ];
  },

  describe(p) {
    if (!p.sw) return `Конденсатор ${p.C} мкФ заряжен до ${U0} В: энергия электрического поля ${mJ(energy(p))}`;
    return `T = ${ms(period(p))}, ν = ${Math.round(1 / period(p))} Гц; через 10 колебаний амплитуда — ${pct(decay10(p))}% от начальной`;
  },

  create(container, params, set) {
    return emOscillationsScene(container, params, set, { state, energy, U0 });
  },
};

export default sim;
