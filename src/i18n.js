// Двуязычный интерфейс: русский и казахский.
// Язык выбирается один раз при загрузке страницы. Смена языка перезагружает страницу:
// все модули рисуют интерфейс один раз при запуске, и так не нужно вести по всему коду
// подписки на смену языка — ни одна строка не останется «забытой» на старом языке.
//
// Два вида перевода:
// - t(key) — строки интерфейса из src/i18n/ui.js (кнопки, подписи, сообщения);
// - tr(ruText) — содержимое работ и симуляций: русский текст из src/data, src/sims, src/svg
//   ищется в словарях src/i18n/kk/*. Непереведённое остаётся по-русски, а не ломает экран.
//
// Модуль импортируется и на сервере (через данные симуляций) — там нет window и localStorage,
// поэтому язык там всегда русский, а язык ответа ИИ задаёт параметр запроса.

import UI from './i18n/ui.js';
import CHEM, { patterns as CHEM_PATTERNS } from './i18n/kk/content-chem.js';
import SIMS, { patterns as SIM_PATTERNS } from './i18n/kk/content-sims.js';
import CORE, { patterns as CORE_PATTERNS } from './i18n/kk/content-core.js';
import ROADMAP from './i18n/kk/content-roadmap.js';

export const LANGS = ['ru', 'kk'];
const LANG_KEY = 'ai-stem-lab:lang';
const hasWindow = typeof window !== 'undefined';

function detectLang() {
  if (!hasWindow) return 'ru';
  // ?lang=kk в ссылке — чтобы учитель мог раздать ссылку сразу на казахскую версию
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (LANGS.includes(fromUrl)) {
    try {
      localStorage.setItem(LANG_KEY, fromUrl);
    } catch {
      // Без хранилища язык из ссылки действует только на эту загрузку.
    }
    return fromUrl;
  }
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return LANGS.includes(saved) ? saved : 'ru';
  } catch {
    return 'ru';
  }
}

export const lang = detectLang();
export const locale = lang === 'kk' ? 'kk-KZ' : 'ru-RU';
if (hasWindow) document.documentElement.lang = lang;

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Без хранилища выбор держится только в адресе страницы.
  }
  // Убираем ?lang= из адреса, иначе он перебил бы новый выбор при перезагрузке
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  if (!canStore()) url.searchParams.set('lang', next);
  window.location.replace(url.toString());
}

function canStore() {
  try {
    localStorage.setItem(`${LANG_KEY}:probe`, '1');
    localStorage.removeItem(`${LANG_KEY}:probe`);
    return true;
  } catch {
    return false;
  }
}

// Строка интерфейса по ключу. {name} заменяются значениями vars.
// Нет перевода — русский текст, нет и его — сам ключ (так пропуск сразу виден на экране).
// Значение может быть и не строкой (например, список подсказок чата) — тогда отдаём как есть.
export function t(key, vars) {
  const value = UI[lang]?.[key] ?? UI.ru[key] ?? key;
  if (typeof value !== 'string' || !vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => (vars[name] ?? m));
}

// Число со словом. В русском три формы («1 работа, 2 работы, 5 работ»): в словаре они
// записаны через «|». В казахском после числительного существительное не меняется («3 жұмыс»).
export function plural(n, key) {
  const forms = String(t(key)).split('|');
  if (lang !== 'ru' || forms.length < 3) return `${n} ${forms[0]}`;
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? forms[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? forms[1] : forms[2];
  return `${n} ${word}`;
}

// Словари содержимого собираются в Map один раз: tr() вызывается на каждое показание прибора.
const EXACT = new Map();
if (lang === 'kk') {
  for (const dict of [CORE, CHEM, SIMS, ROADMAP]) {
    for (const [ru, kk] of Object.entries(dict)) {
      // Одна строка в двух словарях с разным переводом — молча победил бы последний; в разработке предупреждаем
      if (import.meta.env?.DEV && EXACT.has(ru) && EXACT.get(ru) !== kk) console.warn('[i18n] разный перевод одной строки:', ru);
      EXACT.set(ru, kk);
    }
  }
}
const PATTERNS = lang === 'kk' ? [...CORE_PATTERNS, ...CHEM_PATTERNS, ...SIM_PATTERNS] : [];
// Результаты шаблонов кэшируем, но ограниченно: показания с числами почти не повторяются.
const patternCache = new Map();
const PATTERN_CACHE_MAX = 500;

export function tr(ruText) {
  if (lang === 'ru' || typeof ruText !== 'string' || !ruText) return ruText;
  const exact = EXACT.get(ruText);
  if (exact !== undefined) return exact;
  if (!PATTERNS.length) return ruText;
  const cached = patternCache.get(ruText);
  if (cached !== undefined) return cached;
  let out = ruText;
  for (const [re, replacement] of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(ruText)) {
      re.lastIndex = 0;
      out = ruText.replace(re, replacement);
      break;
    }
  }
  if (patternCache.size >= PATTERN_CACHE_MAX) patternCache.clear();
  patternCache.set(ruText, out);
  return out;
}

// Статичная разметка index.html: data-i18n="ключ" — текст элемента,
// data-i18n-html="ключ" — разметка из словаря (только наши собственные строки, не ввод пользователя),
// data-i18n-attr="placeholder:ключ;aria-label:ключ2" — атрибуты.
export function applyStaticI18n(root = document) {
  document.title = t('app.title');
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-html]')) node.innerHTML = t(node.dataset.i18nHtml);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }
}
