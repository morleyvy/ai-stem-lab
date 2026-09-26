// Детерминированный движок: одинаковые параметры → всегда одинаковый результат.
// Используется и в браузере (симуляция), и на сервере (контекст для ИИ-объяснения),
// поэтому здесь не должно быть ничего, что зависит от DOM.

import { SUBSTANCES, SUBSTANCE_IDS } from './data/substances.js';
import { REACTIONS } from './data/reactions.js';

const COLORLESS = '#b5d9f0';
const CRIMSON = '#d6246e';
const INDICATOR = 'indicator_phph';

export const DEFAULT_PARAMS = { substances: [], temperature: 20, concentration: 'dilute' };

// Всё, что пришло извне (ИИ, пользователь, сеть), приводится к допустимым значениям.
export function normalizeParams(raw = {}) {
  const substances = Array.isArray(raw.substances)
    ? [...new Set(raw.substances.filter((id) => SUBSTANCE_IDS.includes(id)))].slice(0, 4)
    : [];
  const t = Number(raw.temperature);
  const temperature = Number.isFinite(t) ? Math.round(Math.min(100, Math.max(0, t))) : 20;
  const concentration = raw.concentration === 'concentrated' ? 'concentrated' : 'dilute';
  return { substances, temperature, concentration };
}

// Правило Вант-Гоффа (школьная программа 9 класса): +10 °C → скорость примерно ×2.
export function rateFactor(temperature, concentration) {
  return 2 ** ((temperature - 20) / 10) * (concentration === 'concentrated' ? 1.5 : 1);
}

function startingLiquid(ids) {
  const solutions = ids.filter((id) => SUBSTANCES[id].form === 'solution');
  if (solutions.length === 0) return null;
  return solutions.includes('salt_cuso4') ? SUBSTANCES.salt_cuso4.color : COLORLESS;
}

// Фенолфталеин малиновый только в щелочной среде. Считаем, что вещества взяты
// в эквивалентных количествах, поэтому кислота или соль меди полностью «съедают» щёлочь.
function isBasic(ids) {
  return ids.includes('base_naoh') && !ids.some((id) => id.startsWith('acid_') || id === 'salt_cuso4');
}

export function runExperiment(rawParams) {
  const params = normalizeParams(rawParams);
  const { substances, temperature, concentration } = params;
  const hasIndicator = substances.includes(INDICATOR);
  const reactants = substances.filter((id) => id !== INDICATOR).sort();
  const solid = reactants.find((id) => SUBSTANCES[id].form === 'solid');
  const liquidStart = startingLiquid(reactants);

  const base = {
    params,
    equation: null,
    observations: [],
    why: '',
    hint: '',
    safety: '',
    see: 'none',
    rate: null,
    visual: {
      liquidStart: liquidStart ?? COLORLESS,
      hasLiquid: liquidStart !== null,
      solid: solid ? { color: SUBSTANCES[solid].color } : null,
    },
  };

  if (reactants.length < 2) {
    // Одно вещество + индикатор — это не реакция, но показать окраску индикатора полезно.
    if (hasIndicator && reactants.length === 1 && SUBSTANCES[reactants[0]].form === 'solution') {
      const basic = isBasic(reactants);
      return {
        ...base,
        status: 'indicator',
        title: basic ? 'Индикатор показывает щелочную среду' : 'Индикатор не меняет цвет',
        see: basic ? 'color' : 'none',
        observations: [basic ? 'Раствор окрашивается в малиновый цвет' : 'Раствор остаётся бесцветным'],
        why: basic
          ? 'Фенолфталеин становится малиновым в щелочной среде.'
          : 'Фенолфталеин бесцветен в кислой и нейтральной среде.',
        hint: basic ? 'Что будет с цветом, если добавить кислоту?' : 'Проверьте индикатор в растворе щёлочи.',
        visual: { ...base.visual, liquidStart: basic ? CRIMSON : COLORLESS, liquidEnd: basic ? CRIMSON : COLORLESS },
      };
    }
    return {
      ...base,
      status: 'need_more',
      title: 'Нужно минимум два вещества',
      why: 'Для реакции нужны хотя бы два вещества. Добавьте второй реактив.',
    };
  }

  const entry = reactants.length === 2
    ? REACTIONS.find((r) => [...r.reactants].sort().join() === reactants.join())
    : null;

  if (!entry) {
    return {
      ...base,
      status: 'not_modeled',
      title: 'Этот опыт пока не моделируется',
      why: 'В проверенной базе лаборатории нет такой комбинации. Мы не показываем результат наугад, чтобы не научить неправильной химии.',
    };
  }

  const outcome = entry.resolve(temperature, concentration);

  if (outcome.type === 'not_modeled') {
    return { ...base, status: 'not_modeled', title: 'Этот опыт пока не моделируется', why: outcome.why };
  }

  if (outcome.type === 'no_reaction') {
    return {
      ...base,
      status: 'no_reaction',
      title: 'Реакция не идёт',
      observations: ['Видимых изменений нет'],
      why: outcome.why,
      hint: outcome.hint,
      safety: outcome.safety ?? '',
      visual: { ...base.visual, liquidEnd: base.visual.liquidStart },
    };
  }

  const rate = outcome.baseRate * rateFactor(temperature, concentration);
  const visual = { ...base.visual, ...outcome.visual };
  visual.liquidEnd = outcome.visual.liquidEnd ?? visual.liquidStart;
  let see = outcome.see;
  const observations = [...outcome.observations];

  if (hasIndicator) {
    // Индикатор сначала капают в щёлочь (среда щелочная), затем добавляют второе вещество.
    const before = reactants.includes('base_naoh');
    const after = isBasic(reactants);
    if (before) visual.liquidStart = CRIMSON;
    if (before && !after) {
      observations.unshift('Малиновая окраска фенолфталеина исчезает — щёлочь нейтрализована');
      if (see === 'none') see = 'color';
    }
  }

  return {
    ...base,
    status: 'reaction',
    title: 'Реакция идёт',
    equation: outcome.equation,
    observations,
    why: outcome.why,
    hint: outcome.hint,
    safety: outcome.safety,
    see,
    rate,
    visual,
  };
}
