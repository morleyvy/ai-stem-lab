// Общая логика HTTP-эндпоинтов: одна и та же для Vercel (api/*.js)
// и для локального dev-сервера Vite (vite.config.js).

import { AiUnavailableError, askAboutSim, chatAssistant, explainExperiment, generateQuiz, generateQuizFor, hasLesson, normalizeLang, parseChatRequest, parseRequest, validateText } from './ai.js';
import { LessonRejectedError, generateLesson, parseLessonGenRequest } from './lessonGen.js';
import { missionFeedback, parseMissionCheck } from './missionCheck.js';
import { CUSTOM_ID_RE, validateLesson } from '../src/customLesson.js';

// Тексты ошибок, которые клиент показывает ученику как есть. lang, кроме 'kk', — русский (normalizeLang).
const ERRORS = {
  ru: {
    parseText: 'Текст запроса пустой или длиннее 300 символов',
    askLength: 'Вопрос длиннее 300 символов',
    chat: 'Вопрос пустой, длиннее 300 символов или запрос некорректен',
    lessonGen: 'Опишите работу (до 400 символов) и проверьте предмет, симуляцию и класс',
  },
  kk: {
    parseText: 'Сұраныс мәтіні бос немесе 300 таңбадан ұзын',
    askLength: 'Сұрақ 300 таңбадан ұзын',
    chat: 'Сұрақ бос, 300 таңбадан ұзын немесе сұраныс қате',
    lessonGen: 'Жұмысты сипаттаңыз (400 таңбаға дейін) және пәнді, симуляцияны, сыныпты тексеріңіз',
  },
};

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
    const lang = normalizeLang(body?.lang);
    const text = validateText(body?.text);
    if (!text) return { status: 400, body: { error: ERRORS[lang].parseText } };
    return withAi(() => parseRequest(text, lang));
  },

  async ask(body) {
    if (!body || typeof body !== 'object' || typeof body.simId !== 'string') return { status: 400, body: { error: 'bad_request' } };
    const lang = normalizeLang(body.lang);
    if (body.question != null && typeof body.question !== 'string') return { status: 400, body: { error: 'bad_request' } };
    if ((body.question ?? '').length > 300) return { status: 400, body: { error: ERRORS[lang].askLength } };
    return withAi(async () => ({ text: await askAboutSim(body, lang) }));
  },

  async explain(body) {
    if (!body || typeof body !== 'object') return { status: 400, body: { error: 'bad_request' } };
    // Параметры опыта и язык приходят одним объектом; движку язык не нужен
    const { lang, ...params } = body;
    return withAi(async () => ({ text: await explainExperiment(params, normalizeLang(lang)) }));
  },

  // Верные ответы уходят клиенту вместе с вопросами: это учебное закрепление, а не экзамен,
  // и мгновенная обратная связь важнее, чем защита от подсматривания в DevTools.
  async quiz(body) {
    if (!body || typeof body !== 'object') return { status: 400, body: { error: 'bad_request' } };
    // Работу учителя из конструктора сервер не хранит (она в Supabase под RLS или в браузере),
    // поэтому её содержимое приходит с клиента. Это допустимо: опрос увидит только тот, кто прислал
    // работу, а validateLesson пропускает лишь известную симуляцию, достижимые шаги и тексты
    // ограниченной длины — в промпт попадают те же поля, что и у встроенных работ, как данные в JSON.
    if (typeof body.lessonId === 'string' && CUSTOM_ID_RE.test(body.lessonId)) {
      const { lesson } = validateLesson(body.lesson);
      if (!lesson) return { status: 400, body: { error: 'bad_request' } };
      return withAi(() => generateQuizFor(lesson, normalizeLang(body.lang)));
    }
    if (!hasLesson(body.lessonId)) return { status: 400, body: { error: 'bad_request' } };
    return withAi(() => generateQuiz(body.lessonId, normalizeLang(body.lang)));
  },

  // Конструктор лабораторных для учителя. 422 — модель отказалась собирать такую работу
  // (не по теме или неуместно): reason показываем учителю. 503 — ИИ недоступен или так и не собрал
  // работу, которая проходит проверку.
  async 'lesson-gen'(body) {
    const request = parseLessonGenRequest(body);
    if (!request) return { status: 400, body: { error: ERRORS[normalizeLang(body?.lang)].lessonGen } };
    try {
      return { status: 200, body: { lesson: await generateLesson(request) } };
    } catch (err) {
      if (err instanceof LessonRejectedError) return { status: 422, body: { error: 'rejected', reason: err.message } };
      return withAi(() => { throw err; });
    }
  },

  async chat(body) {
    const lang = normalizeLang(body?.lang);
    const request = parseChatRequest(body);
    if (!request) return { status: 400, body: { error: ERRORS[lang].chat } };
    return withAi(async () => ({ text: await chatAssistant(request, lang) }));
  },

  // Детективная миссия: верность ответа клиент считает сам по движку, здесь — только отзыв ИИ
  // о рассуждении; опыты сервер пересчитывает сам (см. server/missionCheck.js).
  async 'mission-check'(body) {
    const request = parseMissionCheck(body);
    if (!request) return { status: 400, body: { error: 'bad_request' } };
    return withAi(() => missionFeedback(request, normalizeLang(body.lang)));
  },
};
