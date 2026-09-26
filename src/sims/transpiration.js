// Транспирация: испарение воды листьями. Потометр — побег в трубке с водой,
// пузырёк воздуха в капилляре движется тем быстрее, чем больше воды испаряет растение.

import { fmt } from './canvas.js';
import { transpirationScene } from '../svg/scenes/transpiration.js';

const WIND = ['штиль', 'слабый', 'средний', 'сильный'];

// Скорость испарения, мл/ч: свет открывает устьица, ветер уносит влажный воздух, влажность тормозит испарение
export function transpirationRate({ light, wind, humidity }) {
  return 0.8 * (light ? 1 : 0.35) * (1 + 0.35 * wind) * ((100 - humidity) / 50);
}

export const TRANSPIRATION = {
  id: 'transpiration',
  subject: 'biology',
  title: 'Транспирация',
  freeTitle: 'Испарение воды листьями',
  freeSub: 'Свет, ветер, влажность воздуха',
  freeIcon: 'leaves',
  controls: [
    { id: 'light', label: 'Освещение', min: 0, max: 1, step: 1, unit: '', value: 1, names: ['темнота', 'свет'] },
    { id: 'wind', label: 'Ветер (вентилятор)', min: 0, max: 3, step: 1, unit: '', value: 0, names: WIND },
    { id: 'humidity', label: 'Влажность воздуха', min: 20, max: 90, step: 10, unit: '%', value: 50 },
  ],
  formula: 'Вода: корни → стебель → листья → испарение через устьица',
  hint: 'Меняйте свет, ветер и влажность регуляторами ниже и следите за пузырьком в капилляре потометра.',
  chart: { x: 'humidity', y: (p) => transpirationRate(p), xLabel: 'влажность воздуха, %', yLabel: 'испарение, мл/ч', series: (p) => `${p.light ? 'свет' : 'темнота'}, ветер: ${WIND[p.wind]}` },
  theory: 'Транспирация — испарение воды листьями через устьица. Она усиливается на свету (устьица открыты), при ветре и в сухом воздухе и ослабевает в темноте и при высокой влажности. Благодаря ей вода с минеральными веществами поднимается от корней к листьям, а листья охлаждаются.',

  readings(p) {
    const r = transpirationRate(p);
    return [
      { label: 'Испарение воды', value: `${fmt(r, 2)} мл/ч` },
      { label: 'Потеря воды за 10 мин', value: `${fmt(r / 6, 2)} мл` },
      { label: 'Устьица', value: p.light ? 'открыты' : 'почти закрыты' },
    ];
  },

  describe(p) {
    return `Растение испаряет ${fmt(transpirationRate(p), 2)} мл воды в час`;
  },

  create(container, params, set) {
    return transpirationScene(container, params, set, { transpirationRate });
  },
};
