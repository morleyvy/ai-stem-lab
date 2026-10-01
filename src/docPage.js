// Отдельные страницы сайта: «О проекте», «Вопросы и ответы».
// Своя ссылка у каждой нужна, чтобы политику можно было открыть, отправить и сохранить
// как документ, а не искать в окне поверх приложения. Тексты — в src/data/pages.js.

import { PAGES, PAGE_IDS } from './data/pages.js';
import { applyStaticI18n, lang, setLang, t } from './i18n.js';

applyStaticI18n();

const id = PAGE_IDS.includes(document.body.dataset.page) ? document.body.dataset.page : 'about';
const page = PAGES[id][lang] ?? PAGES[id].ru;
document.title = `${page.title} — Shoqan`;

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

function link(href, text, className = '') {
  const a = el('a', className, text);
  a.href = href;
  return a;
}

const crumbs = el('nav', 'doc-crumbs');
crumbs.setAttribute('aria-label', t('doc.crumbs'));
crumbs.append(link('/', t('doc.home')), el('span', '', ' / '), el('span', '', page.title));

const article = el('article', 'doc-article');
article.append(crumbs, el('h1', 'doc-title', page.title));
if (page.updated) article.append(el('p', 'doc-updated', page.updated));
article.append(el('p', 'doc-lead', page.lead));
for (const section of page.sections) {
  // В вопросах и ответах ответ свёрнут: список вопросов виден целиком, нужный открывается по нажатию
  if (id === 'faq') {
    const item = el('details', 'doc-faq');
    const summary = el('summary');
    summary.append(el('h2', '', section.h));
    item.append(summary, ...section.p.map((text) => el('p', '', text)));
    article.append(item);
    continue;
  }
  const block = el('section', 'doc-section');
  block.append(el('h2', '', section.h));
  for (const text of section.p ?? []) block.append(el('p', '', text));
  if (section.list) {
    const list = el('ul');
    list.append(...section.list.map((item) => el('li', '', item)));
    block.append(list);
  }
  for (const text of section.note ?? []) block.append(el('p', '', text));
  article.append(block);
}
document.getElementById('doc').replaceChildren(article);

// Подвал: остальные документы и возврат в лабораторию
const others = PAGE_IDS.filter((p) => p !== id).map((p) => link(`/${p}.html`, (PAGES[p][lang] ?? PAGES[p].ru).title, 'footer-link'));
const footer = document.getElementById('docFooter');
const nav = el('nav', 'doc-footer-links');
nav.setAttribute('aria-label', t('foot.nav'));
nav.append(link('/', t('doc.back'), 'footer-link'), ...others);
footer.replaceChildren(nav, el('p', 'doc-copy', `© ${new Date().getFullYear()} Shoqan · ${t('header.sub')}`));

for (const b of document.querySelectorAll('.lang-switch [data-lang]')) {
  b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  b.addEventListener('click', () => setLang(b.dataset.lang));
}
const select = document.getElementById('langSelect');
select.value = lang;
select.addEventListener('change', (e) => setLang(e.target.value));
