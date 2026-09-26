// Общая логика HTTP-эндпоинтов: одна и та же для Vercel (api/*.js)
// и для локального dev-сервера Vite (vite.config.js).

import { AiUnavailableError, askAboutSim, explainExperiment, parseRequest, validateText } from './ai.js';

async function withAi(fn) {
  try {
    return { status: 200, body: await fn() };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // 503 = «ИИ недоступен»: клиент молча переключится на офлайн-режим.
      console.warn('[ai] unavailable:', err.message);
      return { status: 503, body: { error: 'ai_unavailable' } };
    }
    console.error('[ai] unexpected error', err);
    return { status: 500, body: { error: 'internal_error' } };
  }
}

export const routes = {
  async parse(body) {
    const text = validateText(body?.text);
    if (!text) return { status: 400, body: { error: 'Текст запроса пустой или длиннее 300 символов' } };
    return withAi(() => parseRequest(text));
  },

  async ask(body) {
    if (!body || typeof body !== 'object' || typeof body.simId !== 'string') return { status: 400, body: { error: 'bad_request' } };
    if (body.question != null && typeof body.question !== 'string') return { status: 400, body: { error: 'bad_request' } };
    if ((body.question ?? '').length > 300) return { status: 400, body: { error: 'Вопрос длиннее 300 символов' } };
    return withAi(async () => ({ text: await askAboutSim(body) }));
  },

  async explain(body) {
    if (!body || typeof body !== 'object') return { status: 400, body: { error: 'bad_request' } };
    return withAi(async () => ({ text: await explainExperiment(body) }));
  },
};
