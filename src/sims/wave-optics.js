// Определение длины световой волны с помощью дифракционной решётки (11 класс, «Волновая оптика»).
// Лазерный модуль светит на решётку с периодом d, за ней на расстоянии L стоит экран с линейкой.
// Максимумы k-го порядка лежат под углами d·sin φ = k·λ. Ученик читает по линейке положение
// максимума 1-го порядка x₁ (с точностью до 1 мм, как на настоящей линейке) и по нему вычисляет λ:
// sin φ₁ = x₁ / √(x₁² + L²). Поэтому вычисленная длина волны отличается от паспортной на несколько
// нанометров — это погрешность отсчёта, а не ошибка модели. Иллюстрация — в svg/scenes/wave-optics.js.

import { fmt } from './canvas.js';
import { waveOpticsScene } from '../svg/scenes/wave-optics.js';

// Паспортные длины волн распространённых лазерных модулей (красный, зелёный, фиолетовый)
export const LASERS = [
  { name: 'красный', title: 'Красный', nm: 650, color: '#ff3b2f' },
  { name: 'зелёный', title: 'Зелёный', nm: 532, color: '#2ee66b' },
  { name: 'фиолетовый', title: 'Фиолетовый', nm: 405, color: '#b57aff' },
];
// Школьные решётки: число штрихов на 1 мм; период d = 1/N мм
export const GRATINGS = [100, 300, 600];
export const SCREEN_HALF = 25; // см — линейка на экране размечена от −25 до +25 см

export const periodUm = (p) => 1000 / GRATINGS[p.grating]; // период решётки, мкм
const lambdaUm = (p) => LASERS[p.laser].nm / 1000;
// Наибольший порядок: sin φ не может превышать 1, поэтому k ≤ d/λ
export const kMax = (p) => Math.floor(periodUm(p) / lambdaUm(p));
// Положение максимума k-го порядка на экране, см (от центрального максимума)
export function spotX(p, k) {
  const sin = (k * lambdaUm(p)) / periodUm(p);
  return p.L * Math.tan(Math.asin(sin));
}
// Сколько максимумов (вместе с центральным) попадает на экран
export const onScreen = (p) => {
  let n = 0;
  for (let k = 1; k <= kMax(p); k++) if (spotX(p, k) <= SCREEN_HALF) n = k;
  return 2 * n + 1;
};

// Отсчёт по линейке экрана — до миллиметра; по нему ученик и считает длину волны
function measure(p) {
  const x = Math.round(spotX(p, 1) * 10) / 10;
  if (x > SCREEN_HALF) return null;
  const sin = x / Math.hypot(x, p.L);
  return { x, sin, nm: periodUm(p) * sin * 1000 };
}

const setup = (p) => `${LASERS[p.laser].title} лазер, решётка ${GRATINGS[p.grating]} штрихов на 1 мм, L = ${p.L} см`;

const sim = {
  id: 'wave-optics',
  subject: 'physics',
  title: 'Дифракционная решётка',
  freeTitle: 'Лазер и решётка',
  freeSub: 'Дифракция, длина волны',
  controls: [
    { id: 'L', label: 'Расстояние от решётки до экрана L', min: 20, max: 70, step: 5, unit: 'см', value: 50 },
    { id: 'on', label: 'Лазер', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключен', 'включён'], action: true, actionLabel: 'Включить лазер' },
    { id: 'laser', label: 'Цвет лазера', min: 0, max: 2, step: 1, unit: '', value: 0, names: LASERS.map((l) => l.name), action: true, actionLabel: 'Поставить другой лазер' },
    { id: 'grating', label: 'Дифракционная решётка', min: 0, max: 2, step: 1, unit: '', value: 1, names: GRATINGS.map((n) => `${n} штрихов на 1 мм`), action: true, actionLabel: 'Заменить решётку' },
  ],
  formula: 'd · sin φ = k · λ;  sin φ = x / √(x² + L²)',
  hint: 'Нажмите на лазер, чтобы включить его. Другой лазер — слева, другая решётка — справа. Экран тащите вдоль скамьи.',
  chart: { x: 'L', y: (p) => spotX(p, 1), xLabel: 'L, см', yLabel: 'x₁, см', series: (p) => `${LASERS[p.laser].title}, ${GRATINGS[p.grating]} штр./мм` },
  theory: 'Дифракционная решётка — множество параллельных щелей на одинаковом расстоянии d (период решётки). Волны от всех щелей усиливают друг друга в направлениях, для которых разность хода равна целому числу длин волн: d · sin φ = k · λ, где k = 0, 1, 2… — порядок максимума. Зная d и измерив угол φ по положению максимума на экране, находят длину волны λ.',

  readings(p) {
    if (!p.on) {
      return [
        { label: 'Лазер', value: 'выключен' },
        { label: 'Период решётки d', value: `${fmt(periodUm(p))} мкм` },
      ];
    }
    const m = measure(p);
    return [
      { label: 'Максимум 1-го порядка x₁', value: m ? `${fmt(m.x, 1)} см` : 'за краем экрана' },
      { label: 'sin φ₁', value: m ? fmt(m.sin, 3) : '—' },
      { label: 'Длина волны λ', value: m ? `${Math.round(m.nm)} нм` : '—' },
      { label: 'Максимумов на экране', value: String(onScreen(p)) },
    ];
  },

  describe(p) {
    if (!p.on) return 'Лазер выключен: на экране темно';
    const m = measure(p);
    if (!m) return `${setup(p)}: максимумы 1-го порядка за краем экрана`;
    return `${setup(p)}: x₁ = ${fmt(m.x, 1)} см, sin φ₁ = ${fmt(m.sin, 3)}, λ = ${Math.round(m.nm)} нм`;
  },

  create(container, params, set) {
    return waveOpticsScene(container, params, set, { LASERS, GRATINGS, SCREEN_HALF, kMax });
  },
};

export default sim;
