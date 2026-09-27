import { defineConfig, loadEnv } from 'vite';

// С запасом на работу из конструктора, которую клиент присылает для опроса (до 20 000 байт JSON)
const MAX_BODY_BYTES = 40_000;

// В разработке отдаём /api/* прямо из Vite, чтобы не нужен был отдельный сервер.
// На Vercel те же обработчики работают как serverless-функции из папки api/.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };

        const name = req.url.replace(/^\//, '').split('?')[0];
        if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > MAX_BODY_BYTES) return send(413, { error: 'too_large' });
        }

        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          return send(400, { error: 'invalid_json' });
        }

        // Импорт внутри запроса: изменения в server/ подхватываются без перезапуска.
        const { routes } = await server.ssrLoadModule('/server/handlers.js');
        if (!Object.hasOwn(routes, name)) return send(404, { error: 'not_found' });
        const result = await routes[name](body);
        send(result.status, result.body);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Ключ читаем из .env только на сервере — префикса VITE_ нет, в браузер он не попадёт.
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'ANTHROPIC_API_KEY']) {
    if (env[name] && !process.env[name]) process.env[name] = env[name];
  }
  return { plugins: [localApi()] };
});
