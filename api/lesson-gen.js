import { routes } from '../server/handlers.js';

// Генерация с повторной попыткой может занять десятки секунд — больше стандартного лимита функции
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { status, body } = await routes['lesson-gen'](req.body);
  res.status(status).json(body);
}
