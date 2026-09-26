// Офлайн-разбор запроса по ключевым словам. Нужен, когда нет интернета или
// ИИ недоступен: школа в селе со слабой связью всё равно сможет ставить опыты.

import { ALIASES } from './data/substances.js';
import { normalizeParams } from './engine.js';

export function parseLocally(text) {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  const substances = [];
  let rest = t;

  for (const [id, patterns] of ALIASES) {
    const hit = patterns.find((p) => p.test(rest));
    if (hit) {
      substances.push(id);
      // Вырезаем найденное, чтобы «медный купорос» не засчитался ещё и как «медь».
      rest = rest.replace(hit, ' ');
    }
  }

  // «Кислота» без уточнения — берём соляную как самую частую в школьных опытах.
  if (!substances.some((id) => id.startsWith('acid_')) && /кислот|қышқыл/.test(rest)) {
    substances.push('acid_hcl');
  }

  let temperature = 20;
  const deg = t.match(/(\d{1,3})\s*(°|градус|c\b|с\b)/);
  if (deg) temperature = Number(deg[1]);
  else if (/кипя|кипен|қайна/.test(t)) temperature = 100;
  else if (/нагре|нагрет|подогре|қыздыр/.test(t)) temperature = 80;

  const concentration = /концентр/.test(t) ? 'concentrated' : 'dilute';

  const params = normalizeParams({ substances, temperature, concentration });
  return {
    status: params.substances.length ? 'ok' : 'unsupported',
    ...params,
    reason: params.substances.length ? '' : 'Не нашёл знакомых веществ. Попробуй выбрать их из списка.',
  };
}
