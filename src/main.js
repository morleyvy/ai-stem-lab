import { SUBSTANCES } from './data/substances.js';
import { SHELF, SHELF_BY_ID } from './data/shelf.js';
import { ALL_LESSONS, GRADES, SIMS, SIM_GRADE, SUBJECTS, SUBJECT_BY_ID, TOPICS, parseGrade } from './data/catalog.js';
import { ROADMAP } from './data/roadmap.js';
import { createChemLab } from './svg/chemLab.js';
import { createBench } from './bench.js';
import { loadCompleted, startLesson } from './lesson.js';
import { createSandbox } from './sandbox.js';
import { createMissions, mt } from './missions.js';
import { MISSION_BY_ID } from './data/missions.js';
import { createSimStage } from './simStage.js';
import { preview } from './previews.js';
import { runExperiment } from './engine.js';
import { lineIcon, topicIcon } from './lineIcons.js';
import * as account from './account.js';
import { ON_TIME_XP, REPEAT_XP, assignmentStatus, attemptXp, computeProgress, titleOf } from './progress.js';
import { initChat } from './chat.js';
import { answerOffline, newMemory } from './offlineChat.js';
import { createLive } from './live.js';
import { createConstructor } from './constructor.js';
import { PREVIEW_ID } from './customLesson.js';
import { createTour } from './tour.js';
import { initFeedback } from './feedback.js';
import { initAccessibility } from './accessibility.js';
import { addContent, applyStaticI18n, lang, locale, plural, setLang, t, tr } from './i18n.js';
import { registerSW } from 'virtual:pwa-register';

// Разметку index.html переводим до первой отрисовки экранов
applyStaticI18n();

const API_TIMEOUT_MS = 20_000;
const SUBJECT_KEY = 'ai-stem-lab:subject';
const SCREENS = ['auth', 'menu', 'teacher', 'account', 'workspace', 'constructor'];
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

// Маскот — только декоративный акцент в пустых состояниях: текст рядом и так всё объясняет,
// поэтому скринридеру картинку не показываем.
function mascot(pose, size) {
  const img = el('img', 'mascot');
  Object.assign(img, { src: `/icons/mascot-${pose}.webp`, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async' });
  img.setAttribute('aria-hidden', 'true');
  return img;
}

let screen = 'auth';
// Что открыто на рабочем месте: 'lesson' (химия), 'sim-lesson', 'sandbox' (химия), 'sim-free'
let mode = null;
// id открытой лабораторной — чтобы ИИ-ассистент в чате знал, о какой работе вопрос
let currentLessonId = null;
let lesson = null;
let user = null; // профиль из Supabase; null — демо-режим без аккаунта
let subject = loadSubject(); // предмет, выбранный в навигации шапки

// Химическая лаборатория — SVG-иллюстрация: чёткая на любом экране и не требует WebGL.
const lab = createChemLab($('lab'), { onPick: handlePick, onHover: showHover });
const bench = createBench(lab);

// Проба газа лучинкой в свободной лаборатории: кнопка — запасной путь к перетаскиванию лучинки на сцене.
// В лабораторной работе ту же кнопку показывает карточка шага.
const SPLINT_TEXT = {
  pop: () => t('splint.pop'),
  out: (gas) => t('splint.out', { gas: tr(gas) }),
  burn: () => t('splint.burn'),
};
const splintBtn = el('button', 'ghost', t('splint.button'));
splintBtn.type = 'button';
splintBtn.hidden = true;
$('washBtn').after(splintBtn);
splintBtn.addEventListener('click', () => {
  if (bench.isBusy()) return toast(t('work.busy'));
  lab.splint();
});
lab.onSplint(({ gas, outcome }) => {
  if (mode === 'sandbox') toast(SPLINT_TEXT[outcome](gas));
});
const sandbox = createSandbox({ bench, lab, $, toast, postJson, explain });
const missions = createMissions({ bench, lab, $, toast, postJson, saveResult: (id, stats) => saveResult(id, stats), onStart: (id) => openMission(id) });
const simStage = createSimStage({
  canvasBox: $('simCanvas'),
  controlsBox: $('simControls'),
  readoutBox: $('simReadout'),
  chartBox: $('simChart'),
  clearChartBtn: $('clearChartBtn'),
});
const live = createLive({
  client: account.realtimeClient(),
  getUser: () => user,
  toast,
  // Гостю, который хочет начать урок или подключиться, нужен вход: выход из демо-режима ведёт на экран входа
  signIn: () => $('logoutBtn').click(),
  coach: $('coach'),
  openLessonById: (id) => {
    const i = ALL_LESSONS.findIndex((l) => l.id === id);
    if (i >= 0) openLesson(i);
    // Работа учителя из конструктора (id 'c-…'), если она уже загружена с заданиями класса
    else if (constructorUi.byId(id)) openLesson(constructorUi.byId(id));
    return i >= 0 || Boolean(constructorUi.byId(id));
  },
});
// Экран «Конструктор лабораторных» (src/constructor.js) создаёт свою разметку сам
const constructorUi = createConstructor({ show, getUser: () => user, openLesson, toast, confirmAction, mascot });

// ---------- Навигация ----------

// На телефоне в строке опыта помещается слов пять: «Химия · Лабораторная работа…» съедало их все,
// и название работы не было видно. Коротко — номер и название: «№ 1. Взаимодействие металлов…»
function shortCrumb(crumb) {
  const kind = crumb.split(' · ').slice(1).join(' · ');
  const parts = kind.match(/^(.*?)[.:]\s+(.+)$/);
  if (!parts) return crumb;
  const number = parts[1].match(/№\s*\d+/)?.[0];
  return number ? `${number}. ${parts[2]}` : parts[2];
}

function show(next, crumb = '') {
  screen = next;
  for (const id of SCREENS) $(id).hidden = id !== next;
  const full = el('span', 'crumb-full', crumb);
  const short = el('span', 'crumb-short', shortCrumb(crumb));
  $('workTitle').replaceChildren(full, short);
  $('userBox').hidden = next === 'auth';
  // Лендинг — продолжение экрана входа, после входа он не нужен
  $('landing').hidden = next !== 'auth';
  // Режим фокуса: во время опыта убираем навигацию и декоративный фон
  document.body.classList.toggle('focus', next === 'workspace');
  $('topNav').hidden = next === 'auth' || next === 'workspace';
  // Обучение рассказывает про экран с работами — с других экранов его не запустить
  $('tourBtn').hidden = next !== 'menu';
  renderTopNav();
  window.scrollTo(0, 0);
  // Смена экрана без перезагрузки не слышна скринридеру — переводим фокус на заголовок
  // новой страницы. В рабочем месте фокус не трогаем: там свой порядок работы с опытом.
  if (next !== 'workspace') {
    const h1 = $(next).querySelector('h1');
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
  }
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
  live.lessonClosed();
  lesson = null;
  mode = null;
  sandbox.leave();
  missions.leave();
  simStage.unmount();
  simCtrl = null;
  currentLessonId = null;
  if (bench.state.contents.length) await bench.wash();
  setTemperature(20);
}

// target — номер работы в ALL_LESSONS или готовая работа учителя из конструктора (custom: true)
async function openLesson(target, { onExit = openMenu } = {}) {
  await resetBench();
  const data = typeof target === 'number' ? ALL_LESSONS[target] : target;
  currentSubject = data.subject;
  currentLessonId = data.id;
  const crumb = data.custom
    ? t('cn.crumb', { subject: tr(SUBJECT_BY_ID[data.subject].name), title: tr(data.title) })
    : t('work.lessonCrumb', { subject: tr(SUBJECT_BY_ID[data.subject].name), n: data.number, title: tr(data.title) });
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
    quiz: () => lessonQuiz(data.id, data.custom ? data : null),
    // Проба работы учителем в конструкторе — не результат: в журнал и прогресс не пишем
    onComplete: data.preview ? null : saveResult,
    onProgress: (event) => live.progress(data, event),
    onExit,
    onNext: typeof target === 'number' ? nextInSubject(target) : null,
  });
  chat.experimentOpened();
  // Учитель, пробующий свою работу в конструкторе, сайт уже знает — обучение ему ни к чему
  if (!data.preview) tour.maybeStart('lesson', LESSON_TOUR);
}

function nextInSubject(index) {
  const current = ALL_LESSONS[index];
  const next = ALL_LESSONS.findIndex((l, i) => i > index && l.subject === current.subject);
  return next >= 0 ? () => openLesson(next) : null;
}

async function openSandbox() {
  await resetBench();
  currentSubject = 'chemistry';
  showWorkspace('sandbox', `${tr(SUBJECT_BY_ID.chemistry.name)} · ${t('work.free')}`);
  sandbox.enter();
  renderReagentBar(SHELF.map((s) => s.id));
  chat.experimentOpened();
}

// Детективная миссия: тот же химический стол, но на полке только реактивы миссии (см. src/missions.js)
async function openMission(id) {
  await resetBench();
  currentSubject = 'chemistry';
  showWorkspace('mission', `${tr(SUBJECT_BY_ID.chemistry.name)} · ${mt('tile')}`);
  missions.enter(id);
  renderReagentBar(MISSION_BY_ID[id].reagents);
  chat.experimentOpened();
}

async function openSimFree(simId, { focusAsk = false } = {}) {
  await resetBench();
  const def = SIMS[simId];
  currentSubject = def.subject;
  showWorkspace('sim-free', t('work.freeCrumb', { subject: tr(SUBJECT_BY_ID[def.subject].name), title: tr(def.title) }));
  $('simTheory').textContent = tr(def.theory);
  $('simFormula').textContent = tr(def.formula);
  simCtrl = simStage.mount(def);
  showSimHint(def);
  $('simAnswer').hidden = true;
  $('simQuestion').value = '';
  if (focusAsk) $('simQuestion').focus();
  chat.experimentOpened();
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
    const b = el('button', s.id === active ? 'nav-tab active' : 'nav-tab', tr(s.name));
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
    if (!res.ok) return toast(t('work.saveFail', { error: res.error }));
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
  const gained = t('work.saved', { points: plural(gain, 'n.point') });
  toast(levelUp ? t('work.levelUp', { text: gained, level: lastProgress.level + 1 }) : gained);
}

const PERSON_ICON = '<svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.8 21c.6-4.3 4-7 8.2-7s7.6 2.7 8.2 7z" fill="currentColor"/></svg>';

function setUser(profile) {
  user = profile;
  $('userName').textContent = profile
    ? t('user.label', { name: profile.full_name, role: t(profile.role === 'teacher' ? 'role.teacher' : 'role.student'), grade: profile.grade })
    : t('user.demo');
  // Силуэт вместо инициалов: буква «Д» у гостя читалась как непонятный значок
  $('avatar').innerHTML = PERSON_ICON;
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
    { title: t('tool.freeLab'), sub: t('tool.freeLabSub'), icon: 'metals', thumb: chemLabPreview, open: openSandbox },
    { title: mt('tile'), sub: mt('tileSub'), icon: 'acids', open: () => missions.showList() },
    {
      title: t('tool.ai'), sub: t('tool.aiChemSub'), icon: 'tools', ai: true,
      open: async () => { await openSandbox(); $('prompt').focus(); },
    },
  ],
  physics: [
    { title: t('tool.ai'), sub: t('tool.aiSimSub'), icon: 'tools', ai: true, open: () => openSimFree('ohm', { focusAsk: true }) },
    // Конструктор — инструмент учителя; гостю он открыт, чтобы его можно было показать без аккаунта
    { title: t('cn.tool'), sub: t('cn.toolSub'), icon: 'tools', ai: true, teacherTool: true, open: () => constructorUi.open() },
  ],
  biology: [
    { title: t('tool.ai'), sub: t('tool.aiSimSub'), icon: 'tools', ai: true, open: () => openSimFree('photosynthesis', { focusAsk: true }) },
    { title: t('cn.tool'), sub: t('cn.toolSub'), icon: 'tools', ai: true, teacherTool: true, open: () => constructorUi.open() },
  ],
  // Конструктора здесь нет: он собирает работы только по физике и биологии (src/customLesson.js)
  informatics: [
    { title: t('tool.ai'), sub: t('tool.aiSimSub'), icon: 'tools', ai: true, open: () => openSimFree('it-network-topology', { focusAsk: true }) },
  ],
};

// В физике и биологии нет общей песочницы, как в химии, — свободная лаборатория это все симуляции предмета
// с произвольными параметрами, собранные в одном месте.
function freeLabTiles(subjectId) {
  return Object.keys(SIMS).filter((id) => SIMS[id].subject === subjectId).map((simId) => tile({
    kicker: t('tool.freeLab'), title: tr(SIMS[simId].freeTitle), sub: tr(SIMS[simId].freeSub), thumb: () => simPreview(simId),
    onClick: () => openSimFree(simId), className: 'free',
  }));
}

function greetingWord() {
  const h = new Date().getHours();
  return t(h < 12 ? 'greet.morning' : h < 18 ? 'greet.day' : 'greet.evening');
}

// Сводка ученика: результаты с баллами и задания класса (из аккаунта или, в демо-режиме, из браузера)
async function loadProgress() {
  let results = [];
  let assignments = [];
  let error = null;
  if (user?.role === 'student') {
    const res = await account.loadMyScores(user.id);
    if (res.ok) results = res.value;
    else error = res.error;
    if (user.class) {
      const a = await account.loadClassAssignments(user.class.id);
      if (a.ok) assignments = a.value;
      else error ??= a.error;
      await constructorUi.loadAssigned(assignments);
    }
  } else if (!user) {
    // Гость видит работы, собранные в конструкторе в этом браузере, — как ученик видел бы задания
    await constructorUi.loadOwn();
    try {
      results = JSON.parse(localStorage.getItem(LOCAL_RESULTS_KEY) ?? '[]');
    } catch {
      results = [];
    }
    // Работы, пройденные до появления журнала результатов, засчитываем без баллов
    const known = new Set(results.map((r) => r.lesson_id));
    for (const id of loadCompleted()) if (!known.has(id) && id !== PREVIEW_ID) results.push({ lesson_id: id, q_ok: 0, q_total: 0, hyp_ok: 0, hyp_total: 0, completed_at: new Date(0).toISOString() });
  }
  const progress = computeProgress(results, ALL_LESSONS, assignments);
  lastProgress = progress;
  lastAssignments = assignments;
  return { progress, assignments, results, error, done: progress.done };
}

// Плитка: либо превью сцены сверху (thumb — промис с SVG), либо линейная иконка слева
function tile({ title, kicker, grade, sub, icon, thumb, badge, onClick, className = '' }) {
  const btn = el('button', `tile ${thumb ? 'has-thumb' : ''} ${className}`);
  btn.type = 'button';
  btn.onclick = onClick;
  let iconBox;
  if (thumb) {
    iconBox = el('span', 'tile-thumb loading');
    thumb().then((svg) => {
      iconBox.innerHTML = svg;
      iconBox.classList.remove('loading');
    });
  } else {
    iconBox = el('span', 'tile-line-icon');
    iconBox.innerHTML = topicIcon(icon);
    if (iconBox.firstElementChild.tagName === 'IMG') iconBox.classList.add('has-img');
  }
  const body = el('span', 'tile-body');
  if (kicker) body.append(el('span', 'tile-kicker', kicker));
  if (grade) body.append(el('span', 'tile-grade', t('grade.badge', { n: grade })));
  body.append(el('span', 'tile-title', title));
  if (sub) body.append(el('span', 'tile-sub', sub));
  btn.append(iconBox, body);
  if (badge) btn.append(el('span', 'tile-badge done', badge));
  return btn;
}

async function renderMenu() {
  $('greetWord').textContent = greetingWord();
  $('greetName').textContent = user ? user.full_name.split(' ')[0] : t('user.guest');

  const { assignments, done } = await loadProgress();
  // Сначала — невыполненное задание учителя с ближайшим сроком, потом — следующая работа по порядку
  const todo = assignments.filter((a) => !done.has(a.lesson_id))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0];
  const assigned = todo ? ALL_LESSONS.findIndex((l) => l.id === todo.lesson_id) : -1;
  const next = assigned >= 0 ? assigned : ALL_LESSONS.findIndex((l) => !done.has(l.id));
  renderBanner(next, assigned >= 0);
  // Задание из конструктора: в ALL_LESSONS его нет — баннер ведёт прямо в работу учителя
  const customTodo = todo && user?.class ? constructorUi.byId(todo.lesson_id) : null;
  if (customTodo) {
    $('bannerTitle').textContent = t('banner.assigned');
    $('bannerSub').textContent = t('cn.bannerSub', { subject: tr(SUBJECT_BY_ID[customTodo.subject].name), title: tr(customTodo.title) });
    $('bannerBtn').textContent = t('banner.do');
    $('bannerBtn').onclick = () => openLesson(customTodo);
  }
  live.renderMenu($('banner'));
  gradeFilter = loadGradeFilter();
  renderSubjects(done);
}

// Раздел выбранного в навигации предмета. Отдельно от renderMenu: смена класса в фильтре
// перерисовывает только его, без повторной загрузки прогресса из сети.
function renderSubjects(done) {
  lastDone = done;
  $('subjectSections').replaceChildren(...SUBJECTS.filter((s) => s.id === subject).map((s) => {
    const section = el('section', 'subject-section');
    section.id = `subject-${s.id}`;
    section.style.setProperty('--c', s.color);
    section.style.setProperty('--soft', s.soft);

    // Внутри тем остаются только работы выбранного класса; тема без них скрывается целиком
    const topics = TOPICS[s.id].map((topic) => ({
      ...topic,
      lessons: topic.lessons.filter((id) => matchesGrade(LESSON_BY_ID[id].grade)),
      sims: (topic.sims ?? []).filter((id) => matchesGrade(SIM_GRADE[id])),
    })).filter((topic) => topic.lessons.length || topic.sims.length);
    const lessonCount = topics.reduce((sum, topic) => sum + topic.lessons.length, 0);
    const head = el('div', 'subject-head');
    head.append(el('span', 'subject-tag', tr(s.name)));
    // «0 работ · 0 тем» ничего не объясняет — для пустого класса ниже есть отдельное сообщение
    if (lessonCount) head.append(el('span', 'subject-meta', t('dash.subjectMeta', { works: plural(lessonCount, 'n.work'), topics: plural(topics.length, 'n.topic') })));
    const filter = gradeFilterControl(gradeFilter, (g) => {
      gradeFilter = g;
      saveGradeFilter(g);
      // Номер открытой темы относится к прежнему списку тем — после фильтра он указал бы на другую
      openTopics[s.id] = null;
      renderSubjects(lastDone);
      document.querySelector('#subjectSections .grade-chip[aria-pressed="true"]')?.focus();
    });

    // Сначала только список тем; работы темы появляются по нажатию на неё.
    const entries = [
      ...topics.map((topic) => ({
        name: tr(topic.name),
        // Иконка темы подбирается по русскому названию из каталога
        icon: topic.name,
        meta: plural(topic.lessons.length, 'n.work'),
        done: topic.lessons.filter((id) => done.has(id)).length,
        total: topic.lessons.length,
        tiles: () => topicTiles(topic, done),
      })),
      ...customEntry(s.id, done),
      {
        name: t('dash.tools'),
        icon: 'tools',
        meta: t('dash.toolsMeta'),
        tiles: () => [
          ...(s.id === 'chemistry' ? [] : freeLabTiles(s.id)),
          ...(TOOLS[s.id] ?? []).filter((f) => !f.teacherTool || user?.role !== 'student').map((f) => tile({ title: f.title, sub: f.sub, icon: f.icon, thumb: f.thumb, onClick: f.open, className: f.ai ? 'free ai' : 'free' })),
        ],
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
      iconBox.innerHTML = topicIcon(e.icon);
      if (iconBox.firstElementChild.tagName === 'IMG') iconBox.classList.add('has-img');
      const body = el('span', 'tile-body');
      body.append(el('span', 'tile-title', e.name), el('span', 'tile-sub', e.total ? t('dash.topicMeta', { meta: e.meta, done: e.done }) : e.meta));
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
        // Когда у класса есть только «Инструменты», подсказка «выберите тему» лишняя
        detail.replaceChildren(...(lessonCount ? [el('p', 'topic-empty', t('dash.pickTopic'))] : []));
        return;
      }
      const tiles = el('div', 'tiles');
      tiles.append(...entries[k].tiles());
      detail.replaceChildren(el('h3', 'topic-title', entries[k].name), tiles);
    }
    showTopic();

    section.append(head, filter);
    if (gradeFilter !== 'all' && !lessonCount) {
      section.append(el('p', 'grade-empty', t('grade.empty', { subject: tr(s.name), n: gradeFilter })));
    }
    section.append(grid, detail);
    const soon = soonBlock(s.id, lessonCount);
    if (soon) section.append(soon);
    return section;
  }));
  tour.maybeStart('menu', MENU_TOUR);
}

// ---------- Аккаунт ученика ----------

async function openAccount() {
  if (user?.role === 'teacher') return openTeacher();
  // Имя — до show(): фокус переходит на заголовок, и скринридер должен сразу его прочитать
  $('profileName').textContent = user?.full_name ?? t('user.guestName');
  show('account', t('acc.crumb'));
  const { progress, assignments, results, error } = await loadProgress();
  renderAccount(progress, assignments, results);
  // Иначе сбой сети выглядел бы как потерянный прогресс
  if (error) accountError(t('acc.loadFail', { error }));
}

// Номер — логин для входа. Середину скрываем: за школьным компьютером экран видят соседи.
function maskPhone(digits) {
  if (!/^7\d{10}$/.test(digits ?? '')) return null;
  return `+7 ${digits.slice(1, 4)} *** ** ${digits.slice(9)}`;
}

// Имя и фамилия при регистрации вводятся одним полем «Имя и фамилия» — первое слово считаем именем
function renderProfileFacts(dl) {
  const [first, ...rest] = user.full_name.split(' ');
  const teacher = user.role === 'teacher';
  const role = t(teacher ? 'role.teacher' : 'role.student');
  const facts = [
    [t('fact.firstName'), first],
    [t('fact.lastName'), rest.join(' ') || '—'],
    [t('fact.role'), role[0].toUpperCase() + role.slice(1)],
    [t(teacher ? 'fact.gradeTeacher' : 'fact.grade'), user.grade],
    ...(teacher ? [] : [[t('fact.class'), user.class ? user.class.name : t('fact.noClass')]]),
    [t('fact.phone'), maskPhone(user.phone)],
    [t('fact.since'), user.created_at ? new Date(user.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null],
  ];
  dl.replaceChildren(...facts.filter(([, value]) => value).map(([label, value]) => {
    const row = el('div', 'profile-fact');
    row.append(el('dt', '', label), el('dd', '', value));
    return row;
  }));
}

function accountError(msg) {
  const p = document.querySelector('.account-error');
  p.hidden = !msg;
  p.textContent = msg ?? '';
}

function renderAccount(p, assignments, results) {
  accountError(null);
  $('profileAvatar').innerHTML = PERSON_ICON;
  $('profileName').textContent = user?.full_name ?? t('user.guestName');
  $('profileMeta').textContent = user
    ? t('acc.meta', { grade: user.grade, cls: user.class ? t('acc.metaClass', { name: user.class.name }) : t('acc.metaNoClass') })
    : t('acc.demo');
  $('profileInfo').hidden = !user;
  if (user) renderProfileFacts($('profileFacts'));
  $('accJoinForm').hidden = !user || !!user.class;
  $('leaveClassBtn').hidden = !user?.class;
  $('profileLogin').hidden = !!user;
  live.renderAccount(document.querySelector('#account .profile-card'));

  const inLevel = p.xp - p.from;
  $('levelNum').textContent = String(p.level);
  $('levelTitle').textContent = titleOf(p.level);
  $('xpText').textContent = plural(p.xp, 'n.point');
  $('xpBar').style.width = `${Math.round((inLevel / (p.to - p.from)) * 100)}%`;
  $('xpNext').textContent = t('acc.xpNext', { level: p.level + 1, points: plural(p.to - p.xp, 'n.point') });
  $('doneCount').textContent = String(p.done.size);
  $('doneTotal').textContent = t('acc.outOf', { n: ALL_LESSONS.length });
  $('streak').textContent = String(p.streak);

  $('checklist').replaceChildren(...SUBJECTS.map((s) => {
    const { done, total } = p.subjects[s.id] ?? { done: 0, total: 0 };
    const li = el('li', 'subject-progress');
    li.style.setProperty('--c', s.color);
    const bar = el('div', 'progress');
    const fill = el('div', 'progress-bar');
    fill.style.width = `${total ? (done / total) * 100 : 0}%`;
    bar.append(fill);
    const head = el('div', 'subject-progress-head');
    head.append(el('span', 'subject-dot'), el('span', '', tr(s.name)), el('span', 'muted', t('acc.doneOf', { done, total })));
    li.append(head, bar);
    return li;
  }));

  // Задания от учителя
  const card = $('assignmentsCard');
  card.hidden = !user?.class;
  if (user?.class) {
    const open = assignments.filter((a) => !p.done.has(a.lesson_id)).length;
    $('assignCount').textContent = assignments.length ? t('acc.left', { open, total: assignments.length }) : '';
    $('assignmentList').replaceChildren(...(assignments.length ? assignments.map((a) => {
      const i = ALL_LESSONS.findIndex((l) => l.id === a.lesson_id);
      const l = ALL_LESSONS[i] ?? constructorUi.byId(a.lesson_id);
      if (!l) return el('span');
      const st = assignmentStatus(a, p.done);
      const row = el('button', `assignment ${st.key}`);
      row.type = 'button';
      row.onclick = () => openLesson(i >= 0 ? i : l);
      const subj = SUBJECT_BY_ID[l.subject];
      const dot = el('span', 'subject-dot');
      dot.style.background = subj.color;
      const text = el('span', 'assignment-text');
      text.append(el('b', '', tr(l.short ?? l.title)), el('span', 'muted small', l.custom ? `${tr(subj.name)} · ${t('cn.badge')}` : t('acc.assignmentMeta', { subject: tr(subj.name), n: l.number })));
      row.append(dot, text, el('span', `status ${st.key}`, st.text));
      return row;
    }) : [el('p', 'muted small', t('acc.noAssignments'))]));
  }

  // Достижения
  $('badgeCount').textContent = t('acc.badgeCount', { got: p.badges.filter((b) => b.got).length, total: p.badges.length });
  // Значки, а не список из десяти строк: название под иконкой, условие — по нажатию.
  // Статус словами остаётся в имени кнопки — для экранного диктора и без цветового зрения
  $('badgeGrid').replaceChildren(...p.badges.map((b) => {
    const status = t(b.got ? 'acc.got' : 'acc.notGot');
    const item = el('button', `badge-item ${b.got ? 'got' : 'locked'}`);
    item.type = 'button';
    item.title = `${b.desc} — ${status}`;
    item.setAttribute('aria-label', `${b.name}. ${b.desc}. ${status}`);
    const icon = el('span', 'badge-icon');
    icon.innerHTML = lineIcon(b.icon);
    item.append(icon, el('span', 'badge-name', b.name));
    item.onclick = () => toast(`${b.name}: ${b.desc} — ${status}`);
    return item;
  }));

  // История: последние попытки, новые сверху
  // Работы, пройденные до появления журнала, подставлены с датой 1970 года — в истории им не место
  const rows = [...results].filter((r) => new Date(r.completed_at).getTime() > 0).reverse().slice(0, 30);
  if (!rows.length) {
    const empty = el('div', 'empty-state');
    empty.append(mascot('study', 180), el('p', 'muted small', t('acc.emptyHistory')));
    $('historyTable').replaceChildren(empty);
    return;
  }
  const table = el('table', 'journal-table history-table');
  const head = table.createTHead().insertRow();
  for (const key of ['acc.colDate', 'acc.colWork', 'acc.colQuestions', 'acc.colHyp', 'acc.colPoints']) head.append(el('th', '', t(key)));
  const body = table.createTBody();
  for (const r of rows) {
    const l = findLesson(r.lesson_id);
    const subj = l && SUBJECT_BY_ID[l.subject];
    const row = body.insertRow();
    row.insertCell().textContent = new Date(r.completed_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    row.insertCell().textContent = l ? `${subj.short}${lessonNo(l)}. ${tr(l.short ?? l.title)}` : r.lesson_id;
    const q = row.insertCell();
    q.textContent = `${r.q_ok}/${r.q_total}`;
    q.className = r.q_ok === r.q_total ? 'ok' : 'no';
    row.insertCell().textContent = `${r.hyp_ok}/${r.hyp_total}`;
    row.insertCell().textContent = String(attemptXp(r));
  }
  const wrap = el('div', 'table-wrap');
  wrap.append(table);
  $('historyTable').replaceChildren(wrap);
}

$('accountBtn').addEventListener('click', () => openAccount());
$('profileLogin').addEventListener('click', () => show('auth'));

$('accJoinForm').addEventListener('submit', withBusy($('accJoinForm'), async (fd) => {
  const code = String(fd.get('code')).trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return accountError(t('join.bad'));
  const res = await account.joinClass(code);
  if (!res.ok) return accountError(res.error);
  setUser(res.value);
  toast(t('join.ok', { name: res.value.class?.name ?? '' }));
  await openAccount();
}));

$('leaveClassBtn').addEventListener('click', () => {
  confirmAction(t('acc.leaveConfirm', { name: user.class?.name ?? '' }), t('acc.leaveYes'), async () => {
    const res = await account.leaveClass();
    if (!res.ok) return accountError(res.error);
    if (res.value) setUser(res.value);
    await openAccount();
  });
});

// Открытая тема в каждом предмете: сохраняется, пока ученик переходит между работами и дашбордом.
const openTopics = {};

// ---------- Классы 7–11 ----------

const GRADE_KEY = 'ai-stem-lab:grade-filter';
const LESSON_BY_ID = Object.fromEntries(ALL_LESSONS.map((l) => [l.id, l]));
// Сколько работ класса в предмете считаем «мало»: тогда ниже показываем, что готовится по программе
const FEW_WORKS = 3;
let gradeFilter = 'all'; // 'all' или номер класса 7–11
let lastDone = new Set();
let gradeControlSeq = 0;

const matchesGrade = (grade) => gradeFilter === 'all' || grade === gradeFilter;

// Выбор храним отдельно для каждого, кто входит с этого браузера: за одним школьным компьютером
// по очереди сидят ученики разных классов, и чужой выбор не должен становиться их фильтром.
function readGradeStore() {
  try {
    const store = JSON.parse(localStorage.getItem(GRADE_KEY) ?? '{}');
    return store && typeof store === 'object' && !Array.isArray(store) ? store : {};
  } catch {
    return {};
  }
}

function loadGradeFilter() {
  const saved = readGradeStore()[user?.id ?? 'guest'];
  if (saved === 'all' || GRADES.includes(saved)) return saved;
  // У учителя в поле класса — название его класса, у гостя класса нет: им по умолчанию «Все»
  return (user?.role === 'student' && parseGrade(user.grade)) || 'all';
}

function saveGradeFilter(value) {
  try {
    localStorage.setItem(GRADE_KEY, JSON.stringify({ ...readGradeStore(), [user?.id ?? 'guest']: value }));
  } catch {
    // Без хранилища выбор действует до перезагрузки страницы.
  }
}

// Переключатель «Класс: Все · 7 … 11». Кнопки с aria-pressed, как вкладки предметов в шапке:
// выбор применяется сразу, без отдельного подтверждения.
function gradeFilterControl(value, onChange) {
  const wrap = el('div', 'grade-filter');
  const label = el('span', 'grade-filter-label', t('grade.label'));
  label.id = `grade-filter-label-${++gradeControlSeq}`;
  const group = el('div', 'grade-filter-options');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  group.append(...['all', ...GRADES].map((g) => {
    const b = el('button', 'grade-chip', g === 'all' ? t('grade.all') : String(g));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(g === value));
    // Одна цифра на кнопке скринридеру ничего не скажет
    if (g !== 'all') b.setAttribute('aria-label', t('grade.badge', { n: g }));
    b.onclick = () => onChange(g);
    return b;
  }));
  wrap.append(label, group);
  return wrap;
}

// «Скоро»: настоящие разделы программы выбранного класса, для которых работ ещё нет.
// Это честный план, а не заглушки с выдуманным содержимым, — поэтому плитки не нажимаются.
function soonBlock(subjectId, lessonCount) {
  if (gradeFilter === 'all' || lessonCount >= FEW_WORKS) return null;
  const planned = ROADMAP.filter((r) => r.subject === subjectId && r.grade === gradeFilter);
  if (!planned.length) return null;
  const list = el('ul', 'tiles soon-tiles');
  list.append(...planned.map((r) => {
    const item = el('li', 'tile soon');
    item.setAttribute('aria-disabled', 'true');
    const body = el('span', 'tile-body');
    const meta = el('span', 'soon-meta');
    meta.append(el('span', 'tile-grade', t('grade.badge', { n: r.grade })), el('span', 'soon-badge', t('grade.soon')));
    body.append(meta, el('span', 'tile-title', tr(r.title)));
    item.append(body);
    return item;
  }));
  const box = el('div', 'soon-block');
  box.append(el('h3', 'topic-title', t('grade.soonTitle', { n: gradeFilter })), el('p', 'soon-note', t('grade.soonNote')), list);
  return box;
}

// Работа по id: встроенная или из конструктора учителя (загруженная с заданиями или своими работами)
const findLesson = (id) => LESSON_BY_ID[id] ?? constructorUi.byId(id);
// У работ учителя нет номера в программе — вместо него короткая пометка «ИИ»
const lessonNo = (l) => l.number ?? t('cn.mark');

// «От учителя»: работы из конструктора — ученику назначенные классу, гостю сохранённые в этом браузере.
// Отдельной темой рядом с темами предмета, чтобы их не приходилось искать в программе.
function customEntry(subjectId, done) {
  const list = constructorUi.forSubject(subjectId, lastAssignments.map((a) => a.lesson_id))
    .filter((l) => matchesGrade(l.grade));
  if (!list.length) return [];
  return [{
    name: t('cn.fromTeacher'),
    icon: 'tools',
    meta: plural(list.length, 'n.work'),
    done: list.filter((l) => done.has(l.id)).length,
    total: list.length,
    tiles: () => list.map((l) => tile({
      kicker: t('cn.badge'), grade: l.grade, title: l.short ?? l.title, sub: l.topic, thumb: () => lessonPreview(l),
      badge: done.has(l.id) ? t('dash.done') : '', onClick: () => openLesson(l), className: 'custom',
    })),
  }];
}

function topicTiles(topic, done) {
  const tiles = topic.lessons.map((lessonId) => {
    const i = ALL_LESSONS.findIndex((l) => l.id === lessonId);
    const l = ALL_LESSONS[i];
    return tile({
      kicker: t('dash.workNo', { n: l.number }), grade: l.grade, title: tr(l.short ?? l.title), sub: tr(l.topic), thumb: () => lessonPreview(l),
      badge: done.has(l.id) ? t('dash.done') : '', onClick: () => openLesson(i),
    });
  });
  for (const simId of topic.sims ?? []) {
    const def = SIMS[simId];
    tiles.push(tile({
      kicker: t('dash.freeExp'), title: tr(def.freeTitle), sub: tr(def.freeSub), thumb: () => simPreview(simId),
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
    $('bannerTitle').textContent = t('banner.demoTitle');
    $('bannerSub').textContent = t('banner.demoSub');
    btn.textContent = t('banner.login');
    btn.onclick = () => show('auth');
  } else if (user.role === 'teacher') {
    $('bannerTitle').textContent = t('banner.teacherTitle');
    $('bannerSub').textContent = t('banner.teacherSub');
    btn.textContent = t('banner.myClasses');
    btn.onclick = openTeacher;
  } else if (!user.class) {
    $('bannerTitle').textContent = t('banner.joinTitle');
    $('bannerSub').textContent = t('banner.joinSub');
    $('joinForm').hidden = false;
    btn.hidden = true;
  } else if (next >= 0) {
    const l = ALL_LESSONS[next];
    $('bannerTitle').textContent = t(assigned ? 'banner.assigned' : next === 0 ? 'banner.start' : 'banner.continue');
    $('bannerSub').textContent = t('banner.lesson', { prefix: assigned ? '' : t('banner.nextWork'), subject: tr(SUBJECT_BY_ID[l.subject].name), n: l.number, title: tr(l.title) });
    btn.textContent = t(assigned ? 'banner.do' : next === 0 ? 'banner.startBtn' : 'banner.continueBtn');
    btn.onclick = () => openLesson(next);
  } else {
    $('bannerTitle').textContent = t('banner.allDone');
    $('bannerSub').textContent = t('banner.allDoneSub');
    btn.textContent = t('banner.openLab');
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
  $('gradeLabel').textContent = t(teacher ? 'auth.gradeTeacher' : 'auth.grade');
}

$('loginForm').addEventListener('submit', withBusy($('loginForm'), async (fd) => {
  formError($('loginForm'), null);
  const res = await account.login(fd.get('phone'), fd.get('password'));
  if (!res.ok) return formError($('loginForm'), res.error);
  if (!res.value) return formError($('loginForm'), t('auth.noProfile'));
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
  if (!/^[A-Z0-9]{6}$/.test(code)) return formError(box, t('join.bad'));
  const res = await account.joinClass(code);
  if (!res.ok) return formError(box, res.error);
  setUser(res.value);
  renderMenu();
  toast(t('join.ok', { name: res.value.class?.name ?? '' }));
}));

$('logoutBtn').addEventListener('click', async () => {
  await resetBench();
  await account.logout();
  constructorUi.reset();
  setUser(null);
  show('auth');
});

// ---------- Учитель ----------

let teacherClasses = [];
let activeClassId = null;

async function openTeacher() {
  renderProfileFacts($('teacherFacts'));
  show('teacher', t('teacher.title'));
  // Работы из конструктора нужны до таблиц: они бывают среди заданий и в списке для назначения
  await constructorUi.loadOwn();
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
  if (!teacherClasses.length) $('classTabs').replaceChildren(el('p', 'muted', t('teacher.noClasses')));
}

async function renderClassPanel() {
  const k = teacherClasses.find((x) => x.id === activeClassId);
  $('classPanel').hidden = !k;
  if (!k) return;
  $('classCode').textContent = k.code;
  $('classTable').replaceChildren(el('p', 'muted', t('teacher.loading')));

  const [res, asg] = await Promise.all([account.loadClassResults(k.id), account.loadClassAssignments(k.id)]);
  if (!res.ok) return teacherError(res.error);
  if (!asg.ok) return teacherError(asg.error);
  const { students, results } = res.value;
  const assignments = asg.value;
  live.renderTeacherCard($('classPanel'), k, students, assignments);
  const doneBy = (sid, lid) => results.some((r) => r.user_id === sid && r.lesson_id === lid);

  // Сводка: доля выполненных назначенных работ по всем ученикам
  const cells = students.length * assignments.length;
  const doneCells = assignments.reduce((sum, a) => sum + students.filter((s) => doneBy(s.id, a.lesson_id)).length, 0);
  $('statStudents').textContent = String(students.length);
  $('statAssigned').textContent = String(assignments.length);
  $('statCompletion').textContent = cells ? `${Math.round((doneCells / cells) * 100)}%` : '—';

  renderAssignPicker(k, assignments);

  // Таблица заданий
  if (!assignments.length) {
    $('assignTable').replaceChildren(el('p', 'muted small', t('teacher.noTasks')));
  } else {
    $('assignTable').replaceChildren(...assignments.map((a) => {
      const l = findLesson(a.lesson_id);
      const n = students.filter((s) => doneBy(s.id, a.lesson_id)).length;
      const row = el('div', 'assign-row');
      const subj = SUBJECT_BY_ID[l?.subject] ?? SUBJECTS[0];
      const dot = el('span', 'subject-dot');
      dot.style.background = subj.color;
      const info = el('span', 'assignment-text');
      info.append(el('b', '', l ? `${subj.short}${lessonNo(l)}. ${tr(l.short ?? l.title)}` : a.lesson_id), el('span', 'muted small', a.due_date ? t('teacher.due', { date: new Date(`${a.due_date}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) }) : t('teacher.noDue')));
      const bar = el('div', 'progress mini-bar');
      const fill = el('div', 'progress-bar');
      fill.style.width = students.length ? `${(n / students.length) * 100}%` : '0%';
      bar.append(fill);
      const del = el('button', 'ghost small', t('teacher.unassign'));
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
    $('classTable').replaceChildren(el('p', 'muted', t('teacher.noStudents', { code: k.code })));
    return;
  }
  const columns = assignments.length ? assignments.map((a) => findLesson(a.lesson_id)).filter(Boolean) : ALL_LESSONS;
  const table = el('table', 'journal-table');
  const head = table.createTHead().insertRow();
  head.append(el('th', '', t('teacher.colStudent')), el('th', '', t('teacher.colLevel')));
  for (const l of columns) {
    const subj = SUBJECT_BY_ID[l.subject];
    const th = el('th', 'subject-th', `${subj.short}${lessonNo(l)}`);
    th.title = `${tr(subj.name)}: ${tr(l.title)}`;
    th.style.color = subj.color;
    head.append(th);
  }
  head.append(el('th', '', ''));
  const body = table.createTBody();
  for (const s of students) {
    const mine = results.filter((r) => r.user_id === s.id);
    const p = computeProgress(mine, ALL_LESSONS, assignments);
    const row = body.insertRow();
    row.insertCell().textContent = s.full_name;
    row.insertCell().textContent = t('teacher.levelCell', { level: p.level, xp: p.xp });
    for (const l of columns) {
      const last = mine.filter((r) => r.lesson_id === l.id).at(-1);
      const td = row.insertCell();
      if (!last) {
        const a = assignments.find((x) => x.lesson_id === l.id);
        const late = a && assignmentStatus(a, new Set()).key === 'late';
        td.textContent = late ? t('teacher.late') : '—';
        td.className = late ? 'no' : 'empty-cell';
        continue;
      }
      td.textContent = `${last.q_ok}/${last.q_total}`;
      td.className = last.q_ok === last.q_total ? 'ok' : 'no';
      td.title = t('teacher.cellTitle', { q: `${last.q_ok}/${last.q_total}`, h: `${last.hyp_ok}/${last.hyp_total}`, date: new Date(last.completed_at).toLocaleString(locale) });
    }
    const act = row.insertCell();
    const rm = el('button', 'ghost small', t('teacher.remove'));
    rm.type = 'button';
    rm.onclick = () => confirmAction(t('teacher.removeConfirm', { name: s.full_name }), t('teacher.remove'), async () => {
      const r = await account.removeStudent(s.id);
      if (!r.ok) return teacherError(r.error);
      await renderClassPanel();
    });
    act.append(rm);
  }
  const wrap = el('div', 'table-wrap');
  wrap.append(table);
  const legend = el('p', 'muted small', assignments.length
    ? t('teacher.legendAssigned')
    : t('teacher.legendAll'));
  $('classTable').replaceChildren(wrap, legend);
}

// Выбор работы для назначения: только ещё не назначенные, по предметам и с фильтром по классу.
// Фильтр по умолчанию берётся из названия класса («8Б» → 8), чтобы учитель сразу видел работы своей параллели.
const teacherGrade = {};

function renderAssignPicker(k, assignments) {
  const grade = teacherGrade[k.id] ?? parseGrade(k.name) ?? 'all';
  const fits = (l) => (grade === 'all' || l.grade === grade) && !assignments.some((a) => a.lesson_id === l.id);
  const control = gradeFilterControl(grade, (g) => {
    teacherGrade[k.id] = g;
    renderAssignPicker(k, assignments);
    document.querySelector('#assignGrade .grade-chip[aria-pressed="true"]')?.focus();
  });
  control.id = 'assignGrade';
  const old = $('assignGrade');
  if (old) old.replaceWith(control);
  else $('assignForm').before(control);

  const groups = SUBJECTS.map((s) => {
    const g = document.createElement('optgroup');
    g.label = tr(s.name);
    ALL_LESSONS.filter((l) => l.subject === s.id && fits(l))
      .forEach((l) => g.append(new Option(t(grade === 'all' ? 'teacher.optionGrade' : 'teacher.option', { n: l.number, title: tr(l.short ?? l.title), grade: l.grade }), l.id)));
    return g;
  }).filter((g) => g.children.length);
  // Свои работы из конструктора — отдельной группой, по тому же фильтру класса
  const custom = constructorUi.ownRows().filter((r) => (grade === 'all' || r.grade === grade) && !assignments.some((a) => a.lesson_id === r.lesson_id));
  if (custom.length) {
    const g = document.createElement('optgroup');
    g.label = t('cn.fromAi');
    custom.forEach((r) => g.append(new Option(r.title, r.lesson_id)));
    groups.push(g);
  }
  const placeholder = t(groups.length || grade === 'all' ? 'teacher.pickWork' : 'teacher.noWorksForGrade', { n: grade });
  document.querySelector('#assignForm select').replaceChildren(new Option(placeholder, ''), ...groups);
}

// Подтверждение опасных действий внутри страницы (без системных диалогов)
function confirmAction(text, yesLabel, onYes, danger = true) {
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yesLabel;
  $('confirmYes').classList.toggle('danger-bg', danger);
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
  toast(t('teacher.created', { name, code: r.value?.code ?? '' }));
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
    toast(t('teacher.copied'));
  } catch {
    toast(t('teacher.codeIs', { code: $('classCode').textContent }));
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

$('newCodeBtn').addEventListener('click', () => {
  const k = teacherClasses.find((x) => x.id === activeClassId);
  if (!k) return;
  confirmAction(t('teacher.newCodeConfirm', { name: k.name }), t('teacher.newCodeYes'), async () => {
    const r = await account.regenerateCode(k.id);
    if (!r.ok) return teacherError(r.error);
    await loadTeacher();
    toast(t('teacher.newCodeDone', { code: r.value }));
  }, false);
});

$('deleteClass').addEventListener('click', () => {
  const k = teacherClasses.find((x) => x.id === activeClassId);
  if (!k) return;
  confirmAction(t('teacher.deleteConfirm', { name: k.name }), t('confirm.delete'), async () => {
    const r = await account.deleteClass(k.id);
    if (!r.ok) return teacherError(r.error);
    activeClassId = null;
    await loadTeacher();
  });
});

// ---------- Стол ----------

function handlePick(id) {
  if (bench.isBusy()) return toast(t('work.busy'));
  if (mode === 'lesson') lesson?.handlePick(id);
  else if (mode === 'sandbox') sandbox.handlePick(id);
  else if (mode === 'mission') missions.handlePick(id);
}

function setTemperature(t) {
  $('temp').value = t;
  $('tempValue').textContent = t;
  bench.setTemperature(t);
}

// Подсказка под сценой (не поверх картинки): при наведении — название реактива.
const CHEM_HINT = t('work.chemHint');
function showHover(id) {
  const item = id ? SHELF_BY_ID[id] : null;
  $('hint').textContent = item
    ? `${tr(SUBSTANCES[item.substance].name)}${item.concentration ? t('work.concentratedHint') : ''}`
    : CHEM_HINT;
}

function showSimHint(def) {
  $('simHint').hidden = !def.hint;
  $('simHint').textContent = tr(def.hint) ?? '';
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
      // Язык интерфейса уходит в каждый запрос к ИИ: на нём сервер и ответит
      body: JSON.stringify({ ...body, lang }),
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

// Опрос на закрепление по итогам работы; null — ИИ недоступен, работа сама соберёт запасной опрос.
// Работу учителя сервер не хранит — она уходит вместе с id, сервер перепроверит её (server/handlers.js)
async function lessonQuiz(lessonId, customLesson = null) {
  const res = await postJson('/api/quiz', { lessonId, ...(customLesson && { lesson: customLesson }) });
  return res.ok && Array.isArray(res.data.questions) ? res.data.questions : null;
}

// Вопрос ИИ об опыте на симуляции; если ИИ недоступен — теория из описания симуляции.
async function askSim(simId, params, question) {
  const res = await postJson('/api/ask', { simId, params, question });
  if (res.ok && typeof res.data.text === 'string') return res.data.text;
  const def = SIMS[simId];
  return t('work.aiOffline', { describe: tr(def.describe(params)), theory: tr(def.theory) });
}

async function answerSim(question) {
  if (!simCtrl) return;
  const box = $('simAnswer');
  box.hidden = false;
  box.textContent = t('work.thinking');
  box.textContent = await askSim(simCtrl.def.id, { ...simCtrl.params }, question);
}

$('simAskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('simQuestion').value.trim();
  if (q) answerSim(q);
});
$('simExplainBtn').addEventListener('click', () => answerSim(''));

// Плавающему чату отдаём только «что открыто сейчас»: предмет и, если это симуляция, её параметры.
// Сервер сам пересчитает показания по описанию опыта.
function chatContext() {
  if (screen !== 'workspace') return { subject: activeSubject() };
  const lessonId = currentLessonId ?? undefined;
  if (simCtrl) return { subject: currentSubject, simId: simCtrl.def.id, params: { ...simCtrl.params }, lessonId };
  // Миссия: содержимое стола не отправляем — по нему ассистент узнал бы неизвестные вещества
  if (mode === 'mission') return { subject: 'chemistry', mission: true };
  // Химия: работа или свободная лаборатория — ассистенту важно, что уже в стакане и как нагрето
  return { subject: currentSubject, lessonId, sandbox: mode === 'sandbox', bench: { contents: [...bench.state.contents], temperature: bench.state.temperature } };
}
// Для ответов без интернета: те же данные, что уходят ИИ, но целиком — ответ собирается в браузере
function offlineChatFacts() {
  if (screen !== 'workspace') return { subject: activeSubject() };
  if (simCtrl) return { subject: currentSubject, sim: { def: simCtrl.def, params: { ...simCtrl.params } } };
  if (mode === 'mission') return { mission: true };
  return { subject: currentSubject, lessonId: currentLessonId ?? undefined, bench: true, result: bench.state.result };
}
const chat = initChat({
  postJson,
  getContext: chatContext,
  screens: SCREENS.filter((id) => id !== 'auth'),
  answerOffline: (question) => answerOffline(question, offlineChatFacts(), { t, tr, lang }, offlineMemoryFor(chatContext())),
});

// Память офлайн-ответов своя у каждого опыта: в новом опыте Шоқан снова объясняет с начала
let offlineMemory = { key: null, memory: newMemory() };
function offlineMemoryFor(ctx) {
  const key = ctx.simId ?? ctx.lessonId ?? (ctx.sandbox ? 'sandbox' : ctx.mission ? 'mission' : 'menu');
  if (offlineMemory.key !== key) offlineMemory = { key, memory: newMemory() };
  return offlineMemory.memory;
}

// Те же реактивы, что на 3D-столе, но кнопками: для клавиатуры, экранных дикторов и слабых компьютеров.
function renderReagentBar(ids) {
  $('reagentBar').replaceChildren(el('span', 'reagent-bar-label', t('work.reagents')), ...ids.map((id) => {
    const item = SHELF_BY_ID[id];
    const b = el('button', 'reagent', item.kind === 'dish' ? tr(item.label) : `${tr(item.label)} ${tr(item.note)}`);
    b.type = 'button';
    b.setAttribute('aria-label', `${tr(SUBSTANCES[item.substance].name)}${item.concentration ? t('work.concentratedAria') : ''}`);
    b.onclick = () => handlePick(id);
    return b;
  }));
}

// Крупный текст: масштабирует весь интерфейс через размер шрифта корня.
const FONT_KEY = 'ai-stem-lab:large-text';
function setLargeText(on) {
  document.documentElement.classList.toggle('large-text', on);
  // Кнопка есть и в шапке, и в строке опыта (там шапки нет) — состояние у обеих общее
  for (const id of ['fontBtn', 'fontBtnWork']) $(id).setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem(FONT_KEY, on ? '1' : '');
  } catch {
    // Настройка просто не запомнится.
  }
}
for (const id of ['fontBtn', 'fontBtnWork']) $(id).addEventListener('click', () => setLargeText(!document.documentElement.classList.contains('large-text')));
try {
  setLargeText(localStorage.getItem(FONT_KEY) === '1');
} catch {
  setLargeText(false);
}

// Версия для слабовидящих — те же три места, что и у «A+»: шапка, строка опыта и меню на телефоне
initAccessibility(['lowVisionBtn', 'lowVisionBtnWork', 'menuLowVision']);

// Переключатель языка: смена перезагружает страницу (почему — см. src/i18n.js)
for (const b of document.querySelectorAll('.lang-switch [data-lang]')) {
  b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  b.addEventListener('click', () => setLang(b.dataset.lang));
}
$('langSelect').value = lang;
$('langSelect').addEventListener('change', (e) => setLang(e.target.value));

// ---------- Телефон: шапка как у приложения ----------
// На узком экране в шапке только логотип, «РУС ⌄» и меню ☰; аккаунт, крупный текст и выход — в меню.
// Предметы переезжают из шапки в отдельную строку под ней: в одной строке с кнопками им тесно.
const narrow = matchMedia('(max-width: 720px)');
function placeTopNav() {
  const nav = $('topNav');
  if (narrow.matches) document.querySelector('header.top').after(nav);
  else document.querySelector('header.top .brand').after(nav);
}
narrow.addEventListener('change', placeTopNav);
placeTopNav();

function setSiteMenu(open) {
  $('siteMenu').hidden = !open;
  $('menuBtn').setAttribute('aria-expanded', String(open));
  if (!open) return;
  // Меню отражает то же, что шапка на компьютере: нет аккаунта (экран входа) — нет и пунктов про него
  const signedIn = !$('userBox').hidden;
  $('menuAccount').hidden = !signedIn;
  $('menuLogout').hidden = !signedIn;
  $('menuAvatar').innerHTML = PERSON_ICON;
  $('menuName').textContent = $('userName').textContent;
  $('menuFont').setAttribute('aria-pressed', String(document.documentElement.classList.contains('large-text')));
  $('siteMenu').querySelector('.site-menu-item:not([hidden])')?.focus();
}
$('menuBtn').addEventListener('click', () => setSiteMenu($('siteMenu').hidden));
$('menuAccount').addEventListener('click', () => { setSiteMenu(false); $('accountBtn').click(); });
$('menuLogout').addEventListener('click', () => { setSiteMenu(false); $('logoutBtn').click(); });
$('menuFont').addEventListener('click', () => {
  setLargeText(!document.documentElement.classList.contains('large-text'));
  $('menuFont').setAttribute('aria-pressed', String(document.documentElement.classList.contains('large-text')));
});
document.addEventListener('click', (e) => {
  if (!$('siteMenu').hidden && !e.target.closest('#siteMenu, #menuBtn')) setSiteMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('siteMenu').hidden) {
    setSiteMenu(false);
    $('menuBtn').focus();
  }
});

// Клавиатура в лабораторной работе: Enter — «Далее» или действие шага, 1–4 — вариант ответа
document.addEventListener('keydown', (e) => {
  if (screen !== 'workspace' || !$('lessonSide') || $('lessonSide').hidden) return;
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
  const buttons = [...$('coach').querySelectorAll('button:not([disabled])')];
  if (e.key === 'Enter') {
    const next = buttons.find((b) => b.textContent === t('lesson.next')) ?? buttons.find((b) => b.classList.contains('primary'));
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

// ---------- Лендинг под экраном входа ----------

// Число работ, классы и темы берём из каталога, чтобы лендинг не расходился с программой при добавлении работ
// «7–9»: диапазон классов, в которых уже есть работы (классы подряд, пропусков в программе нет)
function gradeRange(grades) {
  const list = [...new Set(grades)].filter(Boolean).sort((a, b) => a - b);
  if (!list.length) return '';
  return list[0] === list.at(-1) ? String(list[0]) : `${list[0]}–${list.at(-1)}`;
}
{
  const covered = ALL_LESSONS.map((l) => l.grade);
  const soon = gradeRange(GRADES.filter((g) => !covered.includes(g)));
  $('landWorksNum').textContent = String(ALL_LESSONS.length);
  // Та же цифра в карточке входа — раньше она была вписана в разметку и отставала от каталога
  $('authWorksNum').textContent = String(ALL_LESSONS.length);
  $('authWorksText').textContent = plural(ALL_LESSONS.length, 'auth.point1n').replace(/^\d+\s*/, '');
  $('landWorksTitle').textContent = t(soon ? 'land.f2Soon' : 'land.f2Title', { range: gradeRange(covered), soon });
}
for (const card of document.querySelectorAll('.land-subject')) {
  const id = card.dataset.subject;
  const topics = TOPICS[id] ?? [];
  // Предмет без показанных работ (см. SHOWN_NEW_LABS в src/data/catalog.js) на лендинге не рекламируем
  if (!topics.length) { card.remove(); continue; }
  const works = topics.reduce((sum, topic) => sum + topic.lessons.length, 0);
  const range = gradeRange(ALL_LESSONS.filter((l) => l.subject === id).map((l) => l.grade));
  card.style.setProperty('--c', SUBJECT_BY_ID[id].color);
  card.querySelector('.land-subject-name').textContent = tr(SUBJECT_BY_ID[id].name);
  card.querySelector('.land-subject-count').textContent = range ? t('land.subjectCount', { works: plural(works, 'n.work'), range }) : plural(works, 'n.work');
  card.querySelector('.land-subject-topics').textContent = topics.slice(0, 3).map((topic) => tr(topic.name)).join(' · ');
}
// Та же гостевая кнопка, что и в карточке входа: логика гостевого режима живёт в одном месте
$('landGuestBtn').addEventListener('click', () => $('guestBtn').click());
$('landLoginBtn').addEventListener('click', () => {
  switchTab(false);
  const phone = $('loginForm').elements.phone;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  phone.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
  phone.focus({ preventScroll: true });
});
// Плавное появление при прокрутке. Класс reveal-on ставится только из JS и только без
// «уменьшения движения»: без скрипта или с этой настройкой блоки видны сразу.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      reveal.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  $('landing').classList.add('reveal-on');
  for (const node of $('landing').querySelectorAll('.reveal')) reveal.observe(node);
}

// ---------- Обучение и обратная связь ----------

const tour = createTour({ t });
const shown = (sel) => [...document.querySelectorAll(sel)].find((n) => n.getClientRects().length) ?? null;
// На телефоне аккаунт и настройки спрятаны в меню ☰ — показываем его вместо кнопок шапки
const MENU_TOUR = [
  { target: () => $('topNav'), title: t('tour.subjectsTitle'), text: t('tour.subjectsText') },
  { target: () => shown('#subjectSections .grade-filter'), title: t('tour.gradeTitle'), text: t('tour.gradeText') },
  { target: () => shown('#subjectSections .topic-card'), title: t('tour.topicTitle'), text: t('tour.topicText') },
  { target: () => shown('#bannerBtn'), title: t('tour.bannerTitle'), text: t('tour.bannerText') },
  { target: () => shown('.chat-fab'), title: t('tour.chatTitle'), text: t('tour.chatText') },
  { target: () => shown('#accountBtn'), title: t('tour.accountTitle'), text: t('tour.accountText') },
  { target: () => shown('#menuBtn'), title: t('tour.accountTitle'), text: t('tour.menuText') },
];
const LESSON_TOUR = [
  { target: () => shown('#lab, #simCanvas'), title: t('tour.sceneTitle'), text: t('tour.sceneText') },
  { target: () => shown('#lessonSide'), title: t('tour.coachTitle'), text: t('tour.coachText') },
  { target: () => shown('#reagentBar, #simControls'), title: t('tour.controlsTitle'), text: t('tour.controlsText') },
  { target: () => shown('#journalCard'), title: t('tour.journalTitle'), text: t('tour.journalText') },
  { target: () => shown('#backBtn'), title: t('tour.exitTitle'), text: t('tour.exitText') },
];
$('tourBtn').addEventListener('click', () => tour.start('menu', MENU_TOUR));

const feedback = initFeedback({ $, t, lang, toast, send: account.sendFeedback, currentScreen: () => screen });
$('footerFeedback').addEventListener('click', feedback.open);

$('footerYear').textContent = String(new Date().getFullYear());

// Ссылка на Instagram: пока адреса нет, колонку «Мы в соцсетях» не показываем
const INSTAGRAM_URL = '';
if (INSTAGRAM_URL) {
  $('instagramLink').href = INSTAGRAM_URL;
  $('footerSocial').hidden = false;
}

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
    notice.textContent = t('auth.notConfigured');
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

// ---------- Телефон: новый шаг всегда на виду ----------
// Сцена прилипает к верху, а карточка шага прокручивается под ней. Если ученик ушёл вниз к реактивам
// или регуляторам, новый шаг оказывался под сценой, и казалось, что ничего не произошло.
// При смене шага подводим карточку под сцену — только если её сейчас не видно.
new MutationObserver(() => {
  if (!narrow.matches || screen !== 'workspace' || $('lessonSide').hidden) return;
  const scene = (simCtrl ? $('simCanvas') : $('lab')).getBoundingClientRect();
  const card = $('lessonSide').getBoundingClientRect();
  const hiddenUnderScene = card.top < scene.bottom;
  const belowScreen = card.top > innerHeight - 120;
  if (!hiddenUnderScene && !belowScreen) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollBy({ top: card.top - scene.bottom - 8, behavior: smooth ? 'smooth' : 'auto' });
}).observe($('coach'), { childList: true });

// ---------- Во весь экран ----------

// Опыт можно открыть без панелей браузера и системы — на телефоне и на компьютере.
// iPhone это не разрешает сайтам (там полный экран даёт иконка на главном экране),
// поэтому кнопка есть, только где API работает.
if (document.fullscreenEnabled) {
  const btn = $('fullscreenBtn');
  btn.hidden = false;
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => toast(t('work.fullscreenFail')));
  });
  document.addEventListener('fullscreenchange', () => btn.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement))));
}

// ---------- Офлайн ----------

// На телефоне кэш качается в фоне несколько секунд. Без сообщения ученик не знает,
// когда можно выключать интернет, и думает, что офлайн-режим не работает.
registerSW({ onOfflineReady: () => toast(t('net.ready')) });

function syncOnline() { $('offlineBadge').hidden = navigator.onLine; }
addEventListener('online', syncOnline);
addEventListener('offline', syncOnline);
syncOnline();

// Только в режиме разработки: позволяет автотестам работать без мыши.
if (import.meta.env.DEV) {
  // tryLab('id') / tryFree('id') — открыть новую работу из src/data/labs до внесения в реестр
  const loadLab = async (id) => {
    const [sim, lesson, kk] = await Promise.all([
      import(/* @vite-ignore */ `/src/sims/${id}.js`),
      import(/* @vite-ignore */ `/src/data/labs/${id}.js`),
      import(/* @vite-ignore */ `/src/i18n/kk/labs/${id}.js`).catch(() => ({})),
    ]);
    addContent(kk.default ?? {}, kk.patterns ?? []);
    SIMS[sim.default.id] = sim.default;
    return lesson.default;
  };
  const tryLab = async (id) => openLesson(await loadLab(id));
  const tryFree = async (id) => {
    await loadLab(id);
    return openSimFree(id);
  };
  window.__lab = { tryLab, tryFree, constructor: constructorUi, sim: () => simCtrl, pick: handlePick, busy: () => bench.isBusy(), openLesson, openSandbox, openSimFree, setTemperature, openMission, missionState: () => missions.debug(), missionList: () => missions.showList() };
}
