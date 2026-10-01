// Работа и мощность: электрическая лебёдка на штативе равномерно поднимает груз (диски по 0,5 кг на подвесе)
// на высоту h, которую задаёт концевой выключатель на линейке. При равномерном подъёме сила тяги F = m·g,
// работа A = F·h, мощность N = A/t, потенциальная энергия поднятого груза Eп = m·g·h.
// Затем груз отпускают, он падает в песок; скорость у песка находим из сохранения энергии, Eк = Eп.
// Сопротивлением воздуха при падении с высоты до 1 м пренебрегаем. Сцена — в svg/scenes/work-power.js.

import { fmt } from './canvas.js';
import { workPowerScene } from '../svg/scenes/work-power.js';

export const G = 9.8; // Н/кг — как в школьных задачниках РК

export const force = (p) => p.m * G; // при равномерном подъёме сила тяги равна силе тяжести
export const work = (p) => force(p) * p.h;
export const liftTime = (p) => p.h / p.v;
export const power = (p) => work(p) / liftTime(p); // то же, что F·v
export const potential = (p) => p.m * G * p.h;
// Скорость у песка из закона сохранения энергии m·g·h = m·v²/2 — её и «измеряет» датчик скорости
export const fallSpeed = (p) => Math.sqrt(2 * G * p.h);
export const kinetic = (p) => (p.m * fallSpeed(p) ** 2) / 2;

const sim = {
  id: 'work-power',
  subject: 'physics',
  title: 'Работа и мощность лебёдки',
  freeTitle: 'Лебёдка и груз',
  freeSub: 'Работа, мощность, энергия',
  controls: [
    { id: 'm', label: 'Масса груза', min: 0.5, max: 3, step: 0.5, unit: 'кг', value: 1 },
    { id: 'h', label: 'Высота подъёма', min: 0.2, max: 1, step: 0.1, unit: 'м', value: 0.5 },
    { id: 'v', label: 'Скорость подъёма', min: 0.1, max: 0.5, step: 0.1, unit: 'м/с', value: 0.2 },
    { id: 'lift', label: 'Лебёдка', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключена, груз внизу', 'груз поднят'], action: true, actionLabel: 'Включить лебёдку' },
    { id: 'drop', label: 'Груз', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['висит на нити', 'отпущен и упал'], action: true, actionLabel: 'Отпустить поднятый груз' },
  ],
  formula: 'A = F·s;  N = A / t;  Eп = m·g·h;  Eк = m·v² / 2',
  hint: 'Нажмите «Пуск», тяните красную метку на линейке, красный рычаг отпускает груз.',
  chart: { x: 'h', y: work, xLabel: 'h, м', yLabel: 'A, Дж', series: (p) => `m = ${fmt(p.m, 1)} кг` },
  theory: 'Механическая работа равна произведению силы на путь, пройденный по направлению силы: A = F·s, единица — джоуль (1 Дж = 1 Н·м). При равномерном подъёме груза на высоту h сила тяги равна силе тяжести, поэтому A = m·g·h. Мощность показывает, как быстро совершается работа: N = A / t, единица — ватт (1 Вт = 1 Дж/с); при равномерном движении N = F·v. Поднятый груз обладает потенциальной энергией Eп = m·g·h — она равна работе, затраченной на подъём. При падении потенциальная энергия переходит в кинетическую Eк = m·v² / 2, а полная механическая энергия сохраняется.',

  readings(p) {
    if (!p.lift) {
      return [
        { label: 'Груз', value: 'стоит внизу, на песке' },
        { label: 'Сила тяжести F = m·g', value: `${fmt(force(p), 1)} Н` },
      ];
    }
    if (p.drop) {
      return [
        { label: 'Высота падения h', value: `${fmt(p.h, 1)} м` },
        { label: 'Eп наверху = m·g·h', value: `${fmt(potential(p))} Дж` },
        { label: 'Скорость у песка v', value: `${fmt(fallSpeed(p))} м/с` },
        { label: 'Eк у песка = m·v²/2', value: `${fmt(kinetic(p))} Дж` },
      ];
    }
    return [
      { label: 'Сила тяги F', value: `${fmt(force(p), 1)} Н` },
      { label: 'Время подъёма t', value: `${fmt(liftTime(p), 1)} с` },
      { label: 'Работа A = F·h', value: `${fmt(work(p))} Дж` },
      { label: 'Мощность N = A/t', value: `${fmt(power(p))} Вт` },
    ];
  },

  describe(p) {
    if (!p.lift) return `Груз ${fmt(p.m, 1)} кг стоит внизу, на песке; сила тяжести груза F = m·g = ${fmt(force(p), 1)} Н`;
    if (p.drop) return `Груз ${fmt(p.m, 1)} кг упал с высоты ${fmt(p.h, 1)} м: v = ${fmt(fallSpeed(p))} м/с, Eк = ${fmt(kinetic(p))} Дж, Eп было ${fmt(potential(p))} Дж`;
    return `Груз ${fmt(p.m, 1)} кг поднят на ${fmt(p.h, 1)} м за t = ${fmt(liftTime(p), 1)} с: F = ${fmt(force(p), 1)} Н, A = ${fmt(work(p))} Дж, N = ${fmt(power(p))} Вт, Eп = ${fmt(potential(p))} Дж`;
  },

  create(container, params, set) {
    return workPowerScene(container, params, set, { liftTime, G });
  },
};

export default sim;
