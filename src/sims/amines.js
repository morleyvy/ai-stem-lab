// Основные свойства аминов и амфотерность аминокислот: метиламин, анилин и глицин с индикаторами,
// соляной кислотой, раствором щёлочи и бромной водой.
// pH не задан таблицей, а считается из уравнения электронейтральности раствора по константам
// кислотности (25 °C): метиламин — сильное основание среди аминов (pKa иона CH₃NH₃⁺ 10,64),
// анилин — очень слабое (pKa C₆H₅NH₃⁺ 4,6: бензольное кольцо оттягивает неподелённую пару азота),
// глицин в воде — биполярный ион ⁺H₃N–CH₂–COO⁻ (pKa₁ 2,34, pKa₂ 9,60), поэтому реагирует и с кислотой,
// и со щёлочью. Окраска индикаторов следует из pH, масса осадка триброманилина — из стехиометрии.
// Иллюстрация установки — в svg/scenes/amines.js.

import { fmt } from './canvas.js';
import { aminesScene } from '../svg/scenes/amines.js';

export const C0 = 0.01; // моль/л — концентрация исследуемых растворов
export const V0 = 5; // мл — порция раствора в пробирке
const C_ACID = 0.01; // моль/л — соляная кислота и раствор NaOH той же концентрации, что и вещества
const C_BR2 = 0.05; // моль/л — бромная вода
const KW = 1e-14;
const M_TBA = 329.8; // г/моль — 2,4,6-триброманилин C₆H₂Br₃NH₂

export const SUBSTANCES = [
  { name: 'метиламин', formula: 'CH₃NH₂', kind: 'amine', pKa: 10.64 },
  { name: 'анилин', formula: 'C₆H₅NH₂', kind: 'amine', pKa: 4.6 },
  { name: 'глицин', formula: 'NH₂CH₂COOH', kind: 'amino', pKa1: 2.34, pKa2: 9.6 },
];
export const INDICATORS = ['не добавлен', 'фенолфталеин', 'универсальный индикатор'];
export const REAGENTS = ['не добавлен', 'соляная кислота HCl', 'раствор NaOH', 'бромная вода'];
const HCL = 1;
const NAOH = 2;
const BR2 = 3;

const vol = (p) => V0 + (p.reagent ? p.V : 0); // мл раствора в пробирке

// Бромная вода: анилин замещает три атома водорода в кольце (C₆H₅NH₂ + 3Br₂ → C₆H₂Br₃NH₂↓ + 3HBr),
// метиламин бромируется по аминогруппе, и выделившийся HBr связывает вторую молекулу амина
// (Br₂ + 2CH₃NH₂ → CH₃NHBr + [CH₃NH₃]Br), глицин в этих условиях с бромом не реагирует.
// Возвращает ммоль: израсходованного брома, вступившего в реакцию амина и выделившегося HBr.
export function bromination(p) {
  if (p.reagent !== BR2) return { br2: 0, used: 0, hbr: 0, left: 0 };
  const nSub = C0 * V0;
  const nBr2 = C_BR2 * p.V;
  if (p.substance === 1) {
    const br2 = Math.min(nBr2, 3 * nSub);
    return { br2, used: br2 / 3, hbr: br2, left: nBr2 - br2 };
  }
  if (p.substance === 0) {
    const br2 = Math.min(nBr2, nSub / 2);
    return { br2, used: br2, hbr: br2, left: nBr2 - br2 };
  }
  return { br2: 0, used: 0, hbr: 0, left: nBr2 };
}

// pH из уравнения электронейтральности: [H⁺] + [Na⁺] + [катионы] = [OH⁻] + [Cl⁻] + [Br⁻] + [анионы].
// Левая часть минус правая монотонно растёт с [H⁺], поэтому корень находится делением отрезка пополам.
// Избыток брома в воде слабо кислый (Br₂ + H₂O ⇄ HBr + HBrO, K ≈ 7·10⁻⁹) — им пренебрегаем.
export function pH(p) {
  const v = vol(p) / 1000;
  const sub = SUBSTANCES[p.substance];
  const br = bromination(p);
  const cSub = (C0 * V0 - br.used) / 1000 / v;
  const cCl = p.reagent === HCL ? (C_ACID * p.V) / 1000 / v : 0;
  const cNa = p.reagent === NAOH ? (C_ACID * p.V) / 1000 / v : 0;
  const cBr = br.hbr / 1000 / v;
  const balance = (h) => {
    let charge = h + cNa - KW / h - cCl - cBr;
    if (sub.kind === 'amine') {
      const ka = 10 ** -sub.pKa;
      charge += (cSub * h) / (h + ka);
    } else {
      const k1 = 10 ** -sub.pKa1;
      const k2 = 10 ** -sub.pKa2;
      charge += (cSub * (h * h - k1 * k2)) / (h * h + k1 * h + k1 * k2);
    }
    return charge;
  };
  let lo = -15;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (balance(10 ** mid) > 0) hi = mid;
    else lo = mid;
  }
  return -(lo + hi) / 2;
}

// Доля малиновой формы фенолфталеина (pKa 9,4): заметная окраска появляется примерно с pH 8,4
export const pinkShare = (ph) => 1 / (1 + 10 ** (9.4 - ph));

// Окраска универсального индикатора — по шкале, как на коробке индикаторной бумаги
export const UNIVERSAL = [
  [2.5, 'красная'], [4.5, 'оранжевая'], [5.5, 'жёлтая'], [6.5, 'жёлто-зелёная'],
  [7.5, 'зелёная'], [9, 'сине-зелёная'], [10.5, 'синяя'], [Infinity, 'фиолетовая'],
];

export function medium(ph) {
  if (ph < 3) return 'сильнокислая';
  if (ph < 5.5) return 'кислая';
  if (ph < 6.5) return 'слабокислая';
  if (ph <= 7.5) return 'нейтральная';
  if (ph < 9) return 'слабощелочная';
  if (ph < 11) return 'щелочная';
  return 'сильнощелочная';
}

// Масса осадка 2,4,6-триброманилина, мг
export const precipitate = (p) => (p.reagent === BR2 && p.substance === 1 ? bromination(p).used * M_TBA : 0);

// Доля брома, оставшегося в растворе (0 — бромная вода обесцветилась)
export const bromineLeft = (p) => (p.reagent === BR2 && p.V > 0 ? bromination(p).left / (C_BR2 * p.V) : 0);

function colorText(p) {
  // Об осадке говорит строка «Продукт реакции», здесь — только окраска брома
  if (p.reagent === BR2) {
    const left = bromineLeft(p);
    if (left < 0.02) return 'бромная вода обесцветилась';
    return left < 0.9 ? 'жёлтая окраска брома ослабла' : 'жёлтая окраска брома сохраняется';
  }
  const ph = pH(p);
  if (p.indicator === 1) {
    const k = pinkShare(ph);
    if (k > 0.5) return 'малиновая';
    return k > 0.1 ? 'бледно-розовая' : 'бесцветная';
  }
  if (p.indicator === 2) return UNIVERSAL.find(([lim]) => ph < lim)[1];
  return 'бесцветная';
}

function product(p) {
  const s = p.substance;
  if (p.reagent === HCL) return ['хлорид метиламмония [CH₃NH₃]Cl', 'хлорид фениламмония [C₆H₅NH₃]Cl', 'соль глицина [NH₃CH₂COOH]Cl'][s];
  if (p.reagent === NAOH) return s === 2 ? 'глицинат натрия NH₂CH₂COONa' : 'реакции нет';
  if (p.reagent === BR2) return ['бром реагирует с аминогруппой, осадка нет', `триброманилин C₆H₂Br₃NH₂↓, ${fmt(precipitate(p), 1)} мг`, 'реакции нет'][s];
  return '—';
}

const NAMES = ['Метиламин', 'Анилин', 'Глицин'];
const INDICATOR_IN = ['', 'с фенолфталеином', 'с универсальным индикатором'];
const REAGENT_SHORT = ['', 'HCl', 'NaOH', 'бромная вода'];

export default {
  id: 'amines',
  subject: 'chemistry',
  title: 'Свойства аминов и аминокислот',
  freeTitle: 'Амины и аминокислоты',
  freeSub: 'Индикаторы, pH, HCl, NaOH, бромная вода',
  controls: [
    { id: 'V', label: 'Объём реактива', min: 1, max: 10, step: 1, unit: 'мл', value: 2 },
    // Действия на сцене: склянку с веществом выбирают щелчком, капельницы подносят к пробирке
    { id: 'substance', label: 'Вещество', min: 0, max: 2, step: 1, unit: '', value: 0, names: SUBSTANCES.map((x) => x.name), action: true, actionLabel: 'Налить раствор вещества в пробирку' },
    { id: 'indicator', label: 'Индикатор', min: 0, max: 2, step: 1, unit: '', value: 0, names: INDICATORS, action: true, actionLabel: 'Добавить индикатор' },
    { id: 'reagent', label: 'Реактив', min: 0, max: 3, step: 1, unit: '', value: 0, names: REAGENTS, action: true, actionLabel: 'Добавить реактив' },
  ],
  // Общее для всех опытов работы: аминогруппа присоединяет ион H⁺ (уравнения конкретных реакций — в наблюдениях)
  formula: 'R–NH₂ + H⁺ → [R–NH₃]⁺',
  hint: 'Нажмите на склянку с веществом, затем на капельницу с индикатором или реактивом.',
  chart: { x: 'V', y: (p) => pH(p), xLabel: 'V реактива, мл', yLabel: 'pH', series: (p) => `${SUBSTANCES[p.substance].name} + ${p.reagent ? REAGENT_SHORT[p.reagent] : 'без реактива'}` },
  theory: 'Амины — производные аммиака, в которых атомы водорода замещены углеводородными радикалами. Атом азота аминогруппы имеет неподелённую электронную пару и присоединяет ион H⁺, поэтому амины — органические основания: их растворы имеют щелочную среду, с кислотами амины образуют соли. Метилрадикал увеличивает электронную плотность на азоте, и метиламин — более сильное основание, чем аммиак. В анилине неподелённая пара азота смещена в бензольное кольцо, поэтому анилин — очень слабое основание: его раствор не окрашивает фенолфталеин. Зато аминогруппа активирует кольцо, и анилин с бромной водой сразу даёт белый осадок 2,4,6-триброманилина. Аминокислоты содержат аминогруппу и карбоксильную группу, поэтому амфотерны: реагируют и с кислотами, и со щелочами. В водном растворе глицин существует в виде биполярного иона ⁺H₃N–CH₂–COO⁻, среда раствора близка к нейтральной.',

  readings(p) {
    const added = p.reagent ? ` + ${REAGENT_SHORT[p.reagent]} ${p.V} мл` : '';
    return [
      { label: 'В пробирке', value: `${SUBSTANCES[p.substance].name}${added}` },
      { label: 'pH', value: fmt(pH(p), 1) },
      { label: 'Окраска', value: colorText(p) },
      { label: 'Продукт реакции', value: product(p) },
    ];
  },

  describe(p) {
    const name = NAMES[p.substance];
    const ph = fmt(pH(p), 1);
    if (p.reagent === BR2) {
      if (p.substance === 1) return `Анилин с бромной водой (${p.V} мл): выпал белый осадок 2,4,6-триброманилина ${fmt(precipitate(p), 1)} мг, pH ${ph}`;
      return `${name} с бромной водой (${p.V} мл): ${colorText(p)}, осадка нет`;
    }
    const color = p.indicator ? `, окраска индикатора ${colorText(p)}` : '';
    if (p.reagent) return `${name} ${INDICATOR_IN[p.indicator]} + ${REAGENT_SHORT[p.reagent]} ${p.V} мл: pH ${ph}${color}`.replace('  ', ' ');
    if (p.indicator) return `${name} ${INDICATOR_IN[p.indicator]}: pH ${ph}, среда ${medium(pH(p))}${color}`;
    return `Раствор: ${name.toLowerCase()}, pH ${ph}, среда ${medium(pH(p))}`;
  },

  create(container, params, set) {
    return aminesScene(container, params, set, { pH, pinkShare, precipitate, bromineLeft, SUBSTANCES });
  },
};
