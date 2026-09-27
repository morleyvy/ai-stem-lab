// Сцена «Скрещивание гороха»: на лабораторном столе — эмалированный лоток, в котором
// одна за другой появляются горошины потомства (жёлтые и зелёные), слева — чашки Петри
// с семенами родителей. На стене — доска с решёткой Пеннета (генотипы написаны на доске)
// и счётчик семян. Никаких подписей поверх сцены: текст только на доске и табло.

import { createScene, floorShadow, readout, room, s, text } from '../kit.js';
import { tr } from '../../i18n.js';
import { sillPlants } from '../bioDecor.js';

const GENOTYPES = ['AA', 'Aa', 'aa'];
const MAX_N = 400;
const BENCH = 478;
// Дно лотка в перспективе: задний край уже и выше, передний шире и ниже
const FLOOR = { backY: 376, frontY: 450, back: [338, 782], front: [300, 820] };
const BOARD = { x: 40, y: 30, w: 290, h: 300 };
const INK = '#1e3a5f';

// Детерминированный генератор: раскладка и порядок появления одинаковы при одинаковых условиях
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function geneticsScene(container, params, set, { offspring }) {
  const peas = []; // слоты горошин в DOM-порядке «сзади вперёд»
  let yellowFill, greenFill, boardTitle, headTop, headLeft, cellText, cellPea, dishPeas, cntY, cntG, cntP;
  let key = '';
  let shown = 0;
  let layout = null;

  // Раскладка горошин по дну лотка для N семян: сетка в перспективе с лёгким разбросом
  function relayout() {
    const N = params.N;
    const cols = Math.ceil(Math.sqrt(N * 3.2));
    const rows = Math.ceil(N / cols);
    const rnd = rng(N * 31 + 7);
    const slots = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (slots.length >= N) break;
        const v = rows === 1 ? 0.5 : (row + 0.5) / rows;
        const u = (col + 0.5 + (rnd() - 0.5) * 0.35) / cols;
        const y = FLOOR.backY + 10 + v * (FLOOR.frontY - FLOOR.backY - 18) + (rnd() - 0.5) * 3;
        const left = FLOOR.back[0] + (FLOOR.front[0] - FLOOR.back[0]) * v + 14;
        const right = FLOOR.back[1] + (FLOOR.front[1] - FLOOR.back[1]) * v - 14;
        const span = (right - left) / cols;
        slots.push({ x: left + u * (right - left), y, r: Math.min(10, span * 0.42) * (0.88 + 0.12 * v) });
      }
    }
    // Порядок появления — вразброс по всему лотку
    const order = slots.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const kids = offspring(params);
    peas.forEach((p, i) => {
      p.cur = -1;
      if (i < N) {
        p.pea.setAttribute('cx', slots[i].x);
        p.pea.setAttribute('cy', slots[i].y);
        p.sh.setAttribute('cx', slots[i].x + slots[i].r * 0.25);
        p.sh.setAttribute('cy', slots[i].y + slots[i].r * 0.75);
      }
      p.pea.setAttribute('r', 0);
      p.sh.setAttribute('rx', 0);
      p.sh.setAttribute('ry', 0);
    });
    // i-й потомок попадает в слот order[i]
    order.forEach((slot, i) => {
      peas[slot].pea.setAttribute('fill', kids[i] ? yellowFill : greenFill);
    });
    layout = { slots, order, kids };
  }

  function updateBoard() {
    const g1 = GENOTYPES[params.P1].split('');
    const g2 = GENOTYPES[params.P2].split('');
    boardTitle.textContent = `P:  ${GENOTYPES[params.P1]} × ${GENOTYPES[params.P2]}`;
    g2.forEach((g, i) => { headTop[i].textContent = g; });
    g1.forEach((g, j) => { headLeft[j].textContent = g; });
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const pair = [g1[j], g2[i]].sort().join('');
        cellText[j][i].textContent = pair;
        cellPea[j][i].setAttribute('fill', pair.includes('A') ? yellowFill : greenFill);
      }
    }
    // Семена родителей в чашках Петри — по их фенотипу
    dishPeas[0].forEach((e) => e.setAttribute('fill', g1.includes('A') ? yellowFill : greenFill));
    dishPeas[1].forEach((e) => e.setAttribute('fill', g2.includes('A') ? yellowFill : greenFill));
  }

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      // На подоконнике — горох на подпорках (объект опытов Менделя) и пеларгония
      sillPlants(svg, d, [{ x: 650, kind: 'pea' }, { x: 712, kind: 'pea', scale: 0.9 }, { x: 870, kind: 'geranium' }]);
      yellowFill = d.rad([[0, '#f8ecb4'], [0.5, '#e3c75e'], [1, '#a4852c']], 0.35, 0.3);
      greenFill = d.rad([[0, '#d4e5ab'], [0.5, '#8cab4f'], [1, '#4c6626']], 0.35, 0.3);

      // ---------- Доска с решёткой Пеннета ----------
      const { x, y, w, h } = BOARD;
      const cell = 64;
      const gx = x + (w - cell * 3) / 2;
      const gy = y + 78;
      svg.append(
        s('rect', { x, y, width: w, height: h, rx: 6, fill: d.lin(['#9ca3af', '#e5e7eb', '#6b7280'], 'v'), filter: d.url('soft') }),
        s('rect', { x: x + 8, y: y + 8, width: w - 16, height: h - 16, rx: 3, fill: d.lin([[0, '#fbfbf8'], [1, '#eceee8']], 'v') }),
        s('path', { d: `M${x + 30} ${y + 12} L${x + w - 60} ${y + 12} L${x + w - 120} ${y + h - 12} L${x + 12} ${y + h - 12} Z`, fill: '#ffffff', 'fill-opacity': 0.35 }),
        s('rect', { x: x + 40, y: y + h - 2, width: w - 80, height: 8, rx: 2, fill: d.lin(['#d1d5db', '#6b7280'], 'v') }),
      );
      boardTitle = text(x + w / 2, y + 40, '', { size: 20, weight: 600, fill: INK });
      svg.append(boardTitle);
      // Сетка 3×3: гаметы в заголовках, генотипы потомков в ячейках
      const grid = s('g', { stroke: INK, 'stroke-opacity': 0.75, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' });
      for (let k = 1; k <= 2; k++) {
        grid.append(
          s('line', { x1: gx + cell * k, y1: gy, x2: gx + cell * k, y2: gy + cell * 3 }),
          s('line', { x1: gx, y1: gy + cell * k, x2: gx + cell * 3, y2: gy + cell * k }),
        );
      }
      grid.append(s('line', { x1: gx + 6, y1: gy + 6, x2: gx + cell - 6, y2: gy + cell - 6, 'stroke-opacity': 0.4 }));
      svg.append(
        grid,
        text(gx + cell - 18, gy + 18, '♂', { size: 15, weight: 600, fill: INK }),
        text(gx + 18, gy + cell - 18, '♀', { size: 15, weight: 600, fill: INK }),
      );
      headTop = [0, 1].map((i) => text(gx + cell * (i + 1.5), gy + cell / 2, '', { size: 22, weight: 600, fill: '#7a2e2e' }));
      headLeft = [0, 1].map((j) => text(gx + cell / 2, gy + cell * (j + 1.5), '', { size: 22, weight: 600, fill: '#7a2e2e' }));
      svg.append(...headTop, ...headLeft);
      cellText = [];
      cellPea = [];
      for (let j = 0; j < 2; j++) {
        cellText.push([]);
        cellPea.push([]);
        for (let i = 0; i < 2; i++) {
          const cx = gx + cell * (i + 1.5);
          const cy = gy + cell * (j + 1.5);
          const pea = s('circle', { cx, cy: cy - 10, r: 11 });
          const t = text(cx, cy + 17, '', { size: 16, weight: 600, fill: INK });
          svg.append(s('ellipse', { cx: cx + 2, cy: cy + 1, rx: 9, ry: 2.5, fill: '#000', 'fill-opacity': 0.12 }), pea, t);
          cellPea[j].push(pea);
          cellText[j].push(t);
        }
      }

      // ---------- Счётчик семян на стене под окном ----------
      cntY = readout(d, { x: 596, y: 276, w: 100, caption: tr('Жёлтые'), color: '#e8cf6a' });
      cntG = readout(d, { x: 706, y: 276, w: 100, caption: tr('Зелёные'), color: '#9cc26a' });
      cntP = readout(d, { x: 816, y: 276, w: 104, caption: tr('Жёлтых, %'), color: '#cbd5e1' });
      svg.append(cntY.g, cntG.g, cntP.g);

      // ---------- Чашки Петри с семенами родителей ----------
      dishPeas = [];
      for (const [k, dx] of [[0, 110], [1, 212]]) {
        const top = BENCH - 16;
        const list = [[-18, 0], [0, 2], [18, -1]].map(([ox, oy]) => s('circle', { cx: dx + ox, cy: top + 4 + oy, r: 8 }));
        dishPeas[k] = list;
        svg.append(
          floorShadow(dx, BENCH + 1, 52, d),
          s('ellipse', { cx: dx, cy: BENCH - 3, rx: 46, ry: 7, fill: '#dfe7ee', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.2 }),
          ...list,
          s('path', { d: `M${dx - 46} ${BENCH - 3} V${top} Q${dx} ${top - 8} ${dx + 46} ${top} V${BENCH - 3} Q${dx} ${BENCH + 5} ${dx - 46} ${BENCH - 3} Z`, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.4 }),
          s('ellipse', { cx: dx, cy: top, rx: 46, ry: 6, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1.4 }),
        );
      }

      // ---------- Эмалированный лоток ----------
      const { backY, frontY, back, front } = FLOOR;
      const rimBack = backY - 14;
      const rimFront = frontY + 10;
      svg.append(
        floorShadow((front[0] + front[1]) / 2, BENCH + 1, 300, d, 10),
        // наружная передняя стенка
        s('path', { d: `M${front[0] - 22} ${rimFront} H${front[1] + 22} L${front[1] + 16} ${BENCH - 1} H${front[0] - 16} Z`, fill: d.lin([[0, '#d6dbe0'], [1, '#9aa3ad']], 'v') }),
        // верхний борт
        s('path', { d: `M${back[0] - 16} ${rimBack} H${back[1] + 16} L${front[1] + 22} ${rimFront} H${front[0] - 22} Z`, fill: '#eef1f4', stroke: '#8f99a4', 'stroke-width': 1.2 }),
        // внутренняя задняя и боковые стенки — видна глубина лотка
        s('path', { d: `M${back[0] - 8} ${rimBack + 5} H${back[1] + 8} L${back[1]} ${backY} H${back[0]} Z`, fill: d.lin([[0, '#b7bfc8'], [1, '#d7dde3']], 'v') }),
        s('path', { d: `M${back[0] - 8} ${rimBack + 5} L${back[0]} ${backY} L${front[0]} ${frontY} L${front[0] - 12} ${rimFront - 3} Z`, fill: '#c7cfd7' }),
        s('path', { d: `M${back[1] + 8} ${rimBack + 5} L${back[1]} ${backY} L${front[1]} ${frontY} L${front[1] + 12} ${rimFront - 3} Z`, fill: '#bfc7cf' }),
        // дно
        s('path', { d: `M${back[0]} ${backY} H${back[1]} L${front[1]} ${frontY} H${front[0]} Z`, fill: d.lin([[0, '#e3e7eb'], [1, '#f5f7f9']], 'v') }),
        s('path', { d: `M${front[0] - 22} ${rimFront} H${front[1] + 22}`, stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 1.5 }),
      );
      const peaLayer = s('g');
      for (let i = 0; i < MAX_N; i++) {
        const sh = s('ellipse', { rx: 0, ry: 0, fill: '#1f2937', 'fill-opacity': 0.22 });
        const pea = s('circle', { r: 0 });
        peaLayer.append(sh, pea);
        peas.push({ sh, pea, cur: -1 });
      }
      svg.append(peaLayer);
    },

    frame(dt) {
      const k = `${params.P1}-${params.P2}-${params.N}`;
      if (k !== key) {
        key = k;
        shown = 0;
        updateBoard();
        relayout();
      }
      const N = params.N;
      const rate = Math.max(N / 2.5, 24); // выборка «прорастает» за 2–3 секунды
      const grow = rate * 0.35; // каждая горошина набухает около трети секунды
      if (shown < N + grow) shown += rate * dt;

      let yellow = 0;
      let visible = 0;
      layout.order.forEach((slot, i) => {
        const f = Math.max(0, Math.min(1, (shown - i) / grow));
        if (f > 0) {
          visible++;
          if (layout.kids[i]) yellow++;
        }
        const p = peas[slot];
        if (p.cur === f) return;
        p.cur = f;
        const r = layout.slots[slot].r * f;
        p.pea.setAttribute('r', r);
        p.sh.setAttribute('rx', r * 0.95);
        p.sh.setAttribute('ry', r * 0.35);
      });
      cntY.set(String(yellow));
      cntG.set(String(visible - yellow));
      cntP.set(visible ? String(Math.round((yellow / visible) * 100)) : '—');
    },
  });
  return scene;
}
