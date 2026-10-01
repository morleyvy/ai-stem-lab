// Шоқан без интернета: ответ собирается из тех же проверенных данных, которые видит ИИ
// (теория и показания симуляции, объяснение реакции из движка), а не генерируется.
// Поэтому ответ может быть неполным, но не может быть неверным.
// Модуль не трогает DOM и язык сам: переводчики t и tr приходят снаружи, так его можно тестировать в node.

import { ALIASES, SUBSTANCES } from './data/substances.js';
import { runExperiment } from './engine.js';
// Казахские названия регуляторов нужны для разбора вопроса на любом языке интерфейса
import KK_CONTENT from './i18n/kk/content-sims.js';
import KK_LABS from './i18n/kk/labs/index.js';
import { OFFLINE_FAQ } from './data/offlineFaq.js';
import { LAB_FAQ } from './data/labs/index.js';
import { SHOWN_NEW_LABS } from './data/catalog.js';

const KK_SIMS = { ...KK_CONTENT, ...KK_LABS };

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
// i18n: { t, tr, lang } — переводчики и язык интерфейса (для готовых ответов на двух языках)
export function answerOffline(question, facts, i18n, memory = newMemory()) {
  const text = compose(question, facts, i18n, memory);
  // Тот же ответ второй раз подряд ничего не даёт — честно говорим, что без сети больше не знаем
  if (text === memory.last) return i18n.t('off.again');
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

  // Пересчёт опыта точнее любой заготовки, поэтому он первый
  const whatIf = facts.sim && simWhatIf(question, facts.sim, i18n);
  if (whatIf) return whatIf;
  const other = facts.bench && facts.result?.params && mentionedSubstance(question, facts.result.params.substances);
  if (other) return substanceWhatIf(other, facts.result, i18n, memory);
  // Показания и формулу берём из самого опыта; на остальное сначала ищем готовый проверенный ответ
  if (!['readings', 'formula'].includes(intent)) {
    const faq = searchFaq(question, facts, i18n.lang);
    if (faq) return faq;
  }
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

// Ученик называет другое вещество («а если медь?», «с медью ничего не будет») — считаем этот опыт
// движком, так и вопрос из базы получает честный ответ. Меняем вещество той же формы
// (металл на металл, раствор на раствор), остальное оставляем как было
function substanceWhatIf(id, result, i18n, memory) {
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

// ---------- «Что будет, если…» в симуляции ----------
// Симуляция сама считает показания при любых параметрах, поэтому ответ — это пересчёт опыта,
// а не заготовленный текст: «период вырастет с 2,01 до 2,84 с» всегда совпадёт с тем, что покажет стенд.

const UP = /увелич|больше|выше|повыс|длиннее|сильнее|тяжелее|добав|нагре|включ|дальше от|отодвин|арттыр|көбейт|жоғары|ұзар|қызд|қос|алыс/;
const DOWN = /уменьш|меньше|ниже|пониз|короче|слабее|легче|убав|охлад|остуд|выключ|ближе|придвин|кеміт|азайт|төмен|қысқар|суыт|өшір|жақын/;
// Слова, которыми о регуляторе спрашивают, хотя в его названии их нет
// «Дальше» без «от» не берём: «что делать дальше» — это не про расстояние
const SYNONYMS = { T: /нагре|охлад|остуд|тепл|холод|қызд|суыт/, t: /дольше|минут|секунд/, d: /ближе|дальше от|отодвин|придвин|жақын|алыс/ };

const TIME_IDS = ['t', 'time'];

const words = (text) => text.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-яәіңғүұқөһ]+/g) ?? [];
// Корень — первые четыре буквы: «длину», «длиной», «длина» совпадут; короткие служебные слова не участвуют
const stems = (text) => words(text ?? '').filter((w) => w.length >= 4).map((w) => w.slice(0, 4));

function simWhatIf(question, { def, params }, { t, tr }) {
  const q = question.toLowerCase().replace(/ё/g, 'е');
  const asked = new Set(stems(q));
  const up = UP.test(q);
  const down = DOWN.test(q);
  const factor = Number(q.match(/(\d+(?:[.,]\d+)?)\s*(?:раз|есе)/)?.[1]?.replace(',', '.'));
  const target = Number(q.match(/(?:до|=)\s*(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.'));

  let best = null;
  for (const c of def.controls) {
    if (c.action) continue;
    const label = new Set([...stems(c.label), ...stems(KK_SIMS[c.label])]);
    let score = [...label].filter((s) => asked.has(s)).length + (SYNONYMS[c.id]?.test(q) ? 1 : 0);
    // Названо значение переключателя: «стекло», «масло», «выключить лампу»
    const named = c.names?.findIndex((n) => [...stems(n), ...stems(KK_SIMS[n])].some((s) => asked.has(s))) ?? -1;
    if (named >= 0) score += 2;
    if (score > (best?.score ?? 0)) best = { c, score, named };
  }
  if (!best) return null;
  const { c, named } = best;
  if (named < 0 && !up && !down && !Number.isFinite(target)) return null;

  // Действия (собрать цепь, включить лазер) считаем выполненными: иначе приборы показывают ноль
  const base = { ...params };
  for (const a of def.controls) if (a.action) base[a.id] = a.max;
  // Опыт, который ещё не шёл по времени (нагрев, брожение), при нуле ничем не отличается — берём середину
  for (const a of def.controls) if (TIME_IDS.includes(a.id) && a.id !== c.id && !base[a.id]) base[a.id] = a.max / 2;

  const from = base[c.id];
  let to;
  if (named >= 0 && named !== from) to = named;
  else if (c.names) to = from + (down ? -1 : 1);
  else if (Number.isFinite(target)) to = target;
  else if (Number.isFinite(factor) && factor > 0) to = down ? from / factor : from * factor;
  else to = from + ((c.max - c.min) / 4) * (down ? -1 : 1);
  to = Math.min(c.max, Math.max(c.min, Math.round(to / c.step) * c.step));
  to = Number(to.toFixed(4));

  const value = (v) => (c.names ? tr(c.names[v]) : `${String(v).replace('.', ',')} ${c.unit}`.trim());
  if (to === from) return t('off.simLimit', { label: tr(c.label), value: value(from) });

  const after = { ...base, [c.id]: to };
  const before = def.readings(base);
  const changed = def.readings(after)
    .map((r, i) => (before[i] && before[i].value !== r.value ? `${tr(r.label)}: ${before[i].value} → ${r.value}` : null))
    .filter(Boolean);
  return [
    t('off.simIf', { label: tr(c.label), from: value(from), to: value(to) }),
    changed.length ? `${changed.join('; ')}.` : t('off.simSame'),
    t('off.tryIt'),
  ].join(' ');
}

// ---------- Поиск по частым вопросам ----------
// Совпадение считаем по корням слов (как косинус по множествам), а не по точной фразе:
// «зачем реостат» и «для чего в цепи нужен реостат» должны найти один и тот же ответ.

// Вопросительные и служебные слова есть почти в каждом вопросе и ничего не различают
const STOP = new Set(stems('почему зачем какой какая какие каких сколько такое будет если нужно можно этот этой этого тоже очень когда откуда чтобы неге деген қалай қандай үшін болады керек және бұл осы'));

// Скрытые работы не должны всплывать в ответах Шоқана
const FAQ_INDEX = [...OFFLINE_FAQ, ...LAB_FAQ.filter((f) => SHOWN_NEW_LABS.has(f.scope))].map((entry) => ({
  entry,
  variants: [...entry.q, ...entry.qk].map((v) => new Set(stems(v).filter((s) => !STOP.has(s)))),
}));

const FAQ_THRESHOLD = 0.5;

function searchFaq(question, facts, lang) {
  const asked = new Set(stems(question).filter((s) => !STOP.has(s)));
  if (!asked.size) return null;
  const here = facts.sim?.def.id ?? facts.lessonId;
  const opened = Boolean(facts.sim || facts.bench);
  const subject = facts.subject ?? (facts.bench ? 'chemistry' : null);
  let best = null;
  for (const { entry, variants } of FAQ_INDEX) {
    // В открытом опыте ответы других опытов не годятся: «почему выделяется газ» в работе
    // про металлы — не про мел. По всей базе ищем, только когда опыт не открыт
    if (opened && ![here, subject, 'general'].includes(entry.scope)) continue;
    // Вопросы открытого опыта и его предмета важнее: «почему период…» в маятнике — про маятник
    const bonus = entry.scope === here ? 0.15 : entry.scope === subject ? 0.05 : 0;
    for (const v of variants) {
      if (!v.size) continue;
      const common = [...v].filter((s) => asked.has(s)).length;
      // Одного общего корня мало: «расскажи» и «расстояние» совпадают по первым буквам.
      // Исключение — заготовки вроде «что такое осмос», где значимое слово одно. Короткий вопрос
      // ученика исключением не считаем: «кто такой Ньютон» — не вопрос про второй закон Ньютона
      if (common < Math.min(2, v.size)) continue;
      const score = common / Math.sqrt(v.size * asked.size) + bonus;
      if (score > (best?.score ?? 0)) best = { entry, score };
    }
  }
  if (!best || best.score < FAQ_THRESHOLD) return null;
  return lang === 'kk' ? best.entry.ak : best.entry.a;
}
