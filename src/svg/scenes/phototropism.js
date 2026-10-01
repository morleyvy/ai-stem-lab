// Сцена «Фототропизм проростков»: кабинет биологии, на столе — картонный светонепроницаемый ящик
// с открытой передней стенкой (видно, что внутри) и окошком в левой стенке. Внутри — глиняный горшок
// с пятью этиолированными проростками овса. Слева — настольная лампа: щелчок по ней включает свет,
// и луч через окошко падает на проростки только сбоку. Справа — схема верхушки колеоптиля без чисел: оранжевые
// точки ауксина стекают из верхушки в зону роста, при боковом свете их больше на теневой стороне,
// клетки там длиннее, и верхушка наклоняется к лампе. На подносе — ножницы, чашечки с чёрными
// и прозрачными колпачками и горшок с новыми проростками; их переносят (или просто щёлкают) к горшку в ящике.

import { createScene, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const PX = 5; // px на мм длины колеоптиля
const BOX = { x1: 228, x2: 560, top: 150, wall: 10 };
const HOLE = { y1: 282, y2: 318 }; // окошко в левой стенке ящика
const LAMP = { x: 160, y: 300 }; // центр отражателя лампы
const POT = { x: 394, rim: 400, bottom: 466, rTop: 70, rBottom: 52 };
const SOIL_Y = 404;
const SEEDS = [[-44, 0.95], [-22, 1.03], [0, 1], [22, 0.97], [44, 1.05]]; // смещение от центра горшка и разброс длины
const TARGET = { x: POT.x + 4, y: 196 }; // куда подносят инструмент — над верхушками
const CARD = { x1: 596, x2: 924, top: 30, bottom: 346 };
const COL = { cx: 760, w: 44, base: 300, cell: 30 }; // схема верхушки: две колонки клеток по три
const TRAY_Y = 452;
const BODY = '#e3e8a6'; // этиолированный колеоптиль, выросший в темноте, — бледный, желтовато-зелёный
const EDGE = '#8b9a3e';
const AUXIN = '#f97316';

// Ось проростка: прямое основание и равномерно изогнутая зона роста (верхние 55% длины), изгиб влево — к лампе
function stemPoints(x0, y0, len, theta) {
  const n = 18;
  const zone = 0.55;
  const pts = [[x0, y0]];
  let x = x0;
  let y = y0;
  let phi = 0;
  for (let i = 1; i <= n; i++) {
    const ds = len / n;
    const mid = (i - 0.5) * ds;
    phi = mid < (1 - zone) * len ? 0 : (theta * (mid - (1 - zone) * len)) / (zone * len);
    const r = (phi * Math.PI) / 180;
    x -= Math.sin(r) * ds;
    y -= Math.cos(r) * ds;
    pts.push([x, y, r]);
  }
  pts[0].push(0);
  return pts;
}

const pathOf = (pts, off = 0) => `M${pts.map(([x, y, r]) => `${(x - Math.cos(r) * off).toFixed(1)} ${(y + Math.sin(r) * off).toFixed(1)}`).join(' L')}`;

export function phototropismScene(container, params, set, { bend, auxin, length }) {
  const seedlings = [];
  const tools = [];
  let lampGlow, bulb, beamIn, beamOut, ledOn;
  let dome, domeCap, cutMark, arrow, colL, colR, cellsL, cellsR, sideL, sideR;
  const dotsL = [];
  const dotsR = [];
  const domeDots = [];

  let shownTime = params.time;
  let shownTip = params.tip;
  let beamK = params.light ? 1 : 0;
  // Анимация инструмента: какой несут, этап (fly — к горшку, work — над верхушками, back — на поднос)
  let anim = null;

  const pp = () => ({ ...params, tip: shownTip });

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // Табло в сцене нет: время, угол и доля ауксина показаны один раз — в панели показаний под сценой

      // ── Ящик: тёмная внутренность, луч из окошка, горшок с проростками ──
      const inX = BOX.x1 + BOX.wall;
      const inW = BOX.x2 - BOX.x1 - 2 * BOX.wall;
      const inTop = BOX.top + BOX.wall;
      const clip = `box${uid}`;
      defs.append(s('clipPath', { id: clip }, [s('rect', { x: inX, y: inTop, width: inW, height: BENCH - inTop })]));
      svg.append(
        floorShadow((BOX.x1 + BOX.x2) / 2, BENCH + 2, 190, d, 10),
        s('rect', { x: inX, y: inTop, width: inW, height: BENCH - inTop, fill: d.lin([[0, '#3a332c'], [1, '#221e1a']], 'v') }),
        // Дно ящика и угол с задней стенкой — чтобы было видно глубину
        s('path', { d: `M${inX} ${BENCH} L${inX + 26} ${BENCH - 22} H${inX + inW - 26} L${inX + inW} ${BENCH} Z`, fill: '#2d2722' }),
        s('path', { d: `M${inX} ${inTop} L${inX + 26} ${inTop + 20} V${BENCH - 22} M${inX + inW} ${inTop} L${inX + inW - 26} ${inTop + 20} V${BENCH - 22} H${inX + 26}`, stroke: '#4a4038', 'stroke-width': 1.5, fill: 'none' }),
      );
      // Луч внутри ящика: расходится от окошка вправо, яркость — по освещённости
      beamIn = s('path', {
        d: `M${inX} ${HOLE.y1} L${BOX.x2 - BOX.wall} ${HOLE.y1 - 92} V${HOLE.y2 + 120} L${inX} ${HOLE.y2} Z`,
        fill: d.lin([[0, '#fde68a', 0.75], [0.6, '#fde68a', 0.28], [1, '#fde68a', 0.1]]),
        'clip-path': `url(#${clip})`,
        opacity: 0,
      });
      svg.append(beamIn);

      // Горшок с землёй
      const { x, rim, bottom, rTop, rBottom } = POT;
      svg.append(
        floorShadow(x, bottom + 2, 70, d),
        s('path', { d: `M${x - rTop + 6} ${rim + 12} L${x - rBottom} ${bottom - 4} Q${x - rBottom} ${bottom} ${x - rBottom + 5} ${bottom} H${x + rBottom - 5} Q${x + rBottom} ${bottom} ${x + rBottom} ${bottom - 4} L${x + rTop - 6} ${rim + 12} Z`, fill: d.lin([[0, '#7c2d12'], [0.3, '#c2410c'], [0.6, '#b45309'], [1, '#6b2a0e']]) }),
        s('rect', { x: x - rTop, y: rim, width: rTop * 2, height: 14, rx: 4, fill: d.lin([[0, '#7c2d12'], [0.3, '#d9622b'], [0.6, '#c2410c'], [1, '#6b2a0e']]) }),
        s('ellipse', { cx: x, cy: rim + 2, rx: rTop - 6, ry: 6, fill: '#3b2416' }),
      );

      // Проростки: контур, тело, блик со стороны лампы, тень с другой стороны, колпачок, срез
      for (const [dx, k] of SEEDS) {
        const edge = s('path', { fill: 'none', stroke: EDGE, 'stroke-width': 10, 'stroke-linejoin': 'round' });
        const body = s('path', { fill: 'none', stroke: BODY, 'stroke-width': 8, 'stroke-linejoin': 'round' });
        const shadeLine = s('path', { fill: 'none', stroke: '#6b7a2a', 'stroke-width': 2, 'stroke-opacity': 0.45, 'stroke-linecap': 'round' });
        const lit = s('path', { fill: 'none', stroke: '#fffbe6', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0 });
        const cut = s('ellipse', { rx: 4, ry: 1.8, fill: '#f7f9dc', stroke: EDGE, 'stroke-width': 1, opacity: 0 });
        const cap = s('path', { d: 'M-6.5 12 V-4 Q-6.5 -11 0 -11 Q6.5 -11 6.5 -4 V12 Z', opacity: 0 });
        const grain = s('ellipse', { cx: POT.x + dx + 5, cy: SOIL_Y - 1, rx: 6, ry: 2.6, fill: '#d6b56d', stroke: '#a16207', 'stroke-width': 0.8 });
        svg.append(grain, edge, body, shadeLine, lit, cut, cap);
        seedlings.push({ x: POT.x + dx, k, edge, body, shadeLine, lit, cut, cap });
      }

      // Стенки, крышка и торцы гофрокартона поверх содержимого
      const card = d.lin([[0, '#a8794a'], [0.5, '#c99a64'], [1, '#9a6c3f']]);
      svg.append(
        s('rect', { x: BOX.x1, y: BOX.top, width: BOX.wall, height: HOLE.y1 - BOX.top, fill: card }),
        s('rect', { x: BOX.x1, y: HOLE.y2, width: BOX.wall, height: BENCH - HOLE.y2, fill: card }),
        s('rect', { x: BOX.x2 - BOX.wall, y: BOX.top, width: BOX.wall, height: BENCH - BOX.top, fill: card }),
        s('rect', { x: BOX.x1, y: BOX.top, width: BOX.x2 - BOX.x1, height: BOX.wall, fill: d.lin([[0, '#d4a873'], [1, '#a8794a']], 'v') }),
        s('path', { d: `M${BOX.x1 + 3} ${BOX.top + 3} H${BOX.x2 - 3} M${BOX.x1 + 5} ${BOX.top + 6} V${HOLE.y1} M${BOX.x1 + 5} ${HOLE.y2} V${BENCH} M${BOX.x2 - 5} ${BOX.top + 6} V${BENCH}`, stroke: '#7a5530', 'stroke-width': 1, 'stroke-dasharray': '2 3', fill: 'none' }),
        // Ободок окошка
        s('rect', { x: BOX.x1 - 2, y: HOLE.y1 - 3, width: BOX.wall + 4, height: 3, fill: '#7a5530' }),
        s('rect', { x: BOX.x1 - 2, y: HOLE.y2, width: BOX.wall + 4, height: 3, fill: '#7a5530' }),
      );

      // ── Настольная лампа ──
      const lamp = s('g', { class: 'lamp' });
      lampGlow = s('ellipse', { cx: LAMP.x + 14, cy: LAMP.y, rx: 34, ry: 40, fill: d.url('glow'), opacity: 0 });
      beamOut = s('path', { d: `M${LAMP.x + 8} ${LAMP.y - 24} L${BOX.x1} ${HOLE.y1 - 10} V${HOLE.y2 + 10} L${LAMP.x + 8} ${LAMP.y + 24} Z`, fill: d.lin([[0, '#fde68a', 0.6], [1, '#fde68a', 0.25]]), opacity: 0 });
      bulb = s('ellipse', { cx: LAMP.x + 6, cy: LAMP.y, rx: 5, ry: 17, fill: '#e2e8f0' });
      ledOn = s('circle', { cx: 122, cy: 456, r: 3, fill: '#475569' });
      const arm = { stroke: '#475569', 'stroke-width': 7, 'stroke-linecap': 'round' };
      lamp.append(
        s('rect', { x: 30, y: 250, width: 160, height: 222, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        floorShadow(92, BENCH + 1, 52, d),
        s('path', { d: 'M48 466 Q50 450 92 448 Q134 450 136 466 Z', fill: d.lin([[0, '#1f2937'], [0.45, '#64748b'], [1, '#1f2937']]) }),
        s('rect', { x: 46, y: 464, width: 92, height: 6, rx: 3, fill: '#1e293b' }),
        s('rect', { x: 112, y: 451, width: 20, height: 10, rx: 3, fill: '#0f172a' }),
        ledOn,
        s('line', { x1: 86, y1: 450, x2: 66, y2: 350, ...arm }),
        s('line', { x1: 66, y1: 350, x2: LAMP.x - 22, y2: LAMP.y - 6, ...arm }),
        s('circle', { cx: 86, cy: 450, r: 6, fill: '#334155' }),
        s('circle', { cx: 66, cy: 350, r: 6, fill: '#334155' }),
        s('line', { x1: 66, y1: 352, x2: 100, y2: 380, stroke: '#94a3b8', 'stroke-width': 2 }),
        lampGlow,
        // Отражатель: раструб открыт вправо, к окошку ящика
        s('path', { d: `M${LAMP.x - 30} ${LAMP.y - 12} Q${LAMP.x - 34} ${LAMP.y} ${LAMP.x - 30} ${LAMP.y + 12} L${LAMP.x + 8} ${LAMP.y + 27} V${LAMP.y - 27} Z`, fill: d.lin([[0, '#115e59'], [0.4, '#14b8a6'], [1, '#0f766e']], 'v'), stroke: '#134e4a', 'stroke-width': 1 }),
        s('rect', { x: LAMP.x + 5, y: LAMP.y - 28, width: 5, height: 56, rx: 2, fill: '#0f766e' }),
        bulb,
      );
      svg.append(beamOut, lamp);
      lamp.style.cursor = 'pointer';
      touchTarget(lamp);
      lamp.addEventListener('click', () => set('light', params.light ? 0 : 1));

      // ── Схема верхушки колеоптиля ──
      const cx = COL.cx;
      svg.append(
        s('rect', { x: CARD.x1, y: CARD.top, width: CARD.x2 - CARD.x1, height: CARD.bottom - CARD.top, rx: 14, fill: '#ffffff', stroke: '#d6cfc4', 'stroke-width': 1.2, filter: d.url('soft') }),
        text(cx, CARD.top + 22, tr('Верхушка проростка (схема)'), { size: 15, weight: 700, fill: '#334155' }),
        s('circle', { cx: CARD.x1 + 24, cy: CARD.bottom - 20, r: 4, fill: AUXIN }),
        text(CARD.x1 + 34, CARD.bottom - 19.5, tr('ауксин'), { size: 13, weight: 600, fill: '#9a3412', anchor: 'start' }),
      );
      arrow = s('g', {}, [
        s('path', { d: `M${CARD.x1 + 18} 150 H${cx - COL.w - 64}`, stroke: '#f59e0b', 'stroke-width': 4, 'stroke-linecap': 'round' }),
        s('path', { d: `M${cx - COL.w - 70} 141 L${cx - COL.w - 54} 150 L${cx - COL.w - 70} 159 Z`, fill: '#f59e0b' }),
        text(CARD.x1 + 46, 132, tr('свет'), { size: 13, weight: 700, fill: '#b45309' }),
      ]);
      colL = s('g');
      colR = s('g');
      cellsL = Array.from({ length: 3 }, () => s('rect', { x: cx - COL.w, width: COL.w, rx: 5, fill: '#f1f5d0', stroke: '#9aa84a', 'stroke-width': 1.2 }));
      cellsR = Array.from({ length: 3 }, () => s('rect', { x: cx, width: COL.w, rx: 5, fill: '#f1f5d0', stroke: '#9aa84a', 'stroke-width': 1.2 }));
      colL.append(...cellsL);
      colR.append(...cellsR);
      for (let i = 0; i < 20; i++) {
        const mk = () => s('circle', { r: 3.2, fill: AUXIN, opacity: 0 });
        dotsL.push({ c: mk(), ph: (i * 0.37) % 1, j: ((i * 37) % 29) / 29 });
        dotsR.push({ c: mk(), ph: (i * 0.53 + 0.2) % 1, j: ((i * 23) % 31) / 31 });
      }
      colL.append(...dotsL.map((p) => p.c));
      colR.append(...dotsR.map((p) => p.c));
      // Верхушка — купол над обеими колонками; наклоняется вместе с разницей их длины
      domeCap = s('path', { d: 'M-47 3 V-2 Q-47 -53 0 -55 Q47 -53 47 -2 V3 Z', opacity: 0 });
      dome = s('g', {}, [
        s('path', { d: `M${-COL.w} 0 Q${-COL.w} -48 0 -50 Q${COL.w} -48 ${COL.w} 0 Z`, fill: '#e8efb8', stroke: '#9aa84a', 'stroke-width': 1.2 }),
        ...Array.from({ length: 5 }, (_, i) => {
          const c = s('circle', { cx: -22 + i * 11, cy: -14 - (i % 2) * 14, r: 3.2, fill: AUXIN });
          domeDots.push(c);
          return c;
        }),
        domeCap,
      ]);
      cutMark = s('line', { x1: cx - COL.w - 10, x2: cx + COL.w + 10, stroke: '#dc2626', 'stroke-width': 2, 'stroke-dasharray': '6 4', opacity: 0 });
      sideL = text(cx - COL.w - 10, COL.base - 64, '', { size: 13, weight: 600, fill: '#475569', anchor: 'end' });
      sideR = text(cx + COL.w + 10, COL.base - 64, '', { size: 13, weight: 600, fill: '#475569', anchor: 'start' });
      svg.append(arrow, colL, colR, dome, cutMark, sideL, sideR);

      // ── Поднос с инструментами ──
      svg.append(
        floorShadow(760, BENCH + 1, 170, d, 8),
        s('rect', { x: 600, y: TRAY_Y, width: 320, height: 14, rx: 5, fill: d.lin([[0, '#f8fafc'], [1, '#cbd5e1']], 'v'), stroke: '#94a3b8', 'stroke-width': 1 }),
      );
      const labels = [['Ножницы'], ['Чёрные', 'колпачки'], ['Прозрачные', 'колпачки'], ['Новые', 'проростки']];
      const restX = [640, 722, 806, 888];
      const toolNodes = [scissors(d), capDish(d, true), capDish(d, false), newPot(d)];
      const order = [1, 2, 3, 0]; // какое значение tip даёт инструмент
      toolNodes.forEach((node, i) => {
        labels[i].forEach((line, k) => svg.append(text(restX[i], 380 + k * 16 - (labels[i].length === 1 ? 8 : 0), tr(line), { size: 13, weight: 600, fill: '#475569' })));
        const rest = { x: restX[i], y: TRAY_Y };
        tools.push({ node, v: order[i], rest, pos: { ...rest }, blades: node.blades });
      });
      const layer = s('g');
      tools.forEach((t) => layer.append(t.node));
      svg.append(layer);
    },

    frame(dt, now) {
      // Время на табло и изгиб догоняют регулятор постепенно — проростки изгибаются на глазах
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * 2) : Math.max(params.time, shownTime - dt * 6);
      updateTools(dt);

      const p = pp();
      const on = params.light === 1;
      beamK += ((on ? 1 : 0) - beamK) * Math.min(1, dt * 8);
      const bright = beamK * (0.35 + 0.65 * (params.lux / 1000));
      beamIn.setAttribute('opacity', bright.toFixed(3));
      beamOut.setAttribute('opacity', bright.toFixed(3));
      lampGlow.setAttribute('opacity', bright.toFixed(3));
      bulb.setAttribute('fill', on ? '#fef9c3' : '#e2e8f0');
      ledOn.setAttribute('fill', on ? '#4ade80' : '#475569');

      const theta = bend(p, shownTime);
      const L = length(p, shownTime) * PX;
      for (const sd of seedlings) {
        const pts = stemPoints(sd.x, SOIL_Y, L * sd.k, theta);
        const d0 = pathOf(pts);
        const cap = shownTip === 1 ? 'butt' : 'round';
        for (const el of [sd.edge, sd.body]) {
          el.setAttribute('d', d0);
          el.setAttribute('stroke-linecap', cap);
        }
        sd.lit.setAttribute('d', pathOf(pts.slice(2), 2));
        sd.lit.setAttribute('opacity', (bright * 0.9).toFixed(3));
        sd.shadeLine.setAttribute('d', pathOf(pts.slice(2), -2.2));
        const [tx, ty, tr0] = pts.at(-1);
        const deg = (-tr0 * 180) / Math.PI;
        sd.cut.setAttribute('opacity', shownTip === 1 ? 1 : 0);
        sd.cut.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${deg.toFixed(1)})`);
        const capped = shownTip === 2 || shownTip === 3;
        sd.cap.setAttribute('opacity', capped ? 1 : 0);
        if (capped) {
          sd.cap.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${deg.toFixed(1)})`);
          sd.cap.setAttribute('fill', shownTip === 2 ? '#1f2937' : '#e0f2fe');
          sd.cap.setAttribute('fill-opacity', shownTip === 2 ? 1 : 0.45);
          sd.cap.setAttribute('stroke', shownTip === 2 ? '#0b1220' : '#7dd3fc');
          sd.cap.setAttribute('stroke-width', 1);
        }
      }

      updateScheme(p, now, on);
    },
  });

  // Схема: длина колонок клеток — по доле ауксина на каждой стороне и по приросту за прошедшее время
  function updateScheme(p, now, on) {
    const ax = auxin(p, shownTime);
    const cx = COL.cx;
    const grow = Math.min(1, (length(p, shownTime) - length(p, 0)) / 8);
    const share = ax ? [ax.lit / 50, ax.shade / 50] : [1, 1];
    const hL = 3 * COL.cell * (1 + 0.8 * grow * share[0]);
    const hR = 3 * COL.cell * (1 + 0.8 * grow * share[1]);
    const topL = COL.base - hL;
    const topR = COL.base - hR;
    cellsL.forEach((c, i) => { c.setAttribute('y', (topL + (i * hL) / 3).toFixed(1)); c.setAttribute('height', (hL / 3).toFixed(1)); });
    cellsR.forEach((c, i) => { c.setAttribute('y', (topR + (i * hR) / 3).toFixed(1)); c.setAttribute('height', (hR / 3).toFixed(1)); });

    const nL = ax ? Math.round((ax.lit / 100) * 20) : 0;
    const nR = ax ? Math.round((ax.shade / 100) * 20) : 0;
    const flow = (list, n, x0, top, h) => list.forEach((dt, i) => {
      dt.c.setAttribute('opacity', i < n ? 1 : 0);
      if (i >= n) return;
      dt.c.setAttribute('cx', (x0 + 7 + dt.j * (COL.w - 14)).toFixed(1));
      dt.c.setAttribute('cy', (top + 5 + ((dt.ph + now * 0.12) % 1) * (h - 10)).toFixed(1));
    });
    flow(dotsL, nL, cx - COL.w, topL, hL);
    flow(dotsR, nR, cx, topR, hR);

    const cut = p.tip === 1;
    const tilt = (Math.atan2(hR - hL, 2 * COL.w) * 180) / Math.PI;
    dome.setAttribute('opacity', cut ? 0 : 1);
    dome.setAttribute('transform', `translate(${cx} ${((topL + topR) / 2).toFixed(1)}) rotate(${(-tilt).toFixed(2)})`);
    domeDots.forEach((c, i) => c.setAttribute('cy', (-14 - (i % 2) * 14 + Math.sin(now * 2 + i) * 2).toFixed(1)));
    const capped = p.tip === 2 || p.tip === 3;
    domeCap.setAttribute('opacity', capped ? 1 : 0);
    if (capped) {
      domeCap.setAttribute('fill', p.tip === 2 ? '#1f2937' : '#e0f2fe');
      domeCap.setAttribute('fill-opacity', p.tip === 2 ? 0.95 : 0.4);
      domeCap.setAttribute('stroke', p.tip === 2 ? '#0b1220' : '#38bdf8');
    }
    cutMark.setAttribute('opacity', cut ? 1 : 0);
    cutMark.setAttribute('y1', (topL - 3).toFixed(1));
    cutMark.setAttribute('y2', (topR - 3).toFixed(1));
    // Стрелка света упирается в верхушку; без лампы её нет
    arrow.setAttribute('opacity', on ? 1 : 0);
    // Без купола верхушки стрелка указывает на верхние клетки, а не на пустое место над ними
    arrow.setAttribute('transform', `translate(0 ${(Math.min(topL, topR) + (cut ? 8 : -25) - 150).toFixed(1)})`);
    sideL.textContent = tr(on ? 'освещённая' : 'левая');
    sideR.textContent = tr(on ? 'теневая' : 'правая');
  }

  // ── Инструменты: несут к горшку, работают над верхушками, возвращаются на поднос ──
  function updateTools(dt) {
    if (!anim && params.tip !== shownTip) {
      const t = tools.find((x) => x.v === params.tip);
      anim = { t, stage: 'fly', time: 0 };
    }
    for (const t of tools) {
      if (anim?.t === t) continue;
      if (t.drag) continue;
      approach(t.pos, t.rest, dt, 7);
    }
    if (anim) {
      const { t } = anim;
      if (anim.stage === 'fly') {
        if (approach(t.pos, TARGET, dt, 8)) anim.stage = 'work';
      } else if (anim.stage === 'work') {
        anim.time += dt;
        // Ножницы щёлкают, чашечка зависает: на полпути проростки уже в новом состоянии
        if (anim.time > 0.35) shownTip = params.tip;
        if (anim.time > 0.8) anim.stage = 'back';
      } else if (approach(t.pos, t.rest, dt, 8)) {
        anim = null;
      }
      if (t.blades) {
        const open = anim?.stage === 'work' ? Math.abs(Math.sin(anim.time * 12)) * 16 : 0;
        t.blades[0].setAttribute('transform', `rotate(${-open})`);
        t.blades[1].setAttribute('transform', `rotate(${open})`);
      }
    }
    for (const t of tools) {
      t.node.setAttribute('transform', `translate(${t.pos.x.toFixed(1)} ${t.pos.y.toFixed(1)})`);
      t.node.style.pointerEvents = anim ? 'none' : '';
    }
  }

  function approach(pos, to, dt, rate) {
    const k = Math.min(1, dt * rate);
    pos.x += (to.x - pos.x) * k;
    pos.y += (to.y - pos.y) * k;
    if (Math.hypot(to.x - pos.x, to.y - pos.y) < 2) {
      pos.x = to.x;
      pos.y = to.y;
      return true;
    }
    return false;
  }

  // Перенос мышью/пальцем; простой щелчок без движения тоже применяет инструмент
  const grab = { dx: 0, dy: 0 };
  for (const t of tools) {
    draggable(scene, t.node, {
      onDrag(x, y) {
        if (anim) return;
        if (!t.drag) {
          t.drag = true;
          grab.dx = t.pos.x - x;
          grab.dy = t.pos.y - y;
        }
        t.pos.x = Math.max(20, Math.min(940, x + grab.dx));
        t.pos.y = Math.max(80, Math.min(BENCH, y + grab.dy));
      },
      onEnd() {
        const dragged = t.drag;
        t.drag = false;
        if (anim) return;
        const overPot = t.pos.x > BOX.x1 + 20 && t.pos.x < BOX.x2 - 20 && t.pos.y > 150 && t.pos.y < BENCH;
        if ((!dragged || overPot) && params.tip !== t.v) set('tip', t.v);
      },
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}

// ── Инструменты подноса: начало координат — точка, которой предмет стоит на подносе ──

function scissors(d) {
  const metal = d.lin([[0, '#e2e8f0'], [0.5, '#f8fafc'], [1, '#94a3b8']], 'v');
  const blade = (sgn) => s('g', {}, [
    s('path', { d: `M0 0 L34 ${sgn * -1} L34 ${sgn * 1.5} Q20 ${sgn * 5} 0 ${sgn * 3} Z`, fill: metal, stroke: '#64748b', 'stroke-width': 0.8 }),
    s('ellipse', { cx: -16, cy: sgn * 8, rx: 10, ry: 6.5, fill: 'none', stroke: '#ea580c', 'stroke-width': 4 }),
    s('path', { d: `M-7 ${sgn * 5} L0 ${sgn * 1}`, stroke: '#ea580c', 'stroke-width': 4, 'stroke-linecap': 'round' }),
  ]);
  const b1 = blade(-1);
  const b2 = blade(1);
  const g = s('g', {}, [
    s('rect', { x: -32, y: -46, width: 72, height: 50, fill: '#000', 'fill-opacity': 0 }),
    s('g', { transform: 'translate(0 -16)' }, [b1, b2, s('circle', { r: 2.4, fill: '#475569' })]),
  ]);
  g.blades = [b1, b2];
  return g;
}

// Часовое стекло с колпачками из чёрной бумаги или из прозрачного стекла
function capDish(d, black) {
  const cap = (x, y) => s('path', { d: `M${x - 5} ${y} V${y - 9} Q${x - 5} ${y - 14} ${x} ${y - 14} Q${x + 5} ${y - 14} ${x + 5} ${y - 9} V${y} Z`, fill: black ? '#1f2937' : '#e0f2fe', 'fill-opacity': black ? 1 : 0.55, stroke: black ? '#0b1220' : '#38bdf8', 'stroke-width': 1 });
  return s('g', {}, [
    s('rect', { x: -34, y: -40, width: 68, height: 44, fill: '#000', 'fill-opacity': 0 }),
    s('ellipse', { cx: 0, cy: -4, rx: 30, ry: 6, fill: '#e2e8f0', 'fill-opacity': 0.8, stroke: '#94a3b8', 'stroke-width': 1.2 }),
    cap(-14, -6), cap(0, -8), cap(14, -6),
    s('ellipse', { cx: 0, cy: -3, rx: 30, ry: 5, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 1 }),
  ]);
}

// Маленький горшок со свежими прямыми проростками
function newPot(d) {
  return s('g', {}, [
    s('rect', { x: -26, y: -60, width: 52, height: 62, fill: '#000', 'fill-opacity': 0 }),
    ...[-10, -3, 4, 11].map((x, i) => s('path', { d: `M${x} -24 V${-50 + (i % 2) * 5}`, stroke: EDGE, 'stroke-width': 4.5, 'stroke-linecap': 'round' })),
    ...[-10, -3, 4, 11].map((x, i) => s('path', { d: `M${x} -24 V${-50 + (i % 2) * 5}`, stroke: BODY, 'stroke-width': 3, 'stroke-linecap': 'round' })),
    s('path', { d: 'M-20 -24 L-15 0 H15 L20 -24 Z', fill: d.lin([[0, '#7c2d12'], [0.35, '#c2410c'], [1, '#6b2a0e']]) }),
    s('rect', { x: -22, y: -27, width: 44, height: 6, rx: 2, fill: d.lin([[0, '#7c2d12'], [0.35, '#d9622b'], [1, '#6b2a0e']]) }),
  ]);
}
