// Пульс и физическая нагрузка: частота сердечных сокращений растёт с нагрузкой
// и постепенно возвращается к норме после отдыха; у тренированного человека — быстрее.

import { pulseScene } from '../svg/scenes/pulse.js';

const ACTIVITY = ['покой', 'ходьба', 'бег трусцой', 'быстрый бег'];
const LOAD = [0, 30, 60, 95]; // прибавка к пульсу, уд/мин
const MAX_HR = 206; // 220 − 14 лет

export function heartRate({ activity, trained, rest }) {
  const base = trained ? 60 : 70;
  const load = base + LOAD[activity] * (trained ? 0.85 : 1);
  // Восстановление после нагрузки — экспоненциальное; у тренированных быстрее
  return base + (load - base) * Math.exp(-rest / (trained ? 1.2 : 2));
}

function zone(hr) {
  const share = hr / MAX_HR;
  if (share < 0.5) return 'покой';
  if (share < 0.7) return 'лёгкая нагрузка';
  if (share < 0.85) return 'аэробная зона';
  return 'высокая нагрузка';
}

export const PULSE = {
  id: 'pulse',
  subject: 'biology',
  title: 'Пульс и нагрузка',
  freeTitle: 'Сердце и нагрузка',
  freeSub: 'Активность, тренированность, отдых',
  freeIcon: 'runner',
  controls: [
    { id: 'activity', label: 'Нагрузка', min: 0, max: 3, step: 1, unit: '', value: 0, names: ACTIVITY },
    { id: 'trained', label: 'Подготовка', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['обычная', 'тренированный'] },
    { id: 'rest', label: 'Отдых после нагрузки', min: 0, max: 5, step: 1, unit: 'мин', value: 0 },
    // Действие на сцене: пальцы на запястье, 15-секундный подсчёт ударов
    { id: 'measured', label: 'Пульс измерен вручную', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['нет', 'да'], action: true, actionLabel: 'Измерить пульс на запястье' },
  ],
  formula: 'ЧСС ↑ при нагрузке → кровь быстрее доставляет O₂ к мышцам',
  hint: 'Сначала измерьте пульс вручную: щёлкните по руке на кушетке — пальцы лягут на запястье, и 15 секунд идёт подсчёт ударов (ЧСС = удары × 4). После этого включится монитор ЭКГ; меняйте нагрузку, тренированность и время отдыха регуляторами ниже.',
  chart: { x: 'rest', y: (p) => heartRate(p), xLabel: 'минут отдыха', yLabel: 'пульс, уд/мин', series: (p) => `${ACTIVITY[p.activity]}, ${p.trained ? 'тренированный' : 'обычный'}` },
  theory: 'При физической нагрузке мышцам нужно больше кислорода, поэтому сердце сокращается чаще. После нагрузки пульс постепенно возвращается к норме. У тренированных людей пульс в покое ниже, а восстановление быстрее: их сердце за одно сокращение выбрасывает больше крови.',

  readings(p) {
    if (!p.measured) {
      return [
        { label: 'Пульс (ЧСС)', value: 'не измерен' },
        { label: 'От максимального', value: '—' },
        { label: 'Зона', value: '—' },
      ];
    }
    const hr = heartRate(p);
    return [
      { label: 'Пульс (ЧСС)', value: `${Math.round(hr)} уд/мин` },
      { label: 'От максимального', value: `${Math.round((hr / MAX_HR) * 100)}%` },
      { label: 'Зона', value: zone(hr) },
    ];
  },

  describe(p) {
    if (!p.measured) return 'Пульс ещё не измерен';
    return `Пульс ${Math.round(heartRate(p))} уд/мин (${zone(heartRate(p))})`;
  },

  create(container, params, set) {
    return pulseScene(container, params, set, { heartRate, zone });
  },
};
