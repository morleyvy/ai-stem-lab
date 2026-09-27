import { routes } from '../server/handlers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { status, body } = await routes['mission-check'](req.body);
  res.status(status).json(body);
}
