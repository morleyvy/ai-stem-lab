// Шоқан без интернета: ответ собирается из тех же проверенных данных, которые видит ИИ
// (теория и показания симуляции, объяснение реакции из движка), а не генерируется.
// Поэтому ответ может быть неполным, но не может быть неверным.
// Модуль не трогает DOM и язык сам: переводчики t и tr приходят снаружи, так его можно тестировать в node.

import { ALIASES, SUBSTANCES } from './data/substances.js';
import { runExperiment } from './engine.js';

// Корни слов на русском и казахском. Порядок важен: первый совпавший вид вопроса и определяет ответ.
const INTENTS = [
  ['hypothesis', /гипотез|болжам/],
  ['mission', /мисси|детектив|миссия/],
  ['progress', /балл|уровен|уровн|достиж|ұпай|деңгей|жетістік/],
  ['joinClass', /класс|код|учител|сынып|мұғалім/],
  ['internet', /интернет|офлайн|оффлайн|без сети|желі/],
  ['readings', /показ|прибор|сколько|значени|измер|көрсет|аспап|қанша|өлше/],
  ['formula', /формул|закон|заң/],
  ['change', /увелич|уменьш|больше|меньше|если|измени|арттыр|кеміт|азайт|көбейт|өзгерт|егер/],
  ['how', /как |как$|что делать|дальше|помоги|помощь|не получ|не выход|застрял|қалай|не істе|көмектес|келесі|шықпа/],
  ['why', /почему|зачем|объясн|что происх|что случ|что будет|что прои|неге|не үшін|түсіндір|не бол|не болады/],
];

export function detectIntent(question) {
  const q = ` ${question.toLowerCase().replace(/ё/g, 'е')} `;
  return INTENTS.find(([, re]) => re.test(q))?.[0] ?? 'other';
}

// facts: { sim: { def, params } | null, bench: открыт химический стол, result: итог движка | null, mission: bool }
// memory — общее для всей переписки: какие вопросы из базы уже заданы и какой был прошлый ответ.
// Без неё Шоқан на ответ ученика снова выдавал то же объяснение с тем же вопросом в конце.
export function answerOffline(question, facts, { t, tr }, memory = newMemory()) {
  const text = compose(question, facts, { t, tr }, memory);
  // Тот же ответ второй раз подряд ничего не даёт — честно говорим, что без сети больше не знаем
  if (text === memory.last) return t('off.again');
  memory.last = text;
  return text;
}

export const newMemory = () => ({ hints: new Set(), last: '' });

function compose(question, facts, i18n, memory) {
  const { t } = i18n;
  const intent = detectIntent(question);

  // Вопросы про сам сайт не зависят от опыта
  if (['hypothesis', 'mission', 'progress', 'joinClass', 'internet'].includes(intent)) return t(`off.faq.${intent}`);

  // В миссии нельзя подсказывать вещества: даже «почему» по результату выдало бы ответ
  if (facts.mission) return t('off.mission');

  if (facts.sim) return simAnswer(intent, facts.sim, i18n, memory);
  if (facts.bench) return benchAnswer(question, intent, facts.result, i18n, memory);
  return t('off.noExperiment');
}

function simAnswer(intent, { def, params }, { t, tr }, memory) {
  const readings = def.readings(params).map((r) => `${tr(r.label)}: ${r.value}`).join('; ');
  const observation = tr(def.describe(params));
  const theory = tr(def.theory);
  switch (intent) {
    case 'readings': return `${observation} ${t('off.readings')}: ${readings}.`;
    case 'formula': return `${t('off.formula')}: ${tr(def.formula)}. ${theory}`;
    case 'change': return `${theory} ${t('off.tryIt')}`;
    case 'how': return tr(def.hint);
    case 'why': return `${theory} ${observation}`;
    // Не вопрос, а реплика (например, ответ ученика) — после первого ответа предлагаем проверить на опыте
    default: return memory.last ? t('off.tryIt') : `${observation} ${theory} ${t('off.more')}`;
  }
}

function benchAnswer(question, intent, result, i18n, memory) {
  const { t, tr } = i18n;
  if (!result || result.status === 'need_more') return t('off.benchEmpty');
  if (intent === 'how') return t('off.followSteps');

  // Ученик называет другое вещество («а если медь?», «с медью ничего не будет») —
  // считаем этот опыт движком, так и вопрос из базы получает честный ответ
  const other = mentionedSubstance(question, result.params.substances);
  if (other) return whatIf(other, result, i18n, memory);

  if (intent === 'other' && memory.last) return t('off.again');
  return describeResult(result, intent, i18n, memory);
}

function describeResult(result, intent, { t, tr }, memory) {
  const parts = [];
  if (intent === 'readings' && result.observations?.length) parts.push(`${t('off.observed')}: ${result.observations.map(tr).join('; ')}.`);
  if (result.equation && intent !== 'readings') parts.push(`${t('off.equation')}: ${result.equation}.`);
  if (result.why) parts.push(tr(result.why));
  // Правило безопасности тоже достаточно сказать один раз за опыт
  if (result.safety && !memory.hints.has(result.safety)) {
    memory.hints.add(result.safety);
    parts.push(tr(result.safety));
  }
  // Вопрос из базы задаём один раз: повторённый, он выглядит так, будто ответ ученика не услышали
  if (result.hint && intent !== 'formula' && !memory.hints.has(result.hint)) {
    memory.hints.add(result.hint);
    parts.push(tr(result.hint));
  }
  return parts.join(' ') || t('off.benchEmpty');
}

function mentionedSubstance(question, current) {
  const q = question.toLowerCase().replace(/ё/g, 'е');
  return ALIASES.find(([id, patterns]) => !current.includes(id) && patterns.some((re) => re.test(q)))?.[0] ?? null;
}

// Меняем вещество той же формы (металл на металл, раствор на раствор), остальное оставляем как было
function whatIf(id, result, i18n, memory) {
  const { t, tr } = i18n;
  const form = SUBSTANCES[id].form;
  const kept = result.params.substances.filter((s) => SUBSTANCES[s].form !== form);
  const next = runExperiment({ ...result.params, substances: [...kept, id] });
  const name = tr(SUBSTANCES[id].name);
  if (next.status === 'not_modeled') return t('off.whatIfUnknown', { name });
  const seen = next.observations?.length ? next.observations.map(tr).join('; ') : '';
  return [t('off.whatIf', { name }), seen && `${seen}.`, describeResult(next, 'formula', i18n, memory)]
    .filter(Boolean).join(' ');
}
