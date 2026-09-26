// Проведение лабораторной работы по шагам. Ученик сам выполняет каждое действие — на 3D-столе
// (химия: bench + lab) или регуляторами 2D-симуляции (физика, биология: sim), —
// а контроллер только проверяет, что сделан нужный шаг, и ведёт лабораторный журнал.

import { SHELF_BY_ID } from './data/shelf.js';
import { SUBSTANCES } from './data/substances.js';

const HEAT_OBSERVE_MS = 1800;
const SPLINT_OBSERVE_MS = 1300;
const STORAGE_KEY = 'ai-stem-lab:completed';

// Что происходит между опытами: в штативе берут чистую пробирку, остальное моют
const WASH_TEXT = {
  beaker: 'Стакан моется для следующего опыта…',
  hood: 'Стакан моется для следующего опыта…',
  tubes: 'Берём чистую пробирку для следующего опыта…',
  gas: 'Пробирка моется для следующего опыта…',
  burner: 'Пробирка моется для следующего опыта…',
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

export function startLesson(lesson, { bench, lab, sim, coach, info, journal, toast, setTemperature, pick, onExit, onNext, onComplete, explain }) {
  let index = -1;
  let waiting = null; // что ждём от ученика: { type: 'do', item } | { type: 'heat', to } | { type: 'set', param, to } | { type: 'splint' }
  let pendingHypothesis = null;
  let stopped = false;
  const stats = { hypOk: 0, hypTotal: 0, qOk: 0, qTotal: 0 };
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
      toast('Лучинка горит спокойно: газ ещё не собрался. Подождите немного и повторите.');
      return;
    }
    const step = lesson.steps[index];
    waiting = null;
    const observation = res.outcome === 'pop'
      ? { observations: ['Горящая лучинка у отверстия пробирки — характерный хлопок: водород сгорает'], equation: '2H₂ + O₂ → 2H₂O' }
      : { observations: [`Горящая лучинка гаснет: ${res.gas} не поддерживает горение`], equation: null };
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
    renderStep(step);
  }

  function header(step) {
    const counted = lesson.steps.filter((s) => s.type !== 'wash');
    const n = counted.indexOf(step) + 1;
    const progress = el('div', 'progress');
    const bar = el('div', 'progress-bar');
    bar.style.width = `${Math.round((n / counted.length) * 100)}%`;
    progress.append(bar);
    return [el('div', 'step-count', `Шаг ${n} из ${counted.length}`), progress];
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
      const names = Object.keys(targets).map((id) => `«${sim.def.controls.find((c) => c.id === id).label}»`);
      waiting = { type: 'set', targets };
      coach.replaceChildren(
        ...header(step),
        el('div', 'step-label', 'Выполните'),
        el('p', 'step-text', step.text),
        el('p', 'step-note', actionControl(targets)
          ? 'Выполните действие прямо на сцене — или нажмите кнопку.'
          : `Регулятор ${names.join(' и ')} подсвечен под сценой — или нажмите кнопку.`),
        button(actionControl(targets)?.actionLabel ?? `Установить: ${targetText(targets)}`, () => animateTargets(targets)),
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
        el('div', 'step-label', 'Выполните'),
        el('p', 'step-text', step.text),
        el('p', 'step-note', 'Реактив отмечен стрелкой на полке — нажмите на него или на кнопку.'),
        button(`Взять: ${item.label} ${item.kind === 'dish' ? '' : item.note}`.trim(), () => pick?.(step.item)),
      );
    } else if (step.type === 'heat') {
      waiting = { type: 'heat', to: step.to };
      coach.replaceChildren(
        ...header(step),
        el('div', 'step-label', 'Выполните'),
        el('p', 'step-text', step.text),
        el('p', 'step-note', setup === 'burner'
          ? 'Используйте регулятор нагрева под сценой: спиртовка зажжётся — или нажмите кнопку.'
          : 'Используйте регулятор плитки под сценой — или нажмите кнопку.'),
        button(`Нагреть до ${step.to} °C`, () => animateHeat(step.to)),
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
        el('div', 'step-label', 'Выполните'),
        el('p', 'step-text', step.text),
        el('p', 'step-note', 'Перетащите лучинку со стола к отверстию пробирки — или нажмите кнопку. Шаг можно пропустить.'),
        button('Поднести лучинку', () => lab.splint()),
        button('Пропустить', () => { waiting = null; next(); }, 'ghost'),
      );
    } else if (step.type === 'hypothesis') {
      coach.replaceChildren(...header(step), el('div', 'step-label', 'Гипотеза'), el('p', 'step-text', step.text),
        options(step.options, (opt) => {
          pendingHypothesis = { text: opt.text, ok: Boolean(opt.ok) };
          next();
        }));
    } else if (step.type === 'question') {
      renderQuestion(step);
    } else if (step.type === 'wash') {
      coach.replaceChildren(el('div', 'step-label', 'Подготовка'), el('p', 'step-text', WASH_TEXT[setup] ?? WASH_TEXT.beaker));
      bench.wash().then(() => {
        setTemperature(20);
        if (!stopped) next();
      });
    } else if (step.type === 'conclusion') {
      renderConclusion(step);
    }
  }

  // Варианты перемешиваются при каждом показе: иначе верный ответ всегда стоял бы первым.
  // Плавно ведёт регуляторы к нужным значениям — ученик видит, как меняется опыт
  function animateTargets(targets) {
    const from = { ...sim.params };
    const start = performance.now();
    const tick = (now) => {
      if (stopped) return;
      const p = Math.min(1, (now - start) / 900);
      for (const [id, to] of Object.entries(targets)) sim.set(id, p < 1 ? from[id] + (to - from[id]) * p : to);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function animateHeat(to) {
    const from = bench.state.temperature;
    const start = performance.now();
    const tick = (now) => {
      if (stopped) return;
      const p = Math.min(1, (now - start) / 1200);
      setTemperature(Math.round((from + (to - from) * p) / 5) * 5);
      if (p < 1) requestAnimationFrame(tick);
      else setTemperature(to);
    };
    requestAnimationFrame(tick);
  }

  // Шаг-действие: целевой параметр — не ползунок, а действие на сцене
  function actionControl(targets) {
    return Object.keys(targets).map((id) => sim.def.controls.find((c) => c.id === id)).find((c) => c?.action);
  }

  function targetText(targets) {
    return Object.entries(targets).map(([id, to]) => {
      const c = sim.def.controls.find((x) => x.id === id);
      return c.names ? c.names[to] : `${String(to).replace('.', ',')} ${c.unit}`.trim();
    }).join(', ');
  }

  function options(list, onChoose) {
    const box = el('div', 'options');
    const order = [...list];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((opt) => {
      const b = button(opt.text, () => onChoose(opt, box), 'option');
      b.dataset.ok = opt.ok ? '1' : '';
      box.append(b);
    });
    return box;
  }

  function renderQuestion(step) {
    coach.replaceChildren(...header(step), el('div', 'step-label', 'Контрольный вопрос'), el('p', 'step-text', step.text),
      options(step.options, (opt, box) => {
        stats.qTotal++;
        if (opt.ok) stats.qOk++;
        [...box.children].forEach((b) => {
          b.disabled = true;
          if (b.dataset.ok) b.classList.add('correct');
          else if (b.textContent === opt.text) b.classList.add('wrong');
        });
        coach.append(
          el('p', opt.ok ? 'feedback good' : 'feedback bad', `${opt.ok ? 'Верно.' : 'Неверно.'} ${step.explain}`),
          button('Далее', next),
        );
      }));
  }

  // Ученик выполнил действие (взял реактив, нагрел, поднёс лучинку) — фиксируем наблюдение.
  // observed — готовое наблюдение, если оно не следует из результата движка (проба лучинкой).
  function completeAction(step, observed = null) {
    sim?.highlight(null);
    const r = observed ?? (sim
      ? { observations: [sim.def.describe(sim.params)], equation: sim.def.formula }
      : bench.state.result);
    let verdict = null;
    if (pendingHypothesis) {
      stats.hypTotal++;
      if (pendingHypothesis.ok) stats.hypOk++;
      verdict = pendingHypothesis;
      pendingHypothesis = null;
    }
    if (step.record) {
      rows.push({
        title: step.record,
        hypothesis: verdict,
        // Для повторного наблюдения той же смеси (например, после нагревания) пишем только новое.
        observations: newObservations(r?.observations ?? []).join('. '),
        equation: r?.equation ?? '—',
        all: r?.observations ?? [],
      });
      renderJournal();
    }
    if (!step.after) return next();

    const children = [...header(step), el('div', 'step-label', 'Наблюдение')];
    if (verdict) {
      children.push(el('p', verdict.ok ? 'feedback good' : 'feedback bad',
        verdict.ok ? `Гипотеза подтвердилась: «${verdict.text}».` : `Гипотеза не подтвердилась: «${verdict.text}».`));
    }
    children.push(el('p', 'step-text', step.after));
    if (r?.equation) children.push(el('pre', 'equation', r.equation));
    // Объяснение ИИ строится по параметрам опыта из движка — для пробы лучинкой их нет
    if (!explain || observed) {
      children.push(button('Далее', next));
      coach.replaceChildren(...children);
      return;
    }
    const why = button('Объяснение ИИ-ассистента', async () => {
      why.disabled = true;
      why.textContent = 'Формируется объяснение…';
      const text = await explain(r);
      why.replaceWith(el('p', 'ai-note', text));
    }, 'ghost');
    children.push(why, button('Далее', next));
    coach.replaceChildren(...children);
  }

  function newObservations(list) {
    const seen = rows.at(-1)?.all ?? [];
    const fresh = list.filter((o) => !seen.includes(o));
    return fresh.length ? fresh : list;
  }

  function renderConclusion(step) {
    saveCompleted(lesson.id);
    onComplete?.(lesson.id, { ...stats });
    const list = el('ol', 'conclusion');
    step.points.forEach((p) => list.append(el('li', '', p)));
    const stat = el('div', 'stats');
    stat.append(
      el('div', '', `Гипотезы подтвердились: ${stats.hypOk} из ${stats.hypTotal}`),
      el('div', '', `Контрольные вопросы: ${stats.qOk} из ${stats.qTotal}`),
    );
    const actions = el('div', 'actions');
    actions.append(button('К списку работ', onExit, 'ghost'));
    if (onNext) actions.append(button('Следующая работа', onNext));
    coach.replaceChildren(el('div', 'step-label', 'Вывод'), list, stat, actions);
  }

  function renderInfo() {
    const materials = lesson.shelf
      ? [...new Set(lesson.shelf.map((id) => SUBSTANCES[SHELF_BY_ID[id].substance].name))].join(', ')
      : lesson.equipment;
    info.replaceChildren(
      el('div', 'info-label', 'Цель работы'), el('p', '', lesson.goal),
      el('div', 'info-label', lesson.shelf ? 'Реактивы' : 'Оборудование'), el('p', '', materials),
      el('div', 'info-label', 'Техника безопасности'), el('p', 'safety-text', lesson.safety),
    );
  }

  function renderJournal() {
    const table = el('table', 'journal-table');
    const head = table.createTHead().insertRow();
    ['№', 'Опыт', 'Гипотеза', 'Наблюдения', lesson.formulaLabel ?? 'Уравнение реакции'].forEach((h) => head.append(el('th', '', h)));
    const body = table.createTBody();
    if (!rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 5;
      cell.className = 'empty';
      cell.textContent = 'Журнал заполняется автоматически по мере выполнения опытов.';
    }
    rows.forEach((row, i) => {
      const tr = body.insertRow();
      tr.insertCell().textContent = String(i + 1);
      tr.insertCell().textContent = row.title;
      const hyp = tr.insertCell();
      hyp.textContent = row.hypothesis ? `${row.hypothesis.text} — ${row.hypothesis.ok ? 'подтвердилась' : 'не подтвердилась'}` : '—';
      if (row.hypothesis) hyp.className = row.hypothesis.ok ? 'ok' : 'no';
      tr.insertCell().textContent = row.observations;
      const eq = tr.insertCell();
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
        if (waiting?.type === 'heat') return toast('Сейчас нужно нагреть раствор регулятором под сценой.');
        if (waiting?.type === 'splint') return toast('Сейчас нужно поднести горящую лучинку — или пропустить этот шаг.');
        return toast('Сначала выполните текущий шаг работы.');
      }
      if (id !== waiting.item) return toast('Для этого шага нужен другой реактив — он отмечен стрелкой.');
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
