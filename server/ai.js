// Серверная часть ИИ. Ключ API живёт только здесь (переменная окружения),
// в браузер он никогда не попадает.

import { SUBSTANCES, SUBSTANCE_IDS } from '../src/data/substances.js';
import { normalizeParams, rateFactor, runExperiment } from '../src/engine.js';
import { AiUnavailableError, generate } from './providers.js';
import { SIMS } from '../src/data/catalog.js';

export { AiUnavailableError };

const MAX_TEXT_LENGTH = 300;

const SUBSTANCE_LIST = SUBSTANCE_IDS
  .map((id) => `- ${id} — ${SUBSTANCES[id].name} (${SUBSTANCES[id].formula})`)
  .join('\n');

const PARSE_SYSTEM = `Ты — модуль разбора запросов в виртуальной химической лаборатории для школьников 8–9 класса.

Твоя задача — превратить запрос ученика в описание опыта. Ты НЕ решаешь, что произойдёт в опыте: это делает проверенная база реакций. Ты только определяешь, что ученик хочет сделать.

Доступные вещества (используй только эти id):
${SUBSTANCE_LIST}

Правила:
- Если ученик упоминает вещество, которого нет в списке, — status "unsupported", перечисли такие вещества в unknown_substances.
- Если запрос не про химический опыт или просит что-то опасное (взрывчатка, яды, как навредить) — status "rejected", коротко объясни причину в reason.
- Если ученик описывает цель («хочу получить газ», «как сделать осадок»), подбери подходящие вещества и условия из списка — ученик сам проведёт опыт по твоему плану.
- Если параметр не указан: temperature 20, concentration "dilute".
- Понимай разговорную речь на русском и казахском: «кислота» без уточнения — acid_hcl, «нагрей» — 80, «кипяти» — 100, «гвоздь» — metal_fe, «медный купорос» — salt_cuso4.
- temperature — целое число от 0 до 100.
- reason пиши по-русски, одним предложением, только если status не "ok".`;

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'unsupported', 'rejected'] },
    substances: { type: 'array', items: { type: 'string', enum: SUBSTANCE_IDS } },
    temperature: { type: 'integer' },
    concentration: { type: 'string', enum: ['dilute', 'concentrated'] },
    unknown_substances: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['status', 'substances', 'temperature', 'concentration', 'unknown_substances', 'reason'],
  additionalProperties: false,
};

const EXPLAIN_SYSTEM = `Ты — ассистент учителя химии в виртуальном практикуме для 8–9 классов.

Тебе передан результат опыта из проверенной базы лаборатории. Объясни его в 3–4 коротких предложениях:
- что ученик увидел и почему так произошло;
- если реакции не было или опыт не моделируется — объясни почему;
- если в данных есть rate_factor — можешь сказать, во сколько раз температура/концентрация ускорили реакцию;
- закончи одним вопросом для самопроверки, связанным с темой опыта.

Используй только факты из переданных данных. Не добавляй новых веществ, цветов, формул или реакций.
Пиши просто, по-русски, без markdown-разметки.
Стиль — научный, но понятный школьнику. Обращайся на «вы». Не используй слов, выдающих пол ученика.`;

export function validateText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return null;
  return trimmed;
}

export async function parseRequest(text) {
  const raw = await generate({ system: PARSE_SYSTEM, user: text, schema: PARSE_SCHEMA });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiUnavailableError('invalid JSON from model');
  }

  // Даже со строгой схемой перепроверяем: ответ модели — тоже внешний ввод.
  const status = ['ok', 'unsupported', 'rejected'].includes(parsed.status) ? parsed.status : 'unsupported';
  return {
    status,
    ...normalizeParams(parsed),
    unknown_substances: Array.isArray(parsed.unknown_substances)
      ? parsed.unknown_substances.filter((s) => typeof s === 'string').slice(0, 5).map((s) => s.slice(0, 60))
      : [],
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '',
  };
}

export async function explainExperiment(rawParams) {
  // Результат пересчитываем на сервере, а не берём от клиента: так в промпт
  // нельзя подсунуть выдуманные «факты» через подделанный запрос.
  const result = runExperiment(rawParams);
  const facts = {
    substances: result.params.substances.map((id) => SUBSTANCES[id].name),
    temperature_c: result.params.temperature,
    concentration: result.params.concentration === 'concentrated' ? 'концентрированная' : 'разбавленная',
    status: result.status,
    title: result.title,
    equation: result.equation,
    observations: result.observations,
    why: result.why,
    rate_factor: result.rate
      ? Number(rateFactor(result.params.temperature, result.params.concentration).toFixed(1))
      : null,
    hint: result.hint,
  };

  return generate({ system: EXPLAIN_SYSTEM, user: JSON.stringify(facts) });
}

// ---------- Физика и биология: вопросы об опыте на симуляции ----------

const SIM_SYSTEM = `Ты — ассистент учителя в виртуальной STEM-лаборатории для 8–9 классов (физика и биология).

Тебе переданы данные опыта: название, предмет, теория, формула, текущие параметры и показания приборов, а также вопрос ученика (поле question, может быть пустым).
- Если вопрос пустой — объясни в 3–4 предложениях, что сейчас показывают приборы и почему, опираясь на формулу и теорию, и закончи одним вопросом для самопроверки.
- Если вопрос есть — ответь на него в 3–5 предложениях, используя показания приборов и школьную программу по теме опыта.
- Если вопрос не относится к опыту или к учёбе — вежливо предложи вернуться к опыту.
- Числа бери из переданных показаний, не придумывай других измерений.
Стиль — научный, но понятный школьнику. Обращайся на «вы», не используй слов, выдающих пол ученика. Пиши по-русски, без markdown-разметки.`;

// Параметры от клиента приводим к допустимым значениям регуляторов этой симуляции.
function normalizeSimParams(def, raw = {}) {
  return Object.fromEntries(def.controls.map((c) => {
    const v = Number(raw[c.id]);
    if (!Number.isFinite(v)) return [c.id, c.value];
    const snapped = Math.round((v - c.min) / c.step) * c.step + c.min;
    return [c.id, Number(Math.min(c.max, Math.max(c.min, snapped)).toFixed(4))];
  }));
}

export async function askAboutSim({ simId, params, question }) {
  const def = Object.hasOwn(SIMS, simId) ? SIMS[simId] : null;
  if (!def) throw new AiUnavailableError('unknown simulation');
  const p = normalizeSimParams(def, params);
  const q = typeof question === 'string' ? question.trim().slice(0, MAX_TEXT_LENGTH) : '';
  const facts = {
    experiment: def.title,
    subject: def.subject === 'physics' ? 'физика' : 'биология',
    theory: def.theory,
    formula: def.formula,
    parameters: def.controls.map((c) => ({ name: c.label, value: c.names ? c.names[p[c.id]] : `${p[c.id]} ${c.unit}` })),
    readings: def.readings(p),
    observation: def.describe(p),
    // Вопрос ученика — только данные внутри JSON, а не инструкции для модели.
    question: q,
  };
  return generate({ system: SIM_SYSTEM, user: JSON.stringify(facts) });
}
