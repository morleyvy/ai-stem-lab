// Плавающий чат с ИИ-ассистентом Шоқаном: доступен на всех экранах, кроме входа.
// Состояние приложения чат не читает сам — «что открыто сейчас» ему сообщает getContext,
// так чат не зависит от внутренностей main.js.

import { ALL_LESSONS, SIMS, SUBJECT_BY_ID } from './data/catalog.js';
import { t, tr } from './i18n.js';

const MAX_QUESTION = 300;
// Сервер всё равно примет только последние реплики — не гоняем лишнее по сети.
const HISTORY_TURNS = 6;
const MASCOT = '/icons/mascot.webp';
// Регуляторы опыта и панель химического стола прилипают к низу экрана. Кнопку чата поднимаем
// над ними: регуляторы важнее, чем угол сцены, который кнопка закроет вместо них.
const STICKY_BARS = '.sim-panel, .lab-bar';
// Столько же длится переход в CSS: после него панель прячется атрибутом hidden
const CLOSE_MS = 200;

// Подсказки для пустого чата: первый вопрос проще выбрать, чем придумать.
// Тексты на обоих языках — в src/i18n/ui.js (chat.sugg.*, chat.sim.*).
const SUBJECT_SUGGESTIONS = ['chemistry', 'physics', 'biology'];
const SIM_SUGGESTION = ['ohm', 'lens', 'pendulum', 'archimedes'];

const SEND_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

function mascotImg(className, size) {
  const img = el('img', className);
  Object.assign(img, { src: MASCOT, alt: '', width: size, height: size, decoding: 'async' });
  img.setAttribute('aria-hidden', 'true');
  return img;
}

// Название открытого опыта для подписи и облачка; пусто — опыт не открыт
function experimentTitle(ctx) {
  if (ctx.simId && Object.hasOwn(SIMS, ctx.simId)) return tr(SIMS[ctx.simId].title);
  const lesson = ctx.lessonId && ALL_LESSONS.find((l) => l.id === ctx.lessonId);
  if (lesson) return tr(lesson.title);
  return ctx.sandbox ? t('chat.sandbox') : '';
}

function suggestionsFor(ctx) {
  const sim = ctx.simId && Object.hasOwn(SIMS, ctx.simId) ? SIMS[ctx.simId] : null;
  // Химическая работа или свободная лаборатория: вопросы о том, что происходит в стакане
  if (!sim && (ctx.lessonId || ctx.sandbox)) return t('chat.sugg.bench');
  if (!sim) return t(`chat.sugg.${SUBJECT_SUGGESTIONS.includes(ctx.subject) ? ctx.subject : 'general'}`);
  const first = SIM_SUGGESTION.includes(sim.id) ? t(`chat.sim.${sim.id}`) : t('chat.increase', { label: tr(sim.controls[0].label).toLowerCase() });
  // Длинные «формулы» у биологических опытов — это целые фразы, в кнопку они не помещаются
  const formula = sim.formula.length <= 20 ? t('chat.formula', { formula: tr(sim.formula) }) : t('chat.law');
  return [first, t('chat.readings'), formula];
}

export function initChat({ postJson, getContext, screens, answerOffline }) {
  // Переписка живёт только в памяти страницы: после перезагрузки начинается заново.
  const history = [];
  let pending = false;
  let isOpen = false;
  let closeTimer = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const root = el('div', 'chat');
  root.hidden = true;

  const fab = el('button', 'chat-fab');
  fab.type = 'button';
  fab.setAttribute('aria-label', t('chat.fab'));
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'chatPanel');
  fab.title = t('chat.fab');
  fab.append(mascotImg('chat-fab-img', 72));

  // Реплика рядом с головой Шоқана подсказывает, что это помощник, а не декор.
  // После первого открытия чата она больше не нужна и не мешает до перезагрузки страницы.
  const hint = el('button', 'chat-hint', t('chat.hint'));
  hint.type = 'button';
  hint.tabIndex = -1;
  hint.setAttribute('aria-hidden', 'true');
  // На телефоне облачко закрывает текст карточек — показываем его ненадолго
  if (window.matchMedia('(max-width: 480px)').matches) setTimeout(() => hint.remove(), 7000);

  const panel = el('section', 'chat-panel');
  panel.id = 'chatPanel';
  panel.hidden = true;
  // Немодальный диалог: страница под чатом остаётся рабочей, можно двигать регуляторы и спрашивать.
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'chatTitle');

  const head = el('div', 'chat-head');
  const avatar = el('span', 'chat-avatar');
  avatar.append(mascotImg('', 44));
  const titleBox = el('div', 'chat-title-box');
  const title = el('h2', 'chat-title', 'Шоқан');
  title.id = 'chatTitle';
  titleBox.append(title, el('p', 'chat-subtitle', t('chat.subtitle')));
  const closeBtn = el('button', 'chat-close');
  closeBtn.type = 'button';
  closeBtn.innerHTML = CLOSE_ICON;
  closeBtn.setAttribute('aria-label', t('chat.close'));
  head.append(avatar, titleBox, closeBtn);

  // Полоска под шапкой показывает, о чём ассистент «знает»: так ученик понимает,
  // что можно спрашивать про открытый опыт, не описывая его заново.
  const contextBar = el('p', 'chat-context');

  const log = el('div', 'chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', t('chat.log'));

  const empty = el('div', 'chat-empty');
  const chips = el('div', 'chat-chips');
  empty.append(
    mascotImg('chat-empty-img', 72),
    el('p', 'chat-empty-title', t('chat.hello')),
    el('p', 'chat-empty-text', t('chat.intro')),
    chips,
  );
  log.append(empty);

  const form = el('form', 'chat-form');
  const field = el('div', 'chat-field');
  const input = el('textarea', 'chat-input');
  Object.assign(input, { rows: 1, maxLength: MAX_QUESTION, placeholder: t('chat.placeholder') });
  input.setAttribute('aria-label', t('chat.inputLabel'));
  input.setAttribute('aria-describedby', 'chatCounter');
  const send = el('button', 'chat-send');
  send.type = 'submit';
  send.innerHTML = SEND_ICON;
  send.setAttribute('aria-label', t('chat.send'));
  field.append(input, send);
  const counter = el('span', 'chat-counter', `0/${MAX_QUESTION}`);
  counter.id = 'chatCounter';
  form.append(field, counter);

  panel.append(head, contextBar, log, form);
  root.append(panel, hint, fab);
  document.body.append(root);

  function addMessage(role, text, extra = '') {
    empty.remove();
    const row = el('div', `chat-row ${role}`);
    const msg = el('div', `chat-msg ${extra}`.trim(), text);
    if (role === 'assistant') row.append(mascotImg('chat-mini', 28));
    row.append(msg);
    log.append(row);
    // Длинный ответ показываем с начала, а не с последней строки — иначе вопрос и первые фразы уезжают вверх.
    log.scrollTop = role === 'assistant' && text ? row.offsetTop - 14 : log.scrollHeight;
    return row;
  }

  function renderContext() {
    const ctx = getContext() ?? {};
    const sim = ctx.simId && Object.hasOwn(SIMS, ctx.simId) ? SIMS[ctx.simId] : null;
    const subj = SUBJECT_BY_ID[ctx.subject]?.name;
    const exp = experimentTitle(ctx);
    contextBar.textContent = exp ? t('chat.ctxSim', { title: exp }) : subj ? t('chat.ctxSubject', { name: tr(subj) }) : '';
    contextBar.hidden = !contextBar.textContent;
    if (sim || ctx.subject) root.style.setProperty('--chat-subject', SUBJECT_BY_ID[sim?.subject ?? ctx.subject]?.color ?? '');
    chips.replaceChildren(...suggestionsFor(ctx).map((q) => {
      const chip = el('button', 'chat-chip', q);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        input.value = q;
        ask();
      });
      return chip;
    }));
  }

  function updateInput() {
    counter.textContent = `${input.value.length}/${MAX_QUESTION}`;
    send.disabled = pending || !input.value.trim();
    // Поле растёт вместе с вопросом до четырёх строк, дальше — прокрутка внутри
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }

  function open() {
    clearTimeout(closeTimer);
    isOpen = true;
    hint.remove();
    fab.classList.remove('ready');
    renderContext();
    updateLift();
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    // Класс ставим кадром позже, иначе браузер не увидит начального состояния и переход не сыграет
    requestAnimationFrame(() => root.classList.toggle('open', isOpen));
    updateInput();
    input.focus();
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    const hide = () => {
      closeTimer = null;
      if (!isOpen) panel.hidden = true;
    };
    if (reducedMotion.matches || root.hidden) hide();
    else closeTimer = setTimeout(hide, CLOSE_MS);
    if (restoreFocus && !root.hidden) fab.focus();
  }

  async function ask() {
    const question = input.value.trim().slice(0, MAX_QUESTION);
    if (!question || pending) return;
    pending = true;
    input.value = '';
    updateInput();
    addMessage('user', question);
    renderContext();
    const typing = addMessage('assistant', '', 'typing');
    const dots = el('span', 'chat-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(el('span'), el('span'), el('span'));
    typing.lastChild.append(el('span', 'sr-only', t('chat.typing')), dots);

    // Без сети не ждём таймаута запроса: на телефоне в авиарежиме он может висеть долго
    const res = navigator.onLine
      ? await postJson('/api/chat', { question, history: history.slice(-HISTORY_TURNS), context: getContext() ?? {} })
      : { ok: false, status: 0, data: {} };
    typing.remove();
    const text = res.ok && typeof res.data.text === 'string' ? res.data.text.trim() : '';
    if (text) {
      addMessage('assistant', text);
      // В историю попадают только удачные обмены: сбой не должен сбивать следующий ответ.
      history.push({ role: 'user', text: question }, { role: 'assistant', text });
    } else if (res.status === 0 || res.status >= 429) {
      // Нет сети, лимит или ИИ упал — отвечаем из проверенной базы. В историю для ИИ это не идёт:
      // заготовленный ответ не должен выглядеть для модели как её собственная реплика.
      const row = addMessage('assistant', answerOffline(question));
      row.lastChild.append(el('span', 'chat-note', t('chat.offlineNote')));
    } else {
      addMessage('assistant', t('chat.fallback'), 'error');
    }
    pending = false;
    updateInput();
    if (isOpen) input.focus();
  }

  fab.addEventListener('click', () => (isOpen ? close() : open()));
  hint.addEventListener('click', () => open());
  closeBtn.addEventListener('click', () => close());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  input.addEventListener('input', updateInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask();
  });

  // Подъём над прилипшими панелями: считаем, насколько панель под кнопкой выступает снизу экрана.
  const bars = [...document.querySelectorAll(STICKY_BARS)];
  let liftFrame = 0;
  function updateLift() {
    liftFrame = 0;
    const fr = fab.getBoundingClientRect();
    const h = window.innerHeight;
    const zoneTop = h - fr.height - 40; // где стоит неподнятая кнопка, с запасом
    let lift = 0;
    for (const bar of bars) {
      const r = bar.getBoundingClientRect();
      if (!r.height || r.left >= fr.right || r.right <= fr.left || r.bottom <= zoneTop || r.top >= h) continue;
      lift = Math.max(lift, h - r.top);
    }
    // На очень низком экране не уводим кнопку под шапку
    lift = Math.min(lift, Math.max(0, h - fr.height - 140));
    root.style.setProperty('--chat-lift', `${Math.round(lift)}px`);
  }
  const scheduleLift = () => {
    if (!liftFrame && !root.hidden) liftFrame = requestAnimationFrame(updateLift);
  };
  window.addEventListener('scroll', scheduleLift, { passive: true });
  window.addEventListener('resize', scheduleLift);
  // Панели меняют размер при смене опыта и прячутся вместе с карточкой — тоже пересчёт
  const barObserver = new ResizeObserver(scheduleLift);
  for (const bar of bars) barObserver.observe(bar);

  // Кнопка видна только на экранах практикума: на входе чат не нужен, а до загрузки
  // профиля (ни один экран ещё не показан) она висела бы на пустой странице.
  const screenEls = screens.map((id) => document.getElementById(id)).filter(Boolean);
  function syncVisibility() {
    const visible = screenEls.some((s) => !s.hidden);
    if (!visible) close({ restoreFocus: false });
    root.hidden = !visible;
    if (!visible) return;
    scheduleLift();
    // Экран сменился при открытом чате — обновляем подпись и подсказки.
    if (isOpen) renderContext();
  }
  const observer = new MutationObserver(syncVisibility);
  for (const s of screenEls) observer.observe(s, { attributes: true, attributeFilter: ['hidden'] });
  syncVisibility();

  // Открыт новый опыт: Шоқан сам предлагает помощь именно по нему — облачко с названием опыта
  // возвращается, даже если чат уже открывали, и кнопка мягко пульсирует, пока её не нажмут
  let lastExperiment = '';
  let hintTimer = null;
  function experimentOpened() {
    const ctx = getContext() ?? {};
    const title = experimentTitle(ctx);
    const key = ctx.simId ?? ctx.lessonId ?? (ctx.sandbox ? 'sandbox' : '');
    if (isOpen) renderContext();
    if (!title || key === lastExperiment || isOpen) return;
    lastExperiment = key;
    hint.textContent = t('chat.hintExp', { title });
    hint.style.animation = 'none';
    void hint.offsetWidth;
    hint.style.animation = '';
    root.insertBefore(hint, fab);
    fab.classList.add('ready');
    clearTimeout(hintTimer);
    // На телефоне облачко закрывает сцену — показываем его ненадолго; пульс остаётся
    if (window.matchMedia('(max-width: 480px)').matches) hintTimer = setTimeout(() => hint.remove(), 6000);
  }

  return { experimentOpened };
}
