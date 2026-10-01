// Тепловой эффект растворения и нейтрализации в калориметре. В калориметр наливают воду или
// разбавленную соляную кислоту и высыпают навеску вещества: NaOH растворяется с выделением теплоты,
// NH₄NO₃ — с поглощением. Если NaOH попадает в кислоту,
// к теплоте растворения добавляется теплота нейтрализации NaOH + HCl → NaCl + H₂O.
// Температура считается из теплового баланса Q = c·m·Δt по табличным теплотам на моль вещества,
// поэтому видно, что Δt растёт с массой навески и что знак Δt отличает экзо- от эндотермического процесса.
// Иллюстрация установки — в svg/scenes/thermochem.js.

import { fmt } from './canvas.js';
import { thermochemScene } from '../svg/scenes/thermochem.js';

export const T0 = 20; // °C — вода, кислота и вещества взяты при комнатной температуре
// Удельная теплоёмкость воды 4,2 Дж/(г·°C). Плотность и теплоёмкость разбавленных растворов
// принимаем как у воды — так считают в школьных задачах, ошибка не больше нескольких процентов
export const C = 4.2;
// Теплота нейтрализации сильной кислоты сильным основанием, кДж на моль образовавшейся воды
export const Q_NEUT = 57.3;
// Соляная кислота 10 %: в каждом миллилитре ≈ 0,1 г HCl. В 100 мл её хватает на 10 г NaOH
const HCL_PER_ML = 0.1 / 36.5; // моль HCl в 1 мл
// Объём жидкости постоянный: урок сравнивает вещества и массы навески, а лишний регулятор только путал
export const V = 100;

// q — теплота растворения, кДж/моль: «+» — теплота выделяется, «−» — поглощается
// (справочные значения для разбавленных растворов при 25 °C)
export const SUBSTANCES = [
  null,
  { formula: 'NaOH', M: 40, q: 44.5, color: '#f8fafc' },
  { formula: 'NH₄NO₃', M: 80, q: -25.7, color: '#fefce8' },
];

export const substanceOf = (p) => SUBSTANCES[p.add] ?? null;
const inAcid = (p) => p.liquid === 1;

// Количество вещества NaOH, вступившего в нейтрализацию: не больше, чем есть HCl в кислоте
export const neutralized = (p) => (p.add === 1 && inAcid(p) ? Math.min(p.m / 40, HCL_PER_ML * V) : 0);

// Масса раствора: жидкость (1 г/мл) плюс растворённое вещество
export const solutionMass = (p) => V + (substanceOf(p) ? p.m : 0);

// Теплота процесса, Дж: «+» — выделилась, «−» — поглотилась
export function heat(p) {
  const sub = substanceOf(p);
  if (!sub) return 0;
  return ((p.m / sub.M) * sub.q + neutralized(p) * Q_NEUT) * 1000;
}

export const deltaT = (p) => heat(p) / (C * solutionMass(p));
export const temperature = (p) => T0 + deltaT(p);

// Знак Δt пишем явно: «+» — нагрев, «−» (типографский минус) — охлаждение
const signed = (v) => {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${fmt(Math.abs(r), 1)}`;
};
const liquidText = (p) => `${V} мл ${inAcid(p) ? 'соляной кислоты' : 'воды'}`;

export default {
  id: 'thermochem',
  subject: 'chemistry',
  title: 'Тепловой эффект растворения и нейтрализации',
  freeTitle: 'Калориметр',
  freeSub: 'Растворение NaOH, NH₄NO₃ и нейтрализация',
  controls: [
    { id: 'm', label: 'Масса вещества', min: 1, max: 10, step: 1, unit: 'г', value: 5 },
    // Действия на сцене: банку с веществом высыпают в калориметр, склянку с жидкостью — наливают
    {
      id: 'add', label: 'Вещество', min: 0, max: 2, step: 1, unit: '', value: 0,
      names: ['не добавлено', 'гидроксид натрия NaOH', 'нитрат аммония NH₄NO₃'],
      action: true, actionLabel: 'Высыпать вещество из банки в калориметр',
    },
    {
      id: 'liquid', label: 'Жидкость', min: 0, max: 1, step: 1, unit: '', value: 0,
      names: ['вода', 'соляная кислота (10 %)'],
      action: true, actionLabel: 'Налить в калориметр соляную кислоту',
    },
  ],
  formula: 'Q = c · m · Δt',
  hint: 'Перетащите банку с веществом к калориметру или нажмите на неё. Нажмите на склянку, чтобы налить воду или кислоту.',
  chart: { x: 'm', y: (p) => deltaT(p), xLabel: 'масса вещества, г', yLabel: 'Δt, °C', series: (p) => (substanceOf(p) ? `${substanceOf(p).formula} в ${liquidText(p)}` : 'без вещества') },
  theory: 'Химические реакции и растворение сопровождаются выделением или поглощением теплоты. Процесс, при котором теплота выделяется, называют экзотермическим — раствор нагревается (растворение NaOH, реакция нейтрализации). Процесс, при котором теплота поглощается, — эндотермический: раствор охлаждается (растворение NH₄NO₃). Количество теплоты находят по изменению температуры раствора в калориметре: Q = c·m·Δt, где c = 4,2 Дж/(г·°C), m — масса раствора. Чем больше вещества, тем больше теплоты и тем сильнее меняется температура.',

  readings(p) {
    const sub = substanceOf(p);
    const out = [{ label: 'Температура', value: `${fmt(temperature(p), 1)} °C` }];
    if (!sub) {
      out.push({ label: 'В калориметре', value: liquidText(p) });
      return out;
    }
    const Q = heat(p);
    out.push(
      { label: 'Δt', value: `${signed(deltaT(p))} °C` },
      { label: Q >= 0 ? 'Выделилось Q' : 'Поглотилось Q', value: `${fmt(Math.abs(Q) / 1000, 2)} кДж` },
      { label: 'Процесс', value: Q >= 0 ? 'экзотермический' : 'эндотермический' },
    );
    return out;
  },

  describe(p) {
    const sub = substanceOf(p);
    if (!sub) return `В калориметре ${liquidText(p)} при ${T0} °C`;
    const dt = deltaT(p);
    const Q = heat(p);
    const tail = neutralized(p) ? '; кроме растворения идёт реакция нейтрализации' : '';
    return `${sub.formula} (${p.m} г) в ${liquidText(p)}: температура ${dt >= 0 ? 'повысилась' : 'понизилась'} до ${fmt(temperature(p), 1)} °C, Δt = ${signed(dt)} °C; ${Q >= 0 ? 'выделилось' : 'поглотилось'} ${fmt(Math.abs(Q) / 1000, 2)} кДж теплоты${tail}`;
  },

  create(container, params, set) {
    return thermochemScene(container, params, set, { temperature, SUBSTANCES, T0 });
  },
};
