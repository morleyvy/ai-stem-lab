// Закон Ома для полной цепи: батарейка, ключ, амперметр и реостат соединены последовательно,
// вольтметр подключён прямо к зажимам батарейки. Ученик замыкает ключ, двигает движок реостата
// и меняет новую батарейку на старую — по показаниям находит ЭДС ε и внутреннее сопротивление r.
// Приборы считаем идеальными (амперметр без сопротивления, через вольтметр ток не идёт): в школьной
// работе их поправки меньше погрешности шкалы, а без них U = ε − I·r выполняется точно.
// Иллюстрация установки — в svg/scenes/dc-circuit.js.

import { fmt } from './canvas.js';
import { dcCircuitScene } from '../svg/scenes/dc-circuit.js';

// Плоская батарейка 4,5 В: у новой внутреннее сопротивление около 1 Ом, у разряженной ЭДС почти та же,
// а внутреннее сопротивление в несколько раз больше — так её и отличают от новой под нагрузкой
export const SOURCES = [
  { emf: 4.5, r: 1 },
  { emf: 4.4, r: 3 },
];
const SOURCE_NAMES = ['новая батарейка', 'старая батарейка'];

const src = (p) => SOURCES[p.source] ?? SOURCES[0];
// Ток идёт только при замкнутом ключе: I = ε / (R + r)
export const current = (p) => (p.switch ? src(p).emf / (p.R + src(p).r) : 0);
// Вольтметр на зажимах показывает ЭДС за вычетом падения напряжения внутри источника
export const voltage = (p) => src(p).emf - current(p) * src(p).r;

const sim = {
  id: 'dc-circuit',
  subject: 'physics',
  title: 'ЭДС и внутреннее сопротивление',
  freeTitle: 'Полная цепь',
  freeSub: 'ЭДС, внутреннее сопротивление, ток',
  controls: [
    { id: 'R', label: 'Сопротивление реостата', min: 1, max: 20, step: 1, unit: 'Ом', value: 10 },
    { id: 'switch', label: 'Ключ', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['разомкнут', 'замкнут'], action: true, actionLabel: 'Переключить ключ' },
    { id: 'source', label: 'Источник тока', min: 0, max: 1, step: 1, unit: '', value: 0, names: SOURCE_NAMES, action: true, actionLabel: 'Заменить батарейку' },
  ],
  formula: 'I = ε / (R + r);  U = ε − I·r',
  hint: 'Нажмите на ключ, чтобы замкнуть цепь. Тяните ползунок реостата. Нажмите на батарейку на столе, чтобы поставить её в держатель.',
  chart: {
    x: 'R',
    y: voltage,
    xLabel: 'R, Ом',
    yLabel: 'U, В',
    // Точки с разомкнутым ключом — отдельная серия: там вольтметр показывает ЭДС при любом R
    series: (p) => (p.switch ? SOURCE_NAMES[p.source] : 'ключ разомкнут'),
  },
  theory: 'Сила тока в полной цепи прямо пропорциональна ЭДС источника и обратно пропорциональна полному сопротивлению цепи: I = ε / (R + r), где R — сопротивление внешней цепи, r — внутреннее сопротивление источника. Напряжение на зажимах источника меньше ЭДС на падение напряжения внутри него: U = ε − I·r. При разомкнутой цепи U = ε, а при коротком замыкании (R → 0) ток наибольший: Iкз = ε / r.',

  readings(p) {
    const I = current(p);
    return [
      { label: 'Сила тока I', value: `${fmt(I)} А` },
      { label: 'Напряжение U', value: `${fmt(voltage(p))} В` },
      p.switch
        ? { label: 'Реостат R', value: `${fmt(p.R, 0)} Ом` }
        : { label: 'Ключ', value: 'разомкнут' },
      { label: 'Батарейка', value: SOURCE_NAMES[p.source] },
    ];
  },

  describe(p) {
    if (!p.switch) return `Ключ разомкнут, тока нет: вольтметр на зажимах показывает ЭДС ε = ${fmt(voltage(p))} В`;
    return `R = ${fmt(p.R, 0)} Ом: амперметр показывает I = ${fmt(current(p))} А, вольтметр — U = ${fmt(voltage(p))} В`;
  },

  create(container, params, set) {
    return dcCircuitScene(container, params, set, { current, voltage, SOURCES });
  },
};

export default sim;
