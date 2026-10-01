// Разделение смеси песка, поваренной соли и железных опилок: магнит → растворение в воде →
// фильтрование → выпаривание. Массы фракций считаются из состава смеси и растворимости соли,
// поэтому ученик видит, что при нехватке воды часть соли уходит в осадок вместе с песком,
// а сумма масс выделенных веществ всегда равна массе исходной смеси.
// Иллюстрация установки — в svg/scenes/mixtures.js.

import { fmt } from './canvas.js';
import { mixturesScene } from '../svg/scenes/mixtures.js';

export const SAND = 20; // г — песка в смеси
export const IRON = 5; // г — железных опилок
// Растворимость NaCl при 20 °C — 36 г в 100 г воды (как в таблице растворимости учебника);
// плотность воды 1 г/мл, поэтому считаем на миллилитры
export const SOLUBILITY = 36;

const total = (p) => SAND + IRON + p.salt;
const wet = (p) => Boolean(p.water);
const filtered = (p) => wet(p) && Boolean(p.filter);
const evaporated = (p) => filtered(p) && Boolean(p.evaporate);

// Сколько соли растворится: не больше, чем позволяет растворимость при данном объёме воды
export const dissolved = (p) => (wet(p) ? Math.min(p.salt, (SOLUBILITY * p.V) / 100) : 0);

// Осадок на фильтре: песок, нерастворившаяся соль и железо, если его не убрали магнитом
export const residue = (p) => SAND + (p.salt - dissolved(p)) + (p.magnet ? 0 : IRON);

const sum = (p) => (p.magnet ? IRON : 0) + residue(p) + dissolved(p);

export default {
  id: 'mixtures',
  freeTitle: 'Разделение смеси',
  freeSub: 'Магнит, фильтрование, выпаривание',
  freeIcon: 'magnet',
  subject: 'chemistry',
  title: 'Разделение смеси',
  controls: [
    { id: 'salt', label: 'Масса соли в смеси', min: 5, max: 20, step: 1, unit: 'г', value: 10 },
    { id: 'V', label: 'Объём воды', min: 20, max: 100, step: 10, unit: 'мл', value: 20 },
    { id: 'magnet', label: 'Магнит', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['лежит на столе', 'железо отделено'], action: true, actionLabel: 'Провести магнитом над смесью' },
    { id: 'water', label: 'Вода', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['в цилиндре', 'налита в стакан'], action: true, actionLabel: 'Налить воду в стакан со смесью' },
    { id: 'filter', label: 'Фильтрование', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не проводилось', 'проведено'], action: true, actionLabel: 'Профильтровать смесь' },
    { id: 'evaporate', label: 'Выпаривание', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не проводилось', 'проведено'], action: true, actionLabel: 'Выпарить фильтрат' },
  ],
  formula: 'm(смеси) = m(железа) + m(осадка) + m(соли)',
  hint: 'Работайте с тем, что подсвечено: магнит и цилиндр перетащите к стакану, затем нажмите на стакан и на спиртовку.',
  chart: { x: 'V', y: (p) => Math.min(p.salt, (SOLUBILITY * p.V) / 100), xLabel: 'V воды, мл', yLabel: 'растворится соли, г', series: (p) => `соль ${p.salt} г` },
  theory: 'Смесь состоит из нескольких веществ, каждое из которых сохраняет свои свойства. Поэтому смесь можно разделить: железо притягивается магнитом, соль растворяется в воде, а песок — нет. Нерастворимый песок отделяют фильтрованием, растворённую соль выделяют выпариванием. При 20 °C в 100 мл воды растворяется не больше 36 г поваренной соли.',

  // Четыре строки — по одной на каждое выделенное вещество; массу смеси и сумму масс называет describe()
  readings(p) {
    return [
      { label: 'Железо на магните', value: p.magnet ? `${fmt(IRON, 1)} г` : '—' },
      { label: 'Растворилось соли', value: wet(p) ? `${fmt(dissolved(p), 1)} г из ${fmt(p.salt, 1)} г` : '—' },
      { label: 'Осадок на фильтре', value: filtered(p) ? `${fmt(residue(p), 1)} г` : '—' },
      { label: 'Соль в чашке', value: evaporated(p) ? `${fmt(dissolved(p), 1)} г` : '—' },
    ];
  },

  describe(p) {
    if (evaporated(p)) return `Выпариванием получено ${fmt(dissolved(p), 1)} г соли; сумма масс веществ ${fmt(sum(p), 1)} г равна массе смеси ${fmt(total(p), 1)} г`;
    if (filtered(p)) return `На фильтре остался осадок ${fmt(residue(p), 1)} г, через фильтр прошёл раствор соли`;
    if (wet(p)) {
      const d = dissolved(p);
      if (d < p.salt) return `В ${p.V} мл воды растворилось только ${fmt(d, 1)} г соли из ${fmt(p.salt, 1)} г, остальная соль лежит на дне вместе с песком`;
      return `Вся соль (${fmt(p.salt, 1)} г) растворилась в ${p.V} мл воды, песок осел на дно`;
    }
    if (p.magnet) return `Магнит притянул ${fmt(IRON, 1)} г железных опилок, песок и соль остались в стакане`;
    return `Смесь песка, соли и железных опилок массой ${fmt(total(p), 1)} г`;
  },

  create(container, params, set) {
    return mixturesScene(container, params, set, { dissolved, residue, IRON });
  },
};
