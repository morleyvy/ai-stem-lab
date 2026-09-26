// Активность фермента каталазы (кусочек сырого картофеля в пероксиде водорода).
// Высота пены зависит от температуры: оптимум около 37 °C, выше ~55 °C белок денатурирует.
// Иллюстрация установки — в svg/scenes/enzyme.js.

import { fmt } from './canvas.js';
import { enzymeScene } from '../svg/scenes/enzyme.js';

export function activity(T) {
  const bell = Math.exp(-(((T - 37) / 22) ** 2));
  const denature = T > 55 ? Math.max(0, 1 - (T - 55) / 10) : 1;
  return bell * denature;
}

// Без картофеля в пробирке фермента нет — пероксид не разлагается
const effective = (p) => (p.added ? activity(p.T) : 0);

export const ENZYME = {
  id: 'enzyme',
  freeTitle: 'Каталаза в картофеле',
  freeSub: 'Температура и активность фермента',
  freeIcon: 'enzyme',
  subject: 'biology',
  title: 'Ферменты',
  controls: [
    { id: 'T', label: 'Температура', min: 0, max: 80, step: 1, unit: '°C', value: 5 },
    // Действие на сцене: кусочек картофеля пинцетом опускают в пробирку с пероксидом
    { id: 'added', label: 'Картофель в пробирке', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['нет', 'опущен'], action: true, actionLabel: 'Опустить картофель в пробирку' },
  ],
  formula: '2H₂O₂ → 2H₂O + O₂ (катализатор — каталаза)',
  hint: 'Возьмите пинцет с кусочком картофеля (справа от бани) и перенесите его к горлышку пробирки. Затем поворачивайте ручку плитки мышью или меняйте температуру регулятором ниже — следите за высотой пены.',
  chart: { x: 'T', y: (p) => Math.round(effective(p) * 100), xLabel: 'T, °C', yLabel: 'активность, %', series: (p) => (p.added ? 'каталаза (картофель)' : 'без картофеля') },
  theory: 'Ферменты — белковые катализаторы. Каталаза ускоряет разложение пероксида водорода. У каждого фермента есть оптимальная температура; при сильном нагревании белок денатурирует и фермент перестаёт работать.',

  readings(p) {
    const a = effective(p);
    return [
      { label: 'Активность фермента', value: `${Math.round(a * 100)}%` },
      { label: 'Высота пены', value: `${fmt(a * 6, 1)} см` },
      { label: 'Температура', value: `${p.T} °C` },
      { label: 'Картофель', value: p.added ? 'в пробирке' : 'ещё не опущен' },
    ];
  },

  describe(p) {
    if (!p.added) return 'Картофель ещё не опущен: пероксид водорода не разлагается, пена не образуется';
    const a = effective(p);
    return a < 0.02 ? 'Пена не образуется' : `Высота пены ≈ ${fmt(a * 6, 1)} см (активность ${Math.round(a * 100)}%)`;
  },

  create(container, params, set) {
    return enzymeScene(container, params, set, { activity });
  },
};
