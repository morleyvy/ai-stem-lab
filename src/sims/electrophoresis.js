// Гель-электрофорез ДНК. Пробы ДНК, разрезанной рестриктазой, наносят в лунки агарозного геля у катода (−).
// Фосфатные группы делают ДНК отрицательно заряженной, поэтому в электрическом поле фрагменты идут к аноду (+).
// Гель — молекулярное «сито»: короткие фрагменты проходят сквозь поры быстрее длинных, и путь фрагмента
// линейно убывает с логарифмом его длины (d = a − b·lg L). Путь растёт пропорционально напряжению и времени.
// Сама ДНК бесцветна: во время опыта виден только синий краситель проб, а полосы ДНК светятся
// в ультрафиолете благодаря красителю, добавленному в гель. По полосам маркера (набор фрагментов известной длины)
// определяют длину неизвестного фрагмента, а сравнивая наборы полос — «ДНК-отпечатки» — устанавливают, чья ДНК
// оставлена на месте преступления. Иллюстрация установки — в svg/scenes/electrophoresis.js.

import { fmt } from './canvas.js';
import { electrophoresisScene } from '../svg/scenes/electrophoresis.js';

export const GEL_MM = 80; // длина геля от лунок до края у анода; дальше фрагменты уходят в буфер
const SPEED = 0.015; // мм/(В·мин): фрагмент 100 п.н. при 100 В проходит 1,5 мм в минуту, как в школьном 1% геле
const RES = 1.2; // мм: полосы ближе друг к другу, чем их ширина, сливаются в одну
const DYE_EQ = 300; // синий краситель проб в 1% агарозе идёт примерно вместе с фрагментом 300 п.н.

// Дорожки геля: маркер длин, неизвестный фрагмент (продукт ПЦР), ДНК с места преступления и трёх подозреваемых,
// обработанные одной и той же рестриктазой. Наборы фрагментов подобраны так, что совпадает только второй подозреваемый.
export const LANES = [
  { name: 'Маркер', short: 'М', frags: [5000, 3000, 2000, 1500, 1000, 700, 500, 300, 200, 100] },
  { name: 'Образец X', short: 'X', frags: [800] },
  { name: 'Улика', short: 'Улика', frags: [4000, 1800, 900, 400] },
  { name: 'Подозреваемый 1', short: 'П1', frags: [4000, 2500, 900, 300] },
  { name: 'Подозреваемый 2', short: 'П2', frags: [4000, 1800, 900, 400] },
  { name: 'Подозреваемый 3', short: 'П3', frags: [3000, 1800, 600, 400] },
];
const MARKER = 0;
const EVIDENCE = 2;
const SUSPECTS = [3, 4, 5];

// Относительная подвижность: 1 у фрагмента 100 п.н., 0,2 у 10 000 п.н. (линейно по lg L)
export const mobility = (L) => 1.8 - 0.4 * Math.log10(L);

// Время, которое ток реально шёл через гель: без проб и без тока ничего не движется
export const runTime = (p) => (p.load && p.power ? p.time : 0);

// Путь фрагмента длиной L от лунки, мм
export const distance = (L, p, t = runTime(p)) => SPEED * p.U * t * mobility(L);

export const dyeFront = (p, t) => distance(DYE_EQ, p, t);

// Полосы дорожки, оставшиеся в геле: близкие фрагменты сливаются в одну полосу (позиция — середина)
export function bands(lane, p, t) {
  const list = LANES[lane].frags
    .map((L) => ({ L, d: distance(L, p, t) }))
    .filter((b) => b.d <= GEL_MM)
    .sort((a, b) => a.d - b.d);
  const groups = [];
  for (const b of list) {
    const last = groups.at(-1);
    if (last && b.d - last.members.at(-1).d < RES) last.members.push(b);
    else groups.push({ members: [b] });
  }
  for (const g of groups) g.d = g.members.reduce((s, b) => s + b.d, 0) / g.members.length;
  return groups;
}

// Длина по маркеру: путь полосы сравнивают с двумя соседними полосами маркера и интерполируют по lg L.
// Если эти соседние полосы маркера слились или ушли из геля, длину честно определить нельзя.
export function lengthByMarker(d, p) {
  const marker = bands(MARKER, p);
  const resolved = marker.filter((g) => g.members.length === 1).map((g) => g.members[0]);
  const all = [...LANES[MARKER].frags].sort((a, b) => b - a); // по возрастанию пути
  for (let i = 0; i + 1 < all.length; i++) {
    const a = distance(all[i], p);
    const b = distance(all[i + 1], p);
    if (d < a - 1e-9 || d > b + 1e-9) continue;
    const ra = resolved.find((x) => x.L === all[i]);
    const rb = resolved.find((x) => x.L === all[i + 1]);
    if (!ra || !rb) return null;
    const lg = Math.log10(ra.L) + ((d - ra.d) / (rb.d - ra.d)) * (Math.log10(rb.L) - Math.log10(ra.L));
    return nice(10 ** lg);
  }
  return null;
}

const nice = (L) => (L < 1000 ? Math.round(L / 10) * 10 : Math.round(L / 100) * 100);

// Две дорожки выглядят одинаково, если у них столько же полос и каждая на том же месте (точнее ширины полосы)
function sameLook(a, b, p) {
  const x = bands(a, p);
  const y = bands(b, p);
  return x.length === y.length && x.every((g, i) => Math.abs(g.d - y[i].d) < RES);
}

// Кого из подозреваемых нельзя отличить от улики
export const matches = (p) => SUSPECTS.filter((i) => sameLook(i, EVIDENCE, p));

const listMm = (groups) => groups.map((g) => fmt(g.d, 1)).join('; ');

function bandsText(p) {
  const g = bands(p.lane, p);
  if (!g.length) return 'все вышли из геля';
  if (g.length > 4) return `${g.length} полос, от ${fmt(g[0].d, 1)} до ${fmt(g.at(-1).d, 1)} мм`;
  return `${listMm(g)} мм`;
}

function lengthText(p) {
  if (p.lane === MARKER) return 'маркер: 100–5000 п.н.';
  const g = bands(p.lane, p);
  if (!g.length) return 'полосы вышли из геля';
  const L = g.map((x) => lengthByMarker(x.d, p));
  if (L.some((v) => v === null)) return 'не определить — полосы маркера слились';
  return `≈ ${L.join(', ')} п.н.`;
}

function matchText(p) {
  const m = matches(p);
  if (!m.length) return 'нет совпадений';
  if (m.length === 1) return LANES[m[0]].name;
  return `не различить: ${m.map((i) => LANES[i].short).join(', ')}`;
}

export default {
  id: 'electrophoresis',
  subject: 'biology',
  title: 'Гель-электрофорез ДНК',
  freeTitle: 'Электрофорез ДНК',
  freeSub: 'Маркер длин, напряжение, ДНК-отпечатки',
  controls: [
    { id: 'U', label: 'Напряжение источника', min: 50, max: 150, step: 10, unit: 'В', value: 100 },
    { id: 'time', label: 'Время', min: 0, max: 60, step: 5, unit: 'мин', value: 0 },
    { id: 'lane', label: 'Дорожка геля', min: 0, max: 5, step: 1, unit: '', value: 0, names: ['М — маркер длин', 'X — неизвестный фрагмент', 'Улика', 'Подозреваемый 1', 'Подозреваемый 2', 'Подозреваемый 3'] },
    // Действия на сцене: микропипетку подносят к лункам, источник включают тумблером, лампу — щелчком
    { id: 'load', label: 'Пробы ДНК', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не нанесены', 'нанесены'], action: true, actionLabel: 'Нанести пробы в лунки микропипеткой' },
    { id: 'power', label: 'Источник тока', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключен', 'включён'], action: true, actionLabel: 'Включить источник тока тумблером' },
    { id: 'uv', label: 'УФ-лампа', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключена', 'включена'], action: true, actionLabel: 'Включить УФ-лампу над гелем' },
  ],
  formula: 'чем короче фрагмент, тем дальше он уходит: d = a − b·lg L',
  hint: 'Перетащите микропипетку к лункам, щёлкните тумблер источника и УФ-лампу. Дорожку выбирайте щелчком по гелю.',
  chart: { x: 'time', y: (p) => Math.round(distance(800, p) * 10) / 10, xLabel: 't, мин', yLabel: 'путь фрагмента X, мм', series: (p) => `${p.U} В` },
  theory: 'Гель-электрофорез разделяет фрагменты ДНК по длине. ДНК разрезают ферментом рестриктазой и наносят в лунки агарозного геля. Из-за фосфатных групп ДНК заряжена отрицательно и в электрическом поле движется к аноду (+). Гель работает как сито: короткие фрагменты проходят дальше длинных, путь убывает с логарифмом длины. Длину неизвестного фрагмента находят, сравнивая его полосу с полосами маркера длин. ДНК разных людей даёт разный набор полос — «ДНК-отпечаток», по нему проводят идентификацию личности.',

  readings(p) {
    const t = runTime(p);
    const dye = dyeFront(p);
    const seen = p.uv && p.load;
    return [
      { label: 'Синий краситель прошёл', value: !p.load ? 'пробы не нанесены' : dye === 0 ? 'в лунках' : dye > GEL_MM ? 'вышел из геля' : `${fmt(dye, 1)} мм` },
      { label: 'Полосы на дорожке', value: !p.load ? 'пробы не нанесены' : !p.uv ? 'не видны без УФ-лампы' : t === 0 ? 'в лунке' : bandsText(p) },
      { label: 'Длина по маркеру', value: !seen || t === 0 ? '—' : lengthText(p) },
      { label: 'Совпадение с уликой', value: !seen || t === 0 ? '—' : matchText(p) },
    ];
  },

  describe(p) {
    if (!p.load) return 'Пробы ДНК ещё не нанесены в лунки геля';
    if (!p.power) return 'Пробы в лунках, источник тока выключен — ДНК стоит на месте';
    if (p.time === 0) return `Ток включён (${p.U} В), электрофорез только начался — пробы ещё у лунок`;
    const dye = dyeFront(p);
    if (!p.uv) {
      return dye > GEL_MM
        ? `${p.U} В, ${p.time} мин: синий краситель вышел из геля; полосы ДНК без УФ-лампы не видны`
        : `${p.U} В, ${p.time} мин: синий краситель прошёл ${fmt(dye, 1)} мм к аноду; полосы ДНК без УФ-лампы не видны`;
    }
    const lane = LANES[p.lane];
    const g = bands(p.lane, p);
    if (!g.length) return `${lane.name}: все полосы вышли из геля`;
    if (p.lane === MARKER) {
      const lost = LANES[MARKER].frags.length - g.reduce((s, x) => s + x.members.length, 0);
      const merged = g.some((x) => x.members.length > 1);
      let out = `Маркер (${p.U} В, ${p.time} мин): видно полос: ${g.length} из 10, от ${fmt(g[0].d, 1)} до ${fmt(g.at(-1).d, 1)} мм`;
      if (merged) out += '; часть полос слилась';
      if (lost) out += '; самые короткие фрагменты вышли из геля';
      return out;
    }
    if (p.lane === 1) {
      const L = lengthByMarker(g[0].d, p);
      return L === null
        ? `Образец X: полоса на ${fmt(g[0].d, 1)} мм — по маркеру длину не определить: соседние полосы маркера слились`
        : `Образец X: полоса на ${fmt(g[0].d, 1)} мм — по маркеру длина ≈ ${L} п.н.`;
    }
    const m = matches(p);
    let verdict;
    if (p.lane === EVIDENCE) verdict = m.length === 1 ? `совпадает ${LANES[m[0]].name}` : m.length ? `не различить: ${m.map((i) => LANES[i].short).join(', ')}` : 'совпадений нет';
    else if (!m.includes(p.lane)) verdict = 'отличается от улики';
    else verdict = m.length === 1 ? 'совпадает с уликой' : 'от улики не отличить — полосы не разделились';
    return `${lane.name}: полосы на ${listMm(g)} мм — ${verdict}`;
  },

  create(container, params, set) {
    return electrophoresisScene(container, params, set, { LANES, GEL_MM, bands, dyeFront });
  },
};
