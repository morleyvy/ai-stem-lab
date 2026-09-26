import { SUBSTANCES } from './data/substances.js';
import { SHELF, SHELF_BY_ID } from './data/shelf.js';
import { ALL_LESSONS, SIMS, SUBJECTS, SUBJECT_BY_ID, TOPICS } from './data/catalog.js';
import { createChemLab } from './svg/chemLab.js';
import { createBench } from './bench.js';
import { loadCompleted, startLesson } from './lesson.js';
import { createSandbox } from './sandbox.js';
import { createSimStage } from './simStage.js';
import { preview } from './previews.js';
import { runExperiment } from './engine.js';
import { lineIcon } from './lineIcons.js';
import * as account from './account.js';
import { ON_TIME_XP, REPEAT_XP, assignmentStatus, attemptXp, computeProgress, titleOf } from './progress.js';

const API_TIMEOUT_MS = 20_000;
const SUBJECT_KEY = 'ai-stem-lab:subject';
const SCREENS = ['auth', 'menu', 'teacher', 'workspace'];
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

let screen = 'auth';
// Что открыто на рабочем месте: 'lesson' (химия), 'sim-lesson', 'sandbox' (химия), 'sim-free'
let mode = null;
let lesson = null;
let user = null; // профиль из Supabase; null — демо-режим без аккаунта
let subject = loadSubject(); // предмет, выбранный в навигации шапки

// Химическая лаборатория — SVG-иллюстрация: чёткая на любом экране и не требует WebGL.
const lab = createChemLab($('lab'), { onPick: handlePick, onHover: showHover });
const bench = createBench(lab);

// Проба газа лучинкой в свободной лаборатории: кнопка — запасной путь к перетаскиванию лучинки на сцене.
// В лабораторной работе ту же кнопку показывает карточка шага.
const SPLINT_TEXT = {
  pop: () => 'Хлопок! Газ сгорает — это водород: 2H₂ + O₂ → 2H₂O.',
  out: (gas) => `Лучинка погасла: ${gas} не поддерживает горение.`,
  burn: () => 'Лучинка горит спокойно: в сосуде воздух, газ не выделяется.',
};
const splintBtn = el('button', 'ghost', 'Поднести лучинку');
splintBtn.type = 'button';
splintBtn.hidden = true;
$('washBtn').after(splintBtn);
splintBtn.addEventListener('click', () => {
  if (bench.isBusy()) return toast('Дождитесь окончания текущего действия.');
  lab.splint();
});
lab.onSplint(({ gas, outcome }) => {
  if (mode === 'sandbox') toast(SPLINT_TEXT[outcome](gas));
});
const sandbox = createSandbox({ bench, lab, $, toast, postJson, explain });
const simStage = createSimStage({
  canvasBox: $('simCanvas'),
  controlsBox: $('simControls'),
  readoutBox: $('simReadout'),
  chartBox: $('simChart'),
  clearChartBtn: $('clearChartBtn'),
});

// ---------- Навигация ----------

function show(next, crumb = '') {
  screen = next;
  for (const id of SCREENS) $(id).hidden = id !== next;
  $('workTitle').textContent = crumb;
  $('userBox').hidden = next === 'auth';
  // Режим фокуса: во время опыта убираем навигацию и декоративный фон
  document.body.classList.toggle('focus', next === 'workspace');
  $('topNav').hidden = next === 'auth' || next === 'workspace';
  renderTopNav();
  window.scrollTo(0, 0);
}

function showWorkspace(nextMode, crumb) {
  mode = nextMode;
  // Регуляторы и подсветка стенда — в цвете предмета
  const color = SUBJECT_BY_ID[currentSubject ?? 'chemistry'].color;
  $('simCard').style.setProperty('--c', color);
  const isSim = mode === 'sim-lesson' || mode === 'sim-free';
  const isLesson = mode === 'lesson' || mode === 'sim-lesson';
  $('labCard').hidden = isSim;
  $('reagentBar').hidden = isSim;
  $('simCard').hidden = !isSim;
  $('lessonSide').hidden = !isLesson;
  $('sandboxSide').hidden = mode !== 'sandbox';
  $('simSide').hidden = mode !== 'sim-free';
  const drawers = {
    journalCard: isLesson,
    infoDrawer: isLesson,
    chartDrawer: isSim,
    simAiDrawer: isSim,
    sandboxAiDrawer: mode === 'sandbox',
  };
  for (const [id, on] of Object.entries(drawers)) {
    $(id).hidden = !on;
    $(id).open = false;
  }
  // В лабораторной работе стакан моется по ходу работы, а не вручную.
  $('washBtn').hidden = mode !== 'sandbox';
  splintBtn.hidden = mode !== 'sandbox';
  show('workspace', crumb);
}

async function resetBench() {
  lesson?.stop();
  lesson = null;
  mode = null;
  sandbox.leave();
  simStage.unmount();
  simCtrl = null;
  if (bench.state.contents.length) await bench.wash();
  setTemperature(20);
}

async function openLesson(index) {
  await resetBench();
  const data = ALL_LESSONS[index];
  currentSubject = data.subject;
  const crumb = `${SUBJECT_BY_ID[data.subject].name} · Лабораторная работа № ${data.number}. ${data.title}`;
  let sim = null;
  if (data.sim) {
    // Сначала показываем стенд: симуляции нужен видимый контейнер, чтобы узнать свой размер.
    showWorkspace('sim-lesson', crumb);
    sim = simStage.mount(SIMS[data.sim], data.initial);
    showSimHint(SIMS[data.sim]);
    simCtrl = sim;
  } else {
    showWorkspace('lesson', crumb);
    renderReagentBar(data.shelf);
  }
  lesson = startLesson(data, {
    bench,
    lab,
    sim,
    coach: $('coach'),
    info: $('info'),
    journal: $('journal'),
    toast,
    setTemperature,
    pick: handlePick,
    explain: data.sim ? () => askSim(data.sim, sim.params, '') : explain,
    onComplete: saveResult,
    onExit: openMenu,
    onNext: nextInSubject(index),
  });
}

function nextInSubject(index) {
  const current = ALL_LESSONS[index];
  const next = ALL_LESSONS.findIndex((l, i) => i > index && l.subject === current.subject);
  return next >= 0 ? () => openLesson(next) : null;
}

async function openSandbox() {
  await resetBench();
  currentSubject = 'chemistry';
  showWorkspace('sandbox', 'Химия · Свободный эксперимент');
  sandbox.enter();
  renderReagentBar(SHELF.map((s) => s.id));
}

async function openSimFree(simId, { focusAsk = false } = {}) {
  await resetBench();
  const def = SIMS[simId];
  currentSubject = def.subject;
  showWorkspace('sim-free', `${SUBJECT_BY_ID[def.subject].name} · Свободный эксперимент: ${def.title}`);
  $('simTheory').textContent = def.theory;
  $('simFormula').textContent = def.formula;
  simCtrl = simStage.mount(def);
  showSimHint(def);
  $('simAnswer').hidden = true;
  $('simQuestion').value = '';
  if (focusAsk) $('simQuestion').focus();
}

async function openMenu() {
  await resetBench();
  show('menu');
  await renderMenu();
}

// ---------- Навигация по предметам ----------

function loadSubject() {
  try {
    const saved = localStorage.getItem(SUBJECT_KEY);
    return SUBJECTS.some((s) => s.id === saved) ? saved : SUBJECTS[0].id;
  } catch {
    return SUBJECTS[0].id;
  }
}

// В работе подсвечиваем предмет этой работы, на дашборде — выбранный.
function activeSubject() {
  if (screen !== 'workspace') return subject;
  if (mode === 'sandbox') return 'chemistry';
  return currentSubject ?? subject;
}
let currentSubject = null;
let simCtrl = null; // открытая симуляция (регуляторы и параметры)

function renderTopNav() {
  const active = activeSubject();
  $('topNav').replaceChildren(...SUBJECTS.map((s) => {
    const b = el('button', s.id === active ? 'nav-tab active' : 'nav-tab', s.name);
    b.type = 'button';
    b.style.setProperty('--c', s.color);
    b.style.setProperty('--soft', s.soft);
    b.setAttribute('aria-pressed', String(s.id === active));
    b.onclick = () => selectSubject(s.id);
    return b;
  }));
}

async function selectSubject(id) {
  subject = id;
  try {
    localStorage.setItem(SUBJECT_KEY, id);
  } catch {
    // Выбор просто не запомнится между визитами.
  }
  await openMenu();
}

// ---------- Аккаунт ----------

// Последний посчитанный прогресс — чтобы после работы показать прибавку опыта и новый уровень
let lastProgress = null;
let lastAssignments = [];
const LOCAL_RESULTS_KEY = 'ai-stem-lab:results';

async function saveResult(lessonId, stats) {
  const row = { lesson_id: lessonId, q_ok: stats.qOk, q_total: stats.qTotal, hyp_ok: stats.hypOk, hyp_total: stats.hypTotal, completed_at: new Date().toISOString() };
  const first = !lastProgress?.done.has(lessonId);
  const due = lastAssignments.find((a) => a.lesson_id === lessonId)?.due_date;
  const onTime = first && due && new Date() <= new Date(`${due}T23:59:59`);
  const gain = (first ? attemptXp(row) : REPEAT_XP) + (onTime ? ON_TIME_XP : 0);
  if (user) {
    const res = await account.saveResult(lessonId, stats);
    if (!res.ok) return toast(`Результат не сохранён: ${res.error}`);
  } else {
    // Демо-режим: результаты хранятся только в этом браузере
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_RESULTS_KEY) ?? '[]');
      list.push(row);
      localStorage.setItem(LOCAL_RESULTS_KEY, JSON.stringify(list));
    } catch {
      // без хранилища прогресс просто не запомнится
    }
  }
  const newXp = (lastProgress?.xp ?? 0) + gain;
  const levelUp = lastProgress && newXp >= lastProgress.to;
  toast(levelUp ? `+${gain} XP · Новый уровень ${lastProgress.level + 1}!` : `+${gain} XP`);
}

function setUser(profile) {
  user = profile;
  $('userName').textContent = profile
    ? `${profile.full_name} · ${profile.role === 'teacher' ? 'учитель' : 'ученик'}, ${profile.grade}`
    : 'Демо-режим';
  $('avatar').textContent = profile
    ? profile.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : 'Д';
}

// ---------- Личный кабинет ----------

// Превью опыта для плитки: та же SVG-сцена, что внутри работы, в уменьшенном виде
// Для превью действия ученика считаем выполненными: лазер включён, цепь собрана и т.п.
const doneActions = (def) => Object.fromEntries(def.controls.filter((c) => c.action).map((c) => [c.id, c.max]));

function lessonPreview(l) {
  if (l.sim) {
    const def = SIMS[l.sim];
    const params = { ...Object.fromEntries(def.controls.map((ctl) => [ctl.id, ctl.value])), ...l.initial, ...doneActions(def) };
    return preview(`sim:${l.id}`, (box) => def.create(box, params, () => {}));
  }
  // Химия: в стакане — итог первого опыта работы (первые два реактива из хода работы)
  const reagents = [...new Set(l.steps.filter((st) => st.type === 'do').map((st) => st.item))].slice(0, 2);
  const substances = reagents.map((id) => SHELF_BY_ID[id].substance);
  const concentrated = reagents.some((id) => SHELF_BY_ID[id].concentration === 'concentrated');
  const heatStep = l.steps.find((st) => st.type === 'heat');
  const result = runExperiment({ substances, temperature: heatStep?.to ?? 20, concentration: concentrated ? 'concentrated' : 'dilute' });
  return preview(`chem:${l.id}`, (box) => {
    const chem = createChemLab(box, {});
    chem.setSetup(l.setup ?? 'beaker', { receiver: l.receiver });
    chem.setShelf(l.shelf);
    chem.stage(reagents, result);
    return chem;
  }, (l.setup ?? 'beaker') === 'beaker' ? { viewBox: '213 205 534 300' } : {});
}

function simPreview(simId) {
  const def = SIMS[simId];
  const params = { ...Object.fromEntries(def.controls.map((ctl) => [ctl.id, ctl.value])), ...doneActions(def) };
  return preview(`free:${simId}`, (box) => def.create(box, params, () => {}));
}

const chemLabPreview = () => preview('chem:lab', (box) => createChemLab(box, {}), { viewBox: '60 40 840 473' });

// Общие инструменты предмета — после тем. Свободные опыты физики и биологии берутся из TOPICS.
const TOOLS = {
  chemistry: [
    { title: 'Свободная лаборатория', sub: 'Все реактивы и любые условия', icon: 'metals', thumb: chemLabPreview, open: openSandbox },
    {
      title: 'ИИ-ассистент', sub: 'Спланирует опыт по описанию', icon: 'tools', ai: true,
      open: async () => { await openSandbox(); $('prompt').focus(); },
    },
  ],
  physics: [
    { title: 'ИИ-ассистент', sub: 'Ответит на вопросы об опыте', icon: 'tools', ai: true, open: () => openSimFree('ohm', { focusAsk: true }) },
  ],
  biology: [
    { title: 'ИИ-ассистент', sub: 'Ответит на вопросы об опыте', icon: 'tools', ai: true, open: () => openSimFree('photosynthesis', { focusAsk: true }) },
  ],
};

// Русские окончания: 1 работа, 2 работы, 5 работ
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${word}`;
}

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

// Сводка ученика: результаты с баллами и задания класса (из аккаунта или, в демо-режиме, из браузера)
async function loadProgress() {
  let results = [];
  let assignments = [];
  if (user?.role === 'student') {
    const res = await account.loadMyScores(user.id);
    if (res.ok) results = res.value;
    if (user.class) {
      const a = await account.loadClassAssignments(user.class.id);
      if (a.ok) assignments = a.value;
    }
  } else if (!user) {
    try {
      results = JSON.parse(localStorage.getItem(LOCAL_RESULTS_KEY) ?? '[]');
    } catch {
      results = [];
    }
    // Работы, пройденные до появления журнала результатов, засчитываем без баллов
    const known = new Set(results.map((r) => r.lesson_id));
    for (const id of loadCompleted()) if (!known.has(id)) results.push({ lesson_id: id, q_ok: 0, q_total: 0, hyp_ok: 0, hyp_total: 0, completed_at: new Date(0).toISOString() });
  }
  const progress = computeProgress(results, ALL_LESSONS, assignments);
  lastProgress = progress;
  lastAssignments = assignments;
  return { progress, assignments, done: progress.done };
}

// Плитка: либо превью сцены сверху (thumb — промис с SVG), либо линейная иконка слева
function tile({ title, kicker, sub, icon, thumb, badge, onClick, className = '' }) {
  const t = el('button', `tile ${thumb ? 'has-thumb' : ''} ${className}`);
  t.type = 'button';
  t.onclick = onClick;
  let iconBox;
  if (thumb) {
    iconBox = el('span', 'tile-thumb loading');
    thumb().then((svg) => {
      iconBox.innerHTML = svg;
      iconBox.classList.remove('loading');
    });
  } else {
    iconBox = el('span', 'tile-line-icon');
    iconBox.innerHTML = lineIcon(icon);
  }
  const body = el('span', 'tile-body');
  if (kicker) body.append(el('span', 'tile-kicker', kicker));
  body.append(el('span', 'tile-title', title));
  if (sub) body.append(el('span', 'tile-sub', sub));
  t.append(iconBox, body);
  if (badge) t.append(el('span', 'tile-badge done', badge));
  return t;
}

async function renderMenu() {
  showOnboarding();
  $('greetWord').textContent = greetingWord();
  $('greetName').textContent = user ? user.full_name.split(' ')[0] : 'гость';

  const { progress, assignments, done } = await loadProgress();
  // Сначала — невыполненное задание учителя с ближайшим сроком, потом — следующая работа по порядку
  const todo = assignments.filter((a) => !done.has(a.lesson_id))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0];
  const assigned = todo ? ALL_LESSONS.findIndex((l) => l.id === todo.lesson_id) : -1;
  const next = assigned >= 0 ? assigned : ALL_LESSONS.findIndex((l) => !done.has(l.id));
  renderBanner(next, assigned >= 0);
  $('gamePanel').hidden = user?.role === 'teacher';
  if (user?.role !== 'teacher') renderGame(progress, assignments);

  // Раздел выбранного в навигации предмета
  $('subjectSections').replaceChildren(...SUBJECTS.filter((s) => s.id === subject).map((s) => {
    const section = el('section', 'subject-section');
    section.id = `subject-${s.id}`;
    section.style.setProperty('--c', s.color);
    section.style.setProperty('--soft', s.soft);

    const topics = TOPICS[s.id];
    const lessonCount = ALL_LESSONS.filter((l) => l.subject === s.id).length;
    const head = el('div', 'subject-head');
    head.append(el('span', 'subject-tag', s.name), el('span', 'subject-meta', `${plural(lessonCount, 'работа', 'работы', 'работ')} · ${plural(topics.length, 'тема', 'темы', 'тем')}`));

    // Сначала только список тем; работы темы появляются по нажатию на неё.
    const entries = [
      ...topics.map((t) => ({
        name: t.name,
        icon: t.name,
        meta: plural(t.lessons.length, 'работа', 'работы', 'работ'),
        done: t.lessons.filter((id) => done.has(id)).length,
        total: t.lessons.length,
        tiles: () => topicTiles(t, done),
      })),
      {
        name: 'Инструменты',
        icon: 'tools',
        meta: s.id === 'chemistry' ? 'лаборатория и ИИ' : 'ИИ-ассистент',
        tiles: () => TOOLS[s.id].map((f) => tile({ title: f.title, sub: f.sub, icon: f.icon, thumb: f.thumb, onClick: f.open, className: f.ai ? 'free ai' : 'free' })),
      },
    ];

    const grid = el('div', 'topic-grid');
    const detail = el('div', 'topic-detail');
    detail.id = `topic-detail-${s.id}`;
    const cards = entries.map((e, k) => {
      const card = el('button', 'topic-card');
      card.type = 'button';
      card.setAttribute('aria-expanded', 'false');
      card.setAttribute('aria-controls', detail.id);
      const iconBox = el('span', 'tile-line-icon');
      iconBox.innerHTML = lineIcon(e.icon);
      const body = el('span', 'tile-body');
      body.append(el('span', 'tile-title', e.name), el('span', 'tile-sub', e.total ? `${e.meta} · выполнено ${e.done}` : e.meta));
      card.append(iconBox, body, el('span', 'topic-arrow', '›'));
      card.onclick = () => {
        openTopics[s.id] = openTopics[s.id] === k ? null : k;
        showTopic();
      };
      return card;
    });
    grid.append(...cards);

    function showTopic() {
      const k = openTopics[s.id];
      cards.forEach((c, i) => {
        c.classList.toggle('active', i === k);
        c.setAttribute('aria-expanded', String(i === k));
      });
      if (k == null) {
        detail.replaceChildren(el('p', 'topic-empty', 'Выберите тему, чтобы увидеть её лабораторные работы и опыты.'));
        return;
      }
      const tiles = el('div', 'tiles');
      tiles.append(...entries[k].tiles());
      detail.replaceChildren(el('h3', 'topic-title', entries[k].name), tiles);
    }
    showTopic();

    section.append(head, grid, detail);
    return section;
  }));
}

function renderGame(p, assignments) {
  $('levelNum').textContent = String(p.level);
  $('levelTitle').textContent = titleOf(p.level);
  const inLevel = p.xp - p.from;
  const span = p.to - p.from;
  $('xpText').textContent = `${p.xp} XP`;
  $('xpNext').textContent = `до уровня ${p.level + 1}: ${p.to - p.xp} XP`;
  $('xpBar').style.width = `${Math.round((inLevel / span) * 100)}%`;
  $('levelRing').style.setProperty('--p', `${Math.round((inLevel / span) * 360)}deg`);
  $('streak').textContent = p.streak ? `🔥 ${plural(p.streak, 'день', 'дня', 'дней')} подряд` : '🔥 Серия: 0 дней';
  $('doneCount').textContent = `✓ ${p.done.size} из ${ALL_LESSONS.length} работ`;

  $('checklist').replaceChildren(...SUBJECTS.map((s) => {
    const { done, total } = p.subjects[s.id];
    const li = el('li', 'subject-progress');
    li.style.setProperty('--c', s.color);
    const bar = el('div', 'progress');
    const fill = el('div', 'progress-bar');
    fill.style.width = `${(done / total) * 100}%`;
    bar.append(fill);
    const head = el('div', 'subject-progress-head');
    head.append(el('span', 'subject-dot'), el('span', '', s.name), el('span', 'muted', `${done} / ${total}`));
    li.append(head, bar);
    return li;
  }));

  // Задания от учителя
  const card = $('assignmentsCard');
  card.hidden = !user?.class;
  if (user?.class) {
    const open = assignments.filter((a) => !p.done.has(a.lesson_id)).length;
    $('assignCount').textContent = assignments.length ? `осталось ${open}` : '';
    $('assignmentList').replaceChildren(...(assignments.length ? assignments.map((a) => {
      const i = ALL_LESSONS.findIndex((l) => l.id === a.lesson_id);
      const l = ALL_LESSONS[i];
      if (!l) return el('span');
      const st = assignmentStatus(a, p.done);
      const row = el('button', `assignment ${st.key}`);
      row.type = 'button';
      row.onclick = () => openLesson(i);
      const subj = SUBJECT_BY_ID[l.subject];
      const dot = el('span', 'subject-dot');
      dot.style.background = subj.color;
      const text = el('span', 'assignment-text');
      text.append(el('b', '', l.short ?? l.title), el('span', 'muted small', `${subj.name} · работа № ${l.number}`));
      row.append(dot, text, el('span', `status ${st.key}`, st.text));
      return row;
    }) : [el('p', 'muted small', 'Учитель пока не назначил заданий. Можно выполнять любые работы ниже.')]));
  }

  // Значки
  $('badgeCount').textContent = `${p.badges.filter((b) => b.got).length} / ${p.badges.length}`;
  $('badgeGrid').replaceChildren(...p.badges.map((b) => {
    const item = el('div', `badge-item ${b.got ? 'got' : 'locked'}`);
    item.title = b.desc;
    item.append(el('span', 'badge-icon', b.icon), el('span', 'badge-name', b.name), el('span', 'badge-desc', b.desc));
    return item;
  }));
}

// Открытая тема в каждом предмете: сохраняется, пока ученик переходит между работами и дашбордом.
const openTopics = {};

function topicTiles(t, done) {
  const tiles = t.lessons.map((lessonId) => {
    const i = ALL_LESSONS.findIndex((l) => l.id === lessonId);
    const l = ALL_LESSONS[i];
    return tile({
      kicker: `Работа № ${l.number}`, title: l.short ?? l.title, sub: l.topic, thumb: () => lessonPreview(l),
      badge: done.has(l.id) ? 'Выполнена' : '', onClick: () => openLesson(i),
    });
  });
  for (const simId of t.sims ?? []) {
    const def = SIMS[simId];
    tiles.push(tile({
      kicker: 'Свободный опыт', title: def.freeTitle, sub: def.freeSub, thumb: () => simPreview(simId),
      onClick: () => openSimFree(simId), className: 'free',
    }));
  }
  return tiles;
}

function renderBanner(next, assigned = false) {
  const btn = $('bannerBtn');
  $('joinForm').hidden = true;
  btn.hidden = false;
  formError($('banner'), null);

  if (!user) {
    $('bannerTitle').textContent = 'Демо-режим';
    $('bannerSub').textContent = 'Результаты не сохраняются в журнал класса. Войдите, чтобы вести прогресс.';
    btn.textContent = 'Войти';
    btn.onclick = () => show('auth');
  } else if (user.role === 'teacher') {
    $('bannerTitle').textContent = 'Кабинет учителя';
    $('bannerSub').textContent = 'Создавайте классы, назначайте лабораторные работы и следите за прогрессом учеников.';
    btn.textContent = 'Мои классы';
    btn.onclick = openTeacher;
  } else if (!user.class) {
    $('bannerTitle').textContent = 'Вступите в класс';
    $('bannerSub').textContent = 'Введите код от учителя — тогда учитель увидит ваши результаты.';
    $('joinForm').hidden = false;
    btn.hidden = true;
  } else if (next >= 0) {
    const l = ALL_LESSONS[next];
    $('bannerTitle').textContent = assigned ? 'Задание от учителя' : next === 0 ? 'Начните практикум' : 'Продолжите практикум';
    $('bannerSub').textContent = `${assigned ? '' : 'Следующая работа: '}${SUBJECT_BY_ID[l.subject].name}, № ${l.number}. ${l.title}`;
    btn.textContent = assigned ? 'Выполнить' : next === 0 ? 'Начать' : 'Продолжить';
    btn.onclick = () => openLesson(next);
  } else {
    $('bannerTitle').textContent = 'Все лабораторные работы выполнены';
    $('bannerSub').textContent = 'Закрепите знания в свободных экспериментах.';
    btn.textContent = 'Открыть лабораторию';
    btn.onclick = openSandbox;
  }
}

function formError(form, message) {
  const p = form.querySelector('.form-error');
  p.hidden = !message;
  p.textContent = message ?? '';
}

function withBusy(form, fn) {
  return async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await fn(new FormData(form));
    } finally {
      btn.disabled = false;
    }
  };
}

function switchTab(register) {
  $('loginForm').hidden = register;
  $('registerForm').hidden = !register;
  $('tabLogin').classList.toggle('active', !register);
  $('tabRegister').classList.toggle('active', register);
  $('tabLogin').setAttribute('aria-selected', String(!register));
  $('tabRegister').setAttribute('aria-selected', String(register));
}

function updateRoleFields() {
  const teacher = $('registerForm').elements.role.value === 'teacher';
  $('codeField').hidden = teacher;
  $('gradeLabel').textContent = teacher ? 'Класс, в котором вы ведёте предмет' : 'Класс';
}

$('loginForm').addEventListener('submit', withBusy($('loginForm'), async (fd) => {
  formError($('loginForm'), null);
  const res = await account.login(fd.get('phone'), fd.get('password'));
  if (!res.ok) return formError($('loginForm'), res.error);
  if (!res.value) return formError($('loginForm'), 'Профиль не найден. Пройдите регистрацию ещё раз с этим же номером и паролем.');
  setUser(res.value);
  openMenu();
}));

$('registerForm').addEventListener('submit', withBusy($('registerForm'), async (fd) => {
  const form = $('registerForm');
  formError(form, null);
  const { errors, data } = account.validateRegistration(Object.fromEntries(fd));
  if (errors.length) return formError(form, errors.join(' '));
  const res = await account.register(data);
  if (!res.ok) return formError(form, res.error);
  setUser(res.value);
  openMenu();
}));

$('joinForm').addEventListener('submit', withBusy($('joinForm'), async (fd) => {
  const box = $('banner');
  formError(box, null);
  const code = String(fd.get('code')).trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return formError(box, 'Код класса — 6 символов (буквы и цифры).');
  const res = await account.joinClass(code);
  if (!res.ok) return formError(box, res.error);
  setUser(res.value);
  renderMenu();
  toast(`Вы вступили в класс ${res.value.class?.name ?? ''}.`);
}));

$('logoutBtn').addEventListener('click', async () => {
  await resetBench();
  await account.logout();
  setUser(null);
  show('auth');
});

// ---------- Учитель ----------

let teacherClasses = [];
let activeClassId = null;

async function openTeacher() {
  show('teacher', 'Мои классы');
  await loadTeacher();
}

async function loadTeacher() {
  teacherError(null);
  const res = await account.loadTeacherClasses(user.id);
  if (!res.ok) return teacherError(res.error);
  teacherClasses = res.value;
  if (!teacherClasses.some((k) => k.id === activeClassId)) activeClassId = teacherClasses[0]?.id ?? null;
  renderClassTabs();
  await renderClassPanel();
}

function teacherError(msg) {
  const p = document.querySelector('.teacher-error');
  p.hidden = !msg;
  p.textContent = msg ?? '';
}

function renderClassTabs() {
  $('classTabs').replaceChildren(...teacherClasses.map((k) => {
    const b = el('button', k.id === activeClassId ? 'class-tab active' : 'class-tab', k.name);
    b.type = 'button';
    b.onclick = async () => {
      activeClassId = k.id;
      renderClassTabs();
      await renderClassPanel();
    };
    return b;
  }));
  if (!teacherClasses.length) $('classTabs').replaceChildren(el('p', 'muted', 'Классов пока нет — создайте первый класс.'));
}

async function renderClassPanel() {
  const k = teacherClasses.find((x) => x.id === activeClassId);
  $('classPanel').hidden = !k;
  if (!k) return;
  $('classCode').textContent = k.code;
  $('classTable').replaceChildren(el('p', 'muted', 'Загрузка…'));

  const [res, asg] = await Promise.all([account.loadClassResults(k.id), account.loadClassAssignments(k.id)]);
  if (!res.ok) return teacherError(res.error);
  if (!asg.ok) return teacherError(asg.error);
  const { students, results } = res.value;
  const assignments = asg.value;
  const doneBy = (sid, lid) => results.some((r) => r.user_id === sid && r.lesson_id === lid);

  // Сводка: доля выполненных назначенных работ по всем ученикам
  const cells = students.length * assignments.length;
  const doneCells = assignments.reduce((sum, a) => sum + students.filter((s) => doneBy(s.id, a.lesson_id)).length, 0);
  $('statStudents').textContent = String(students.length);
  $('statAssigned').textContent = String(assignments.length);
  $('statCompletion').textContent = cells ? `${Math.round((doneCells / cells) * 100)}%` : '—';

  // Выбор работы для назначения: только ещё не назначенные, по предметам
  const select = document.querySelector('#assignForm select');
  select.replaceChildren(new Option('Выберите работу…', ''), ...SUBJECTS.map((s) => {
    const g = document.createElement('optgroup');
    g.label = s.name;
    ALL_LESSONS.filter((l) => l.subject === s.id && !assignments.some((a) => a.lesson_id === l.id))
      .forEach((l) => g.append(new Option(`№ ${l.number}. ${l.short ?? l.title}`, l.id)));
    return g;
  }));

  // Таблица заданий
  if (!assignments.length) {
    $('assignTable').replaceChildren(el('p', 'muted small', 'Заданий пока нет. Выберите работу и срок выше.'));
  } else {
    $('assignTable').replaceChildren(...assignments.map((a) => {
      const l = ALL_LESSONS.find((x) => x.id === a.lesson_id);
      const n = students.filter((s) => doneBy(s.id, a.lesson_id)).length;
      const row = el('div', 'assign-row');
      const subj = SUBJECT_BY_ID[l?.subject] ?? SUBJECTS[0];
      const dot = el('span', 'subject-dot');
      dot.style.background = subj.color;
      const info = el('span', 'assignment-text');
      info.append(el('b', '', l ? `${subj.short}${l.number}. ${l.short ?? l.title}` : a.lesson_id), el('span', 'muted small', a.due_date ? `срок: ${new Date(`${a.due_date}T00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : 'без срока'));
      const bar = el('div', 'progress mini-bar');
      const fill = el('div', 'progress-bar');
      fill.style.width = students.length ? `${(n / students.length) * 100}%` : '0%';
      bar.append(fill);
      const del = el('button', 'ghost small', 'Снять');
      del.type = 'button';
      del.onclick = async () => {
        const r = await account.unassign(a.id);
        if (!r.ok) return teacherError(r.error);
        await renderClassPanel();
      };
      row.append(dot, info, bar, el('span', 'muted small', `${n}/${students.length}`), del);
      return row;
    }));
  }

  // Таблица учеников: назначенные работы (или все, если заданий нет) + итог
  if (!students.length) {
    $('classTable').replaceChildren(el('p', 'muted', `Учеников пока нет. Сообщите им код класса ${k.code}.`));
    return;
  }
  const columns = assignments.length ? assignments.map((a) => ALL_LESSONS.find((l) => l.id === a.lesson_id)).filter(Boolean) : ALL_LESSONS;
  const table = el('table', 'journal-table');
  const head = table.createTHead().insertRow();
  head.append(el('th', '', 'Ученик'), el('th', '', 'Уровень'));
  for (const l of columns) {
    const subj = SUBJECT_BY_ID[l.subject];
    const th = el('th', 'subject-th', `${subj.short}${l.number}`);
    th.title = `${subj.name}: ${l.title}`;
    th.style.color = subj.color;
    head.append(th);
  }
  head.append(el('th', '', ''));
  const body = table.createTBody();
  for (const s of students) {
    const mine = results.filter((r) => r.user_id === s.id);
    const p = computeProgress(mine, ALL_LESSONS, assignments);
    const tr = body.insertRow();
    tr.insertCell().textContent = s.full_name;
    tr.insertCell().textContent = `${p.level} · ${p.xp} XP`;
    for (const l of columns) {
      const last = mine.filter((r) => r.lesson_id === l.id).at(-1);
      const td = tr.insertCell();
      if (!last) {
        const a = assignments.find((x) => x.lesson_id === l.id);
        const late = a && assignmentStatus(a, new Set()).key === 'late';
        td.textContent = late ? 'просрочено' : '—';
        td.className = late ? 'no' : 'empty-cell';
        continue;
      }
      td.textContent = `${last.q_ok}/${last.q_total}`;
      td.className = last.q_ok === last.q_total ? 'ok' : 'no';
      td.title = `Контрольные вопросы ${last.q_ok}/${last.q_total}, гипотезы ${last.hyp_ok}/${last.hyp_total}. Выполнено ${new Date(last.completed_at).toLocaleString('ru-RU')}`;
    }
    const act = tr.insertCell();
    const rm = el('button', 'ghost small', 'Убрать');
    rm.type = 'button';
    rm.onclick = () => confirmAction(`Убрать ученика «${s.full_name}» из класса? Его результаты сохранятся.`, 'Убрать', async () => {
      const r = await account.removeStudent(s.id);
      if (!r.ok) return teacherError(r.error);
      await renderClassPanel();
    });
    act.append(rm);
  }
  const wrap = el('div', 'table-wrap');
  wrap.append(table);
  const legend = el('p', 'muted small', assignments.length
    ? 'Показаны назначенные работы. В ячейке — верные ответы на контрольные вопросы (последняя попытка), зелёным — все верно.'
    : 'Заданий нет — показаны все работы. Х — химия, Ф — физика, Б — биология.');
  $('classTable').replaceChildren(wrap, legend);
}

// Подтверждение опасных действий внутри страницы (без системных диалогов)
function confirmAction(text, yesLabel, onYes) {
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yesLabel;
  $('confirmBox').hidden = false;
  $('confirmNo').onclick = () => { $('confirmBox').hidden = true; };
  $('confirmYes').onclick = async () => {
    $('confirmBox').hidden = true;
    await onYes();
  };
}

$('newClassForm').addEventListener('submit', withBusy($('newClassForm'), async (fd) => {
  const name = String(fd.get('name')).trim();
  if (!name) return;
  const r = await account.createClass(name);
  if (!r.ok) return teacherError(r.error);
  activeClassId = r.value?.id ?? activeClassId;
  $('newClassForm').reset();
  await loadTeacher();
  toast(`Класс «${name}» создан. Код: ${r.value?.code ?? ''}`);
}));

$('assignForm').addEventListener('submit', withBusy($('assignForm'), async (fd) => {
  const lessonId = fd.get('lesson');
  if (!lessonId) return;
  const r = await account.assignLesson(activeClassId, lessonId, fd.get('due'));
  if (!r.ok) return teacherError(r.error);
  $('assignForm').reset();
  await renderClassPanel();
}));

$('copyCode').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('classCode').textContent);
    toast('Код скопирован');
  } catch {
    toast(`Код класса: ${$('classCode').textContent}`);
  }
});

$('renameClass').addEventListener('click', () => {
  const k = teacherClasses.find((x) => x.id === activeClassId);
  if (!k) return;
  // Переименование — прямо в вкладке класса
  const tab = document.querySelector('.class-tab.active');
  const input = Object.assign(document.createElement('input'), { value: k.name, maxLength: 10, className: 'class-rename' });
  tab.replaceWith(input);
  input.focus();
  let saved = false;
  const save = async (keep = true) => {
    if (saved) return;
    saved = true;
    const name = keep ? input.value.trim() : '';
    if (name && name !== k.name) {
      const r = await account.renameClass(k.id, name);
      if (!r.ok) teacherError(r.error);
    }
    await loadTeacher();
  };
  input.addEventListener('blur', () => save());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') save(false);
  });
});

$('deleteClass').addEventListener('click', () => {
  const k = teacherClasses.find((x) => x.id === activeClassId);
  if (!k) return;
  confirmAction(`Удалить класс «${k.name}»? Задания класса удалятся, ученики останутся без класса, их результаты сохранятся.`, 'Удалить', async () => {
    const r = await account.deleteClass(k.id);
    if (!r.ok) return teacherError(r.error);
    activeClassId = null;
    await loadTeacher();
  });
});

// ---------- Стол ----------

function handlePick(id) {
  if (bench.isBusy()) return toast('Дождитесь окончания текущего действия.');
  if (mode === 'lesson') lesson?.handlePick(id);
  else if (mode === 'sandbox') sandbox.handlePick(id);
}

function setTemperature(t) {
  $('temp').value = t;
  $('tempValue').textContent = t;
  bench.setTemperature(t);
}

// Подсказка под сценой (не поверх картинки): при наведении — название реактива.
const CHEM_HINT = 'Нажмите на склянку или чашку с веществом — реактив попадёт в сосуд на столе.';
function showHover(id) {
  const item = id ? SHELF_BY_ID[id] : null;
  $('hint').textContent = item
    ? `${SUBSTANCES[item.substance].name}${item.concentration ? ' (концентрированная)' : ''}`
    : CHEM_HINT;
}

function showSimHint(def) {
  $('simHint').hidden = !def.hint;
  $('simHint').textContent = def.hint ?? '';
}

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---------- ИИ ----------

async function postJson(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: {} };
  } finally {
    clearTimeout(timer);
  }
}

// Объяснение ИИ по фактам из базы; если ИИ недоступен — текст из проверенной базы.
async function explain(result) {
  const res = await postJson('/api/explain', result.params);
  if (res.ok && typeof res.data.text === 'string') return res.data.text;
  return [result.why, result.hint].filter(Boolean).join(' ');
}

// Вопрос ИИ об опыте на симуляции; если ИИ недоступен — теория из описания симуляции.
async function askSim(simId, params, question) {
  const res = await postJson('/api/ask', { simId, params, question });
  if (res.ok && typeof res.data.text === 'string') return res.data.text;
  const def = SIMS[simId];
  return `ИИ-ассистент сейчас недоступен. ${def.describe(params)}. ${def.theory}`;
}

async function answerSim(question) {
  if (!simCtrl) return;
  const box = $('simAnswer');
  box.hidden = false;
  box.textContent = 'Ассистент думает…';
  box.textContent = await askSim(simCtrl.def.id, { ...simCtrl.params }, question);
}

$('simAskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('simQuestion').value.trim();
  if (q) answerSim(q);
});
$('simExplainBtn').addEventListener('click', () => answerSim(''));

// Те же реактивы, что на 3D-столе, но кнопками: для клавиатуры, экранных дикторов и слабых компьютеров.
function renderReagentBar(ids) {
  $('reagentBar').replaceChildren(el('span', 'reagent-bar-label', 'Реактивы:'), ...ids.map((id) => {
    const item = SHELF_BY_ID[id];
    const b = el('button', 'reagent', item.kind === 'dish' ? item.label : `${item.label} ${item.note}`);
    b.type = 'button';
    b.setAttribute('aria-label', `${SUBSTANCES[item.substance].name}${item.concentration ? ', концентрированная' : ''}`);
    b.onclick = () => handlePick(id);
    return b;
  }));
}

// Крупный текст: масштабирует весь интерфейс через размер шрифта корня.
const FONT_KEY = 'ai-stem-lab:large-text';
function setLargeText(on) {
  document.documentElement.classList.toggle('large-text', on);
  $('fontBtn').setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem(FONT_KEY, on ? '1' : '');
  } catch {
    // Настройка просто не запомнится.
  }
}
$('fontBtn').addEventListener('click', () => setLargeText(!document.documentElement.classList.contains('large-text')));
try {
  setLargeText(localStorage.getItem(FONT_KEY) === '1');
} catch {
  setLargeText(false);
}

// Клавиатура в лабораторной работе: Enter — «Далее» или действие шага, 1–4 — вариант ответа
document.addEventListener('keydown', (e) => {
  if (screen !== 'workspace' || !$('lessonSide') || $('lessonSide').hidden) return;
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
  const buttons = [...$('coach').querySelectorAll('button:not([disabled])')];
  if (e.key === 'Enter') {
    const next = buttons.find((b) => b.textContent === 'Далее') ?? buttons.find((b) => b.classList.contains('primary'));
    if (next) {
      e.preventDefault();
      next.click();
    }
  } else if (/^[1-4]$/.test(e.key)) {
    const opts = buttons.filter((b) => b.classList.contains('option'));
    opts[Number(e.key) - 1]?.click();
  }
});

// Гостевой режим: попробовать практикум без аккаунта (результаты хранятся только в этом браузере)
$('guestBtn').addEventListener('click', () => {
  setUser(null);
  openMenu();
});

// Короткая подсказка для первого визита; после «Понятно» больше не показывается
const ONBOARDING_KEY = 'ai-stem-lab:onboarding-done';
function showOnboarding() {
  let done = false;
  try {
    done = localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    // без хранилища просто показываем подсказку
  }
  $('onboarding').hidden = done;
}
$('onboardingClose').addEventListener('click', () => {
  $('onboarding').hidden = true;
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // не запомнится — не страшно
  }
});

// ---------- Запуск ----------

$('temp').addEventListener('input', (e) => setTemperature(Number(e.target.value)));
$('washBtn').addEventListener('click', async () => {
  if (!bench.isBusy()) await bench.wash();
});
$('backBtn').addEventListener('click', openMenu);
$('homeBtn').addEventListener('click', () => (screen === 'auth' ? null : openMenu()));
$('tabLogin').addEventListener('click', () => switchTab(false));
$('tabRegister').addEventListener('click', () => switchTab(true));
$('registerForm').addEventListener('change', updateRoleFields);

async function boot() {
  if (!account.isConfigured) {
    // Без Supabase приложение остаётся рабочим для демонстрации, но без аккаунтов.
    const notice = $('authNotice');
    notice.hidden = false;
    notice.textContent = 'Вход пока не настроен — можно попробовать практикум без регистрации.';
    show('auth');
    return;
  }
  const profile = await account.loadProfile().catch(() => null);
  if (profile) {
    setUser(profile);
    openMenu();
  } else {
    show('auth');
  }
}

updateRoleFields();
showHover(null);
boot();

// Только в режиме разработки: позволяет автотестам работать без мыши.
if (import.meta.env.DEV) {
  window.__lab = { pick: handlePick, busy: () => bench.isBusy(), openLesson, openSandbox, openSimFree, setTemperature };
}
