// Проведение лабораторной работы по шагам. Ученик сам выполняет каждое действие — на 3D-столе
// (химия: bench + lab) или регуляторами 2D-симуляции (физика, биология: sim), —
// а контроллер только проверяет, что сделан нужный шаг, и ведёт лабораторный журнал.

import { SHELF_BY_ID } from './data/shelf.js';
import { SUBSTANCES } from './data/substances.js';
import { t, tr } from './i18n.js';
import { play } from './sound.js';

const HEAT_OBSERVE_MS = 1800;
const SPLINT_OBSERVE_MS = 1300;
const STORAGE_KEY = 'ai-stem-lab:completed';

// Что происходит между опытами: в штативе берут чистую пробирку, остальное моют
const WASH_TEXT = {
  beaker: 'lesson.washBeaker',
  hood: 'lesson.washBeaker',
  tubes: 'lesson.washTubes',
  gas: 'lesson.washTube',
  burner: 'lesson.washTube',
};

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

export function loadCompleted() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveCompleted(id) {
  try {
    const done = loadCompleted();
    done.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    // Хранилище недоступно (приватный режим) — отметка о выполнении просто не сохранится.
  }
}

// onProgress получает ход работы для «Живого урока» (src/live.js): шаг, ответ, ошибку, завершение.
export function startLesson(lesson, { bench, lab, sim, coach, info, journal, toast, setTemperature, onExit, onNext, onComplete, explain, quiz, onProgress }) {
  let index = -1;
  let waiting = null; // что ждём от ученика: { type: 'do', item } | { type: 'heat', to } | { type: 'set', param, to } | { type: 'splint' }
  let pendingHypothesis = null;
  let stopped = false;
  const stats = { hypOk: 0, hypTotal: 0, qOk: 0, qTotal: 0 };
  // Для разбора после работы: что ученик предположил и где ошибся
  const review = { hypotheses: [], answers: [] };
  const quizStats = { ok: 0, total: 0 };
  let quizPromise = null;
  const rows = [];

  const setup = lesson.setup ?? 'beaker';
  if (lesson.shelf) {
    lab.setShelf(lesson.shelf);
    lab.setSetup(setup, { receiver: lesson.receiver });
    lab.highlight([]);
  }
  renderInfo();
  renderJournal();

  const offSim = sim?.onChange((params) => {
    if (waiting?.type === 'set' && reached(params, waiting)) observeAfterDelay();
  }) ?? (() => {});

  const offChange = !sim && bench.onChange((state) => {
    if (waiting?.type === 'heat' && state.temperature >= waiting.to) {
      const step = lesson.steps[index];
      waiting = null;
      // Даём ученику увидеть, как изменилась реакция, прежде чем показать вывод.
      setTimeout(() => !stopped && completeAction(step), HEAT_OBSERVE_MS);
    }
  });

  // Проба лучинкой: сцена сообщает, что произошло у отверстия приёмника
  const offSplint = (!sim && lab.onSplint?.((res) => {
    if (waiting?.type !== 'splint') return;
    if (res.outcome === 'burn') {
      toast(t('lesson.splintWait'));
      return;
    }
    const step = lesson.steps[index];
    waiting = null;
    const observation = res.outcome === 'pop'
      ? { observations: [t('lesson.splintPop')], equation: '2H₂ + O₂ → 2H₂O' }
      : { observations: [t('lesson.splintOut', { gas: tr(res.gas) })], equation: null };
    setTimeout(() => !stopped && completeAction(step, observation), SPLINT_OBSERVE_MS);
  })) || (() => {});

  next();

  function reached(params, { targets }) {
    return Object.entries(targets).every(([id, to]) => Math.abs(params[id] - to) < 1e-6);
  }

  // Даём ученику увидеть результат действия, прежде чем показать наблюдение.
  function observeAfterDelay() {
    const step = lesson.steps[index];
    waiting = null;
    setTimeout(() => !stopped && completeAction(step), HEAT_OBSERVE_MS);
  }

  function next() {
    index++;
    const step = lesson.steps[index];
    if (!step) return;
    onProgress?.({ type: 'step', index });
    renderStep(step);
  }

  function header(step) {
    const counted = lesson.steps.filter((s) => s.type !== 'wash');
    const n = counted.indexOf(step) + 1;
    const progress = el('div', 'progress');
    const bar = el('div', 'progress-bar');
    bar.style.width = `${Math.round((n / counted.length) * 100)}%`;
    progress.append(bar);
    return [el('div', 'step-count', t('lesson.stepOf', { n, m: counted.length })), progress];
  }

  function button(text, onClick, className = 'primary') {
    const b = el('button', className, text);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  }

  function renderStep(step) {
    lab?.highlight([]);
    waiting = null;

    if (step.type === 'set') {
      // Шаг может требовать один регулятор (param/to) или несколько сразу (targets)
      const targets = step.targets ?? { [step.param]: step.to };
      const names = Object.keys(targets).map((id) => `«${tr(sim.def.controls.find((c) => c.id === id).label)}»`);
      waiting = { type: 'set', targets };
      coach.replaceChildren(
        ...header(step),
        el('div', 'step-label', t('lesson.do')),
        el('p', 'step-text', tr(step.text)),
        // Кнопки «сделать за меня» нет: смысл работы в том, чтобы ученик сам провёл опыт
        el('p', 'step-note', actionControl(targets)
          ? t('lesson.actionNote', { action: tr(actionControl(targets).actionLabel).toLowerCase() })
          : t('lesson.controlNote', { names: names.join(t('lesson.and')), target: targetText(targets) })),
      );
      sim.highlight(Object.keys(targets));
      if (reached(sim.params, waiting)) observeAfterDelay();
      return;
    }
    sim?.highlight(null);

    if (step.type === 'do') {
      const item = SHELF_BY_ID[step.item];
      waiting = { type: 'do', item: step.item };
      lab.highlight([step.item], { arrow: true });
      coach.replaceChildren(
        ...header(step),
        el('div', 'step-label', t('lesson.do')),
        el('p', 'step-text', tr(step.text)),
        // Сокращения вроде «разб.» уже кончаются точкой — вторую точку из шаблона не удваиваем
        el('p', 'step-note', t('lesson.pickNote', { item: `${tr(item.label)} ${item.kind === 'dish' ? '' : tr(item.note)}`.trim().replace(/\.$/, '') })),
      );
    } else if (step.type === 'heat') {
      waiting = { type: 'heat', to: step.to };
      coach.replaceChildren(
        ...header(step),
        el('div', 'step-label', t('lesson.do')),
        el('p', 'step-text', tr(step.text)),
        el('p', 'step-note', setup === 'burner'
          ? t('lesson.heatBurner', { to: step.to })
          : t('lesson.heatPlate', { to: step.to })),
      );
      // Раствор уже нагрет заранее — засчитываем шаг сразу.
      if (bench.state.temperature >= step.to) {
        waiting = null;
        setTimeout(() => !stopped && completeAction(step), HEAT_OBSERVE_MS);
      }
    } else if (step.type === 'splint') {
      waiting = { type: 'splint' };
      coach.replaceChildren(
        ...header(step),
        el('div', 'step-label', t('lesson.do')),
        el('p', 'step-text', tr(step.text)),
        el('p', 'step-note', t('lesson.splintNote')),
        // Кнопкой, а не только перетаскиванием: на телефоне сцена маленькая и лучинку пальцем не поймать
        button(t('splint.button'), () => lab.splint(), 'primary'),
        button(t('lesson.skip'), () => { waiting = null; next(); }, 'ghost'),
      );
    } else if (step.type === 'hypothesis') {
      coach.replaceChildren(...header(step), el('div', 'step-label', t('lesson.hypothesis')), el('p', 'step-text', tr(step.text)),
        options(step.options, (opt) => {
          pendingHypothesis = { question: tr(step.text), text: tr(opt.text), ok: Boolean(opt.ok) };
          onProgress?.({ type: 'answer', kind: 'hypothesis', index, opt: step.options.indexOf(opt), ok: Boolean(opt.ok) });
          next();
        }));
    } else if (step.type === 'question') {
      renderQuestion(step);
    } else if (step.type === 'wash') {
      coach.replaceChildren(el('div', 'step-label', t('lesson.prepare')), el('p', 'step-text', t(WASH_TEXT[setup] ?? WASH_TEXT.beaker)));
      bench.wash().then(() => {
        setTemperature(20);
        if (!stopped) next();
      });
    } else if (step.type === 'conclusion') {
      renderConclusion(step);
    }
  }

  // Шаг-действие: целевой параметр — не ползунок, а действие на сцене
  function actionControl(targets) {
    return Object.keys(targets).map((id) => sim.def.controls.find((c) => c.id === id)).find((c) => c?.action);
  }

  function targetText(targets) {
    return Object.entries(targets).map(([id, to]) => {
      const c = sim.def.controls.find((x) => x.id === id);
      return c.names ? tr(c.names[to]) : `${String(to).replace('.', ',')} ${tr(c.unit)}`.trim();
    }).join(', ');
  }

  // Варианты перемешиваются при каждом показе: иначе верный ответ всегда стоял бы первым.
  function options(list, onChoose) {
    const box = el('div', 'options');
    const order = [...list];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((opt) => {
      const b = button(tr(opt.text), () => onChoose(opt, box), 'option');
      b.dataset.ok = opt.ok ? '1' : '';
      box.append(b);
    });
    return box;
  }

  function renderQuestion(step) {
    coach.replaceChildren(...header(step), el('div', 'step-label', t('lesson.question')), el('p', 'step-text', tr(step.text)),
      options(step.options, (opt, box) => {
        stats.qTotal++;
        if (opt.ok) stats.qOk++;
        review.answers.push({ step, chosen: tr(opt.text), ok: Boolean(opt.ok) });
        onProgress?.({ type: 'answer', kind: 'question', index, opt: step.options.indexOf(opt), ok: Boolean(opt.ok) });
        play(opt.ok ? 'success' : 'error');
        [...box.children].forEach((b) => {
          b.disabled = true;
          if (b.dataset.ok) b.classList.add('correct');
          else if (b.textContent === tr(opt.text)) b.classList.add('wrong');
        });
        coach.append(
          el('p', opt.ok ? 'feedback good' : 'feedback bad', `${t(opt.ok ? 'lesson.right' : 'lesson.wrong')} ${tr(step.explain)}`),
          button(t('lesson.next'), next),
        );
      }));
  }

  // Ученик выполнил действие (взял реактив, нагрел, поднёс лучинку) — фиксируем наблюдение.
  // observed — готовое наблюдение, если оно не следует из результата движка (проба лучинкой).
  function completeAction(step, observed = null) {
    sim?.highlight(null);
    const r = observed ?? (sim
      ? { observations: [tr(sim.def.describe(sim.params))], equation: tr(sim.def.formula) }
      : bench.state.result);
    let verdict = null;
    if (pendingHypothesis) {
      stats.hypTotal++;
      if (pendingHypothesis.ok) stats.hypOk++;
      verdict = pendingHypothesis;
      review.hypotheses.push(verdict);
      pendingHypothesis = null;
    }
    if (step.record) {
      rows.push({
        title: tr(step.record),
        hypothesis: verdict,
        // Для повторного наблюдения той же смеси (например, после нагревания) пишем только новое.
        observations: newObservations(r?.observations ?? []).map(tr).join('. '),
        equation: tr(r?.equation) ?? '—',
        all: r?.observations ?? [],
      });
      renderJournal();
    }
    if (!step.after) return next();

    const children = [...header(step), el('div', 'step-label', t('lesson.observation'))];
    if (verdict) {
      play(verdict.ok ? 'success' : 'error');
      children.push(el('p', verdict.ok ? 'feedback good' : 'feedback bad',
        t(verdict.ok ? 'lesson.hypOk' : 'lesson.hypNo', { text: verdict.text })));
    }
    children.push(el('p', 'step-text', tr(step.after)));
    if (r?.equation) children.push(el('pre', 'equation', tr(r.equation)));
    // Объяснение ИИ строится по параметрам опыта из движка — для пробы лучинкой их нет
    if (!explain || observed) {
      children.push(button(t('lesson.next'), next));
      coach.replaceChildren(...children);
      return;
    }
    const why = button(t('lesson.why'), async () => {
      why.disabled = true;
      why.textContent = t('lesson.explaining');
      const text = await explain(r);
      why.replaceWith(el('p', 'ai-note', text));
    }, 'ghost');
    children.push(why, button(t('lesson.next'), next));
    coach.replaceChildren(...children);
  }

  function newObservations(list) {
    const seen = rows.at(-1)?.all ?? [];
    const fresh = list.filter((o) => !seen.includes(o));
    return fresh.length ? fresh : list;
  }

  // Итог работы: вывод → разбор → опрос на закрепление → результат.
  // Работа засчитывается только после опроса. Если ученик уйдёт посередине, результат не сохранится
  // и работу придётся пройти заново — зато в журнал учителя не попадают незавершённые попытки.
  function renderConclusion(step) {
    // Вопросы запрашиваем сразу: пока ученик читает вывод и разбор, ИИ успевает их подготовить.
    quizPromise = loadQuiz();
    coach.replaceChildren(el('div', 'step-label', t('lesson.conclusion')), pointList(step.points, 'conclusion'),
      button(t('lesson.review'), () => renderReview(step)));
  }

  function pointList(points, className) {
    const list = el('ol', className);
    points.forEach((p) => list.append(el('li', '', tr(p))));
    return list;
  }

  function reviewItem(className, question, ...rest) {
    const item = el('li', className);
    item.append(el('div', 'review-q', question), ...rest);
    return item;
  }

  function renderReview(step) {
    const box = el('div', 'review');

    if (review.hypotheses.length) {
      const list = el('ul', 'review-list');
      review.hypotheses.forEach((h) => list.append(reviewItem(h.ok ? 'ok' : 'no', h.question,
        el('div', 'review-a', t('lesson.yourAnswer', { text: h.text })),
        el('span', 'review-tag', t(h.ok ? 'lesson.confirmed' : 'lesson.notConfirmed')))));
      box.append(el('h4', 'review-title', t('lesson.hypotheses')), list);
    }

    if (review.answers.length) {
      const wrong = review.answers.filter((a) => !a.ok);
      box.append(el('h4', 'review-title', t('lesson.questions')));
      if (wrong.length) {
        const list = el('ul', 'review-list');
        wrong.forEach(({ step: q, chosen }) => list.append(reviewItem('no', tr(q.text),
          el('div', 'review-a', t('lesson.yourAnswer', { text: chosen })),
          el('div', 'review-a right', t('lesson.rightAnswer', { text: tr(q.options.find((o) => o.ok)?.text) ?? '—' })),
          el('p', 'review-explain', tr(q.explain)))));
        box.append(list);
      } else {
        box.append(el('p', 'review-all-ok', t('lesson.allRight')));
      }
    }

    box.append(el('h4', 'review-title', t('lesson.main')), pointList(step.points, 'review-points'));
    const go = button(t('lesson.startQuiz'), () => {
      go.disabled = true;
      startQuiz();
    });
    coach.replaceChildren(el('div', 'step-label', t('lesson.review')), box, go);
  }

  // Вопросы от ИИ; без ИИ (нет ключа, нет сети, негодный ответ) — вопросы и гипотезы самой работы,
  // чтобы работу можно было завершить и офлайн.
  async function loadQuiz() {
    const fromAi = await Promise.resolve(quiz?.()).catch(() => null);
    const valid = Array.isArray(fromAi) ? fromAi.filter(isQuizQuestion).slice(0, 4) : [];
    if (valid.length >= 2) return valid;
    const local = localQuiz();
    return local.length >= 2 ? local : [];
  }

  function isQuizQuestion(q) {
    return typeof q?.text === 'string' && typeof q.explain === 'string' && Array.isArray(q.options)
      && q.options.every((o) => typeof o?.text === 'string') && q.options.filter((o) => o.ok === true).length === 1;
  }

  // Запасной опрос: контрольные вопросы, затем гипотезы (пояснение — наблюдение из следующего опыта).
  function localQuiz() {
    const steps = lesson.steps;
    const questions = steps.filter((s) => s.type === 'question')
      .map((s) => ({ text: s.text, options: s.options, explain: s.explain }));
    const hypotheses = steps.flatMap((s, i) => {
      if (s.type !== 'hypothesis') return [];
      const after = steps.slice(i + 1).find((x) => x.after)?.after;
      return after ? [{ text: s.text, options: s.options, explain: after }] : [];
    });
    return [...questions, ...hypotheses].slice(0, 4);
  }

  async function startQuiz() {
    // Если вопросы ещё не готовы — спокойная заглушка вместо пустой панели
    const loading = el('div', 'quiz-loading');
    loading.append(el('p', 'step-note', t('lesson.quizLoading')), el('div', 'skeleton-line'), el('div', 'skeleton-line short'), el('div', 'skeleton-line'));
    const timer = setTimeout(() => !stopped && coach.replaceChildren(el('div', 'step-label', t('lesson.quiz')), loading), 150);
    const questions = await quizPromise;
    clearTimeout(timer);
    if (stopped) return;
    if (!questions.length) return renderFinal(t('lesson.quizUnavailable'));
    renderQuizQuestion(questions, 0);
  }

  function renderQuizQuestion(questions, i) {
    const q = questions[i];
    const progress = el('div', 'progress');
    const bar = el('div', 'progress-bar');
    bar.style.width = `${Math.round(((i + 1) / questions.length) * 100)}%`;
    progress.append(bar);
    coach.replaceChildren(el('div', 'step-count', t('lesson.quizOf', { n: i + 1, m: questions.length })), progress,
      el('div', 'step-label', t('lesson.quiz')), el('p', 'step-text', tr(q.text)),
      options(q.options, (opt, box) => {
        quizStats.total++;
        if (opt.ok) quizStats.ok++;
        play(opt.ok ? 'success' : 'error');
        [...box.children].forEach((b) => {
          b.disabled = true;
          if (b.dataset.ok) b.classList.add('correct');
          else if (b.textContent === tr(opt.text)) b.classList.add('wrong');
        });
        coach.append(
          el('p', opt.ok ? 'feedback good' : 'feedback bad', `${t(opt.ok ? 'lesson.right' : 'lesson.wrong')} ${tr(q.explain)}`),
          i < questions.length - 1
            ? button(t('lesson.next'), () => renderQuizQuestion(questions, i + 1))
            : button(t('lesson.finish'), () => renderFinal()),
        );
      }));
  }

  function renderFinal(note) {
    saveCompleted(lesson.id);
    onProgress?.({ type: 'finish' });
    // Опрос уходит в журнал учителя вместе с контрольными вопросами — схема результатов не меняется
    onComplete?.(lesson.id, { ...stats, qOk: stats.qOk + quizStats.ok, qTotal: stats.qTotal + quizStats.total });
    const stat = el('div', 'stats');
    stat.append(
      el('div', '', t('lesson.statHyp', { ok: stats.hypOk, total: stats.hypTotal })),
      el('div', '', t('lesson.statQ', { ok: stats.qOk, total: stats.qTotal })),
    );
    if (quizStats.total) stat.append(el('div', '', t('lesson.statQuiz', { ok: quizStats.ok, total: quizStats.total })));
    const actions = el('div', 'actions');
    actions.append(button(t('lesson.toList'), onExit, 'ghost'));
    if (onNext) actions.append(button(t('lesson.nextWork'), onNext));
    coach.replaceChildren(el('div', 'step-label', t('lesson.finished')), ...(note ? [el('p', 'step-note', note)] : []), stat, actions);
  }

  function renderInfo() {
    const materials = lesson.shelf
      ? [...new Set(lesson.shelf.map((id) => tr(SUBSTANCES[SHELF_BY_ID[id].substance].name)))].join(', ')
      : tr(lesson.equipment);
    info.replaceChildren(
      el('div', 'info-label', t('lesson.goal')), el('p', '', tr(lesson.goal)),
      el('div', 'info-label', t(lesson.shelf ? 'lesson.reagents' : 'lesson.equipment')), el('p', '', materials),
      el('div', 'info-label', t('lesson.safety')), el('p', 'safety-text', tr(lesson.safety)),
    );
  }

  function renderJournal() {
    const table = el('table', 'journal-table');
    const head = table.createTHead().insertRow();
    ['№', t('lesson.colExp'), t('lesson.colHyp'), t('lesson.colObs'), tr(lesson.formulaLabel) ?? t('lesson.colEquation')].forEach((h) => head.append(el('th', '', h)));
    const body = table.createTBody();
    if (!rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 5;
      cell.className = 'empty';
      cell.textContent = t('lesson.journalEmpty');
    }
    rows.forEach((row, i) => {
      const line = body.insertRow();
      line.insertCell().textContent = String(i + 1);
      line.insertCell().textContent = row.title;
      const hyp = line.insertCell();
      hyp.textContent = row.hypothesis ? t(row.hypothesis.ok ? 'lesson.hypCellOk' : 'lesson.hypCellNo', { text: row.hypothesis.text }) : '—';
      if (row.hypothesis) hyp.className = row.hypothesis.ok ? 'ok' : 'no';
      line.insertCell().textContent = row.observations;
      const eq = line.insertCell();
      eq.textContent = row.equation;
      eq.className = 'eq';
    });
    const wrap = el('div', 'table-wrap');
    wrap.append(table);
    journal.replaceChildren(wrap);
  }

  return {
    async handlePick(id) {
      if (waiting?.type !== 'do') {
        play('error');
        if (waiting?.type === 'heat') return toast(t('lesson.needHeat'));
        if (waiting?.type === 'splint') return toast(t('lesson.needSplint'));
        return toast(t('lesson.needStep'));
      }
      if (id !== waiting.item) {
        onProgress?.({ type: 'miss', index });
        play('error');
        return toast(t('lesson.wrongReagent'));
      }
      const step = lesson.steps[index];
      waiting = null;
      lab.highlight([]);
      await bench.add(id);
      if (!stopped) completeAction(step);
    },
    stop() {
      stopped = true;
      if (offChange) offChange();
      offSim();
      offSplint();
      // Свободная лаборатория и следующие работы начинаются с обычного стакана
      if (lesson.shelf) lab.setSetup('beaker');
    },
  };
}
