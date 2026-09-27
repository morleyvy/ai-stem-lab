// Провайдеры ИИ за одним интерфейсом generate({ system, user, schema, maxTokens? }) → текст.
// maxTokens нужен длинным ответам (работа из конструктора — несколько тысяч токенов JSON).
// Выбор по тому, какой ключ задан: GEMINI_API_KEY (бесплатный лимит) или ANTHROPIC_API_KEY.
// Остальной код не знает, какая модель отвечает, — поменять провайдера можно одной переменной.

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

// Flash-Lite: на бесплатном тарифе у обычной Flash всего 5 запросов в минуту — мало для демо.
// Алиас «-latest» — не придётся править код, когда Google выпустит новую версию.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
// Sonnet 5: для разбора запроса и короткого объяснения его хватает, а стоит в ~2.5 раза дешевле Opus.
const CLAUDE_MODEL = 'claude-sonnet-5';

export class AiUnavailableError extends Error {}

let gemini;
let claude;

async function generateGemini({ system, user, schema, maxTokens }) {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
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

export async function generate(request) {
  const provider = process.env.GEMINI_API_KEY ? generateGemini
    : process.env.ANTHROPIC_API_KEY ? generateClaude
      : null;
  if (!provider) throw new AiUnavailableError('no API key configured');
  try {
    return await provider(request);
  } catch (err) {
    // Любой сбой внешнего вызова (нет ключа, лимит, сеть, отказ) для ученика значит одно:
    // ИИ сейчас недоступен — фронтенд переключится на офлайн-режим.
    if (err instanceof AiUnavailableError) throw err;
    throw new AiUnavailableError(err?.message ?? String(err));
  }
}
