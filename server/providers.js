// Провайдеры ИИ за одним интерфейсом generate({ system, user, schema, maxTokens? }) → текст.
// maxTokens нужен длинным ответам (работа из конструктора — несколько тысяч токенов JSON).
// Выбор по тому, какой ключ задан: GEMINI_API_KEY (бесплатный лимит) или ANTHROPIC_API_KEY.
// Остальной код не знает, какая модель отвечает, — поменять провайдера можно одной переменной.

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

// Flash-Lite: на бесплатном тарифе у обычной Flash всего 5 запросов в минуту — мало для демо.
// Алиас «-latest» — не придётся править код, когда Google выпустит новую версию.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
// Запасная модель: при перегрузке (503) или исчерпанном лимите (429) у Google обычно падает
// одна модель, а не все сразу, и лимиты бесплатного тарифа считаются для каждой модели отдельно.
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-latest';
// Короткая пауза: всплеск нагрузки часто проходит за секунду, а ученик не должен долго ждать.
const RETRY_DELAY_MS = 1000;
// Sonnet 5: для разбора запроса и короткого объяснения его хватает, а стоит в ~2.5 раза дешевле Opus.
const CLAUDE_MODEL = 'claude-sonnet-5';

export class AiUnavailableError extends Error {}

let gemini;
let claude;

async function generateGemini({ system, user, schema, maxTokens }, model) {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await gemini.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      // С запасом: у Gemini «размышления» модели тоже расходуют этот лимит.
      maxOutputTokens: maxTokens ?? 4096,
      ...(schema && { responseMimeType: 'application/json', responseJsonSchema: schema }),
    },
  });
  if (!response.text) throw new AiUnavailableError(`empty response (${response.candidates?.[0]?.finishReason ?? 'no candidates'})`);
  return response.text;
}

async function generateClaude({ system, user, schema, maxTokens }) {
  claude ??= new Anthropic();
  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens ?? 2000,
    output_config: { effort: 'low', ...(schema && { format: { type: 'json_schema', schema } }) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (message.stop_reason === 'refusal') throw new AiUnavailableError('refusal');
  const block = message.content.find((b) => b.type === 'text');
  if (!block) throw new AiUnavailableError('empty response');
  return block.text;
}

// Временный сбой (перегрузка, лимит, сеть) — есть смысл повторить или сменить модель.
// Ошибки вроде неверного ключа или плохого запроса повтором не лечатся.
function isTransient(err) {
  const status = err?.status;
  return status === undefined || status === 429 || status >= 500;
}

// Цепочка попыток: основная модель Gemini, она же ещё раз после паузы, запасная Gemini, затем Claude.
// Берутся только провайдеры, для которых задан ключ.
function attempts() {
  const list = [];
  if (process.env.GEMINI_API_KEY) {
    list.push({ run: (r) => generateGemini(r, GEMINI_MODEL) });
    list.push({ run: (r) => generateGemini(r, GEMINI_MODEL), retry: true });
    if (GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) list.push({ run: (r) => generateGemini(r, GEMINI_FALLBACK_MODEL) });
  }
  if (process.env.ANTHROPIC_API_KEY) list.push({ run: generateClaude });
  return list;
}

export async function generate(request) {
  const list = attempts();
  if (list.length === 0) throw new AiUnavailableError('no API key configured');
  let lastError;
  for (const attempt of list) {
    if (attempt.retry) {
      // Повтор той же модели имеет смысл только при временном сбое.
      if (!isTransient(lastError)) continue;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    try {
      return await attempt.run(request);
    } catch (err) {
      lastError = err;
    }
  }
  // Любой сбой внешнего вызова (нет ключа, лимит, сеть, отказ) для ученика значит одно:
  // ИИ сейчас недоступен — фронтенд переключится на офлайн-режим.
  if (lastError instanceof AiUnavailableError) throw lastError;
  throw new AiUnavailableError(lastError?.message ?? String(lastError));
}
