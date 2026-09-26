// Закон Ома: ученик сам собирает цепь из деталей на столе и замыкает ключ,
// затем меняет напряжение источника и сопротивление реостата.
// Иллюстрация установки — в svg/scenes/ohm.js.

import { fmt } from './canvas.js';
import { ohmScene } from '../svg/scenes/ohm.js';

// Ток идёт только по собранной цепи с замкнутым ключом — иначе амперметр показывает ноль
const closed = (p) => Boolean(p.assembled && p.switch);
const current = (p) => (closed(p) ? p.U / p.R : 0);

export const OHM = {
  id: 'ohm',
  freeTitle: 'Электрическая цепь',
  freeSub: 'Напряжение, сопротивление, ток',
  freeIcon: 'bulb',
  subject: 'physics',
  title: 'Электрическая цепь',
  controls: [
    { id: 'U', label: 'Напряжение источника', min: 0, max: 12, step: 0.5, unit: 'В', value: 2 },
    { id: 'R', label: 'Сопротивление реостата', min: 2, max: 20, step: 1, unit: 'Ом', value: 10 },
    { id: 'assembled', label: 'Сборка цепи', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не собрана', 'собрана'], action: true, actionLabel: 'Собрать цепь' },
    { id: 'switch', label: 'Ключ', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['разомкнут', 'замкнут'], action: true, actionLabel: 'Замкнуть ключ' },
  ],
  formula: 'I = U / R',
  hint: 'Перетащите детали со стола в их гнёзда на стенде — провода подключатся сами. Затем щёлкните по ключу, чтобы замкнуть цепь. Движок реостата тоже можно тянуть мышью.',
  chart: { x: 'U', y: current, xLabel: 'U, В', yLabel: 'I, А', series: (p) => `R = ${p.R} Ом` },
  theory: 'Сила тока в участке цепи прямо пропорциональна напряжению и обратно пропорциональна сопротивлению: I = U / R.',

  readings(p) {
    const I = current(p);
    return [
      { label: 'Сила тока I', value: `${fmt(I)} А` },
      { label: 'Напряжение U', value: `${fmt(p.U, 1)} В` },
      closed(p)
        ? { label: 'Мощность P = U·I', value: `${fmt(p.U * I, 1)} Вт` }
        : { label: 'Цепь', value: p.assembled ? 'разомкнута ключом' : 'не собрана' },
    ];
  },

  describe(p) {
    if (!p.assembled) return 'Цепь не собрана — ток не течёт, амперметр показывает 0 А';
    if (!p.switch) return 'Цепь собрана, но ключ разомкнут — цепь разомкнута, амперметр показывает 0 А';
    return `Амперметр показывает I = ${fmt(current(p))} А`;
  },

  create(container, params, set) {
    return ohmScene(container, params, set);
  },
};
