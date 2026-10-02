// Детективные миссии: ученик опытами определяет неизвестные вещества в пробирках.
// Стол (bench) и сцена те же, что в свободной лаборатории; миссия только решает, что можно
// взять, ведёт журнал опытов и оценивает ответ. Верность ответа считается здесь, по движку
// (analyzeMission), — ИИ на сервере лишь комментирует рассуждение и на баллы не влияет.

import { SUBSTANCES } from './data/substances.js';
import { SHELF_BY_ID } from './data/shelf.js';
import {
  EXPLANATION_MAX, MAX_TESTS, MISSIONS, MISSION_BY_ID, OPTION_NAMES, analyzeMission, dealMission,
  missionScore, missionStats, observationCode, resultId, runTest, tubesOf,
} from './data/missions.js';
import { lang, tr } from './i18n.js';
import { play } from './sound.js';

// Строки миссий держим здесь, а не в общем src/i18n/ui.js: так модуль целиком свой
// и не конфликтует с правками словаря интерфейса.
const TEXT = {
  ru: {
    tile: 'Детективные миссии',
    tileSub: 'Определите неизвестное вещество опытом',
    listTitle: 'Детективные миссии',
    listLead: 'В пробирках — неизвестные вещества. Спланируйте опыты, запишите наблюдения и докажите, где что. Не больше {max} опытов на миссию.',
    close: 'Закрыть',
    grade: '{n} класс',
    level1: 'Лёгкая', level2: 'Средняя', level3: 'Сложная',
    tubesN: 'Образцов: {n}',
    tube: 'Пробирка {x}', dish: 'Чашка {x}',
    take: 'Взять пробу: {name}',
    counter: 'Опыты: {n} из {max}',
    current: 'Текущий опыт',
    emptyBeaker: 'Стакан пуст. Возьмите пробу из пробирки — это начнёт опыт.',
    finish: 'Записать опыт и вымыть стакан',
    notebook: 'Лабораторный журнал',
    notebookEmpty: 'Опыты записываются сюда автоматически.',
    onlySample: 'Только проба — реактив не добавлен',
    heated: 'нагрев до {t} °C',
    answerTitle: 'Ваш вывод',
    choose: '— выберите —',
    explain: 'Как вы это определили?',
    explainPh: 'Например: в пробирке A индикатор стал малиновым, значит…',
    submit: 'Проверить ответ',
    needSample: 'Сначала возьмите пробу из пробирки.',
    finishFirst: 'Сначала запишите текущий опыт.',
    limit: 'Лимит опытов исчерпан — сделайте вывод по журналу.',
    already: 'Этот реактив уже в стакане.',
    tooMany: 'В стакане уже два реактива — запишите опыт и начните новый.',
    pickAll: 'Выберите ответ для каждой пробирки.',
    done: 'Ответ уже проверен. Начните миссию заново.',
    resultTitle: 'Результат миссии',
    correct: 'Верно определено: {ok} из {total}',
    truth: 'на самом деле — {name}',
    proofFull: 'Доказательство полное: ваши опыты однозначно определяют ответ.',
    proofPart: 'Доказательство неполное: проведённые опыты не исключают других вариантов.',
    score: 'Баллы: {total} из {max} (ответы {base}, решающий опыт +{decisive}, экономия опытов +{saved})',
    feedback: 'Отзыв ИИ-ассистента',
    feedbackLoading: 'ИИ-ассистент читает ваш журнал…',
    feedbackOffline: 'ИИ-ассистент недоступен — разбор по данным журнала:',
    fbDecisive: 'Решающие опыты: {list}.',
    fbNoDecisive: 'Ни один из опытов не отличал вещества друг от друга — вывод сделан без доказательства.',
    fbWrong: '{tube}: на самом деле — {truth}, а не {answer}.',
    fbExtra: 'Для подтверждения можно было провести ещё опыт: {tube} + {reagents}{heat} — наблюдалось бы: {obs}',
    again: 'Пройти заново',
    toList: 'Другие миссии',
  },
  kk: {
    tile: 'Детективтік миссиялар',
    tileSub: 'Белгісіз затты тәжірибемен анықтаңыз',
    listTitle: 'Детективтік миссиялар',
    listLead: 'Сынауықтарда — белгісіз заттар. Тәжірибелерді жоспарлап, бақылауларды жазып, қайсысы қайда екенін дәлелдеңіз. Бір миссияға {max} тәжірибеден артық емес.',
    close: 'Жабу',
    grade: '{n}-сынып',
    level1: 'Жеңіл', level2: 'Орташа', level3: 'Күрделі',
    tubesN: 'Үлгілер: {n}',
    tube: 'Сынауық {x}', dish: 'Шыныаяқ {x}',
    take: 'Сынама алу: {name}',
    counter: 'Тәжірибелер: {n} / {max}',
    current: 'Ағымдағы тәжірибе',
    emptyBeaker: 'Стақан бос. Сынауықтан сынама алыңыз — тәжірибе осыдан басталады.',
    finish: 'Тәжірибені жазып, стақанды жуу',
    notebook: 'Зертханалық журнал',
    notebookEmpty: 'Тәжірибелер мұнда автоматты түрде жазылады.',
    onlySample: 'Тек сынама — реактив қосылмаған',
    heated: '{t} °C-қа дейін қыздыру',
    answerTitle: 'Сіздің қорытындыңыз',
    choose: '— таңдаңыз —',
    explain: 'Мұны қалай анықтадыңыз?',
    explainPh: 'Мысалы: A сынауығында индикатор таңқурай түсті болды, демек…',
    submit: 'Жауапты тексеру',
    needSample: 'Алдымен сынауықтан сынама алыңыз.',
    finishFirst: 'Алдымен ағымдағы тәжірибені жазыңыз.',
    limit: 'Тәжірибелер шегі таусылды — журнал бойынша қорытынды жасаңыз.',
    already: 'Бұл реактив стақанда бар.',
    tooMany: 'Стақанда екі реактив бар — тәжірибені жазып, жаңасын бастаңыз.',
    pickAll: 'Әр сынауық үшін жауап таңдаңыз.',
    done: 'Жауап тексерілді. Миссияны қайта бастаңыз.',
    resultTitle: 'Миссия нәтижесі',
    correct: 'Дұрыс анықталды: {ok} / {total}',
    truth: 'шын мәнінде — {name}',
    proofFull: 'Дәлелдеу толық: тәжірибелеріңіз жауапты бірмәнді анықтайды.',
    proofPart: 'Дәлелдеу толық емес: жүргізілген тәжірибелер басқа нұсқаларды жоққа шығармайды.',
    score: 'Ұпай: {total} / {max} (жауаптар {base}, шешуші тәжірибе +{decisive}, тәжірибе үнемі +{saved})',
    feedback: 'ЖИ-көмекшінің пікірі',
    feedbackLoading: 'ЖИ-көмекші журналыңызды оқып жатыр…',
    feedbackOffline: 'ЖИ-көмекші қолжетімсіз — журнал деректері бойынша талдау:',
    fbDecisive: 'Шешуші тәжірибелер: {list}.',
    fbNoDecisive: 'Тәжірибелердің ешқайсысы заттарды бір-бірінен ажыратпады — қорытынды дәлелсіз жасалды.',
    fbWrong: '{tube}: шын мәнінде — {truth}, {answer} емес.',
    fbExtra: 'Растау үшін тағы бір тәжірибе жасауға болатын еді: {tube} + {reagents}{heat} — байқалатыны: {obs}',
    again: 'Қайта өту',
    toList: 'Басқа миссиялар',
  },
};

export function mt(key, vars) {
  const value = TEXT[lang]?.[key] ?? TEXT.ru[key] ?? key;
  return vars ? value.replace(/\{(\w+)\}/g, (m, name) => (vars[name] ?? m)) : value;
}

const loc = (obj) => obj[lang] ?? obj.ru;
const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

function button(text, className, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.onclick = onClick;
  return b;
}

// Что увидел ученик — тексты движка, переведённые так же, как в свободной лаборатории.
function observationText(r) {
  if (r.status === 'need_more') return mt('onlySample');
  if (r.status === 'not_modeled') return tr(r.title);
  return r.observations.map(tr).join('; ');
}

const reagentLabel = (id) => {
  const item = SHELF_BY_ID[id];
  return `${tr(SUBSTANCES[item.substance].name)}${item.concentration ? ' (конц.)' : ''}`;
};

export function createMissions({ bench, lab, $, toast, postJson, saveResult, onStart }) {
  let m = null;
  let assignment = null;
  let tests = []; // записанные опыты: { tube, reagents, temperature, result }
  let current = null; // опыт в стакане: { tube, reagents }
  let submitted = false;
  let feedbackToken = 0;

  // Панель миссии живёт рядом с панелью свободной лаборатории — разметку index.html не трогаем.
  const side = el('div', 'ms-side');
  side.id = 'missionSide';
  side.hidden = true;
  $('sandboxSide').after(side);

  bench.onChange(() => {
    if (m && !submitted) renderCurrent();
  });

  const tubeName = (tube) => {
    const kind = SHELF_BY_ID[m.candidates[0]].kind;
    return mt(kind === 'dish' ? 'dish' : 'tube', { x: tube });
  };
  const usedTests = () => tests.length + (current ? 1 : 0);

  // ---------- Список миссий ----------

  let overlay = null;
  function showList() {
    overlay?.remove();
    overlay = el('div', 'ms-overlay');
    const box = el('div', 'ms-dialog');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'msListTitle');
    const h = el('h2', '', mt('listTitle'));
    h.id = 'msListTitle';
    const head = el('div', 'ms-dialog-head');
    const close = button('×', 'ghost small ms-close', hideList);
    close.setAttribute('aria-label', mt('close'));
    head.append(h, close);
    const list = el('div', 'ms-list');
    for (const mission of MISSIONS) {
      const card = button('', 'ms-card', () => {
        hideList();
        onStart(mission.id);
      });
      card.dataset.mission = mission.id;
      const badges = el('span', 'ms-badges');
      badges.append(
        el('span', 'ms-badge', mt('grade', { n: mission.grade })),
        el('span', `ms-badge ms-level-${mission.level}`, mt(`level${mission.level}`)),
        el('span', 'ms-badge ms-plain', mt('tubesN', { n: mission.tubes })),
      );
      card.append(el('span', 'ms-card-title', loc(mission.title)), badges, el('span', 'ms-card-task', loc(mission.task)));
      list.append(card);
    }
    box.append(head, el('p', 'muted', mt('listLead', { max: MAX_TESTS })), list);
    overlay.append(box);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideList();
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideList();
    });
    document.body.append(overlay);
    list.querySelector('button')?.focus();
  }

  function hideList() {
    overlay?.remove();
    overlay = null;
  }

  // ---------- Ход миссии ----------

  function enter(missionId) {
    m = MISSION_BY_ID[missionId];
    assignment = dealMission(m);
    tests = [];
    current = null;
    submitted = false;
    feedbackToken++;
    // На столе только реактивы миссии: склянки-кандидаты скрыты, пробу из них берут кнопками пробирок
    lab.setShelf(m.reagents);
    lab.highlight([]);
    side.hidden = false;
    render();
  }

  function leave() {
    m = null;
    current = null;
    side.hidden = true;
    feedbackToken++;
  }

  async function takeSample(tube) {
    if (submitted) return toast(mt('done'));
    if (bench.isBusy()) return;
    if (current) return toast(mt('finishFirst'));
    if (tests.length >= MAX_TESTS) return toast(mt('limit'));
    current = { tube, reagents: [] };
    render();
    await bench.add(assignment[tube]);
  }

  async function handlePick(id) {
    if (!m) return;
    if (submitted) return toast(mt('done'));
    if (!current) return toast(mt('needSample'));
    if (current.reagents.includes(id)) return toast(mt('already'));
    // Проба + два реактива (обычно индикатор и ещё один) — больше движок не моделирует
    if (current.reagents.length >= 2) return toast(mt('tooMany'));
    current.reagents.push(id);
    await bench.add(id);
  }

  async function finishTest() {
    if (!current || bench.isBusy()) return;
    const r = bench.state.result;
    tests.push({ tube: current.tube, reagents: [...current.reagents], temperature: bench.state.temperature, result: r });
    current = null;
    await bench.wash();
    render();
  }

  // ---------- Отрисовка ----------

  function render() {
    if (!m) return;
    const task = el('div', 'card ms-task');
    task.append(
      el('h2', '', loc(m.title)),
      el('p', '', loc(m.task)),
    );
    const counter = el('p', 'ms-counter');
    counter.id = 'msCounter';
    task.append(counter);
    const tubes = el('div', 'ms-tubes');
    tubes.id = 'msTubes';
    for (const tube of tubesOf(m)) {
      const b = button(tubeName(tube), 'ms-tube', () => takeSample(tube));
      b.dataset.tube = tube;
      b.setAttribute('aria-label', mt('take', { name: tubeName(tube) }));
      tubes.append(b);
    }
    task.append(tubes);

    const work = el('div', 'card ms-current');
    work.id = 'msCurrent';

    const book = el('div', 'card ms-notebook');
    book.append(el('h3', '', mt('notebook')));
    const ol = el('ol', 'ms-log');
    ol.id = 'msLog';
    book.append(ol);

    const answer = el('form', 'card ms-answer');
    answer.id = 'msAnswer';
    answer.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });

    side.replaceChildren(task, work, book, answer);
    renderLog();
    renderAnswer();
    renderCurrent();
  }

  function renderCurrent() {
    const box = $('msCurrent');
    if (!box) return;
    $('msCounter').textContent = mt('counter', { n: usedTests(), max: MAX_TESTS });
    for (const b of $('msTubes').children) b.disabled = submitted || Boolean(current) || tests.length >= MAX_TESTS;
    box.hidden = submitted;
    if (!current) {
      box.replaceChildren(el('h3', '', mt('current')), el('p', 'muted', tests.length >= MAX_TESTS ? mt('limit') : mt('emptyBeaker')));
      return;
    }
    const chips = el('div', 'contents');
    chips.append(el('span', 'chip ms-chip-tube', tubeName(current.tube)), ...current.reagents.map((id) => el('span', 'chip', reagentLabel(id))));
    const r = bench.state.result;
    const obs = el('p', 'ms-obs', r ? observationText(r) : '…');
    obs.setAttribute('aria-live', 'polite');
    const finish = button(mt('finish'), 'primary', finishTest);
    finish.id = 'msFinish';
    box.replaceChildren(el('h3', '', mt('current')), chips, obs, finish);
  }

  function renderLog() {
    const ol = $('msLog');
    if (!tests.length) {
      ol.replaceChildren(el('li', 'muted ms-empty', mt('notebookEmpty')));
      return;
    }
    ol.replaceChildren(...tests.map((test) => {
      const li = el('li');
      const what = [tubeName(test.tube), ...test.reagents.map(reagentLabel)].join(' + ');
      const heat = test.temperature > 20 ? `, ${mt('heated', { t: test.temperature })}` : '';
      li.append(el('b', '', `${what}${heat}`), el('span', '', ` → ${observationText(test.result)}`));
      return li;
    }));
  }

  function renderAnswer() {
    const form = $('msAnswer');
    form.hidden = submitted;
    if (submitted) return;
    form.replaceChildren(el('h3', '', mt('answerTitle')));
    for (const tube of tubesOf(m)) {
      const label = el('label', 'ms-select');
      const select = el('select');
      select.name = `answer-${tube}`;
      select.append(Object.assign(el('option', '', mt('choose')), { value: '' }));
      for (const c of m.candidates) select.append(Object.assign(el('option', '', loc(OPTION_NAMES[c])), { value: c }));
      label.append(el('span', '', tubeName(tube)), select);
      form.append(label);
    }
    const why = el('label', 'ms-explain');
    const area = el('textarea');
    Object.assign(area, { name: 'explanation', maxLength: EXPLANATION_MAX, rows: 3, placeholder: mt('explainPh') });
    why.append(el('span', '', mt('explain')), area);
    const submitBtn = el('button', 'primary', mt('submit'));
    submitBtn.type = 'submit';
    form.append(why, submitBtn);
  }

  // ---------- Проверка ----------

  async function submit() {
    if (submitted || bench.isBusy()) return;
    const form = $('msAnswer');
    const answers = {};
    for (const tube of tubesOf(m)) answers[tube] = form.elements[`answer-${tube}`].value;
    if (Object.values(answers).some((v) => !v)) return toast(mt('pickAll'));
    const explanation = form.elements.explanation.value.trim().slice(0, EXPLANATION_MAX);
    // Незаписанный опыт в стакане тоже идёт в журнал: ученик его видел
    if (current) await finishTest();

    submitted = true;
    const plain = tests.map(({ tube, reagents, temperature }) => ({ tube, reagents, temperature }));
    const analysis = analyzeMission(m, assignment, plain, answers);
    const score = missionScore(analysis, tests.length);
    renderCurrent();
    renderAnswer();
    showResult(analysis, score);
    saveResult(resultId(m), missionStats(analysis));

    const token = ++feedbackToken;
    const res = await postJson('/api/mission-check', {
      missionId: m.id,
      assignment,
      tests: tests.map(({ tube, reagents, temperature, result }) => ({ tube, reagents, temperature, observation: observationCode(result) })),
      answers,
      explanation,
    });
    if (token !== feedbackToken) return;
    const box = $('msFeedback');
    if (res.ok && typeof res.data.text === 'string') {
      box.replaceChildren(el('p', '', res.data.text));
    } else {
      box.replaceChildren(el('p', 'muted small', mt('feedbackOffline')), ...staticFeedback(analysis).map((s) => el('p', '', s)));
    }
  }

  // Запасной отзыв без ИИ — из тех же фактов движка, что уходят модели.
  function staticFeedback(a) {
    const out = [];
    const decisive = a.rows.map((row, i) => ({ row, n: i + 1 })).filter(({ row }) => row.decisive);
    out.push(decisive.length
      ? mt('fbDecisive', { list: decisive.map(({ row, n }) => `№${n} (${tubeName(row.tube)}: ${observationText(row.result)})`).join('; ') })
      : mt('fbNoDecisive'));
    out.push(mt(a.evidenceComplete ? 'proofFull' : 'proofPart'));
    for (const p of a.perTube) {
      if (!p.ok) out.push(mt('fbWrong', { tube: tubeName(p.tube), truth: loc(OPTION_NAMES[p.truth]), answer: loc(OPTION_NAMES[p.answer]) }));
    }
    if (a.extra) {
      const shown = runTest(assignment, a.extra);
      out.push(mt('fbExtra', {
        tube: tubeName(a.extra.tube),
        reagents: a.extra.reagents.map(reagentLabel).join(' + '),
        heat: a.extra.temperature > 20 ? `, ${mt('heated', { t: a.extra.temperature })}` : '',
        obs: observationText(shown),
      }));
    }
    return out;
  }

  function showResult(a, score) {
    const card = el('div', 'card ms-result');
    card.id = 'msResult';
    card.append(el('h2', '', mt('resultTitle')));
    const all = a.correct === a.total;
    play(all ? 'success' : 'error');
    card.append(el('div', `verdict ${all ? 'good' : 'bad'}`, mt('correct', { ok: a.correct, total: a.total })));
    const ul = el('ul', 'ms-verdicts');
    for (const p of a.perTube) {
      const li = el('li', p.ok ? 'ok' : 'no');
      li.append(el('b', '', `${p.ok ? '✓' : '✗'} ${tubeName(p.tube)}: `), el('span', '', loc(OPTION_NAMES[p.answer])));
      if (!p.ok) li.append(el('span', 'muted', ` — ${mt('truth', { name: loc(OPTION_NAMES[p.truth]) })}`));
      ul.append(li);
    }
    card.append(ul, el('p', a.evidenceComplete ? 'ms-proof good' : 'ms-proof', mt(a.evidenceComplete ? 'proofFull' : 'proofPart')));
    card.append(el('p', 'ms-score', mt('score', score)));
    card.append(el('h3', '', mt('feedback')));
    const fb = el('div', 'ai-note ms-feedback');
    fb.id = 'msFeedback';
    fb.setAttribute('aria-live', 'polite');
    fb.append(el('p', 'muted', mt('feedbackLoading')));
    card.append(fb);
    const actions = el('div', 'ms-actions');
    const id = m.id;
    actions.append(button(mt('again'), 'primary', () => onStart(id)), button(mt('toList'), 'ghost', showList));
    card.append(actions);
    side.querySelector('.ms-notebook').after(card);
    card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  return {
    showList,
    enter,
    leave,
    handlePick,
    // Только для автотестов в режиме разработки: раздача и журнал текущей миссии
    debug: () => (m ? { id: m.id, assignment: { ...assignment }, tests: tests.length, current } : null),
  };
}
