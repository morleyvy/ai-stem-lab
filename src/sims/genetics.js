// Моногибридное скрещивание гороха по окраске семян: A — жёлтая (доминантная), a — зелёная.
// Потомство «выращивается» генератором случайных чисел с фиксированным зерном: одинаковые условия
// дают одинаковый результат, поэтому журнал и график воспроизводимы. Иллюстрация — в svg/scenes/genetics.js.

import { geneticsScene } from '../svg/scenes/genetics.js';

const GENOTYPES = ['AA', 'Aa', 'aa'];

function gametes(g) {
  return GENOTYPES[g].split('');
}

// Ожидаемая доля жёлтых (есть хотя бы один A) по решётке Пеннета
export function expectedYellow(p) {
  const g1 = gametes(p.P1);
  const g2 = gametes(p.P2);
  let yellow = 0;
  for (const a of g1) for (const b of g2) if (a === 'A' || b === 'A') yellow++;
  return yellow / 4;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Наблюдаемое потомство: каждая горошина получает по одной случайной гамете от каждого родителя
export function offspring(p) {
  const rnd = mulberry32(p.P1 * 1000003 + p.P2 * 7919 + p.N);
  const g1 = gametes(p.P1);
  const g2 = gametes(p.P2);
  return Array.from({ length: p.N }, () => {
    const a = g1[rnd() < 0.5 ? 0 : 1];
    const b = g2[rnd() < 0.5 ? 0 : 1];
    return a === 'A' || b === 'A';
  });
}

const observedYellowShare = (p) => offspring(p).filter(Boolean).length / p.N;

function ratioText(p) {
  const e = expectedYellow(p);
  if (e === 1) return 'все жёлтые';
  if (e === 0) return 'все зелёные';
  return e === 0.75 ? '3 : 1 (жёлтые : зелёные)' : '1 : 1';
}

export const GENETICS = {
  id: 'genetics',
  freeTitle: 'Скрещивание гороха',
  freeSub: 'Генотипы родителей и потомство',
  freeIcon: 'genetics',
  subject: 'biology',
  title: 'Скрещивание',
  controls: [
    { id: 'P1', label: 'Генотип первого родителя', min: 0, max: 2, step: 1, unit: '', value: 0, names: GENOTYPES },
    { id: 'P2', label: 'Генотип второго родителя', min: 0, max: 2, step: 1, unit: '', value: 0, names: GENOTYPES },
    { id: 'N', label: 'Число потомков', min: 20, max: 400, step: 20, unit: 'шт.', value: 40 },
  ],
  formula: 'Aa × Aa → 1 AA : 2 Aa : 1 aa (3 : 1 по фенотипу)',
  hint: 'Выберите генотипы родителей и число потомков регуляторами ниже — горошины прорастут в лотке, а решётка Пеннета на доске покажет ожидаемый результат.',
  chart: { x: 'N', y: (p) => Math.round(observedYellowShare(p) * 100), xLabel: 'число потомков', yLabel: 'доля жёлтых, %', series: (p) => `${GENOTYPES[p.P1]} × ${GENOTYPES[p.P2]}` },
  theory: 'Признак определяется парой генов. Доминантный ген A (жёлтая окраска) подавляет рецессивный a (зелёная). При скрещивании гибридов Aa × Aa потомство расщепляется по фенотипу в соотношении 3 : 1 — второй закон Менделя.',

  readings(p) {
    const yellow = offspring(p).filter(Boolean).length;
    return [
      { label: 'Ожидаемое расщепление', value: ratioText(p) },
      { label: 'Получено жёлтых / зелёных', value: `${yellow} / ${p.N - yellow}` },
      { label: 'Доля жёлтых', value: `${Math.round((yellow / p.N) * 100)}% (ожидалось ${Math.round(expectedYellow(p) * 100)}%)` },
    ];
  },

  describe(p) {
    const yellow = offspring(p).filter(Boolean).length;
    return `Потомство: ${yellow} жёлтых и ${p.N - yellow} зелёных — ${ratioText(p)}`;
  },

  create(container, params, set) {
    return geneticsScene(container, params, set, { offspring });
  },
};
