// Рычаг: условие равновесия F₁·l₁ = F₂·l₂. Гири по 100 г переносятся мышью из набора на подвесы,
// подвесы передвигаются вдоль плеч,
// балка плавно наклоняется в сторону большего момента силы.
// Иллюстрация установки — в svg/scenes/lever.js.

import { fmt } from './canvas.js';
import { leverScene } from '../svg/scenes/lever.js';

const G = 9.8;
const MAX_ARM = 50; // см
const moment = (m, l) => m * G * (l / 100);

export const LEVER = {
  id: 'lever',
  subject: 'physics',
  title: 'Рычаг',
  freeTitle: 'Рычаг и грузы',
  freeSub: 'Массы, плечи, равновесие',
  freeIcon: 'lever',
  controls: [
    { id: 'm1', label: 'Масса левого груза', min: 0.1, max: 2, step: 0.1, unit: 'кг', value: 1 },
    { id: 'l1', label: 'Плечо левого груза', min: 5, max: MAX_ARM, step: 5, unit: 'см', value: 20 },
    { id: 'm2', label: 'Масса правого груза', min: 0.1, max: 2, step: 0.1, unit: 'кг', value: 0.5 },
    { id: 'l2', label: 'Плечо правого груза', min: 5, max: MAX_ARM, step: 5, unit: 'см', value: 20 },
  ],
  formula: 'F₁ · l₁ = F₂ · l₂',
  hint: 'Переносите гири по 100 г из набора на столе на подвесы и обратно — масса на подвесе равна числу гирь. Подвес за стержень можно передвигать вдоль плеча.',
  chart: { x: 'l2', y: (p) => moment(p.m2, p.l2), xLabel: 'плечо правого груза, см', yLabel: 'момент M₂, Н·м', series: (p) => `m₂ = ${fmt(p.m2, 1)} кг` },
  theory: 'Рычаг находится в равновесии, если моменты сил, вращающих его в разные стороны, равны: F₁·l₁ = F₂·l₂. Чем длиннее плечо, тем меньшая сила нужна для равновесия.',

  readings(p) {
    const M1 = moment(p.m1, p.l1);
    const M2 = moment(p.m2, p.l2);
    return [
      { label: 'Момент слева M₁ = F₁·l₁', value: `${fmt(M1)} Н·м` },
      { label: 'Момент справа M₂ = F₂·l₂', value: `${fmt(M2)} Н·м` },
      { label: 'Состояние', value: Math.abs(M1 - M2) < 1e-6 ? 'равновесие' : M1 > M2 ? 'перевешивает левая сторона' : 'перевешивает правая сторона' },
    ];
  },

  describe(p) {
    const M1 = moment(p.m1, p.l1);
    const M2 = moment(p.m2, p.l2);
    if (Math.abs(M1 - M2) < 1e-6) return `Рычаг в равновесии: M₁ = M₂ = ${fmt(M1)} Н·м`;
    return `Рычаг наклонился ${M1 > M2 ? 'влево' : 'вправо'}: M₁ = ${fmt(M1)} Н·м, M₂ = ${fmt(M2)} Н·м`;
  },

  create(container, params, set) {
    return leverScene(container, params, set, { moment });
  },
};
