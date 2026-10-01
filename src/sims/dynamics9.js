// Второй закон Ньютона: тележка на горизонтальной дорожке тянется нитью через блок грузом на подвесе.
// Ученик отпускает тележку от стопора, электронный секундомер измеряет время t прохождения пути
// s = 0,5 м до оптического датчика, а датчик силы на тележке — силу натяжения нити F.
// Трение в подшипниках колёс и блока считаем пренебрежимо малым: опыт про a = F/m, а не про трение
// (трение — отдельная работа 10 класса). Иллюстрация установки — в svg/scenes/dynamics9.js.

import { fmt } from './canvas.js';
import { dynamics9Scene } from '../svg/scenes/dynamics9.js';

const G = 9.8; // м/с² — как в школьных задачниках РК
export const PATH = 0.5; // м — расстояние от стопора до оптического датчика

const hangKg = (p) => p.mh / 1000;
// Груз и тележка связаны нерастяжимой нитью и разгоняются вместе: сила тяжести груза
// сообщает ускорение обоим телам, a = m·g / (M + m). Нить тянет тележку с силой F = M·a —
// именно её и показывает датчик силы; она чуть меньше веса груза, потому что груз тоже разгоняется.
export const accel = (p) => (hangKg(p) * G) / (p.M + hangKg(p));
export const tension = (p) => (p.released ? p.M * accel(p) : hangKg(p) * G);
export const runTime = (p) => Math.sqrt((2 * PATH) / accel(p));

const sim = {
  id: 'dynamics9',
  freeTitle: 'Тележка с грузом',
  freeSub: 'Сила, масса, ускорение',
  freeIcon: 'mechanics',
  subject: 'physics',
  title: 'Второй закон Ньютона',
  controls: [
    { id: 'M', label: 'Масса тележки', min: 0.2, max: 1, step: 0.1, unit: 'кг', value: 0.5 },
    { id: 'mh', label: 'Масса груза на подвесе', min: 20, max: 200, step: 10, unit: 'г', value: 50 },
    { id: 'released', label: 'Тележка', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['удерживается стопором', 'отпущена'], action: true, actionLabel: 'Отпустить тележку' },
  ],
  formula: 'a = 2s / t²;  a = F / m',
  hint: 'Нажмите на тележку, чтобы отпустить её. Ещё один щелчок вернёт её к стопору.',
  chart: { x: 'mh', y: accel, xLabel: 'm груза, г', yLabel: 'a, м/с²', series: (p) => `M = ${fmt(p.M, 1)} кг` },
  theory: 'Ускорение, которое тело получает под действием силы, прямо пропорционально этой силе и обратно пропорционально массе тела: a = F / m (второй закон Ньютона). Ускорение тележки, которая без начальной скорости прошла путь s за время t, находят по формуле a = 2s / t².',

  readings(p) {
    if (!p.released) {
      return [
        { label: 'Тележка', value: 'у стопора' },
        { label: 'Сила F', value: `${fmt(tension(p))} Н` },
      ];
    }
    const a = accel(p);
    return [
      { label: 'Время t', value: `${fmt(runTime(p), 3)} с` },
      { label: 'Ускорение a', value: `${fmt(a)} м/с²` },
      { label: 'Сила F', value: `${fmt(tension(p))} Н` },
      { label: 'F / a', value: `${fmt(tension(p) / a)} кг` },
    ];
  },

  describe(p) {
    if (!p.released) return `Тележка у стопора; датчик силы показывает вес груза F = ${fmt(tension(p))} Н`;
    const a = accel(p);
    return `Путь ${fmt(PATH, 1)} м пройден за t = ${fmt(runTime(p), 3)} с; a = ${fmt(a)} м/с², F = ${fmt(tension(p))} Н, F/a = ${fmt(tension(p) / a)} кг`;
  },

  create(container, params, set) {
    return dynamics9Scene(container, params, set, { accel, tension, runTime, PATH });
  },
};

export default sim;
