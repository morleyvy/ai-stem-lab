// Фотосинтез: веточка элодеи в воде под лампой. Пузырьки кислорода выделяются тем чаще,
// чем больше света (освещённость ∝ 1/d²), с насыщением при сильном свете.

import { fmt } from './canvas.js';
import { photosynthesisScene } from '../svg/scenes/photosynthesis.js';

// Относительная освещённость: 1 при 20 см
const illuminance = (d) => (20 / d) ** 2;

export function bubbleRate({ d, lamp }) {
  if (!lamp) return 0;
  const I = illuminance(d);
  // Насыщение: при очень ярком свете скорость растёт всё медленнее
  return (40 * I) / (1 + 0.25 * I);
}

export const PHOTOSYNTHESIS = {
  id: 'photosynthesis',
  freeTitle: 'Элодея под лампой',
  freeSub: 'Свет и выделение кислорода',
  freeIcon: 'plant',
  subject: 'biology',
  title: 'Фотосинтез',
  controls: [
    { id: 'd', label: 'Расстояние до лампы', min: 10, max: 50, step: 5, unit: 'см', value: 50 },
    { id: 'lamp', label: 'Лампа', min: 0, max: 1, step: 1, unit: '', value: 1, names: ['выкл.', 'вкл.'] },
    // Действие на сцене: тлеющую лучинку подносят к крану пробирки-приёмника с собранным газом
    { id: 'splint', label: 'Проба тлеющей лучинкой', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не проводилась', 'проведена'], action: true, actionLabel: 'Поднести лучинку к пробирке' },
  ],
  formula: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ (на свету)',
  hint: 'Перетащите лампу ближе или дальше от растения и следите за счётчиком пузырьков: газ собирается в пробирке над воронкой. Когда газа наберётся достаточно, перетащите тлеющую лучинку из стаканчика к крану пробирки.',
  chart: { x: 'd', y: (p) => bubbleRate(p), xLabel: 'расстояние до лампы, см', yLabel: 'пузырьков/мин', series: (p) => (p.lamp ? 'лампа включена' : 'лампа выключена') },
  theory: 'На свету растение образует органические вещества из углекислого газа и воды и выделяет кислород. Чем больше света, тем быстрее идёт фотосинтез — до определённого предела.',

  readings(p) {
    return [
      { label: 'Пузырьков O₂ в минуту', value: `${Math.round(bubbleRate(p))}` },
      { label: 'Освещённость (отн.)', value: p.lamp ? fmt(illuminance(p.d)) : '0' },
      { label: 'Расстояние до лампы', value: `${p.d} см` },
      { label: 'Проба лучинкой', value: p.splint ? 'вспыхнула — кислород' : 'не проводилась' },
    ];
  },

  describe(p) {
    // После пробы лучинкой главное наблюдение — вспышка: именно она попадает в журнал
    if (p.splint) return 'Тлеющая лучинка ярко вспыхнула у пробирки: собранный газ поддерживает горение — это кислород';
    return p.lamp ? `Выделяется ≈ ${Math.round(bubbleRate(p))} пузырьков кислорода в минуту` : 'Пузырьки не выделяются';
  },

  create(container, params, set) {
    return photosynthesisScene(container, params, set, { bubbleRate });
  },
};
