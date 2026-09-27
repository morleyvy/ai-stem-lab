// «Конструктор лабораторных»: учитель описывает работу словами, Шоқан собирает её на одной из
// симуляций (POST /api/lesson-gen), учитель смотрит, пробует и выдаёт классу.
// Работы учителя хранятся в Supabase (миграция 004), в демо-режиме — в этом браузере.
// Перед запуском каждая работа снова проходит validateLesson: содержимое из базы или localStorage
// тоже внешний ввод, а проигрыватель рассчитывает на корректные шаги.

import { SIMS, SUBJECT_BY_ID, parseGrade } from './data/catalog.js';
import { CUSTOM_GRADES, CUSTOM_ID_RE, CUSTOM_SUBJECTS, PREVIEW_ID, PROMPT_MAX, toRunnable } from './customLesson.js';
import * as account from './account.js';
import { lang, locale, t, tr } from './i18n.js';

const LOCAL_KEY = 'ai-stem-lab:custom-lessons';
const LOCAL_MAX = 30;
// Генерация с повторной попыткой на сервере занимает до полуминуты — дольше общего API_TIMEOUT_MS
const GEN_TIMEOUT_MS = 60_000;

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

function button(text, onClick, className = 'ghost') {
  const b = el('button', className, text);
  b.type = 'button';
  b.onclick = onClick;
  return b;
}

function labeled(text, control) {
  const label = el('label', 'cn-field');
  label.append(el('span', 'cn-label', text), control);
  return label;
}

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((r) => r && CUSTOM_ID_RE.test(r.lesson_id)) : [];
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, LOCAL_MAX)));
    return true;
  } catch {
    return false;
  }
}

// Такой же id, как вычисляет база: 'c-' + 12 hex
function localLessonId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `c-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function createConstructor({ show, getUser, openLesson, toast, confirmAction, mascot }) {
  // Работы, которые можно открыть по id: свои (учитель, гость) и назначенные классу (ученик)
  const known = new Map();
  let own = []; // строки «Мои работы»: { id, lesson_id, title, subject, grade, lang, lesson, created_at, local? }
  let ownError = null;
  let draft = null; // { lesson, row } — открытая в превью работа; row — если уже сохранена
  let lastRequest = null;
  let busy = false;
  let classes = [];

  const isTeacher = () => getUser()?.role === 'teacher';
  const isGuest = () => !getUser();

  function remember(rows) {
    for (const row of rows) {
      const lesson = toRunnable(row.lesson_id, row.lesson, { title: row.lesson?.title ?? row.title });
      if (lesson) known.set(row.lesson_id, lesson);
    }
  }

  // ---------- Экран ----------

  const screen = el('section', 'dash constructor');
  screen.id = 'constructor';
  screen.hidden = true;
  screen.setAttribute('aria-labelledby', 'cnTitle');

  const head = el('div', 'cn-head');
  const h1 = el('h1', '', t('cn.title'));
  h1.id = 'cnTitle';
  const headText = el('div');
  headText.append(h1, el('p', 'muted', t('cn.lead')));
  head.append(headText);
  const demoNote = el('p', 'cn-note', t('cn.demoNote'));

  // Форма запроса
  const form = el('form', 'card cn-form');
  const prompt = Object.assign(document.createElement('textarea'), { name: 'prompt', rows: 3, maxLength: PROMPT_MAX, required: true, placeholder: t('cn.promptPlaceholder') });
  const counter = el('span', 'cn-counter muted small', `0 / ${PROMPT_MAX}`);
  prompt.addEventListener('input', () => { counter.textContent = `${prompt.value.length} / ${PROMPT_MAX}`; });
  const subjectSel = document.createElement('select');
  subjectSel.append(new Option(t('cn.anySubject'), ''), ...CUSTOM_SUBJECTS.map((id) => new Option(tr(SUBJECT_BY_ID[id].name), id)));
  const simSel = document.createElement('select');
  const gradeSel = document.createElement('select');
  gradeSel.append(...CUSTOM_GRADES.map((g) => new Option(t('grade.badge', { n: g }), String(g))));
  function fillSims() {
    const current = simSel.value;
    const list = Object.values(SIMS).filter((d) => CUSTOM_SUBJECTS.includes(d.subject) && (!subjectSel.value || d.subject === subjectSel.value));
    simSel.replaceChildren(new Option(t('cn.anySim'), ''), ...list.map((d) => new Option(tr(d.freeTitle ?? d.title), d.id)));
    simSel.value = list.some((d) => d.id === current) ? current : '';
  }
  subjectSel.addEventListener('change', fillSims);
  fillSims();
  const genBtn = el('button', 'primary', t('cn.generate'));
  genBtn.type = 'submit';
  const formError = el('p', 'form-error', '');
  formError.hidden = true;
  formError.setAttribute('role', 'alert');
  const promptBox = labeled(t('cn.promptLabel'), prompt);
  promptBox.append(counter);
  const row = el('div', 'cn-row');
  row.append(labeled(t('cn.subject'), subjectSel), labeled(t('cn.sim'), simSel), labeled(t('cn.grade'), gradeSel));
  const note = el('p', 'muted small cn-scope', t('cn.scope'));
  form.append(promptBox, row, note, genBtn, formError);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    generate({ prompt: prompt.value.trim(), subject: subjectSel.value, simId: simSel.value, grade: Number(gradeSel.value) });
  });

  // Ожидание: генерация идёт ~10 с — показываем, что работа собирается, а не зависла
  const loading = el('div', 'card cn-loading');
  loading.hidden = true;
  loading.setAttribute('role', 'status');
  const loadingText = el('div', 'cn-loading-text');
  loadingText.append(el('b', '', t('cn.loading')), el('span', 'muted small', t('cn.loadingSub')), el('div', 'skeleton-line'), el('div', 'skeleton-line short'), el('div', 'skeleton-line'));
  loading.append(mascot('study', 96), loadingText);

  const preview = el('div', 'card cn-preview');
  preview.hidden = true;
  preview.tabIndex = -1;

  const mine = el('div', 'card cn-mine');
  const mineList = el('div', 'cn-list');
  const mineHead = el('div', 'card-head');
  mineHead.append(el('h2', '', t('cn.mine')));
  mine.append(mineHead, mineList);

  screen.append(head, demoNote, form, loading, preview, mine);
  document.getElementById('teacher').after(screen);

  // Вход в конструктор из кабинета учителя — над вкладками классов, виден и без классов
  const teacherCard = el('div', 'card cn-teacher-card');
  const teacherText = el('div', 'cn-teacher-text');
  const teacherCount = el('span', 'muted small');
  teacherText.append(el('h2', '', t('cn.teacherTitle')), el('p', 'muted small', t('cn.teacherText')), teacherCount);
  teacherCard.append(teacherText, button(t('cn.create'), () => open(), 'primary'));
  document.querySelector('#teacher .teacher-head')?.after(teacherCard);

  // ---------- Генерация ----------

  async function generate(request) {
    if (busy) return;
    if (request.prompt.length < 3) return showError(t('cn.promptShort'));
    lastRequest = request;
    busy = true;
    showError(null);
    genBtn.disabled = true;
    genBtn.textContent = t('cn.loading');
    loading.hidden = false;
    preview.hidden = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GEN_TIMEOUT_MS);
    let res = null;
    let data = {};
    try {
      res = await fetch('/api/lesson-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: request.prompt, subject: request.subject || undefined, simId: request.simId || undefined, grade: request.grade, lang }),
        signal: ctrl.signal,
      });
      data = await res.json().catch(() => ({}));
    } catch {
      res = null;
    } finally {
      clearTimeout(timer);
      busy = false;
      genBtn.disabled = false;
      genBtn.textContent = t('cn.generate');
      loading.hidden = true;
    }
    if (res?.ok && data.lesson) {
      // Сервер уже проверил работу; повторная проверка — та же, что при запуске из хранилища
      const lesson = toRunnable(PREVIEW_ID, data.lesson);
      if (lesson) return openDraft({ lesson: data.lesson, row: null });
    }
    if (res?.status === 400 && typeof data.error === 'string') return showError(data.error);
    if (res?.status === 422) return showError(t('cn.rejected', { reason: typeof data.reason === 'string' ? data.reason : '' }));
    showError(t('cn.unavailable'));
  }

  function showError(msg) {
    formError.hidden = !msg;
    formError.textContent = msg ?? '';
  }

  // ---------- Превью ----------

  function openDraft(next) {
    draft = next;
    renderPreview();
    preview.hidden = false;
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function stepLine(step, def) {
    const li = el('li', `cn-step ${step.type}`);
    const tag = { set: 'cn.stepSet', hypothesis: 'lesson.hypothesis', question: 'lesson.question', conclusion: 'lesson.conclusion' }[step.type];
    li.append(el('span', 'cn-step-tag', t(tag)));
    if (step.type === 'conclusion') {
      const list = el('ul', 'cn-points');
      step.points.forEach((p) => list.append(el('li', '', tr(p))));
      li.append(list);
      return li;
    }
    li.append(el('p', 'cn-step-text', tr(step.text)));
    if (step.type === 'set') {
      const c = def.controls.find((x) => x.id === step.param);
      const value = c.names ? tr(c.names[step.to]) : `${String(step.to).replace('.', ',')} ${tr(c.unit)}`.trim();
      li.append(el('p', 'cn-step-target muted small', t('cn.target', { control: tr(c.label), value })));
      if (step.after) li.append(el('p', 'cn-step-after small', tr(step.after)));
    } else {
      const opts = el('ul', 'cn-options');
      step.options.forEach((o) => {
        const item = el('li', o.ok ? 'ok' : '', tr(o.text));
        // Верный ответ помечен не только цветом — различимо без цветового зрения и скринридером
        if (o.ok) item.prepend(el('span', 'cn-ok', `${t('cn.correct')} `));
        opts.append(item);
      });
      li.append(opts);
      if (step.explain) li.append(el('p', 'cn-step-after small', tr(step.explain)));
    }
    return li;
  }

  function renderPreview() {
    const { lesson, row } = draft;
    const def = SIMS[lesson.sim];
    const subj = SUBJECT_BY_ID[lesson.subject];
    preview.style.setProperty('--c', subj.color);
    const kicker = el('p', 'cn-kicker', [tr(subj.name), t('grade.badge', { n: lesson.grade }), tr(def.freeTitle ?? def.title), t('cn.stepsCount', { n: lesson.steps.length })].join(' · '));
    const title = el('h2', 'cn-preview-title', lesson.title);
    const info = el('dl', 'cn-info');
    for (const [key, value] of [['lesson.goal', lesson.goal], ['lesson.equipment', lesson.equipment], ['lesson.safety', lesson.safety]]) {
      info.append(el('dt', '', t(key)), el('dd', '', tr(value)));
    }
    const steps = el('ol', 'cn-steps');
    lesson.steps.forEach((s) => steps.append(stepLine(s, def)));

    const actions = el('div', 'cn-actions');
    actions.append(button(t('cn.try'), () => tryLesson(lesson), 'primary'));
    actions.append(saveBlock(lesson, row));
    if (lastRequest && !row) actions.append(button(t('cn.again'), () => generate(lastRequest)));
    preview.replaceChildren(kicker, title, info, el('h3', 'cn-subhead', t('cn.procedure')), steps, actions);
  }

  function tryLesson(lesson) {
    const runnable = toRunnable(PREVIEW_ID, lesson, { preview: true });
    if (!runnable) return toast(t('cn.broken'));
    // Проба учителя — не результат ученика: в журнал и прогресс она не пишется
    openLesson(runnable, { onExit: () => open() });
  }

  // Сохранение: учителю — в базу и сразу задание классу; гостю — в этом браузере
  function saveBlock(lesson, row) {
    const box = el('div', 'cn-save');
    if (isGuest()) {
      if (row) {
        box.append(el('p', 'muted small', t('cn.savedLocal')));
      } else {
        box.append(button(t('cn.saveLocal'), () => {
          const saved = { id: `local-${Date.now()}`, lesson_id: localLessonId(), title: lesson.title, subject: lesson.subject, grade: lesson.grade, lang: lesson.lang, lesson, created_at: new Date().toISOString(), local: true };
          if (!writeLocal([saved, ...readLocal()])) return toast(t('cn.noStorage'));
          toast(t('cn.savedLocalToast'));
          refreshOwn().then(() => openDraft({ lesson, row: saved }));
        }));
      }
      return box;
    }
    if (!isTeacher()) return box;
    const classSel = document.createElement('select');
    classSel.append(...classes.map((k) => new Option(k.name, k.id)));
    const due = Object.assign(document.createElement('input'), { type: 'date', min: new Date().toISOString().slice(0, 10) });
    const go = button(row ? t('cn.assign') : t('cn.saveAssign'), async () => {
      go.disabled = true;
      try {
        let saved = row;
        if (!saved) {
          const r = await account.saveCustomLesson(lesson);
          if (!r.ok) return showSaveError(r.error);
          saved = r.value;
          await refreshOwn();
        }
        if (classSel.value) {
          const a = await account.assignLesson(classSel.value, saved.lesson_id, due.value);
          if (!a.ok) return showSaveError(a.error);
          toast(t('cn.assigned', { name: classSel.selectedOptions[0]?.textContent ?? '' }));
        } else {
          toast(t('cn.saved'));
        }
        openDraft({ lesson, row: saved });
      } finally {
        go.disabled = false;
      }
    }, 'primary');
    const err = el('p', 'form-error', '');
    err.hidden = true;
    err.setAttribute('role', 'alert');
    const showSaveError = (msg) => {
      err.hidden = false;
      err.textContent = msg;
    };
    if (classes.length) {
      box.append(labeled(t('cn.class'), classSel), labeled(t('teacher.dueLabel'), due), go);
    } else {
      box.append(el('p', 'muted small', t('cn.noClasses')));
      if (!row) box.append(go);
    }
    box.append(err);
    return box;
  }

  // ---------- Мои работы ----------

  async function refreshOwn() {
    ownError = null;
    if (isGuest()) {
      own = readLocal();
    } else if (isTeacher()) {
      const r = await account.loadCustomLessons();
      if (r.ok) own = r.value;
      else {
        own = [];
        ownError = r.error;
      }
    } else {
      own = [];
    }
    remember(own);
    renderMine();
  }

  function renderMine() {
    mine.hidden = !isGuest() && !isTeacher();
    teacherCount.textContent = own.length ? t('cn.count', { n: own.length }) : '';
    if (ownError) {
      mineList.replaceChildren(el('p', 'form-error', ownError));
      return;
    }
    if (!own.length) {
      mineList.replaceChildren(el('p', 'muted small', t('cn.mineEmpty')));
      return;
    }
    mineList.replaceChildren(...own.map((r) => {
      const item = el('div', 'cn-item');
      const subj = SUBJECT_BY_ID[r.subject] ?? SUBJECT_BY_ID.physics;
      item.style.setProperty('--c', subj.color);
      const text = el('div', 'cn-item-text');
      const date = new Date(r.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      text.append(el('b', '', r.title), el('span', 'muted small', [tr(subj.name), t('grade.badge', { n: r.grade }), r.lang === 'kk' ? 'ҚАЗ' : 'РУС', date].join(' · ')));
      const acts = el('div', 'cn-item-actions');
      acts.append(
        button(t('cn.open'), () => {
          const lesson = known.get(r.lesson_id);
          if (!lesson) return toast(t('cn.broken'));
          openDraft({ lesson: r.lesson, row: r });
        }),
        button(t('cn.delete'), () => confirmAction(t('cn.deleteConfirm', { title: r.title }), t('confirm.delete'), async () => {
          if (r.local) {
            writeLocal(readLocal().filter((x) => x.lesson_id !== r.lesson_id));
          } else {
            const res = await account.deleteCustomLesson(r);
            if (!res.ok) return toast(res.error);
          }
          known.delete(r.lesson_id);
          if (draft?.row?.lesson_id === r.lesson_id) {
            draft = null;
            preview.hidden = true;
          }
          await refreshOwn();
        }), 'ghost danger'),
      );
      item.append(el('span', 'subject-dot'), text, acts);
      return item;
    }));
  }

  async function open() {
    const user = getUser();
    demoNote.hidden = !isGuest();
    // Класс по умолчанию — из названия класса учителя («8Б» → 8), иначе 8
    if (isTeacher()) {
      const r = await account.loadTeacherClasses(user.id);
      classes = r.ok ? r.value : [];
    } else {
      classes = [];
    }
    const g = parseGrade(classes[0]?.name) ?? parseGrade(user?.grade) ?? 8;
    if (!lastRequest) gradeSel.value = String(g);
    show('constructor', t('cn.title'));
    await refreshOwn();
    if (draft) renderPreview();
  }

  // ---------- Для дашборда, заданий и журнала ----------

  // Ученик: работы учителя, назначенные классу. Без миграции 004 таблицы нет — ученику об этом
  // знать незачем: задание просто не откроется, а учитель увидит понятную ошибку у себя.
  async function loadAssigned(assignments) {
    const ids = [...new Set(assignments.map((a) => a.lesson_id).filter((id) => CUSTOM_ID_RE.test(id)))].filter((id) => !known.has(id));
    if (!ids.length) return;
    const r = await account.loadCustomLessons(ids);
    if (r.ok) remember(r.value);
  }

  return {
    open,
    loadAssigned,
    // Свои работы: учителю — для списка заданий, гостю — для дашборда
    loadOwn: refreshOwn,
    byId: (id) => known.get(id) ?? null,
    ownRows: () => own,
    // Работы для раздела «От учителя» на дашборде: ученику — назначенные, гостю — сохранённые в браузере
    forSubject(subjectId, assignedIds) {
      const list = isGuest() ? own.map((r) => known.get(r.lesson_id)) : assignedIds.map((id) => known.get(id));
      return list.filter((l) => l && l.subject === subjectId);
    },
    reset() {
      known.clear();
      own = [];
      draft = null;
      lastRequest = null;
      preview.hidden = true;
    },
  };
}
