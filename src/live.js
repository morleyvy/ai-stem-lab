// «Живой урок»: учитель в реальном времени видит, кто из класса на каком шаге работы,
// и отправляет подсказки. Логика статусов и проверки сообщений — в src/liveCore.js,
// здесь — каналы Supabase Realtime и экраны.
//
// Канал `live:<class_id>` приватный: кто может в него войти и что отправлять, решают политики
// из supabase/005_live_lessons.sql. Без миграции или без Realtime учитель видит подсказку,
// что нужно настроить, а у учеников просто нет баннера — остальной сайт работает как раньше.

import { ALL_LESSONS, SUBJECT_BY_ID } from './data/catalog.js';
import { t, tr } from './i18n.js';
import {
  HINT_MAX, LIVE_MAX_AGE_MS, cleanHintText, computeStatus, createTracker,
  summarize, topicFor, validateHint, validatePresence,
} from './liveCore.js';

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

function button(text, onClick, className = 'ghost small') {
  const b = el('button', className, text);
  b.type = 'button';
  b.onclick = onClick;
  return b;
}

// Ученики проверяют, не начался ли урок, раз в 30 секунд, пока открыто их меню:
// сообщение «урок начат» до них не дойдёт — в канал класса ученик входит только во время урока.
const POLL_MS = 30_000;
// Состояние ученика отправляем не чаще раза в секунду: иначе быстрые клики забьют канал
const TRACK_MS = 1000;
// Панель учителя перерисовывается раз в секунду: время на шаге у учеников идёт и без событий
const BOARD_TICK_MS = 1000;

const findLesson = (id) => ALL_LESSONS.find((l) => l.id === id) ?? null;

// Своя работа ('c-…') может быть не в каталоге этого браузера — тогда показываем её id
export function lessonLabel(id) {
  const l = findLesson(id);
  if (!l) return id;
  const subj = SUBJECT_BY_ID[l.subject];
  return `${subj.short}${l.number}. ${tr(l.short ?? l.title)}`;
}

// Таблицы нет — миграция 005 не выполнена; тогда вместо ошибки показываем, что сделать
const isMissingSetup = (error) => /live_sessions|schema cache|does not exist|permission denied/i.test(error?.message ?? '');

function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createLive({ client, getUser, toast, openLessonById, coach, signIn }) {
  // ---------- Учитель ----------
  let screen = null; // разметка панели учителя, создаётся при первом открытии
  let board = null; // { klass, lessonId, lesson, channel, entries, cards, timer, teacherId }
  let opener = null;

  // ---------- Ученик ----------
  let student = null; // { session, channel, tracker, trackTimer }
  let pollTimer = null;
  let bannerHost = null;

  // ================= Кабинет учителя: карточка «Живой урок» =================

  async function renderTeacherCard(panel, klass, students, assignments) {
    let card = panel.querySelector('.lv-card');
    if (!card) {
      card = el('div', 'card lv-card');
      const summary = panel.querySelector('.class-summary');
      if (summary) summary.after(card);
      else panel.prepend(card);
    }
    const select = el('select', 'lv-select');
    select.setAttribute('aria-label', t('live.pickLabel'));
    const assigned = assignments.map((a) => a.lesson_id);
    if (assigned.length) {
      const g = el('optgroup');
      g.label = t('live.groupAssigned');
      for (const id of assigned) g.append(new Option(lessonLabel(id), id));
      select.append(g);
    }
    for (const subj of Object.values(SUBJECT_BY_ID)) {
      const list = ALL_LESSONS.filter((l) => l.subject === subj.id && !assigned.includes(l.id));
      if (!list.length) continue;
      const g = el('optgroup');
      g.label = tr(subj.name);
      for (const l of list) g.append(new Option(lessonLabel(l.id), l.id));
      select.append(g);
    }
    const note = el('p', 'muted small lv-card-note', t('live.cardSub'));
    const start = button(t('live.start'), () => startReal(klass, students, select.value, start, note), 'primary');
    const row = el('div', 'lv-card-row');
    row.append(select, start);
    card.replaceChildren(el('h2', '', t('live.title')), note, row);

    // Урок уже идёт (учитель перезагрузил страницу) — предлагаем вернуться к панели
    const found = await loadSession(klass.id);
    if (found.error && isMissingSetup(found.error)) {
      note.textContent = t('live.setup');
      note.className = 'small lv-card-note lv-warn';
    } else if (found.session) {
      select.value = found.session.lesson_id;
      start.textContent = t('live.resume');
      note.textContent = t('live.running', { work: lessonLabel(found.session.lesson_id) });
    }
  }

  async function loadSession(classId) {
    if (!client) return { session: null, error: null };
    const { data, error } = await client.from('live_sessions').select('class_id, lesson_id, started_at, started_by').eq('class_id', classId).maybeSingle();
    if (error) return { session: null, error };
    const fresh = data && Date.now() - new Date(data.started_at).getTime() < LIVE_MAX_AGE_MS;
    return { session: fresh ? data : null, error: null };
  }

  async function startReal(klass, students, lessonId, btn, note) {
    const user = getUser();
    if (!client || !user || !lessonId) return;
    btn.disabled = true;
    try {
      const found = await loadSession(klass.id);
      if (found.error) throw found.error;
      // Тот же урок уже идёт — подключаемся к нему, не сбрасывая время начала
      if (found.session?.lesson_id !== lessonId) {
        // Новый урок — через удаление и вставку: время начала и автора ставит база (миграция 005)
        const del = await client.from('live_sessions').delete().eq('class_id', klass.id);
        if (del.error) throw del.error;
        const ins = await client.from('live_sessions').insert({ class_id: klass.id, lesson_id: lessonId });
        if (ins.error) throw ins.error;
      }
    } catch (error) {
      note.textContent = isMissingSetup(error) ? t('live.setup') : t('live.startFail');
      note.className = 'small lv-card-note lv-warn';
      if (!isMissingSetup(error)) console.error('[live]', error);
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    openBoard({ klass, lessonId, students: students.map((s) => ({ uid: s.id, name: s.full_name })), teacherId: user.id });
    connectTeacher();
  }

  function connectTeacher() {
    const b = board;
    const channel = client.channel(topicFor(b.klass.id), { config: { private: true, presence: { key: b.teacherId, enabled: true } } });
    b.channel = channel;
    channel.on('presence', { event: 'sync' }, () => {
      if (board !== b) return;
      applyPresence(channel.presenceState());
      renderBoard();
    });
    client.realtime.setAuth().then(() => channel.subscribe((status) => {
      if (board !== b) return;
      if (status === 'SUBSCRIBED') {
        setBoardError(null);
        channel.send({ type: 'broadcast', event: 'start', payload: { from: b.teacherId, lesson: b.lessonId } });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Чаще всего — не выполнена миграция 005 или в проекте выключен Realtime
        setBoardError(t('live.setup'));
      }
    }));
  }

  // Состояние из Presence сверяем со списком класса из базы: чужие ключи и имена не показываем
  function applyPresence(state) {
    const now = Date.now();
    for (const e of board.entries) {
      const metas = state[e.uid];
      const valid = metas?.length ? validatePresence(metas.at(-1)) : null;
      if (valid && valid.lesson === board.lessonId) {
        if (!e.state || e.state.i !== valid.i) e.seenAt = now;
        e.state = valid;
        e.left = false;
      } else if (!metas?.length && e.state) {
        e.left = true;
      }
    }
  }

  // ================= Панель учителя =================

  function openBoard({ klass, lessonId, students, teacherId }) {
    closeBoard();
    opener = document.activeElement;
    board = {
      klass,
      lessonId,
      lesson: findLesson(lessonId),
      teacherId,
      channel: null,
      entries: students.map((s) => ({ ...s, state: null, seenAt: null, left: false })),
      cards: new Map(),
      target: undefined,
      confirmEnd: null,
    };
    buildScreen();
    board.timer = setInterval(renderBoard, BOARD_TICK_MS);
    renderBoard();
    screen.hidden = false;
    document.body.classList.add('lv-open');
    screen.querySelector('h1').focus({ preventScroll: true });
  }

  function closeBoard() {
    if (!board) return;
    clearInterval(board.timer);
    if (board.channel) client.removeChannel(board.channel);
    board = null;
    if (screen) screen.hidden = true;
    document.body.classList.remove('lv-open');
    opener?.focus?.();
    opener = null;
  }

  function buildScreen() {
    if (!screen) {
      screen = el('section', 'lv-screen');
      screen.setAttribute('aria-labelledby', 'lvTitle');
      document.body.append(screen);
    }
    const b = board;
    const title = el('h1', '', t('live.title'));
    title.id = 'lvTitle';
    title.tabIndex = -1;
    const titleRow = el('div', 'lv-title-row');
    titleRow.append(el('span', 'lv-dot'), title);
    const head = el('div', 'lv-head');
    const info = el('div', 'lv-head-info');
    info.append(titleRow, el('p', 'muted', `${b.klass.name} · ${lessonLabel(b.lessonId)}`));
    const endBtn = button(t('live.end'), () => endLesson(endBtn), 'primary danger-bg');
    const actions = el('div', 'lv-head-actions');
    actions.append(button(t('live.hintAll'), () => openComposer(null)), button(t('live.minimize'), closeBoard), endBtn);
    head.append(info, actions);

    const error = el('p', 'lv-error', '');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    const summary = el('div', 'lv-summary');
    const composer = buildComposer();
    const grid = el('div', 'lv-grid');
    grid.setAttribute('aria-label', t('live.gridLabel'));
    const inner = el('div', 'lv-inner');
    inner.append(head, error, summary, composer, grid);
    screen.replaceChildren(inner);
    Object.assign(b, { ui: { error, summary, composer, grid } });
  }

  function setBoardError(msg) {
    if (!board) return;
    board.ui.error.hidden = !msg;
    board.ui.error.textContent = msg ?? '';
  }

  function statusOf(e, now) {
    return computeStatus(e.state, { seenAt: e.seenAt, now, left: e.left });
  }

  function renderBoard() {
    if (!board) return;
    const now = Date.now();
    const list = board.entries.map((e) => ({ ...e, status: statusOf(e, now) }));
    const sum = summarize(list, board.lesson);
    const stat = (value, label, extra = '') => {
      const d = el('div', `lv-stat ${extra}`);
      d.append(el('b', '', value), el('span', '', label));
      return d;
    };
    const stuck = list.filter((s) => s.status === 'stuck').length;
    const common = el('div', 'lv-stat lv-common');
    common.append(el('span', '', t('live.commonTitle')));
    if (sum.common && board.lesson) {
      const opt = board.lesson.steps[sum.common.i]?.options?.[sum.common.opt];
      common.append(
        el('b', 'lv-common-text', opt ? `«${tr(opt.text)}»` : '—'),
        el('span', 'muted small', t('live.commonMeta', { n: sum.common.n, count: sum.common.count })),
      );
    } else {
      common.append(el('b', 'lv-common-text', t('live.commonNone')));
    }
    board.ui.summary.replaceChildren(
      stat(`${sum.joined}/${sum.total}`, t('live.statJoined')),
      stat(String(sum.finished), t('live.statDone')),
      stat(`${sum.avg}%`, t('live.statAvg')),
      stat(String(stuck), t('live.statStuck'), stuck ? 'lv-stat-warn' : ''),
      common,
    );
    // Карточки обновляем на месте, а не пересоздаём: фокус клавиатуры на кнопке не теряется
    for (const s of list) {
      let c = board.cards.get(s.uid);
      if (!c) {
        c = buildCard(s);
        board.cards.set(s.uid, c);
        board.ui.grid.append(c.root);
      }
      updateCard(c, s, now);
    }
  }

  function buildCard(s) {
    const root = el('article', 'lv-student');
    const name = el('div', 'lv-name', s.name);
    const chip = el('span', 'lv-chip');
    const top = el('div', 'lv-student-top');
    top.append(name, chip);
    const step = el('div', 'lv-step small');
    const bar = el('div', 'progress lv-bar');
    const fill = el('div', 'progress-bar');
    bar.append(fill);
    const answer = el('div', 'lv-answer small');
    const time = el('div', 'lv-time small muted');
    const hint = button(t('live.hintOne'), () => openComposer(s.uid));
    hint.setAttribute('aria-label', t('live.hintFor', { name: s.name }));
    const foot = el('div', 'lv-student-foot');
    foot.append(time, hint);
    root.append(top, step, bar, answer, foot);
    return { root, chip, step, fill, answer, time, hint };
  }

  function updateCard(c, s, now) {
    c.root.dataset.status = s.status;
    c.chip.textContent = t(`live.st.${s.status}`);
    const st = s.state;
    c.step.textContent = st ? t('lesson.stepOf', { n: st.n, m: st.m }) : t('live.noStep');
    c.fill.style.width = st ? `${Math.round((st.st === 'done' ? 1 : st.n / st.m) * 100)}%` : '0%';
    c.answer.textContent = !st || st.ok === null ? t('live.noAnswer') : t(st.ok ? 'live.answerOk' : 'live.answerBad');
    c.answer.className = `lv-answer small ${st?.ok === true ? 'ok' : st?.ok === false ? 'no' : 'muted'}`;
    c.time.textContent = !st ? '' : st.st === 'done' ? t('live.doneTime') : t('live.onStep', { time: mmss(now - (s.seenAt ?? now)) });
    c.hint.disabled = !st || st.st === 'done' || s.status === 'left';
  }

  // ---------- Подсказка ----------

  function buildComposer() {
    const form = el('form', 'lv-composer card');
    form.hidden = true;
    const label = el('label', 'lv-composer-label');
    label.htmlFor = 'lvHintText';
    const text = el('textarea', 'lv-textarea');
    Object.assign(text, { id: 'lvHintText', maxLength: HINT_MAX, rows: 2, placeholder: t('live.hintPlaceholder') });
    const count = el('span', 'muted small lv-count', `0/${HINT_MAX}`);
    text.oninput = () => { count.textContent = `${text.value.length}/${HINT_MAX}`; };
    const actions = el('div', 'lv-composer-actions');
    const send = el('button', 'primary small', t('live.send'));
    send.type = 'submit';
    actions.append(send, button(t('live.nudge'), () => sendHint({ kind: 'nudge' })), button(t('live.cancel'), () => { form.hidden = true; }), count);
    form.append(label, text, actions);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const clean = cleanHintText(text.value);
      if (!clean) return text.focus();
      sendHint({ kind: 'text', text: clean });
    };
    form.onkeydown = (ev) => {
      if (ev.key === 'Escape') form.hidden = true;
    };
    return form;
  }

  function openComposer(uid) {
    const form = board.ui.composer;
    board.target = uid;
    const who = uid ? board.entries.find((e) => e.uid === uid)?.name : null;
    form.querySelector('label').textContent = who ? t('live.hintTo', { name: who }) : t('live.hintToAll');
    const text = form.querySelector('textarea');
    text.value = '';
    text.oninput();
    form.hidden = false;
    text.focus();
  }

  function sendHint({ kind, text = '' }) {
    const b = board;
    const to = b.target ?? null;
    if (!b.channel) return;
    b.channel.send({ type: 'broadcast', event: 'hint', payload: { from: b.teacherId, to, kind, text } });
    b.ui.composer.hidden = true;
    const who = to ? b.entries.find((e) => e.uid === to)?.name : null;
    toast(who ? t('live.sentTo', { name: who }) : t('live.sentAll'));
  }

  // ---------- Завершение ----------

  async function endLesson(btn) {
    const b = board;
    // Второе нажатие подтверждает: случайный клик не должен обрывать урок у всего класса
    if (!b.confirmEnd) {
      btn.textContent = t('live.endConfirm');
      b.confirmEnd = setTimeout(() => {
        b.confirmEnd = null;
        btn.textContent = t('live.end');
      }, 4000);
      return;
    }
    clearTimeout(b.confirmEnd);
    b.channel?.send({ type: 'broadcast', event: 'stop', payload: { from: b.teacherId } });
    const { error } = await client.from('live_sessions').delete().eq('class_id', b.klass.id);
    if (error) {
      setBoardError(t('live.endFail'));
      console.error('[live]', error);
      return;
    }
    closeBoard();
    toast(t('live.ended'));
    // Кнопка «Начать» в кабинете снова должна предлагать новый урок, а не «Вернуться»
    const card = document.querySelector('.lv-card');
    if (card) {
      card.querySelector('.lv-card-note').textContent = t('live.cardSub');
      card.querySelector('button.primary').textContent = t('live.start');
    }
  }

  // ================= Ученик =================

  // Вызывается при каждой отрисовке меню: баннер идущего урока у ученика
  async function renderMenu(anchor) {
    const user = getUser();
    if (!bannerHost) {
      bannerHost = el('div', 'lv-banner-host');
      bannerHost.setAttribute('aria-live', 'polite');
    }
    anchor.before(bannerHost);
    clearInterval(pollTimer);
    pollTimer = null;
    if (!user) {
      leaveStudent();
      bannerHost.replaceChildren();
      return;
    }
    if (user.role !== 'student' || !user.class || !client) {
      bannerHost.replaceChildren();
      return;
    }
    await checkSession(user);
    pollTimer = setInterval(() => {
      // Проверяем, только пока ученик смотрит меню: в работе он уже присоединился или занят
      if (document.hidden || document.getElementById('menu')?.hidden) return;
      checkSession(getUser());
    }, POLL_MS);
  }

  async function checkSession(user) {
    if (!user?.class) return;
    const { session, error } = await loadSession(user.class.id);
    // Миграция не выполнена — у ученика просто нет живых уроков, сообщать ему нечего
    if (error) {
      bannerHost.replaceChildren();
      return;
    }
    if (!session) {
      leaveStudent();
      bannerHost.replaceChildren();
      return;
    }
    if (student && student.session.lesson_id !== session.lesson_id) leaveStudent();
    showStudentBanner(session);
  }

  // Карточка «Живой урок» в профиле: гостю — как начать или подключиться, ученику — кнопка
  // подключения. У учителя своя карточка в кабинете (renderTeacherCard).
  function renderAccount(anchor) {
    anchor.parentElement.querySelector('.lv-account-card')?.remove();
    const user = getUser();
    if (user?.role === 'teacher') return;
    anchor.after(accountCard(user));
  }

  function accountCard(user) {
    const box = el('div', 'lv-banner lv-account-card');
    const text = el('div', 'lv-banner-text');
    text.append(el('div', 'lv-banner-title', t('live.title')), el('div', 'lv-banner-sub', t(user ? 'live.studentSub' : 'live.guestSub')));
    const actions = el('div', 'lv-banner-actions');
    const join = button(t('live.joinLesson'), () => joinFromAccount(join), user ? 'primary' : 'ghost');
    // Гостю начать урок нельзя — нужен вход учителя; кнопка ведёт ко входу и говорит зачем
    if (!user) actions.append(button(t('live.start'), () => askSignIn('live.needTeacher'), 'primary'));
    actions.append(join);
    box.append(text, actions);
    return box;
  }

  function askSignIn(key) {
    toast(t(key));
    signIn();
  }

  async function joinFromAccount(btn) {
    const user = getUser();
    if (!user) return askSignIn('live.needStudent');
    if (!user.class) return toast(t('live.noClass'));
    btn.disabled = true;
    const { session } = await loadSession(user.class.id);
    btn.disabled = false;
    if (session) joinStudent(session);
    else toast(t('live.noSession'));
  }

  function showStudentBanner(session) {
    const joined = student?.session.lesson_id === session.lesson_id;
    const box = el('div', 'lv-banner');
    const text = el('div', 'lv-banner-text');
    const title = el('div', 'lv-banner-title');
    title.append(el('span', 'lv-dot'), document.createTextNode(` ${t('live.bannerTitle')}`));
    text.append(title, el('div', 'lv-banner-sub', lessonLabel(session.lesson_id)));
    const join = button(t(joined ? 'live.backToWork' : 'live.join'), () => joinStudent(session), 'primary');
    box.append(text, join);
    bannerHost.replaceChildren(box);
  }

  async function joinStudent(session) {
    if (!student || student.session.lesson_id !== session.lesson_id) {
      leaveStudent();
      student = { session, channel: null, tracker: null, trackTimer: null };
      connectStudent();
    }
    if (!openLessonById(session.lesson_id)) toast(t('live.noLesson'));
  }

  function connectStudent() {
    const user = getUser();
    const s = student;
    // Состояние одноклассников ученику не нужно: presence только отправляем, не получаем
    const channel = client.channel(topicFor(user.class.id), { config: { private: true, presence: { key: user.id, enabled: false } } });
    s.channel = channel;
    channel.on('broadcast', { event: 'hint' }, ({ payload }) => {
      // Автора сверяем с учителем, начавшим урок (started_by из базы), а не с тем, что написано в сообщении
      const hint = validateHint(payload, { teacherId: s.session.started_by, selfId: user.id });
      if (hint && student === s) receiveHint(hint);
    });
    channel.on('broadcast', { event: 'stop' }, ({ payload }) => {
      if (payload?.from !== s.session.started_by || student !== s) return;
      leaveStudent();
      bannerHost?.replaceChildren();
      toast(t('live.stopped'));
    });
    client.realtime.setAuth().then(() => channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && s.tracker) channel.track(s.tracker.state);
    }));
  }

  function leaveStudent() {
    if (!student) return;
    clearTimeout(student.trackTimer);
    if (student.channel) client.removeChannel(student.channel);
    student = null;
    document.querySelector('.lv-hint')?.remove();
  }

  // Ход работы из src/lesson.js — публикуем, только если это работа идущего урока
  function progress(lesson, event) {
    const s = student;
    if (!s || lesson.id !== s.session.lesson_id) return;
    // Работу начали заново — и состояние заново
    if (event.type === 'step' && event.index === 0) s.tracker = createTracker(lesson);
    if (!s.tracker) return;
    s.tracker.apply(event);
    s.lastStep = lesson.steps[s.tracker.state.i];
    if (s.trackTimer) return;
    s.trackTimer = setTimeout(() => {
      s.trackTimer = null;
      if (s.tracker) s.channel?.track(s.tracker.state);
    }, TRACK_MS);
  }

  // Ученик ушёл из работы — учитель увидит «вышел», последний шаг у него останется
  function lessonClosed() {
    document.querySelector('.lv-hint')?.remove();
    const s = student;
    if (!s?.tracker) return;
    clearTimeout(s.trackTimer);
    s.trackTimer = null;
    s.tracker = null;
    s.channel?.untrack();
  }

  // Подсказка Шоқана зависит от того, что ученик делает сейчас: отвечает или выполняет действие
  function nudgeText() {
    const type = student?.lastStep?.type;
    if (type === 'question' || type === 'hypothesis') return t('live.nudgeThink');
    if (type === 'conclusion') return t('live.nudgeConclude');
    return t('live.nudgeDo');
  }

  function receiveHint(hint) {
    const text = hint.kind === 'nudge' ? nudgeText() : cleanHintText(hint.text);
    const card = el('div', 'lv-hint');
    card.setAttribute('role', 'status');
    const body = el('p', 'lv-hint-text');
    body.append(el('b', '', hint.kind === 'nudge' ? t('live.fromShoqan') : t('live.fromTeacher')), document.createTextNode(` ${text}`));
    const close = button('×', () => card.remove(), 'ghost lv-hint-close');
    close.setAttribute('aria-label', t('live.hintClose'));
    card.append(body, close);
    document.querySelector('.lv-hint')?.remove();
    coach.before(card);
    // Ученик сейчас не в работе — карточку у шага он не увидит, поэтому ещё и всплывающее сообщение
    if (coach.closest('[hidden]')) toast(`${t('live.fromTeacher')} ${text}`);
  }

  window.addEventListener('pagehide', () => {
    if (student?.channel) client.removeChannel(student.channel);
    if (board?.channel) client.removeChannel(board.channel);
  });

  return { renderTeacherCard, renderMenu, renderAccount, progress, lessonClosed, receiveHint };
}
