// Сравнение свойств бензола, толуола и фенола: бромная вода, подкисленный раствор KMnO₄ и FeCl₃
// (в подписях — просто «раствор KMnO₄», кислоту упоминают только оборудование и уравнение).
// Что произойдёт, задаёт таблица реакций (как в учебнике): бензол не реагирует ни с одним реактивом,
// толуол окисляется перманганатом только при нагревании (метильная группа → COOH), фенол мгновенно
// обесцвечивает бромную воду с белым осадком 2,4,6-трибромфенола и даёт с FeCl₃ фиолетовое окрашивание.
// Скорость обесцвечивания — реакция первого порядка по окрашенному реактиву, температура входит
// через уравнение Аррениуса. Поэтому ученик видит не «да/нет», а то, что толуол при 20 °C почти
// не трогает KMnO₄, а в горячей водяной бане обесцвечивает его за пару минут.
// Иллюстрация установки — в svg/scenes/aromatic.js.

import { fmt } from './canvas.js';
import { aromaticScene } from '../svg/scenes/aromatic.js';

export const SUBSTANCES = [
  { name: 'бензол', formula: 'бензол C₆H₆', organicLayer: true },
  { name: 'толуол', formula: 'толуол C₆H₅CH₃', organicLayer: true },
  // Фенол берут водным раствором («фенольная вода») — со всеми реактивами получается один слой
  { name: 'фенол', formula: 'фенол C₆H₅OH', organicLayer: false },
];
export const REAGENTS = ['не добавлен', 'бромная вода', 'раствор KMnO₄', 'раствор FeCl₃'];
const BR2 = 1;
const KMNO4 = 2;
const FECL3 = 3;

export const OBSERVE = 5; // мин — столько пробирку держат в бане и наблюдают
const CLEAR = 0.05; // меньше 5% реактива — окраску глазом уже не видно
const EA = 70; // кДж/моль — энергия активации окисления: от 20 до 80 °C скорость растёт примерно в 130 раз
const R = 8.314e-3; // кДж/(моль·К)

// Время полного обесцвечивания (95%) в опытах школьного масштаба при указанной температуре.
// null — реакции нет: бензольное кольцо не окисляется KMnO₄, а без катализатора FeBr₃
// бензол и толуол бромную воду не обесцвечивают (бром лишь переходит в их слой).
const DECOLOR = {
  [BR2]: [null, null, { t: 0.02, at: 20 }],
  [KMNO4]: [null, { t: 2, at: 80 }, { t: 0.5, at: 20 }],
};

// Константа скорости, 1/мин, при температуре бани T; 0 — реакция не идёт
export function rate(p) {
  const row = DECOLOR[p.reagent];
  const d = row?.[p.substance];
  if (!d) return 0;
  const k0 = Math.log(1 / CLEAR) / d.t;
  return k0 * Math.exp((EA / R) * (1 / (d.at + 273.15) - 1 / (p.T + 273.15)));
}

// Доля окрашенного реактива, оставшаяся через t минут
export const remaining = (p, t = OBSERVE) => Math.exp(-rate(p) * t);

const decolorizes = (p) => p.reagent === BR2 || p.reagent === KMNO4;
const decolored = (p) => (decolorizes(p) ? (1 - remaining(p)) * 100 : 0);

// Что видно в пробирке через 5 минут
export function observation(p) {
  if (p.reagent === BR2) {
    if (p.substance === 2) return 'бромная вода обесцветилась, выпал белый осадок';
    return p.substance === 0 ? 'бромная вода не обесцветилась: бром перешёл в верхний слой бензола' : 'бромная вода не обесцветилась: бром перешёл в верхний слой толуола';
  }
  if (p.reagent === KMNO4) {
    const r = remaining(p);
    if (r <= CLEAR) return 'фиолетовый раствор обесцветился';
    if (r < 0.8) return 'фиолетовая окраска заметно ослабла';
    return 'фиолетовая окраска сохраняется';
  }
  if (p.reagent === FECL3) return p.substance === 2 ? 'появилось фиолетовое окрашивание' : 'жёлтый раствор FeCl₃ не изменился';
  return 'бесцветная жидкость';
}

const NAMES = ['Бензол', 'Толуол', 'Фенол'];

const BROMINATION = 'C₆H₅OH + 3Br₂ → C₆H₂Br₃OH↓ + 3HBr';
// Уравнение того, что сейчас идёт в пробирке. Журнал работы пишет в строку sim.formula в момент
// наблюдения, поэтому formula — геттер от параметров последней созданной сцены: иначе у толуола
// в журнале стояло бы уравнение бромирования фенола.
let live = null;
function equation(p) {
  if (p.reagent === BR2 && p.substance === 2) return BROMINATION;
  if (p.reagent === KMNO4 && p.substance === 1 && remaining(p) < 0.8) return '5C₆H₅CH₃ + 6KMnO₄ + 9H₂SO₄ → 5C₆H₅COOH + 6MnSO₄ + 3K₂SO₄ + 14H₂O';
  if (p.reagent === FECL3 && p.substance === 2) return '6C₆H₅OH + FeCl₃ → H₃[Fe(OC₆H₅)₆] + 3HCl';
  if (p.reagent === KMNO4 && p.substance === 2) return 'фенол окисляется перманганатом';
  if (p.reagent === KMNO4 && p.substance === 1) return 'реакция почти не идёт';
  return p.reagent ? 'реакция не идёт' : 'реактив не добавлен';
}

export default {
  id: 'aromatic',
  subject: 'chemistry',
  title: 'Свойства бензола, толуола и фенола',
  freeTitle: 'Бензол, толуол, фенол',
  freeSub: 'Бромная вода, KMnO₄, FeCl₃, нагревание',
  controls: [
    { id: 'T', label: 'Температура водяной бани', min: 20, max: 80, step: 10, unit: '°C', value: 20 },
    // Действия на сцене: склянку с веществом выбирают щелчком, капельницу с реактивом подносят к пробирке
    { id: 'substance', label: 'Вещество', min: 0, max: 2, step: 1, unit: '', value: 0, names: SUBSTANCES.map((x) => x.name), action: true, actionLabel: 'Налить вещество в чистую пробирку' },
    { id: 'reagent', label: 'Реактив', min: 0, max: 3, step: 1, unit: '', value: 0, names: REAGENTS, action: true, actionLabel: 'Добавить реактив капельницей' },
  ],
  get formula() {
    return live ? equation(live) : BROMINATION;
  },
  hint: 'Нажмите на склянку с веществом слева, затем на капельницу с реактивом справа. Нажмите на плитку, чтобы нагреть баню.',
  chart: { x: 'T', y: decolored, xLabel: 'T бани, °C', yLabel: 'обесцвечено за 5 мин, %', series: (p) => `${SUBSTANCES[p.substance].name} + ${['без реактива', 'Br₂', 'KMnO₄', 'FeCl₃'][p.reagent]}` },
  theory: 'Бензол — ароматический углеводород с устойчивой π-системой из шести электронов. Поэтому, в отличие от алкенов, он не обесцвечивает бромную воду и раствор KMnO₄: для бромирования нужен катализатор FeBr₃. В толуоле бензольное кольцо влияет на метильную группу: при нагревании KMnO₄ окисляет её до карбоксильной группы — образуется бензойная кислота. В феноле группа OH увеличивает электронную плотность в кольце в положениях 2, 4, 6: фенол без катализатора мгновенно обесцвечивает бромную воду, выпадает белый осадок 2,4,6-трибромфенола. С FeCl₃ фенол даёт фиолетовое окрашивание — качественная реакция на фенол.',

  readings(p) {
    // Температуру уже показывают регулятор и табло плитки, продукт — уравнение под шагом
    const out = [
      { label: 'Вещество', value: SUBSTANCES[p.substance].formula },
      { label: 'Реактив', value: REAGENTS[p.reagent] },
    ];
    if (decolorizes(p)) out.push({ label: 'Обесцвечено за 5 мин', value: `${fmt(decolored(p), 0)}%` });
    out.push({ label: 'Наблюдение', value: observation(p) });
    return out;
  },

  describe(p) {
    const name = NAMES[p.substance];
    if (p.reagent === 0) return `${name} налит в пробирку, реактив ещё не добавлен`;
    if (p.reagent === BR2) {
      if (p.substance === 2) return 'Фенол мгновенно обесцветил бромную воду, выпал белый осадок 2,4,6-трибромфенола';
      return `${name} не обесцвечивает бромную воду: бром перешёл в верхний слой, реакции нет`;
    }
    if (p.reagent === FECL3) {
      return p.substance === 2 ? 'Фенол с раствором FeCl₃ дал фиолетовое окрашивание' : `${name} с раствором FeCl₃ не реагирует, окраска не изменилась`;
    }
    if (p.substance === 0) return `Бензол не обесцвечивает раствор KMnO₄ даже при ${p.T} °C`;
    const pct = fmt(decolored(p), 0);
    if (p.substance === 2) return `Фенол при ${p.T} °C быстро обесцвечивает раствор KMnO₄: за 5 мин обесцвечено ${pct}%`;
    return `Толуол при ${p.T} °C: за 5 мин обесцвечено ${pct}% раствора KMnO₄`;
  },

  create(container, params, set) {
    live = params;
    return aromaticScene(container, params, set, { rate, SUBSTANCES });
  },
};
