// Брожение дрожжей: дрожжи сбраживают сахар с выделением CO₂, газ надувает шарик на колбе.
// Активность зависит от температуры (оптимум ~35 °C, выше ~45 °C дрожжи гибнут) и от количества сахара.

import { fmt } from './canvas.js';
import { yeastScene } from '../svg/scenes/yeast.js';

const SUGAR = ['без сахара', '1 ложка', '2 ложки'];
const SUGAR_FACTOR = [0.05, 1, 1.6];

export function yeastActivity(T) {
  const bell = Math.exp(-(((T - 35) / 12) ** 2));
  return T > 45 ? bell * Math.max(0, 1 - (T - 45) / 10) : bell;
}

// Объём выделившегося CO₂, мл
export const co2Volume = ({ T, sugar, time }) => 3 * SUGAR_FACTOR[sugar] * yeastActivity(T) * time;
// Собрано в шарике: без шарика газ уходит в воздух, и объём измерить нельзя
export const collected = (p) => (p.balloon ? co2Volume(p) : 0);

export const YEAST = {
  id: 'yeast',
  subject: 'biology',
  title: 'Брожение дрожжей',
  freeTitle: 'Дрожжи и шарик',
  freeSub: 'Температура, сахар, время',
  freeIcon: 'balloon',
  controls: [
    { id: 'T', label: 'Температура', min: 0, max: 60, step: 5, unit: '°C', value: 20 },
    { id: 'sugar', label: 'Сахар', min: 0, max: 2, step: 1, unit: '', value: 1, names: SUGAR },
    { id: 'time', label: 'Время', min: 0, max: 60, step: 10, unit: 'мин', value: 0 },
    // Действие на сцене: шарик перетаскивают со стола и надевают на горлышко колбы
    { id: 'balloon', label: 'Шарик на колбе', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не надет', 'надет'], action: true, actionLabel: 'Надеть шарик на колбу' },
  ],
  formula: 'C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂↑ (брожение)',
  hint: 'Сначала наденьте шарик на горлышко колбы — перетащите его со стола. Затем меняйте температуру, количество сахара и время регуляторами ниже и следите, как надувается шарик.',
  chart: { x: 'time', y: (p) => collected(p), xLabel: 'время, мин', yLabel: 'CO₂ в шарике, мл', series: (p) => `${p.T} °C, ${SUGAR[p.sugar]}${p.balloon ? '' : ', без шарика'}` },
  theory: 'Дрожжи — одноклеточные грибы. Без доступа кислорода они сбраживают сахар, выделяя углекислый газ и спирт. Сильнее всего брожение идёт в тепле (около 35 °C); при высокой температуре дрожжи гибнут, а без сахара им нечего сбраживать.',

  readings(p) {
    return [
      { label: 'Собрано CO₂ в шарике', value: p.balloon ? `${fmt(collected(p), 1)} мл` : 'шарик не надет' },
      { label: 'Активность дрожжей', value: `${Math.round(yeastActivity(p.T) * 100)}%` },
      { label: 'Сахар', value: SUGAR[p.sugar] },
    ];
  },

  describe(p) {
    if (!p.balloon) return 'Шарик не надет: углекислый газ уходит из колбы в воздух, собрать и измерить его нельзя';
    const V = collected(p);
    return V < 1 ? 'Газ почти не выделяется, шарик не надувается' : `Выделилось ${fmt(V, 1)} мл углекислого газа — шарик надулся`;
  },

  create(container, params, set) {
    return yeastScene(container, params, set, { co2Volume: collected, yeastActivity });
  },
};
