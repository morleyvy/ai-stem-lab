// Сцена «Сортировка и поиск в массиве»: кабинет информатики, на столе два монитора.
// Слева — визуализатор массива: числа показаны столбиками (высота пропорциональна числу), под каждым —
// индекс, ниже — указатели переменных цикла (j, i, m, lo, mid, hi); сверху — живые счётчики сравнений
// и перестановок (для поиска — проверок); n, x и k только в панели показаний под сценой. Справа — редактор Python: вкладки четырёх
// алгоритмов, код с подсветкой выполняемой строки, кнопка «Пуск» и строка состояния. Ученик сам:
//   щёлкает вкладку алгоритма (algo) — код и режим визуализатора меняются;
//   нажимает «Пуск» (run = 1) — алгоритм выполняется по шагам, повторный щелчок возвращает на старт;
//   в режиме поиска щёлкает столбик (key) — его число становится искомым x.
// Шаги берутся из trace() модели — сцена их только проигрывает со скоростью speed шагов/с.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 506;
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';
const LEFT = { x: 14, y: 14, w: 470, h: 448 };
const RIGHT = { x: 496, y: 14, w: 450, h: 448 };
// Столбики: основание, высота числа 100 и поле по ширине экрана
const BASE = 370;
const SCALE = 2.5;
const BARS = { x: 36, w: 426 };
const ROW_H = 21;
const RUN_BTN = { x: 516, y: 384, w: 150, h: 44 };

const BLUE = '#60a5fa';
const CMP = '#fbbf24';
const SWAP = '#f97316';
const DONE = '#4ade80';
const IDLE_OUT = '#cbd5e1';
const HIT = '#22c55e';
const MARK = { j: '#2563eb', 'j+1': '#7c3aed', i: '#0f766e', m: '#db2777', lo: '#0891b2', mid: '#d97706', hi: '#7c3aed' };

// Монитор на подставке: корпус-рамка, экран, ножка до столешницы. Возвращает внутренний прямоугольник экрана
function monitor(svg, d, { x, y, w, h }) {
  const cx = x + w / 2;
  svg.append(
    floorShadow(cx, BENCH + 2, 120, d),
    s('rect', { x: cx - 16, y: y + h - 4, width: 32, height: BENCH - y - h - 4, fill: d.lin([[0, '#475569'], [0.45, '#94a3b8'], [1, '#334155']]) }),
    s('path', { d: `M${cx - 78} ${BENCH + 2} Q ${cx - 70} ${BENCH - 12} ${cx - 30} ${BENCH - 12} H${cx + 30} Q ${cx + 70} ${BENCH - 12} ${cx + 78} ${BENCH + 2} Z`, fill: d.lin([[0, '#64748b'], [1, '#1e293b']], 'v') }),
    s('rect', { x, y, width: w, height: h, rx: 14, fill: d.lin([[0, '#334155'], [0.5, '#1e293b'], [1, '#0f172a']], 'v'), filter: d.url('soft') }),
    s('rect', { x: x + 1.5, y: y + 1.5, width: w - 3, height: 16, rx: 12, fill: '#ffffff', 'fill-opacity': 0.1 }),
    s('circle', { cx, cy: y + h - 6, r: 2.2, fill: '#22c55e' }),
  );
  return { x: x + 12, y: y + 12, w: w - 24, h: h - 26 };
}

// Окно программы: светлый или тёмный фон и полоса заголовка
function windowFrame(svg, d, r, { light }) {
  const bar = light ? '#cbd5e1' : '#1f2937';
  svg.append(
    s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 6, fill: light ? d.lin([[0, '#f8fafc'], [1, '#e2e8f0']], 'v') : d.lin([[0, '#111827'], [1, '#0b1220']], 'v') }),
    s('rect', { x: r.x, y: r.y, width: r.w, height: 26, rx: 6, fill: bar }),
    s('rect', { x: r.x, y: r.y + 20, width: r.w, height: 6, fill: bar }),
  );
}

// Вкладка, которую можно нажать: подложка + подпись; длинная подпись ужимается, но не мельче 13
function tab(x, y, w, h, label, onClick) {
  const bg = s('rect', { x, y, width: w, height: h, rx: 8 });
  const size = Math.max(13, Math.min(15, (w - 14) / (label.length * 0.56)));
  const caption = text(x + w / 2, y + h / 2 + 1, label, { size, weight: 600 });
  const g = s('g', { style: 'cursor:pointer' }, [bg, caption]);
  g.addEventListener('click', onClick);
  touchTarget(g, 4);
  return { g, bg, caption };
}

// Python с подсветкой синтаксиса: ключевые слова, встроенные функции, числа
const KEYWORDS = /^(for|in|if|elif|else|while|break)$/;
function codeLine(x, y, src) {
  const t = text(x, y, '', { size: 14, weight: 500, fill: '#cbd5e1', anchor: 'start' });
  t.setAttribute('font-family', MONO);
  // Отступ — часть синтаксиса Python, пробелы в начале строки нельзя схлопывать
  t.style.whiteSpace = 'pre';
  const lead = src.match(/^ */)[0].length;
  if (lead) t.append(document.createTextNode(' '.repeat(lead)));
  for (const part of src.trim().split(/(\b(?:for|in|if|elif|else|while|break|range|print)\b|\b\d+\b)/).filter(Boolean)) {
    const color = KEYWORDS.test(part) ? '#f472b6' : /^(range|print)$/.test(part) ? '#7dd3fc' : /^\d+$/.test(part) ? '#fdba74' : '#cbd5e1';
    const span = s('tspan', { fill: color, 'font-weight': KEYWORDS.test(part) ? 700 : 500 });
    span.textContent = part;
    t.append(span);
  }
  return t;
}

export function itArraySortingScene(container, params, set, { CODE, ALGOS, trace, arrayOf, isSearch, POOL }) {
  let title, algoTabs, chips, legend, bars, idxLabels, hits, pills, keyLine, keyTag, rowsG, rows = [];
  let runBtn, runText, runPulse, statusMain, statusSub;
  let key = '';
  let shownAlgo = -1;
  let play = { events: [], res: null, i: 0, k: 0, phase: 'idle' };
  let pulse = 0;
  let snap = true;
  // Текущее экранное положение каждого столбика (по числу): плавно догоняет своё место в массиве
  const posX = new Map();

  const slot = () => BARS.w / params.n;
  const slotX = (i) => BARS.x + slot() * (i + 0.5);

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // ── Левый монитор: визуализатор массива ──
      const L = monitor(svg, d, LEFT);
      windowFrame(svg, d, L, { light: true });
      title = text(L.x + L.w / 2, L.y + 13.5, '', { size: 13, weight: 700, fill: '#334155' });
      svg.append(title);

      // Счётчики: подпись слева, моноширинное значение справа — цифры не «прыгают»
      const chip = () => {
        const bg = s('rect', { y: L.y + 34, height: 30, rx: 7, fill: '#1e293b' });
        const caption = text(0, L.y + 49.5, '', { size: 13, weight: 600, fill: '#cbd5e1', anchor: 'start' });
        const value = text(0, L.y + 49, '', { size: 17, weight: 700, fill: '#38bdf8', anchor: 'end' });
        value.setAttribute('font-family', MONO);
        const g = s('g', {}, [bg, caption, value]);
        svg.append(g);
        return { g, bg, caption, value };
      };
      // Не больше двух живых счётчиков: итоговые числа и так стоят в панели показаний
      chips = [chip(), chip()];

      // Легенда цветов столбиков
      // (положения пунктов считаются по длине подписей — казахские длиннее русских)
      legend = [0, 1, 2].map(() => {
        const sw = s('rect', { y: L.y + 75, width: 13, height: 13, rx: 3 });
        const t = text(0, L.y + 82.5, '', { size: 13, weight: 500, fill: '#475569', anchor: 'start' });
        svg.append(sw, t);
        return { sw, t };
      });

      // Ось массива: основание столбиков
      svg.append(
        s('rect', { x: BARS.x - 4, y: BASE, width: BARS.w + 8, height: 3, rx: 1.5, fill: '#94a3b8' }),
      );

      // Искомое число x — пунктир на его высоте: бинарный поиск сравнивает с ним средний столбик
      keyLine = s('line', { x1: BARS.x - 4, x2: BARS.x + BARS.w + 4, stroke: '#16a34a', 'stroke-width': 2, 'stroke-dasharray': '7 5', opacity: 0 });
      // Подпись «x» — у левого края, где столбики самые низкие и не заслоняют её
      keyTag = s('g', { 'pointer-events': 'none' }, [
        s('rect', { x: BARS.x - 6, y: -9, width: 20, height: 18, rx: 5, fill: '#16a34a' }),
        text(BARS.x + 4, 0.5, 'x', { size: 14, weight: 800, fill: '#ffffff' }),
      ]);
      svg.append(keyLine);

      // Столбики — по одному на каждое число набора; лишние при малом n скрываются
      const gloss = d.lin([[0, '#ffffff', 0.35], [0.35, '#ffffff', 0.08], [0.7, '#000000', 0], [1, '#000000', 0.18]]);
      bars = new Map(POOL.map((v) => {
        const body = s('rect', { y: BASE - v * SCALE, height: v * SCALE, rx: 3, fill: BLUE, stroke: shade(BLUE, -0.35), 'stroke-width': 1.2 });
        const shine = s('rect', { y: BASE - v * SCALE, height: v * SCALE, rx: 3, fill: gloss, 'pointer-events': 'none' });
        const label = text(0, BASE - v * SCALE - 10, String(v), { size: 13, weight: 700, fill: '#1e293b' });
        // Светлая обводка: пунктир искомого x может пройти прямо по подписи числа
        label.setAttribute('stroke', '#eef2f7');
        label.setAttribute('stroke-width', 3);
        label.setAttribute('paint-order', 'stroke');
        const g = s('g', { 'pointer-events': 'none' }, [body, shine, label]);
        svg.append(g);
        return [v, { g, body, shine, label }];
      }));
      svg.append(keyTag);
      idxLabels = POOL.map((_, i) => {
        const t = text(0, BASE + 15, String(i), { size: 13, weight: 600, fill: '#64748b' });
        svg.append(t);
        return t;
      });
      // Указатели переменных цикла — цветные «таблички» под индексами, каждая в своей строке
      pills = [0, 1, 2].map((row) => {
        const bg = s('rect', { y: BASE + 27 + row * 17, height: 15, rx: 7.5, opacity: 0 });
        const t = text(0, BASE + 35 + row * 17, '', { size: 13, weight: 700, fill: '#ffffff' });
        t.setAttribute('font-family', MONO);
        svg.append(bg, t);
        return { bg, t };
      });
      // Зоны щелчка по столбикам (режим поиска): весь столбец экрана над индексом
      hits = POOL.map((_, i) => {
        const r = s('rect', { y: L.y + 92, height: BASE - L.y - 92 + 22, fill: 'transparent', style: 'cursor:pointer' });
        r.addEventListener('click', () => {
          if (!isSearch(params) || i >= params.n) return;
          set('key', arrayOf(params)[i]);
        });
        svg.append(r);
        return r;
      });

      // ── Правый монитор: редактор Python ──
      const R = monitor(svg, d, RIGHT);
      windowFrame(svg, d, R, { light: false });
      svg.append(text(R.x + R.w / 2, R.y + 13.5, tr('Редактор Python'), { size: 13, weight: 700, fill: '#e2e8f0' }));
      const tw = (R.w - 16) / 2;
      algoTabs = ALGOS.map((name, i) => {
        const t = tab(R.x + 6 + (i % 2) * (tw + 4), R.y + 34 + Math.floor(i / 2) * 34, tw, 28, tr(name), () => set('algo', i));
        svg.append(t.g);
        return t;
      });
      rowsG = s('g');
      svg.append(rowsG);

      // Кнопка «Пуск» / «На старт» и строка состояния
      const b = RUN_BTN;
      runPulse = s('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, rx: 14, fill: 'none', stroke: '#86efac', 'stroke-width': 3, opacity: 0 });
      runBtn = s('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 11, fill: HIT });
      runText = text(b.x + b.w / 2, b.y + b.h / 2 + 1, '', { size: 16, weight: 800, fill: '#ffffff' });
      const btn = s('g', { style: 'cursor:pointer' }, [
        runPulse,
        s('rect', { x: b.x, y: b.y + 3, width: b.w, height: b.h, rx: 11, fill: '#14532d' }),
        runBtn,
        s('rect', { x: b.x + 3, y: b.y + 3, width: b.w - 6, height: 14, rx: 7, fill: '#ffffff', 'fill-opacity': 0.18 }),
        runText,
      ]);
      btn.addEventListener('click', () => set('run', params.run ? 0 : 1));
      touchTarget(btn, 8);
      svg.append(
        s('line', { x1: R.x + 8, y1: b.y - 10, x2: R.x + R.w - 8, y2: b.y - 10, stroke: '#334155', 'stroke-width': 1.5 }),
        btn,
      );
      statusMain = text(b.x + b.w + 14, b.y + 13, '', { size: 15, weight: 700, fill: '#e2e8f0', anchor: 'start' });
      statusSub = text(b.x + b.w + 14, b.y + 33, '', { size: 13, weight: 500, fill: '#94a3b8', anchor: 'start' });
      svg.append(statusMain, statusSub);
    },

    frame(dt) {
      if (params.algo !== shownAlgo) drawCode(params.algo);
      const k = `${params.algo}|${params.n}|${params.run}|${isSearch(params) ? params.key : ''}`;
      if (k !== key) {
        key = k;
        restart();
      }
      if (play.phase === 'run') {
        play.k += dt * params.speed;
        while (play.phase === 'run' && play.k >= 1) {
          play.k -= 1;
          play.i++;
          if (play.i >= play.events.length) {
            play.phase = 'done';
            play.k = 0;
          }
        }
      }
      drawBars(dt);
      highlight();
      counters();

      for (const [i, t] of algoTabs.entries()) {
        const active = i === params.algo;
        const accent = i < 2 ? '#7c3aed' : '#0891b2';
        t.bg.setAttribute('fill', active ? accent : '#1f2937');
        t.bg.setAttribute('stroke', active ? shade(accent, -0.3) : '#475569');
        t.caption.setAttribute('fill', active ? '#ffffff' : '#cbd5e1');
      }
      runBtn.setAttribute('fill', params.run ? '#475569' : HIT);
      runText.textContent = params.run ? `↺ ${tr('На старт')}` : `▶ ${tr('Пуск')}`;
      // Пока программа не запущена, кнопка мягко пульсирует — подсказка, куда нажать
      pulse += dt;
      runPulse.setAttribute('opacity', params.run ? 0 : (0.35 + 0.35 * Math.sin(pulse * 4)).toFixed(2));
    },
  });

  function restart() {
    snap = true;
    if (!params.run) {
      play = { events: [], res: null, i: 0, k: 0, phase: 'idle' };
      return;
    }
    const res = trace(params);
    play = { events: res.events, res, i: 0, k: 0, phase: res.events.length ? 'run' : 'done' };
  }

  function drawCode(a) {
    shownAlgo = a;
    const R = { x: RIGHT.x + 12, w: RIGHT.w - 24 };
    rows = CODE[a].map((src, i) => {
      const y = RIGHT.y + 12 + 106 + i * ROW_H;
      const bar = s('rect', { x: R.x + 6, y: y - ROW_H / 2, width: R.w - 12, height: ROW_H - 1, rx: 4, fill: HIT, opacity: 0 });
      const g = s('g', {}, [
        bar,
        text(R.x + 30, y + 1, String(i + 1), { size: 13, weight: 500, fill: '#475569', anchor: 'end' }),
        codeLine(R.x + 40, y + 1, src),
      ]);
      return { g, bar };
    });
    rowsG.replaceChildren(...rows.map((r) => r.g));
  }

  // Что сейчас на экране: исходный массив, массив текущего шага или итог
  function current() {
    if (play.phase === 'run') return play.events[play.i];
    if (play.phase === 'done') return play.events.at(-1) ?? null;
    return null;
  }

  function drawBars(dt) {
    const e = current();
    const arr = e ? e.arr : arrayOf(params);
    const search = isSearch(params);
    const done = play.phase === 'done';
    const sw = Math.min(40, slot() * 0.7);
    const k = snap ? 1 : Math.min(1, dt * 14);
    snap = false;
    for (const [v, b] of bars) {
      const idx = arr.indexOf(v);
      b.g.setAttribute('opacity', idx < 0 ? 0 : 1);
      if (idx < 0) continue;
      const target = slotX(idx);
      const x = posX.has(v) && k < 1 ? posX.get(v) + (target - posX.get(v)) * k : target;
      posX.set(v, x);
      for (const r of [b.body, b.shine]) {
        r.setAttribute('x', (x - sw / 2).toFixed(1));
        r.setAttribute('width', sw.toFixed(1));
      }
      b.label.setAttribute('x', x.toFixed(1));

      // Цвет столбика: что с ним происходит на текущем шаге
      let fill = BLUE;
      if (!search) {
        if (done) fill = DONE;
        else if (e) {
          if (idx >= e.done[0] && idx < e.done[1]) fill = DONE;
          if (e.pair.includes(idx)) fill = e.swap ? SWAP : CMP;
        }
      } else if (e) {
        const inWindow = idx >= e.lo && idx <= e.hi;
        if (!inWindow) fill = IDLE_OUT;
        if (idx === e.pair[0]) fill = e.hit ? HIT : CMP;
        if (done && !e.hit && idx === e.pair[0]) fill = CMP;
      }
      b.body.setAttribute('fill', fill);
      b.body.setAttribute('stroke', shade(fill, -0.35));
      // Столбик с искомым числом обведён зелёным
      const isKey = search && v === params.key;
      b.body.setAttribute('stroke-width', isKey ? 3 : 1.2);
      if (isKey) b.body.setAttribute('stroke', '#15803d');
    }
    idxLabels.forEach((t, i) => {
      t.setAttribute('opacity', i < params.n ? 1 : 0);
      t.setAttribute('x', slotX(i).toFixed(1));
    });
    hits.forEach((r, i) => {
      r.setAttribute('x', (BARS.x + slot() * i).toFixed(1));
      r.setAttribute('width', slot().toFixed(1));
      r.setAttribute('pointer-events', search && i < params.n ? 'all' : 'none');
    });

    // Указатели переменных
    const marks = e && !(done && !search) ? e.marks : [];
    pills.forEach((p, row) => {
      const m = marks[row];
      p.bg.setAttribute('opacity', m ? 1 : 0);
      p.t.textContent = m ? m[0] : '';
      if (!m) return;
      const w = Math.max(18, m[0].length * 8.6 + 8);
      const cx = slotX(m[1]);
      p.bg.setAttribute('x', (cx - w / 2).toFixed(1));
      p.bg.setAttribute('width', w.toFixed(1));
      p.bg.setAttribute('fill', MARK[m[0]]);
      p.t.setAttribute('x', cx.toFixed(1));
    });

    const y = BASE - params.key * SCALE;
    keyLine.setAttribute('y1', y);
    keyLine.setAttribute('y2', y);
    keyLine.setAttribute('opacity', search ? 0.85 : 0);
    keyTag.setAttribute('transform', `translate(0 ${y})`);
    keyTag.setAttribute('opacity', search ? 1 : 0);
  }

  // Подсветка строк кода: в начале шага — проверяемое условие (жёлтым), затем выполненная строка
  function highlight() {
    const e = play.phase === 'run' ? play.events[play.i] : null;
    const finished = play.phase === 'done';
    for (const [i, r] of rows.entries()) {
      let fill = null;
      let op = 0;
      if (e) {
        if (i === e.line && (play.k > 0.35 || e.line === e.check)) {
          fill = e.line === e.check ? CMP : HIT;
          op = e.line === e.check ? 0.28 : 0.4;
        } else if (i === e.check && play.k <= 0.35) {
          fill = CMP;
          op = 0.28;
        }
      } else if (finished && i === rows.length - 1) {
        fill = HIT;
        op = 0.4;
      }
      if (fill) r.bar.setAttribute('fill', fill);
      r.bar.setAttribute('opacity', op);
    }
  }

  function counters() {
    const L = { x: LEFT.x + 12, w: LEFT.w - 24 };
    const search = isSearch(params);
    const e = current();
    const res = play.res;
    title.textContent = tr(search ? 'Массив a (отсортирован)' : 'Массив a');

    const items = search
      ? [[tr('Проверок'), String(e ? e.cmp : 0), 200]]
      : [[tr('Сравнений'), String(e ? e.cmp : 0), 200], [tr('Перестановок'), String(e ? e.swaps : 0), 220]];
    let x = L.x + 10;
    chips.forEach((c, i) => {
      const it = items[i];
      c.g.setAttribute('opacity', it ? 1 : 0);
      if (!it) return;
      c.bg.setAttribute('x', x);
      c.bg.setAttribute('width', it[2]);
      c.caption.setAttribute('x', x + 10);
      c.caption.textContent = it[0];
      c.value.setAttribute('x', x + it[2] - 10);
      c.value.textContent = it[1];
      x += it[2] + 6;
    });

    const leg = search
      ? [[CMP, 'проверяется'], [IDLE_OUT, 'вне поиска'], [HIT, 'найдено']]
      : [[CMP, 'сравниваются'], [SWAP, 'меняются местами'], [DONE, 'на своём месте']];
    let lx = L.x + 14;
    legend.forEach((l, i) => {
      l.sw.setAttribute('fill', leg[i][0]);
      l.sw.setAttribute('stroke', shade(leg[i][0], -0.35));
      l.sw.setAttribute('x', lx);
      l.t.setAttribute('x', lx + 19);
      l.t.textContent = tr(leg[i][1]);
      lx += 19 + (l.t.getComputedTextLength() || l.t.textContent.length * 7) + 22;
    });

    if (play.phase === 'idle') {
      statusMain.textContent = tr('Программа не запущена');
      statusMain.setAttribute('fill', '#e2e8f0');
      statusSub.textContent = tr(search ? 'Щёлкните столбик — это x' : 'Нажмите «Пуск»');
    } else if (play.phase === 'run') {
      statusMain.textContent = `${tr('Выполняется строка')} ${e.line + 1}`;
      statusMain.setAttribute('fill', '#fde68a');
      statusSub.textContent = '';
    } else if (!search) {
      statusMain.textContent = tr('Массив отсортирован');
      statusMain.setAttribute('fill', '#4ade80');
      statusSub.textContent = '';
    } else {
      statusMain.textContent = tr(res.k >= 0 ? 'Число найдено' : 'Числа нет в массиве');
      statusMain.setAttribute('fill', res.k >= 0 ? '#4ade80' : '#f87171');
      statusSub.textContent = '';
    }
  }

  return { destroy: () => scene.destroy() };
}
