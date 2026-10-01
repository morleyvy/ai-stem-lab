// Сцена «Робот-исполнитель: ветвление»: кабинет информатики, на столе два монитора.
// Слева — среда исполнителя «Робот»: вкладки лабиринтов и поле 5 × 5 с координатами (стены — объёмные блоки, финиш — клетчатый флажок). Справа — редактор: вкладки
// программ, программа из блоков и рядом та же программа на Python, строка к строке; внизу — кнопка
// «Пуск» и короткая строка состояния. Число команд и клетка робота показаны только в панели
// показаний под сценой, чтобы не дублировать их на экранах. Ученик сам:
//   щёлкает вкладку лабиринта (maze) или программы (prog) — поле и текст программы меняются;
//   нажимает «Пуск» (run = 1) — робот выполняет программу по шагам: проверяемое условие подсвечено
//   жёлтым, выполняемая команда — зелёным, ошибка — красным; повторный щелчок возвращает на старт.
// Путь робота берётся из execute() модели — сцена его только проигрывает со скоростью speed команд/с.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 506;
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';
const LEFT = { x: 18, y: 14, w: 360, h: 448 };
const RIGHT = { x: 394, y: 14, w: 548, h: 448 };
const C = 54; // сторона клетки поля
const FIELD = { x: 75, y: 118 };
const ROWS = { x: 414, y: 118, h: 31, blockW: 240, code: 694 };
const RUN_BTN = { x: 416, y: 374, w: 156, h: 46 };

const COLORS = {
  move: '#2563eb',
  turn: '#0891b2',
  loop: '#7c3aed',
  if: '#d97706',
  else: '#b45309',
};
const CHECK = '#fbbf24';
const OK = '#22c55e';
const FAIL = '#ef4444';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => k * k * (3 - 2 * k);

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

// Вкладка, которую можно нажать: подложка + подпись; длинная подпись ужимается, но не мельче 13
function tab(x, y, w, h, label, onClick) {
  const bg = s('rect', { x, y, width: w, height: h, rx: 8 });
  const size = Math.max(13, Math.min(15, (w - 14) / (label.length * 0.56)));
  const caption = text(x + w / 2, y + h / 2 + 1, label, { size, weight: 700 });
  const g = s('g', { style: 'cursor:pointer' }, [bg, caption]);
  g.addEventListener('click', onClick);
  touchTarget(g, 6);
  return { g, bg, caption };
}

// Python с подсветкой синтаксиса: ключевые слова, объект робота, имена команд
function codeLine(x, y, src) {
  const t = text(x, y, '', { size: 14, weight: 500, fill: '#cbd5e1', anchor: 'start' });
  t.setAttribute('font-family', MONO);
  // Отступ — часть синтаксиса Python, пробелы в начале строки нельзя схлопывать
  t.style.whiteSpace = 'pre';
  const lead = src.match(/^ */)[0].length;
  if (lead) t.append(document.createTextNode(' '.repeat(lead)));
  for (const part of src.trim().split(/(\bwhile\b|\bnot\b|\belif\b|\bif\b|\belse\b|\brobot\b|\.\w+|\(\)|:)/).filter(Boolean)) {
    const color = /^(while|not|elif|if|else)$/.test(part) ? '#f472b6'
      : part === 'robot' ? '#7dd3fc'
        : part.startsWith('.') ? '#fde68a'
          : '#94a3b8';
    const span = s('tspan', { fill: color, 'font-weight': /^(while|not|elif|if|else)$/.test(part) ? 700 : 500 });
    span.textContent = part;
    t.append(span);
  }
  return t;
}

// Робот сверху: корпус, колёса по бокам, датчик-бампер спереди и стрелка направления
function robotBody(d) {
  return s('g', {}, [
    s('ellipse', { cx: 2, cy: 4, rx: 22, ry: 22, fill: '#0f172a', 'fill-opacity': 0.18 }),
    ...[-1, 1].map((k) => s('rect', { x: k * 19 - 5, y: -13, width: 10, height: 26, rx: 4, fill: d.lin([[0, '#111827'], [0.5, '#4b5563'], [1, '#111827']]) })),
    s('rect', { x: -16, y: -17, width: 32, height: 34, rx: 9, fill: d.lin([[0, '#38bdf8'], [0.5, '#0ea5e9'], [1, '#0369a1']]), stroke: '#075985', 'stroke-width': 1.5 }),
    s('rect', { x: -13, y: -14, width: 26, height: 8, rx: 4, fill: '#ffffff', 'fill-opacity': 0.28 }),
    s('rect', { x: -12, y: -21, width: 24, height: 6, rx: 3, fill: '#fbbf24', stroke: '#b45309', 'stroke-width': 1 }),
    s('circle', { cx: -6, cy: -9, r: 3, fill: '#e0f2fe' }),
    s('circle', { cx: 6, cy: -9, r: 3, fill: '#e0f2fe' }),
    s('path', { d: 'M0 -3 L8 9 H-8 Z', fill: '#ffffff' }),
  ]);
}

export function itRobotScene(container, params, set, { MAZES, PROGRAMS, START, SIZE, execute }) {
  let mazeTabs, progTabs, walls, finishMark, trail, robot, cellFlash, rowsG, runBtn, runText, runPulse;
  let statusMain, statusSub;
  let rows = [];
  // Клетки, через которые робот уже проехал, — по ним рисуется пунктирный след
  let trailPts = [];
  let key = '';
  let shownMaze = -1;
  let shownProg = -1;
  // Проигрывание: события из execute(), номер текущего, доля его выполнения
  let play = { events: [], res: null, i: 0, k: 0, phase: 'idle', angles: [0] };
  let pulse = 0;

  const cellX = (x) => FIELD.x + (x - 1) * C + C / 2;
  const cellY = (y) => FIELD.y + (SIZE - y) * C + C / 2;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // ── Левый монитор: исполнитель «Робот» ──
      const L = monitor(svg, d, LEFT);
      svg.append(
        s('rect', { x: L.x, y: L.y, width: L.w, height: L.h, rx: 6, fill: d.lin([[0, '#f1f5f9'], [1, '#e2e8f0']], 'v') }),
        s('rect', { x: L.x, y: L.y, width: L.w, height: 26, rx: 6, fill: '#cbd5e1' }),
        s('rect', { x: L.x, y: L.y + 20, width: L.w, height: 6, fill: '#cbd5e1' }),
        ...['#f87171', '#fbbf24', '#4ade80'].map((c, i) => s('circle', { cx: L.x + 14 + i * 14, cy: L.y + 13, r: 4.5, fill: c })),
        text(L.x + L.w / 2 + 14, L.y + 13.5, tr('Исполнитель «Робот»'), { size: 13, weight: 700, fill: '#334155' }),
      );
      mazeTabs = [0, 1, 2].map((i) => tab(L.x + 10 + i * 107, L.y + 34, 101, 30, tr(`Лабиринт ${i + 1}`), () => set('maze', i)));
      mazeTabs.forEach((t) => svg.append(t.g));

      // Поле: подложка, клетки, стены (перерисовываются при смене лабиринта), координаты
      const fw = SIZE * C;
      svg.append(
        s('rect', { x: FIELD.x - 6, y: FIELD.y - 6, width: fw + 12, height: fw + 12, rx: 8, fill: '#94a3b8' }),
        s('rect', { x: FIELD.x, y: FIELD.y, width: fw, height: fw, fill: '#f8fafc' }),
      );
      const grid = s('g', { stroke: '#cbd5e1', 'stroke-width': 1.2 });
      for (let i = 1; i < SIZE; i++) {
        grid.append(
          s('line', { x1: FIELD.x + i * C, y1: FIELD.y, x2: FIELD.x + i * C, y2: FIELD.y + fw }),
          s('line', { x1: FIELD.x, y1: FIELD.y + i * C, x2: FIELD.x + fw, y2: FIELD.y + i * C }),
        );
      }
      svg.append(grid);
      for (let i = 1; i <= SIZE; i++) {
        svg.append(
          text(cellX(i), FIELD.y + fw + 17, String(i), { size: 13, weight: 700, fill: '#475569' }),
          text(FIELD.x - 17, cellY(i), String(i), { size: 13, weight: 700, fill: '#475569' }),
        );
      }
      svg.append(
        text(FIELD.x + fw + 14, FIELD.y + fw + 17, 'x', { size: 14, weight: 700, fill: '#64748b' }),
        text(FIELD.x - 33, FIELD.y + 8, 'y', { size: 14, weight: 700, fill: '#64748b' }),
        // Старт у всех лабиринтов один — клетка (1; 1), подсвечена зелёным
        s('rect', { x: cellX(START.x) - C / 2 + 2, y: cellY(START.y) - C / 2 + 2, width: C - 4, height: C - 4, rx: 5, fill: '#dcfce7', stroke: '#4ade80', 'stroke-width': 2 }),
      );
      const checker = d.pattern('robotFinish', 12, 12, [
        s('rect', { width: 12, height: 12, fill: '#ffffff' }),
        s('rect', { width: 6, height: 6, fill: '#334155' }),
        s('rect', { x: 6, y: 6, width: 6, height: 6, fill: '#334155' }),
      ]);
      finishMark = s('g', { 'pointer-events': 'none' }, [
        s('rect', { x: -C / 2 + 3, y: -C / 2 + 3, width: C - 6, height: C - 6, rx: 4, fill: checker, 'fill-opacity': 0.35 }),
        s('line', { x1: -10, y1: 18, x2: -10, y2: -18, stroke: '#475569', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        s('path', { d: 'M-9 -18 L14 -11 L-9 -3 Z', fill: '#ef4444', stroke: '#b91c1c', 'stroke-width': 1 }),
      ]);
      walls = s('g');
      trail = s('polyline', { fill: 'none', stroke: '#38bdf8', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '2 9', opacity: 0.9 });
      cellFlash = s('rect', { width: C, height: C, fill: FAIL, opacity: 0 });
      robot = s('g', { 'pointer-events': 'none' }, [robotBody(d)]);
      svg.append(walls, finishMark, trail, cellFlash, robot);

      // ── Правый монитор: редактор программы ──
      const R = monitor(svg, d, RIGHT);
      svg.append(
        s('rect', { x: R.x, y: R.y, width: R.w, height: R.h, rx: 6, fill: d.lin([[0, '#111827'], [1, '#0b1220']], 'v') }),
        s('rect', { x: R.x, y: R.y, width: R.w, height: 26, rx: 6, fill: '#1f2937' }),
        s('rect', { x: R.x, y: R.y + 20, width: R.w, height: 6, fill: '#1f2937' }),
        ...['#f87171', '#fbbf24', '#4ade80'].map((c, i) => s('circle', { cx: R.x + 14 + i * 14, cy: R.y + 13, r: 4.5, fill: c })),
        text(R.x + 62, R.y + 13.5, tr('Редактор программы'), { size: 13, weight: 700, fill: '#e2e8f0', anchor: 'start' }),
      );
      const widths = [128, 180, 192];
      let tx = R.x + 10;
      progTabs = widths.map((w, i) => {
        const t = tab(tx, R.y + 34, w, 30, tr(['линейная', 'ветвление if–else', 'ветвление if–elif–else'][i]), () => set('prog', i));
        tx += w + 5;
        svg.append(t.g);
        return t;
      });
      svg.append(
        text(ROWS.x + 4, R.y + 82, tr('Блоки'), { size: 13, weight: 700, fill: '#94a3b8', anchor: 'start' }),
        text(ROWS.code - 18, R.y + 82, 'Python', { size: 13, weight: 700, fill: '#94a3b8', anchor: 'start' }),
        s('line', { x1: ROWS.x + ROWS.blockW + 12, y1: R.y + 72, x2: ROWS.x + ROWS.blockW + 12, y2: 352, stroke: '#334155', 'stroke-width': 1.5 }),
      );
      rowsG = s('g');
      svg.append(rowsG);

      // Кнопка «Пуск» / «На старт» и строка состояния
      const b = RUN_BTN;
      runPulse = s('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, rx: 14, fill: 'none', stroke: '#86efac', 'stroke-width': 3, opacity: 0 });
      runBtn = s('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 11, fill: OK });
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
        s('line', { x1: R.x + 8, y1: 362, x2: R.x + R.w - 8, y2: 362, stroke: '#334155', 'stroke-width': 1.5 }),
        btn,
      );
      statusMain = text(b.x + b.w + 16, b.y + 13, '', { size: 15, weight: 700, fill: '#e2e8f0', anchor: 'start' });
      statusSub = text(b.x + b.w + 16, b.y + 35, '', { size: 13, weight: 500, fill: '#94a3b8', anchor: 'start' });
      svg.append(statusMain, statusSub);
    },

    frame(dt) {
      if (params.maze !== shownMaze) drawMaze(params.maze);
      if (params.prog !== shownProg) drawProgram(params.prog);
      const k = `${params.maze}|${params.prog}|${params.run}`;
      if (k !== key) {
        key = k;
        restart();
      }

      // Выполнение: каждая команда занимает 1/speed с
      if (play.phase === 'run') {
        play.k += dt * params.speed;
        while (play.phase === 'run' && play.k >= 1) {
          const e = play.events[play.i];
          if (e.ok && e.cmd === 'F') trailPts.push(e.to);
          play.k -= 1;
          play.i++;
          if (play.i >= play.events.length) {
            play.phase = 'done';
            play.k = 0;
          }
        }
      }
      pose();
      highlight();
      status();

      for (const [i, t] of mazeTabs.entries()) paintTab(t, i === params.maze, '#e2e8f0', '#0ea5e9');
      for (const [i, t] of progTabs.entries()) paintTab(t, i === params.prog, '#1f2937', '#7c3aed');
      runBtn.setAttribute('fill', params.run ? '#475569' : OK);
      runText.textContent = params.run ? `↺ ${tr('На старт')}` : `▶ ${tr('Пуск')}`;
      // Пока программа не запущена, кнопка мягко пульсирует — подсказка, куда нажать
      pulse += dt;
      runPulse.setAttribute('opacity', params.run ? 0 : (0.35 + 0.35 * Math.sin(pulse * 4)).toFixed(2));
    },
  });

  function restart() {
    trailPts = [{ ...START }];
    if (!params.run) {
      play = { events: [], res: null, i: 0, k: 0, phase: 'idle', angles: [0] };
      return;
    }
    const res = execute(params);
    // Угол робота копится непрерывно (270° → 360°, а не обратно к 0°), чтобы поворот шёл в нужную сторону
    const angles = [0];
    for (const e of res.events) angles.push(angles.at(-1) + (e.cmd === 'R' ? 90 : e.cmd === 'L' ? -90 : 0));
    play = { events: res.events, res, i: 0, k: 0, phase: res.events.length ? 'run' : 'done', angles };
  }

  function drawMaze(m) {
    shownMaze = m;
    const maze = MAZES[m];
    const blocks = [];
    for (let x = 1; x <= SIZE; x++) {
      for (let y = 1; y <= SIZE; y++) {
        if (maze.free.has(`${x},${y}`)) continue;
        const bx = cellX(x) - C / 2;
        const by = cellY(y) - C / 2;
        // Стена — объёмный блок: светлая грань сверху, тень снизу
        blocks.push(
          s('rect', { x: bx + 1, y: by + 1, width: C - 2, height: C - 2, rx: 4, fill: '#475569' }),
          s('rect', { x: bx + 3, y: by + 3, width: C - 6, height: C - 9, rx: 4, fill: '#7c8aa0' }),
          s('rect', { x: bx + 3, y: by + 3, width: C - 6, height: 6, rx: 3, fill: '#a8b4c4' }),
          s('path', { d: `M${bx + 4} ${by + C / 2} H${bx + C - 4} M${bx + C / 2} ${by + 9} V${by + C / 2} M${bx + C / 4} ${by + C / 2} V${by + C - 7} M${bx + (3 * C) / 4} ${by + C / 2} V${by + C - 7}`, stroke: '#64748b', 'stroke-width': 1.3 }),
        );
      }
    }
    walls.replaceChildren(...blocks);
    finishMark.setAttribute('transform', `translate(${cellX(maze.finish.x)} ${cellY(maze.finish.y)})`);
  }

  function drawProgram(p) {
    shownProg = p;
    rows = PROGRAMS[p].map((line, i) => {
      const y = ROWS.y + i * ROWS.h;
      const indent = (line.indent ?? 0) * 16;
      const color = line.kind ? COLORS[line.kind] : line.cmd === 'F' ? COLORS.move : COLORS.turn;
      const bar = s('rect', { x: ROWS.x - 6, y: y - 2, width: RIGHT.x + RIGHT.w - 18 - ROWS.x, height: ROWS.h - 2, rx: 6, fill: OK, opacity: 0 });
      const g = s('g', {}, [
        bar,
        s('rect', { x: ROWS.x + indent, y: y + 1, width: ROWS.blockW - indent, height: ROWS.h - 8, rx: 7, fill: color }),
        s('rect', { x: ROWS.x + indent + 2, y: y + 2, width: ROWS.blockW - indent - 4, height: 7, rx: 4, fill: '#ffffff', 'fill-opacity': 0.18 }),
        text(ROWS.x + indent + 10, y + ROWS.h / 2 - 2.5, tr(line.block), { size: 14, weight: 700, fill: '#ffffff', anchor: 'start' }),
        text(ROWS.code - 18, y + ROWS.h / 2 - 2.5, String(i + 1), { size: 13, weight: 500, fill: '#475569', anchor: 'end' }),
        codeLine(ROWS.code, y + ROWS.h / 2 - 2.5, `${'    '.repeat(line.indent ?? 0)}${line.py}`),
      ]);
      return { g, bar, block: g.children[1], color };
    });
    rowsG.replaceChildren(...rows.map((r) => r.g));
  }

  function paintTab(t, active, idle, accent) {
    t.bg.setAttribute('fill', active ? accent : idle);
    t.bg.setAttribute('stroke', active ? shade(accent, -0.3) : '#94a3b8');
    t.bg.setAttribute('stroke-width', active ? 1.5 : 1);
    const dark = idle === '#1f2937';
    t.caption.setAttribute('fill', active ? '#ffffff' : dark ? '#cbd5e1' : '#334155');
  }

  // Положение робота: между клетками — плавный переезд, поворот — вращение на месте,
  // команда «вперёд» в стену — толчок к стене и назад
  function pose() {
    let x = START.x;
    let y = START.y;
    let a = 0;
    let flash = 0;
    if (play.phase !== 'idle' && play.events.length) {
      const done = play.phase === 'done';
      const i = done ? play.events.length - 1 : play.i;
      const e = play.events[i];
      const k = done ? 1 : ease(clamp01(play.k));
      const a0 = play.angles[i];
      const a1 = play.angles[i + 1];
      x = e.from.x + (e.to.x - e.from.x) * k;
      y = e.from.y + (e.to.y - e.from.y) * k;
      a = a0 + (a1 - a0) * k;
      if (!e.ok) {
        const bump = done ? 0 : Math.sin(clamp01(play.k) * Math.PI) * 0.22;
        const rad = (a0 * Math.PI) / 180;
        x += Math.sin(rad) * bump;
        y += Math.cos(rad) * bump;
        flash = done ? 0.55 : clamp01(play.k * 2) * 0.55;
        const wx = e.from.x + Math.round(Math.sin(rad));
        const wy = e.from.y + Math.round(Math.cos(rad));
        cellFlash.setAttribute('x', cellX(wx) - C / 2);
        cellFlash.setAttribute('y', cellY(wy) - C / 2);
      }
    }
    cellFlash.setAttribute('opacity', flash.toFixed(2));
    const px = FIELD.x + (x - 1) * C + C / 2;
    const py = FIELD.y + (SIZE - y) * C + C / 2;
    robot.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${a.toFixed(1)})`);
    const pts = trailPts.map((p) => `${cellX(p.x)},${cellY(p.y)}`);
    if (play.phase === 'run' && play.events[play.i]?.cmd === 'F' && play.events[play.i].ok) pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    trail.setAttribute('points', pts.join(' '));
    trail.setAttribute('stroke', play.res?.result === 'loop' && play.phase === 'done' ? '#f59e0b' : '#38bdf8');
  }

  // Подсветка строк: в первой трети хода — проверенные условия (жёлтым), затем выполняемая команда
  function highlight() {
    const e = play.phase === 'run' ? play.events[play.i] : null;
    for (const [i, r] of rows.entries()) {
      let fill = null;
      let op = 0;
      if (e) {
        if (i === e.line && (play.k > 0.3 || !e.checked.length)) {
          fill = e.ok ? OK : FAIL;
          op = 0.4;
        } else if (e.checked.includes(i)) {
          fill = CHECK;
          op = 0.22;
        }
      } else if (play.phase === 'done' && play.res?.result === 'crash' && i === play.events.at(-1).line) {
        fill = FAIL;
        op = 0.4;
      }
      if (fill) r.bar.setAttribute('fill', fill);
      r.bar.setAttribute('opacity', op);
      r.block.setAttribute('stroke', op && fill !== CHECK ? '#ffffff' : 'none');
      r.block.setAttribute('stroke-width', 2);
    }
  }

  function status() {
    const evs = play.events;

    if (play.phase === 'idle') {
      statusMain.textContent = tr('Программа не запущена');
      statusMain.setAttribute('fill', '#e2e8f0');
      statusSub.textContent = tr('Нажмите «Пуск»');
    } else if (play.phase === 'run') {
      statusMain.textContent = `${tr('Выполняется строка')} ${evs[play.i].line + 1}`;
      statusMain.setAttribute('fill', '#fde68a');
      statusSub.textContent = '';
    } else {
      const r = play.res.result;
      const msg = { finish: 'Робот дошёл до финиша', crash: 'Ошибка: впереди стена', loop: 'Робот ходит по кругу', end: 'Финиш не достигнут' }[r];
      statusMain.textContent = tr(msg);
      statusMain.setAttribute('fill', r === 'finish' ? '#4ade80' : r === 'loop' ? '#fbbf24' : '#f87171');
      statusSub.textContent = r === 'crash' ? `${tr('Не выполнена строка')} ${play.events.at(-1).line + 1}` : '';
    }
  }

  return { destroy: () => scene.destroy() };
}
