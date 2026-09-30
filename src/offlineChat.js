// Шоқан без интернета: ответ собирается из тех же проверенных данных, которые видит ИИ
// (теория и показания симуляции, объяснение реакции из движка), а не генерируется.
// Поэтому ответ может быть неполным, но не может быть неверным.
// Модуль не трогает DOM и язык сам: переводчики t и tr приходят снаружи, так его можно тестировать в node.

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
export function answerOffline(question, facts, { t, tr }) {
  const intent = detectIntent(question);

  // Вопросы про сам сайт не зависят от опыта
  if (['hypothesis', 'mission', 'progress', 'joinClass', 'internet'].includes(intent)) return t(`off.faq.${intent}`);

  // В миссии нельзя подсказывать вещества: даже «почему» по результату выдало бы ответ
  if (facts.mission) return t('off.mission');

  if (facts.sim) return simAnswer(intent, facts.sim, { t, tr });
  if (facts.bench) return benchAnswer(intent, facts.result, { t, tr });
  return t('off.noExperiment');
}

function simAnswer(intent, { def, params }, { t, tr }) {
  const readings = def.readings(params).map((r) => `${tr(r.label)}: ${r.value}`).join('; ');
  const observation = tr(def.describe(params));
  const theory = tr(def.theory);
  switch (intent) {
    case 'readings': return `${observation} ${t('off.readings')}: ${readings}.`;
    case 'formula': return `${t('off.formula')}: ${tr(def.formula)}. ${theory}`;
    case 'change': return `${theory} ${t('off.tryIt')}`;
    case 'how': return tr(def.hint);
    case 'why': return `${theory} ${observation}`;
    default: return `${observation} ${theory} ${t('off.more')}`;
  }
}

function benchAnswer(intent, result, { t, tr }) {
  if (!result || result.status === 'need_more') return t('off.benchEmpty');
  if (intent === 'how') return t('off.followSteps');
  const parts = [];
  if (intent === 'readings' && result.observations?.length) parts.push(`${t('off.observed')}: ${result.observations.map(tr).join('; ')}.`);
  if (result.equation && intent !== 'readings') parts.push(`${t('off.equation')}: ${result.equation}.`);
  if (result.why) parts.push(tr(result.why));
  if (result.safety) parts.push(tr(result.safety));
  if (result.hint && intent !== 'formula') parts.push(tr(result.hint));
  return parts.join(' ') || t('off.benchEmpty');
}
