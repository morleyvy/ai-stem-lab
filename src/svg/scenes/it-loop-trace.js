// Сцена «Робот-закрасчик»: на столе монитор со средой программирования. Слева — поле робота
// (старт, коридор из L клеток, за ним кирпичная стена) и трассировочная таблица, справа — вкладки
// программ, код на Python с подсветкой выполняемой строки, кнопки «Шаг», «Пуск», «На старт» и окно вывода.
// Счётчики (шаги, выполнения тела, клетки) показывает панель показаний под сценой, поэтому в окне
// вывода — только то, что вывела бы сама программа: print(k) или сообщение об ошибке.
// Модель (src/sims/it-loop-trace.js) даёт готовый список шагов; сцена лишь проигрывает его:
// робот едет по клеткам, клетки закрашиваются, строки таблицы появляются по одной.

import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 500;
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';
const CELL = 36;
const FIELD = { x: 44, y: 34, w: 464, h: 212 };
const GX = FIELD.x + (FIELD.w - 12 * CELL) / 2; // левый край столбца старта
const GY = 86;
const TABLE = { x: 44, y: 256, w: 464, h: 196 };
const ROW_H = 20;
const TABLE_ROWS = 7;
const EDITOR = { x: 520, y: 34, w: 398 };
const TAB_W = [108, 118, 158]; // вкладка вложенного цикла шире: длинная подпись, особенно по-казахски
const CODE_Y = 90;
const LINE_H = 25;
const CHAR_W = 9.05; // ширина знака моноширинного шрифта 15px
const BTN_Y = 274;
const CONSOLE = { x: 520, y: 324, w: 398, h: 128 };

const PAINT = '#14b8a6';
const OK = '#4ade80';
const BAD = '#f87171';
const COND = '#facc15';
const FALSE = '#fb923c'; // False — обычный конец цикла, не ошибка: оранжевый, а не красный

const cx = (c) => GX + c * CELL + CELL / 2;
const cy = (r) => GY + r * CELL + CELL / 2;

// Подсветка синтаксиса Python: ключевые слова, встроенные функции, числа
const TOKEN = /(\s+)|\b(for|in|while)\b|\b(range|print)\b|(\d+)|\b(robot)\b|([A-Za-z_]\w*)|(.)/g;
function codeLine(x, y, src) {
  const indent = src.length - src.trimStart().length;
  const t = text(x + indent * CHAR_W, y, '', { size: 15, weight: 500, fill: '#e2e8f0', anchor: 'start' });
  t.setAttribute('font-family', MONO);
  t.style.whiteSpace = 'pre';
  for (const m of src.trimStart().matchAll(TOKEN)) {
    const fill = m[2] ? '#c084fc' : m[3] ? '#38bdf8' : m[4] ? '#fbbf24' : m[5] ? '#7dd3fc' : m[6] ? '#e2e8f0' : '#94a3b8';
    const span = s('tspan', { fill });
    span.textContent = m[0];
    t.append(span);
  }
  return t;
}

export function itLoopScene(container, params, set, { trace, code, PROG_NAMES, ROWS, COLS, RUN }) {
  const cells = [];
  const nums = [];
  const tabs = [];
  const rows = [];
  let robot, robotBody, wallFlash, tableHead, tableEmpty, rowHi, codeG, lineHi, note, cols;
  let out;
  let tr0 = trace(params);
  let sig = '';
  let vis = 0;
  let speed = 4;
  let aim = -1;
  let bump = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // ── Монитор на подставке ──
      svg.append(
        floorShadow(480, BENCH + 4, 200, d),
        s('rect', { x: 400, y: BENCH - 8, width: 160, height: 12, rx: 6, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']]) }),
        s('rect', { x: 452, y: 466, width: 56, height: 30, fill: d.lin([[0, '#475569'], [0.45, '#94a3b8'], [1, '#334155']]) }),
        s('rect', { x: 12, y: 6, width: 936, height: 466, rx: 18, fill: d.lin([[0, '#334155'], [1, '#0f172a']], 'v'), filter: d.url('soft') }),
        s('rect', { x: 14, y: 8, width: 932, height: 10, rx: 5, fill: '#ffffff', 'fill-opacity': 0.08 }),
        s('circle', { cx: 480, cy: 13, r: 2.5, fill: '#020617' }),
        s('rect', { x: 26, y: 20, width: 908, height: 440, rx: 6, fill: d.lin([[0, '#0b1220'], [1, '#111a2c']], 'v') }),
      );

      // ── Поле робота ──
      const f = FIELD;
      svg.append(s('rect', { x: f.x, y: f.y, width: f.w, height: f.h, rx: 10, fill: d.lin([[0, '#f1f5f9'], [1, '#dfe6ee']], 'v') }));
      svg.append(text(f.x + 14, f.y + 17, tr('Поле робота'), { size: 15, weight: 700, fill: '#1e293b', anchor: 'start' }));
      const brick = d.pattern('brick', 24, 12, [
        s('rect', { width: 24, height: 12, fill: '#9a4a2a' }),
        s('path', { d: 'M0 0.5 H24 M0 6.5 H24 M6 0 V6 M18 6 V12', stroke: '#e7c9a9', 'stroke-width': 1.2 }),
      ]);
      for (let c = 0; c <= COLS; c++) {
        nums[c] = text(cx(c), GY - 11, c ? String(c) : '', { size: 13, weight: 600, fill: '#64748b' });
        svg.append(nums[c]);
        cells[c] = [];
        for (let r = 0; r < ROWS; r++) {
          const base = s('rect', { x: GX + c * CELL + 1, y: GY + r * CELL + 1, width: CELL - 2, height: CELL - 2, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 });
          const wall = s('rect', { x: GX + c * CELL, y: GY + r * CELL, width: CELL, height: CELL, fill: brick, opacity: 0 });
          const paint = s('rect', { x: GX + c * CELL + 3, y: GY + r * CELL + 3, width: CELL - 6, height: CELL - 6, rx: 3, fill: d.lin([[0, '#5eead4'], [1, PAINT]], 'v'), opacity: 0 });
          svg.append(base, wall, paint);
          cells[c][r] = { base, wall, paint };
        }
      }
      // Метка старта: стрелка на полу клетки 0
      for (let r = 0; r < ROWS; r++) {
        svg.append(s('path', { d: `M${cx(0) - 6} ${cy(r) - 8} L${cx(0) + 6} ${cy(r)} L${cx(0) - 6} ${cy(r) + 8} Z`, fill: '#94a3b8', 'fill-opacity': 0.35 }));
      }
      wallFlash = s('rect', { x: 0, y: 0, width: CELL, height: CELL, fill: 'none', stroke: BAD, 'stroke-width': 4, rx: 4, opacity: 0 });
      svg.append(wallFlash);

      // Робот: корпус, голова с глазами и антенной, валик для закраски справа
      robotBody = s('rect', { x: -11, y: -5, width: 20, height: 14, rx: 4, fill: d.lin([[0, '#fbbf24'], [1, '#d97706']], 'v'), stroke: '#92400e', 'stroke-width': 1 });
      robot = s('g', { 'pointer-events': 'none' }, [
        s('ellipse', { cx: 0, cy: 14, rx: 13, ry: 3, fill: '#0f172a', 'fill-opacity': 0.2 }),
        s('circle', { cx: -6, cy: 11, r: 3.5, fill: '#334155' }),
        s('circle', { cx: 5, cy: 11, r: 3.5, fill: '#334155' }),
        robotBody,
        s('rect', { x: -9, y: -16, width: 16, height: 11, rx: 4, fill: '#e2e8f0', stroke: '#475569', 'stroke-width': 1 }),
        s('circle', { cx: -4.5, cy: -10.5, r: 2, fill: '#0f172a' }),
        s('circle', { cx: 2.5, cy: -10.5, r: 2, fill: '#0f172a' }),
        s('path', { d: 'M-1 -16 V-21', stroke: '#475569', 'stroke-width': 1.5 }),
        s('circle', { cx: -1, cy: -22, r: 2, fill: '#ef4444' }),
        s('path', { d: 'M9 2 H14', stroke: '#475569', 'stroke-width': 2 }),
        s('rect', { x: 13, y: -6, width: 5, height: 16, rx: 2.5, fill: PAINT, stroke: '#0f766e', 'stroke-width': 1 }),
      ]);
      svg.append(robot);

      // ── Трассировочная таблица ──
      const tb = TABLE;
      svg.append(
        s('rect', { x: tb.x, y: tb.y, width: tb.w, height: tb.h, rx: 10, fill: '#0f172a', stroke: '#1e293b', 'stroke-width': 1 }),
        text(tb.x + 14, tb.y + 16, tr('Трассировочная таблица'), { size: 15, weight: 700, fill: '#e2e8f0', anchor: 'start' }),
        s('rect', { x: tb.x + 8, y: tb.y + 28, width: tb.w - 16, height: 22, rx: 4, fill: '#1e293b' }),
      );
      tableHead = s('g');
      svg.append(tableHead);
      rowHi = s('rect', { x: tb.x + 8, y: 0, width: tb.w - 16, height: ROW_H, rx: 4, fill: '#38bdf8', 'fill-opacity': 0.16, opacity: 0 });
      svg.append(rowHi);
      for (let j = 0; j < TABLE_ROWS; j++) {
        const y = tb.y + 62 + j * ROW_H;
        const cellsJ = Array.from({ length: 5 }, () => {
          const t = text(0, y, '', { size: 14, weight: 500, fill: '#cbd5e1' });
          t.setAttribute('font-family', MONO);
          svg.append(t);
          return t;
        });
        rows.push(cellsJ);
      }
      tableEmpty = text(tb.x + tb.w / 2, tb.y + 120, tr('Нажмите «Шаг» или «Пуск»'), { size: 15, weight: 500, fill: '#64748b' });
      svg.append(tableEmpty);

      // ── Вкладки программ ──
      const e = EDITOR;
      PROG_NAMES.forEach((name, k) => {
        const x = e.x + TAB_W.slice(0, k).reduce((a, w) => a + w + 7, 0);
        const w = TAB_W[k];
        const label = tr(name);
        const bg = s('rect', { x, y: e.y, width: w, height: 34, rx: 8, fill: '#1e293b' });
        const t = text(x + w / 2, e.y + 17, label, { size: Math.min(15, (w - 14) / (label.length * 0.58)), weight: 700, fill: '#94a3b8' });
        const g = s('g', { style: 'cursor:pointer' }, [bg, t]);
        g.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          set('prog', k);
        });
        touchTarget(g, 4);
        svg.append(g);
        tabs.push({ bg, t });
      });
      svg.append(s('rect', { x: e.x, y: e.y + 30, width: e.w, height: 198, rx: 8, fill: '#0f172a', stroke: '#1e293b' }));
      lineHi = s('g');
      codeG = s('g');
      note = text(e.x + 16, e.y + 210, '', { size: 14, weight: 500, fill: '#94a3b8', anchor: 'start' });
      svg.append(lineHi, codeG, note);

      // ── Кнопки выполнения ──
      const button = (x, w, label, color, icon, onClick) => {
        const g = s('g', { style: 'cursor:pointer' }, [
          s('rect', { x, y: BTN_Y, width: w, height: 38, rx: 9, fill: d.lin([[0, color], [1, shade(color, -0.22)]], 'v') }),
          s('rect', { x: x + 2, y: BTN_Y + 2, width: w - 4, height: 14, rx: 7, fill: '#ffffff', 'fill-opacity': 0.14 }),
          s('path', { d: icon(x + 20, BTN_Y + 19), fill: '#ffffff' }),
          text(x + w / 2 + 10, BTN_Y + 19, tr(label), { size: 15, weight: 700, fill: '#ffffff' }),
        ]);
        g.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          onClick();
        });
        touchTarget(g, 4);
        svg.append(g);
      };
      const play = (x, y) => `M${x - 5} ${y - 7} L${x + 6} ${y} L${x - 5} ${y + 7} Z`;
      button(e.x, 124, 'Шаг', '#2563eb', (x, y) => `${play(x - 2, y)} M${x + 5} ${y - 7} h3 v14 h-3 Z`, () => {
        // Один шаг — одна проверка условия цикла; последний шаг переводит программу в «выполнена»
        const total = trace(params).total;
        const now = Math.min(params.t, total);
        if (now >= total) return;
        set('t', now + 1 >= total ? RUN : now + 1);
      });
      button(e.x + 132, 124, 'Пуск', '#16a34a', play, () => set('t', RUN));
      button(e.x + 264, 134, 'На старт', '#475569', (x, y) => `M${x - 6} ${y - 6} h12 v12 h-12 Z`, () => set('t', 0));

      // ── Окно вывода ──
      const cn = CONSOLE;
      svg.append(
        s('rect', { x: cn.x, y: cn.y, width: cn.w, height: cn.h, rx: 10, fill: '#020617', stroke: '#1e293b' }),
        text(cn.x + 14, cn.y + 16, tr('Вывод'), { size: 14, weight: 700, fill: '#64748b', anchor: 'start' }),
      );
      out = text(cn.x + 20, cn.y + 74, '', { size: 28, weight: 800, fill: OK, anchor: 'start' });
      out.setAttribute('font-family', MONO);
      svg.append(out);
    },

    frame(dt) {
      const key = `${params.prog},${params.N},${params.L},${params.R}`;
      if (key !== sig) {
        tr0 = trace(params);
        // После «Пуска» программа с новыми параметрами выполняется заново на глазах у ученика;
        // в пошаговом режиме сразу показываем то же число шагов
        if (sig) vis = params.t >= RUN ? 0 : Math.min(params.t, tr0.total);
        aim = -1;
        sig = key;
        renderCode();
      }
      const { events, total } = tr0;
      const target = Math.min(params.t, total);
      if (target < vis) vis = target;
      // Скорость проигрывания выбирается при новой цели: один «Шаг» идёт ~0,25 с, а «Пуск» любой
      // длины укладывается примерно в 1,4 с — длинный вложенный цикл не тянется
      if (target !== aim) {
        aim = target;
        speed = Math.max(4, (target - vis) / 1.4);
      }
      if (vis < target) vis = Math.min(target, vis + dt * speed);
      const k = Math.floor(vis + 1e-9);
      const f = vis - k;
      const moving = k < target;
      const cur = moving ? events[k] : events[k - 1];

      // Клетки: старт, коридор 1 … L, стена; закраска — по пройденным шагам
      const painted = new Set();
      for (let j = 0; j < k; j++) if (events[j].cell) painted.add(`${events[j].cell.c},${events[j].cell.r}`);
      if (moving && f > 0.5 && events[k].cell) painted.add(`${events[k].cell.c},${events[k].cell.r}`);
      for (let c = 0; c <= COLS; c++) {
        const wall = c > params.L;
        nums[c].setAttribute('fill', wall ? '#b6c2cf' : '#475569');
        nums[c].textContent = c && c <= params.L ? String(c) : '';
        for (let r = 0; r < ROWS; r++) {
          const cell = cells[c][r];
          cell.wall.setAttribute('opacity', wall ? 1 : 0);
          cell.base.setAttribute('fill', c === 0 ? '#e2e8f0' : '#ffffff');
          cell.paint.setAttribute('opacity', painted.has(`${c},${r}`) ? 1 : 0);
        }
      }
      
      // Робот: плавно едет к клетке следующего шага; на шаге с ошибкой — тычется в стену
      const from = k ? events[k - 1].pos : { c: 0, r: 0 };
      let x = cx(from.c);
      let y = cy(from.r);
      if (moving) {
        const e = events[k];
        if (e.err) x += Math.sin(f * Math.PI) * 10;
        else if (e.pos.r !== from.r) {
          // robot.left(N), затем robot.down(): сначала назад по строке, потом вниз
          const h = Math.min(1, f / 0.6);
          const v = Math.max(0, (f - 0.6) / 0.4);
          x = cx(from.c + (e.pos.c - from.c) * h);
          y = cy(from.r + (e.pos.r - from.r) * v);
        } else {
          x = cx(from.c + (e.pos.c - from.c) * f);
        }
      }
      const crashed = !moving && k > 0 && events[k - 1].err;
      if (crashed) bump = Math.min(1, bump + dt * 3);
      else bump = 0;
      robot.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      robotBody.setAttribute('fill', crashed ? BAD : robotFill);
      if (crashed) {
        const p = events[k - 1].pos;
        wallFlash.setAttribute('x', GX + (params.L + 1) * CELL);
        wallFlash.setAttribute('y', GY + p.r * CELL);
      }
      wallFlash.setAttribute('opacity', crashed ? (0.55 + 0.45 * Math.sin(bump * Math.PI * 3)).toFixed(2) : 0);

      // Строки кода: жёлтая — проверяемое условие, зелёные — выполненное тело, красная — ошибка
      for (const [j, hl] of lineHi.childNodes.entries()) {
        let fill = 'none';
        if (cur && j === cur.check) fill = cur.cond ? COND : FALSE;
        if (cur && cur.run.includes(j)) fill = cur.err ? BAD : OK;
        hl.setAttribute('fill', fill);
      }
      tabs.forEach(({ bg, t }, j) => {
        bg.setAttribute('fill', j === params.prog ? '#0f172a' : '#1e293b');
        bg.setAttribute('stroke', j === params.prog ? '#38bdf8' : 'none');
        t.setAttribute('fill', j === params.prog ? '#e0f2fe' : '#94a3b8');
      });

      renderTable(events, k);

      // Окно вывода: print(k) печатает только программа while, а ошибка — как сообщение интерпретатора
      const last = k ? events[k - 1] : null;
      if (last?.err) {
        out.textContent = tr('Ошибка: справа стена');
        out.setAttribute('fill', BAD);
        out.setAttribute('font-size', 18);
      } else {
        out.textContent = k === total && params.prog === 1 ? String(last.out) : '';
        out.setAttribute('fill', OK);
        out.setAttribute('font-size', 28);
      }
    },
  });

  const robotFill = robotBody.getAttribute('fill');

  // Код и столбцы таблицы перестраиваются только при смене программы или чисел в ней
  function renderCode() {
    const lines = code(params);
    codeG.replaceChildren();
    lineHi.replaceChildren();
    lines.forEach((src, j) => {
      const y = CODE_Y + j * LINE_H;
      lineHi.append(s('rect', { x: EDITOR.x + 4, y: y - 11, width: EDITOR.w - 8, height: 22, rx: 4, fill: 'none', 'fill-opacity': 0.2 }));
      codeG.append(
        text(EDITOR.x + 20, y, String(j + 1), { size: 13, weight: 500, fill: '#475569' }),
        codeLine(EDITOR.x + 40, y, src),
      );
    });
    const { N, R } = params;
    if (params.prog === 0) {
      const vals = N <= 6 ? Array.from({ length: N }, (_, i) => i).join(', ') : `0, 1, 2, … ${N - 1}`;
      note.textContent = `range(${N}) → i = ${vals}`;
    } else if (params.prog === 1) {
      note.textContent = tr('Тело повторяется, пока условие True');
    } else {
      note.textContent = `${tr('Тело внутреннего цикла')}: ${R} × ${N} = ${R * N}`;
    }

    const x0 = TABLE.x;
    cols = params.prog === 2
      ? [{ x: x0 + 34, h: '№' }, { x: x0 + 100, h: 'row', v: 'row' }, { x: x0 + 160, h: 'i', v: 'i' }, { x: x0 + 260, h: tr('Условие') }, { x: x0 + 390, h: tr('Закрашено') }]
      : [{ x: x0 + 40, h: '№' }, { x: x0 + 120, h: params.prog === 0 ? 'i' : 'k', v: params.prog === 0 ? 'i' : 'k' }, { x: x0 + 240, h: tr('Условие') }, { x: x0 + 380, h: tr('Закрашено') }];
    tableHead.replaceChildren(...cols.map((c) => text(c.x, TABLE.y + 39, c.h, { size: 14, weight: 700, fill: '#94a3b8' })));
  }

  function renderTable(events, k) {
    const from = Math.max(0, k - TABLE_ROWS);
    tableEmpty.setAttribute('opacity', k ? 0 : 1);
    rowHi.setAttribute('opacity', k ? 1 : 0);
    rowHi.setAttribute('y', TABLE.y + 62 + (k - from - 1) * ROW_H - ROW_H / 2);
    rows.forEach((cellsJ, j) => {
      const e = events[from + j];
      const shown = e && from + j < k;
      cellsJ.forEach((t, ci) => {
        const c = cols[ci];
        if (!c || !shown) {
          t.textContent = '';
          return;
        }
        t.setAttribute('x', c.x);
        let value;
        let fill = '#cbd5e1';
        if (ci === 0) value = String(from + j + 1);
        else if (c.v) value = e.vars[c.v] ?? '—';
        else if (ci === cols.length - 2) {
          value = e.cond ? 'True' : 'False';
          fill = e.cond ? OK : FALSE;
        } else if (e.err) {
          value = tr('стена!');
          fill = BAD;
        } else value = String(e.painted);
        t.textContent = String(value);
        t.setAttribute('fill', fill);
      });
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
