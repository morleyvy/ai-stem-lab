// Митоз в клетках кончика корня лука. На предметном столике — давленый препарат кончика корня,
// окрашенный ацетокармином: хроматин и хромосомы красно-малиновые, цитоплазма бледно-розовая.
// Клетки препарата не задаются вручную: для каждого поля зрения генератор с фиксированным зерном
// укладывает клетки рядами вдоль оси корня (как они лежат в настоящем корне) и каждой случайно
// назначает фазу по доле фаз на этом расстоянии от кончика. Число клеток каждой фазы считается —
// сколько центров клеток попало в круг поля зрения, поэтому картинка в окуляре и показания совпадают.
// Митотический индекс = делящиеся клетки / все клетки. Доля клеток в фазе пропорциональна её
// длительности — это обсуждается в вопросах урока.
// Иллюстрация установки — в svg/scenes/mitosis.js.

import { fmt } from './canvas.js';
import { mitosisScene } from '../svg/scenes/mitosis.js';

// Окуляр ×10 с полем зрения 18 мм: диаметр поля в препарате = 18 мм / увеличение объектива
export const MAGS = [
  { total: 100, objective: 10, fov: 1800 },
  { total: 400, objective: 40, fov: 450 },
];
export const FIELD_R = MAGS[1].fov / 2; // мкм — клетки считают при ×400
export const FIELDS = 5;
export const CELL_W = 30; // мкм — ширина клеток меристемы корня лука

export const PHASES = ['interphase', 'prophase', 'metaphase', 'anaphase', 'telophase'];
export const PHASE_NAME = { interphase: 'Интерфаза', prophase: 'Профаза', metaphase: 'Метафаза', anaphase: 'Анафаза', telophase: 'Телофаза' };

// Доли фаз митоза среди всех клеток в середине меристемы (≈ 1 мм от кончика). Профаза — самая
// длинная фаза, анафаза — самая короткая; вместе ≈ 11% клеток, как в подсчётах на корнях лука.
const MERISTEM = { prophase: 0.06, metaphase: 0.018, anaphase: 0.01, telophase: 0.022 };

// Таблица: расстояние от кончика (мм) → во сколько раз меньше делящихся клеток, чем в середине меристемы.
// Зона деления — до ≈ 2 мм; дальше клетки перестают делиться и растут в длину (зона растяжения).
const DIVIDING = [[0, 0.6], [0.5, 0.95], [1, 1], [1.5, 0.9], [2, 0.65], [2.5, 0.3], [3, 0.1], [3.5, 0.03], [4, 0.005], [4.5, 0], [6, 0]];
// Таблица: расстояние от кончика (мм) → длина клетки вдоль оси корня (мкм): в меристеме клетки почти
// квадратные, в зоне растяжения вытягиваются в несколько раз
const LENGTH = [[0, 30], [1, 34], [2, 38], [2.5, 48], [3, 68], [4, 115], [5, 160], [6, 190]];

function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    const [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table.at(-1)[1];
}

export const dividingFactor = (mm) => lerpTable(DIVIDING, mm);
export const cellLength = (mm) => lerpTable(LENGTH, mm);

// Участок корня по расстоянию от кончика
export const zoneName = (mm) => (mm <= 2 ? 'зона деления (меристема)' : 'зона растяжения');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPhase(r, mm) {
  const k = dividingFactor(mm);
  let acc = 0;
  for (const ph of ['prophase', 'metaphase', 'anaphase', 'telophase']) {
    acc += MERISTEM[ph] * k;
    if (r < acc) return ph;
  }
  return 'interphase';
}

const cache = new Map();

// Клетки одного поля зрения: { x, y, w, h, phase, seed } в мкм от центра поля.
// Ось корня вертикальна, кончик — внизу: чем ниже клетка (y > 0), тем ближе она к кончику.
export function fieldCells(mm, f) {
  const key = `${mm}:${f}`;
  if (cache.has(key)) return cache.get(key);
  const rnd = rng(mm * 7919 + f * 104729 + 17);
  const span = FIELD_R + 40;
  const cells = [];
  for (let x0 = -span - rnd() * CELL_W; x0 < span;) {
    const w = CELL_W * (0.88 + rnd() * 0.24);
    // Соседние ряды клеток сдвинуты друг относительно друга — стенки не совпадают
    let y = span + rnd() * cellLength(mm);
    while (y > -span) {
      const L = cellLength(mm - y / 1000) * (0.85 + rnd() * 0.3);
      const cy = y - L / 2;
      cells.push({ x: x0 + w / 2, y: cy, w, h: L, phase: pickPhase(rnd(), mm - cy / 1000), seed: rnd() });
      y -= L;
    }
    x0 += w;
  }
  cache.set(key, cells);
  return cells;
}

// Подсчёт по правилу: клетка считается, если её центр внутри поля зрения
export function counts(mm, fields) {
  const out = Object.fromEntries(PHASES.map((ph) => [ph, 0]));
  for (let f = 1; f <= fields; f++) {
    for (const c of fieldCells(mm, f)) if (c.x * c.x + c.y * c.y <= FIELD_R * FIELD_R) out[c.phase]++;
  }
  out.total = PHASES.reduce((sum, ph) => sum + out[ph], 0);
  out.dividing = out.total - out.interphase;
  return out;
}

export const mitoticIndex = (c) => (c.total ? (c.dividing / c.total) * 100 : 0);

// Что видно при малом увеличении: фазы не различить, но видно, какие клетки и где
const VIEW100 = {
  'зона деления (меристема)': 'При ×100 видна зона деления: мелкие клетки с крупными ядрами плотно прилегают друг к другу, фазы митоза не различимы',
  'зона растяжения': 'При ×100 видна зона растяжения: клетки вытянуты вдоль корня, ядра у них мелкие, фазы митоза не различимы',
};

export default {
  id: 'mitosis',
  subject: 'biology',
  title: 'Митоз в клетках корня лука',
  freeTitle: 'Митоз под микроскопом',
  freeSub: 'Фазы митоза, митотический индекс, зоны корня',
  controls: [
    { id: 'dist', label: 'Расстояние от кончика корня', min: 1, max: 5, step: 1, unit: 'мм', value: 1 },
    // Действия на сцене: препарат переносят на столик, щелчком по револьверу меняют объектив,
    // щелчком по винту препаратоводителя сдвигают препарат к следующему полю зрения
    { id: 'slide', label: 'Препарат кончика корня', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['лежит на столе', 'на столике микроскопа'], action: true, actionLabel: 'Положить препарат на столик микроскопа' },
    { id: 'mag', label: 'Увеличение микроскопа', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['×100', '×400'], action: true, actionLabel: 'Повернуть револьвер и сменить объектив' },
    { id: 'fields', label: 'Просмотрено полей зрения', min: 1, max: FIELDS, step: 1, unit: '', value: 1, names: ['1', '2', '3', '4', '5'], action: true, actionLabel: 'Сдвинуть препарат винтом к следующему полю зрения' },
  ],
  formula: 'митотический индекс = делящиеся клетки / все клетки × 100%',
  hint: 'Положите стекло на столик, щёлкните по объективам для ×400, по винту под столиком — следующее поле. Рамку на схеме корня можно двигать.',
  chart: { x: 'dist', y: (p) => Number(mitoticIndex(counts(p.dist, p.fields)).toFixed(1)), xLabel: 'расстояние от кончика, мм', yLabel: 'митотический индекс, %', series: () => 'митотический индекс' },
  theory: 'Митоз — непрямое деление клетки, при котором каждая дочерняя клетка получает такой же набор хромосом, как у материнской. Ему предшествует интерфаза: клетка растёт, ДНК удваивается, и каждая хромосома состоит из двух хроматид. Профаза: хромосомы спирализуются и становятся видны, ядрышко и ядерная оболочка исчезают, образуется веретено деления. Метафаза: хромосомы выстраиваются по экватору клетки (метафазная пластинка). Анафаза: хроматиды каждой хромосомы расходятся к полюсам. Телофаза: у полюсов формируются два ядра, у растений между ними образуется клеточная пластинка. У растений клетки делятся в образовательной ткани — меристеме; у корня она находится в зоне деления на кончике, под корневым чехликом. Митотический индекс — доля делящихся клеток; чем больше клеток в какой-то фазе, тем дольше она длится.',

  readings(p) {
    const zone = { label: 'Участок корня', value: zoneName(p.dist) };
    if (!p.slide) return [{ label: 'Препарат', value: 'не положен на столик' }, zone];
    if (p.mag === 0) return [zone, { label: 'Фазы митоза', value: 'не различимы — нужен объектив ×40' }];
    // Число полей зрения и увеличение подписаны под окуляром на сцене — здесь только подсчёт
    const c = counts(p.dist, p.fields);
    return [
      zone,
      { label: 'Подсчитано клеток', value: String(c.total) },
      { label: 'Про- · мета- · ана- · телофаза', value: `${c.prophase} · ${c.metaphase} · ${c.anaphase} · ${c.telophase}` },
      { label: 'Митотический индекс', value: `${fmt(mitoticIndex(c), 1)}%` },
    ];
  },

  describe(p) {
    if (!p.slide) return 'Препарат кончика корня не положен на столик микроскопа';
    if (p.mag === 0) return VIEW100[zoneName(p.dist)];
    const c = counts(p.dist, p.fields);
    return `${p.dist} мм от кончика корня, полей зрения: ${p.fields}. Всего клеток ${c.total}: интерфаза ${c.interphase}, профаза ${c.prophase}, метафаза ${c.metaphase}, анафаза ${c.anaphase}, телофаза ${c.telophase}; митотический индекс ${fmt(mitoticIndex(c), 1)}%`;
  },

  create(container, params, set) {
    return mitosisScene(container, params, set, { MAGS, FIELD_R, FIELDS, PHASES, PHASE_NAME, fieldCells, cellLength, dividingFactor });
  },
};
