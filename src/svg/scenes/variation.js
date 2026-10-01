// Сцена «Модификационная изменчивость»: доска с миллиметровкой — единственный прибор, на который
// смотрит ученик. Измеренные семена фасоли ложатся на ней столбиками по длине (варианта v): высота
// столбика — частота p, вместе это вариационный ряд. Красный маркер у доски обводит вершины
// столбиков — получается вариационная кривая и линия среднего M. На столе только то, по чему щёлкают
// в работе: три пакета семян из разных условий и горшок для посева. Числа — в показаниях под сценой.

import { createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const BOARD = { x1: 30, x2: 580, top: 16, bottom: 296 };
const AXIS_Y = 254; // нижний край столбиков
const ROW_V = 276; // подписи вариант v под столбиками
const COL_W = 36;
const STACK = 6.4; // шаг укладки семян в столбике (одно семя = одна единица частоты)
const BAGS = [120, 240, 360]; // центры пакетов: тень, обычные условия, солнце
const BAG = { w: 78, h: 84, bottom: 466 };
const POT = { x: 680, top: 412, bottom: 466 };
const MARKER = { x: 500, y: 291 }; // наконечник маркера на полочке доски
const RATE = 50; // семян в секунду: 100 семян раскладываются за 2 с
const FLIGHT = 0.45;

const SEED_FILL = '#b8693f';
const SEED_EDGE = '#7c3a1d';

// Семя фасоли сбоку: почковидный контур — спинка выпуклая, брюшко с рубчиком вогнуто.
// Длина L и ширина ≈ 0,62 L — пропорции обычной коричневой фасоли.
function beanPath(L) {
  const h = L * 0.31;
  const a = L / 2;
  return `M${-a} 0 C${-a} ${-h * 1.15} ${-a * 0.45} ${-h * 1.2} 0 ${-h * 1.2} C${a * 0.45} ${-h * 1.2} ${a} ${-h * 1.15} ${a} 0 C${a} ${h * 1.05} ${a * 0.45} ${h * 1.05} 0 ${h * 0.68} C${-a * 0.45} ${h * 1.05} ${-a} ${h * 1.05} ${-a} 0 Z`;
}

function bean(d, L, extra = {}) {
  return s('g', extra, [
    s('path', { d: beanPath(L), fill: d.rad([[0, '#d98b5f'], [0.6, SEED_FILL], [1, '#8a4524']], 0.35, 0.3), stroke: SEED_EDGE, 'stroke-width': Math.max(0.6, L * 0.04) }),
    s('ellipse', { cx: 0, cy: L * 0.16, rx: L * 0.1, ry: L * 0.035, fill: '#f5e6cc' }),
  ]);
}

// Плавная кривая через точки (Catmull-Rom → кубические Безье), как от руки маркером
function smoothPath(pts) {
  let path = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return path;
}

const BAG_LABELS = ['Тень', 'Обычные', 'Солнце'];

export function variationScene(container, params, set, { seeds, stats, LENGTH_MIN, LENGTH_MAX }) {
  const classes = LENGTH_MAX - LENGTH_MIN + 1;
  const colX = (v) => 108 + (v - LENGTH_MIN) * COL_W;
  const slotY = (k) => AXIS_Y - STACK / 2 - 1 - k * STACK;

  let curvePath, curveDots, meanLine, meanTag, marker, plant, potLabel;
  const columns = []; // семена на доске: columns[v - LENGTH_MIN][k]
  const flyers = [];
  const bags = [];

  let source = `${params.gen}:${params.bed}`;
  let shown = params.n; // сколько семян уже разложено на доске (догоняет регулятор)
  let curveK = params.curve; // 0…1 — сколько кривой начерчено
  let growK = params.gen; // 0…1 — рост растения в горшке
  let curveLen = 0;
  let curveKey = '';

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });

      // ── Доска с миллиметровкой ──
      const bw = BOARD.x2 - BOARD.x1;
      const bh = BOARD.bottom - BOARD.top;
      svg.append(
        s('rect', { x: BOARD.x1 - 6, y: BOARD.top - 6, width: bw + 12, height: bh + 12, rx: 6, fill: d.lin([[0, '#e2e8f0'], [0.5, '#94a3b8'], [1, '#cbd5e1']], 'v'), filter: d.url('soft') }),
        s('rect', { x: BOARD.x1, y: BOARD.top, width: bw, height: bh, rx: 3, fill: '#fcfdf9' }),
        s('rect', { x: BOARD.x1, y: BOARD.top, width: bw, height: bh, rx: 3, fill: d.pattern('mmgrid', 12, 12, [
          s('path', { d: 'M12 0 V12 M0 12 H12', stroke: '#bfe3c9', 'stroke-width': 0.6, fill: 'none' }),
        ]) }),
      );
      // Крупные линии частот через 5 семян
      for (let f = 5; f <= 25; f += 5) {
        const y = AXIS_Y - f * STACK;
        svg.append(
          s('line', { x1: 86, x2: colX(LENGTH_MAX) + COL_W / 2, y1: y, y2: y, stroke: '#86c79a', 'stroke-width': 0.9, 'stroke-dasharray': '4 3' }),
          text(80, y, String(f), { size: 13, weight: 600, fill: '#64748b', anchor: 'end' }),
        );
      }
      svg.append(
        s('path', { d: `M86 ${AXIS_Y - 27 * STACK - 8} V${AXIS_Y} H${colX(LENGTH_MAX) + COL_W / 2 + 6}`, stroke: '#334155', 'stroke-width': 2, fill: 'none' }),
        s('path', { d: `M86 ${AXIS_Y - 27 * STACK - 14} l-4 8 h8 Z`, fill: '#334155' }),
        text(38, ROW_V, tr('v, мм'), { size: 13, weight: 700, fill: '#0f766e', anchor: 'start' }),
        text(96, 66, tr('p, шт.'), { size: 13, weight: 700, fill: '#64748b', anchor: 'start' }),
      );
      for (let v = LENGTH_MIN; v <= LENGTH_MAX; v++) {
        svg.append(text(colX(v), ROW_V, String(v), { size: 13, weight: 600, fill: '#0f766e' }));
        const col = [];
        for (let k = 0; k < 30; k++) {
          const b = bean(d, 13, { transform: `translate(${colX(v)} ${slotY(k).toFixed(1)})`, opacity: 0 });
          col.push(b);
          svg.append(b);
        }
        columns.push(col);
      }

      // Вариационная кривая и отметка среднего — поверх семян
      meanLine = s('line', { y1: AXIS_Y, y2: 69, stroke: '#2563eb', 'stroke-width': 2, 'stroke-dasharray': '6 4', opacity: 0 });
      // На метке только буква M: само значение — в показаниях под сценой
      meanTag = s('g', { opacity: 0 }, [s('rect', { x: -16, y: -11, width: 32, height: 22, rx: 11, fill: '#2563eb' }), text(0, 0.5, 'M', { size: 13, weight: 700, fill: '#ffffff' })]);
      curvePath = s('path', { fill: 'none', stroke: '#dc2626', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      curveDots = s('g');
      svg.append(meanLine, curvePath, curveDots, meanTag);

      // Полочка доски и красный маркер на ней (наконечник слева)
      svg.append(
        s('rect', { x: BOARD.x1 - 10, y: BOARD.bottom + 6, width: bw + 20, height: 8, rx: 3, fill: d.lin([[0, '#e2e8f0'], [1, '#64748b']], 'v') }),
      );
      marker = s('g', {}, [
        s('rect', { x: -4, y: -16, width: 92, height: 26, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M0 0 L10 -4 V4 Z', fill: '#991b1b' }),
        s('rect', { x: 10, y: -5, width: 12, height: 10, rx: 2, fill: '#e5e7eb', stroke: '#9ca3af', 'stroke-width': 0.8 }),
        s('rect', { x: 22, y: -6, width: 52, height: 12, rx: 4, fill: d.lin([[0, '#f87171'], [0.5, '#dc2626'], [1, '#7f1d1d']], 'v') }),
        s('rect', { x: 26, y: -4.5, width: 40, height: 2.5, rx: 1.25, fill: '#ffffff', 'fill-opacity': 0.45 }),
        s('rect', { x: 74, y: -5, width: 10, height: 10, rx: 3, fill: '#1f2937' }),
      ]);
      svg.append(marker);
      marker.style.cursor = 'pointer';
      marker.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('curve', params.curve ? 0 : 1);
      });
      touchTarget(marker);

      // ── Пакеты с семенами ──
      BAGS.forEach((x, i) => {
        const top = BAG.bottom - BAG.h;
        const half = BAG.w / 2;
        const open = s('g', {}, [
          // Раскрытый пакет: отогнутый край и семена в горловине
          s('path', { d: `M${x - half + 3} ${top + 2} L${x - half - 6} ${top - 12} L${x + half + 6} ${top - 12} L${x + half - 3} ${top + 2} Z`, fill: '#c9a46e', stroke: '#8a6a3d', 'stroke-width': 1 }),
          ...[-18, -4, 10, 22, -11, 4].map((dx, k) => bean(d, 13, { transform: `translate(${x + dx} ${top - 6 - (k > 3 ? 7 : 0)}) rotate(${(k * 37) % 60 - 30})` })),
        ]);
        const closed = s('path', { d: `M${x - half} ${top + 2} H${x + half} V${top + 12} H${x - half} Z`, fill: '#b48a52', stroke: '#8a6a3d', 'stroke-width': 1 });
        const ring = s('rect', { x: x - half - 5, y: top - 18, width: BAG.w + 10, height: BAG.h + 22, rx: 10, fill: 'none', stroke: '#16a34a', 'stroke-width': 2.5, 'stroke-dasharray': '6 4', opacity: 0 });
        const icon = i === 0
          ? s('path', { d: `M${x - 13} ${top + 40} a7 7 0 0 1 4 -12 a9 9 0 0 1 17 2 a6 6 0 0 1 1 10 Z`, fill: '#94a3b8' })
          : i === 1
            ? s('g', {}, [s('circle', { cx: x - 4, cy: top + 33, r: 7, fill: '#fbbf24' }), s('path', { d: `M${x - 6} ${top + 43} a6 6 0 0 1 4 -10 a8 8 0 0 1 14 2 a5 5 0 0 1 1 8 Z`, fill: '#cbd5e1' })])
            : s('g', {}, [
              s('circle', { cx: x, cy: top + 35, r: 8, fill: '#f59e0b' }),
              ...Array.from({ length: 8 }, (_, k) => {
                const a = (k * Math.PI) / 4;
                return s('line', { x1: x + Math.cos(a) * 11, y1: top + 35 + Math.sin(a) * 11, x2: x + Math.cos(a) * 14.5, y2: top + 35 + Math.sin(a) * 14.5, stroke: '#f59e0b', 'stroke-width': 2, 'stroke-linecap': 'round' });
              }),
            ]);
        const g = s('g', {}, [
          ring,
          floorShadow(x, BAG.bottom + 2, half * 0.9, d),
          s('path', { d: `M${x - half} ${top} H${x + half} L${x + half - 2} ${BAG.bottom} H${x - half + 2} Z`, fill: d.lin([[0, '#a07a46'], [0.25, '#d9b98a'], [0.7, '#c9a46e'], [1, '#94703f']]), stroke: '#8a6a3d', 'stroke-width': 1.2 }),
          closed,
          open,
          s('rect', { x: x - half + 5, y: top + 20, width: BAG.w - 10, height: 52, rx: 4, fill: '#fffdf5', stroke: '#d6c7a1', 'stroke-width': 1 }),
          icon,
          text(x, top + 60, tr(BAG_LABELS[i]), { size: 13, weight: 700, fill: '#78350f' }),
        ]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('bed', i);
        });
        touchTarget(g, 6);
        svg.append(g);
        bags.push({ g, open, closed, ring });
      });

      // ── Горшок: посев семян выбранного пакета в обычных условиях ──
      const px = POT.x;
      plant = s('g');
      potLabel = s('g');
      const pot = s('g', {}, [
        s('rect', { x: px - 58, y: 280, width: 116, height: 190, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        plant,
        floorShadow(px, POT.bottom + 2, 42, d),
        s('ellipse', { cx: px, cy: POT.top + 2, rx: 38, ry: 6, fill: '#5b3a24' }),
        s('path', { d: `M${px - 42} ${POT.top} H${px + 42} L${px + 32} ${POT.bottom} H${px - 32} Z`, fill: d.lin([[0, '#9a3412'], [0.3, '#ea7a45'], [0.7, '#c2410c'], [1, '#7c2d12']]), stroke: '#7c2d12', 'stroke-width': 1 }),
        s('rect', { x: px - 46, y: POT.top - 4, width: 92, height: 12, rx: 3, fill: d.lin([[0, '#9a3412'], [0.3, '#f08a55'], [1, '#7c2d12']]), stroke: '#7c2d12', 'stroke-width': 1 }),
        potLabel,
      ]);
      pot.style.cursor = 'pointer';
      pot.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('gen', params.gen ? 0 : 1);
      });
      touchTarget(pot, 6);
      svg.append(pot);
      potLabel.append(
        s('rect', { x: px - 34, y: POT.top + 18, width: 68, height: 22, rx: 4, fill: '#fffdf5', stroke: '#d6c7a1', 'stroke-width': 1 }),
        text(px, POT.top + 29.5, tr('Посев'), { size: 13, weight: 700, fill: '#166534' }),
      );
      buildPlant(d);

      // Летящие семена: из открытого пакета в свой столбик на доске
      for (let i = 0; i < 24; i++) {
        const b = bean(d, 13, { opacity: 0, 'pointer-events': 'none' });
        flyers.push({ b, live: false, t: 0, from: [0, 0], to: [0, 0] });
        svg.append(b);
      }
    },

    frame(dt) {
      const key = `${params.gen}:${params.bed}`;
      // Новый пакет или посев — выборка другая, семена измеряют заново
      if (key !== source) {
        source = key;
        shown = 0;
        flyers.forEach((f) => { f.live = false; f.b.setAttribute('opacity', 0); });
      }
      const list = seeds(params);
      const before = Math.floor(shown);
      shown = params.n > shown ? Math.min(params.n, shown + dt * RATE) : params.n;
      const after = Math.floor(shown);
      for (let i = before; i < after; i++) launch(i, list[i]);
      // Регулятор вернули назад — семена, которых больше нет в выборке, не долетают
      flyers.forEach((f) => { if (f.live && f.i >= after) { f.live = false; f.b.setAttribute('opacity', 0); } });
      updateFlyers(dt);

      // Семена на доске: столбик длины v, k-е по счёту семя этой длины
      const counts = new Array(classes).fill(0);
      const landed = new Array(classes).fill(0);
      const flying = new Set(flyers.filter((f) => f.live).map((f) => f.i));
      for (let i = 0; i < after; i++) {
        const c = list[i] - LENGTH_MIN;
        counts[c]++;
        if (!flying.has(i)) landed[c] = counts[c];
      }
      columns.forEach((col, c) => col.forEach((b, k) => b.setAttribute('opacity', k < landed[c] ? 1 : 0)));

      bags.forEach((b, i) => {
        const on = i === params.bed;
        b.open.setAttribute('opacity', on ? 1 : 0);
        b.closed.setAttribute('opacity', on ? 0 : 1);
        b.ring.setAttribute('opacity', on ? 1 : 0);
      });

      updateCurve(dt, counts, after);
      growK = params.gen ? Math.min(1, growK + dt * 0.8) : Math.max(0, growK - dt * 2);
      plant.setAttribute('opacity', growK > 0.01 ? 1 : 0);
      plant.setAttribute('transform', `translate(${POT.x} ${POT.top}) scale(${(0.15 + 0.85 * growK).toFixed(3)}) translate(${-POT.x} ${-POT.top})`);
      potLabel.setAttribute('opacity', growK < 0.5 ? 1 : 0);
    },
  });

  // Растение фасоли: стебель, тройчатые листья, стручки
  function buildPlant(d) {
    const px = POT.x;
    const y0 = POT.top;
    const leaf = (x, y, a, size = 1) => s('path', {
      d: `M0 0 C${8 * size} ${-10 * size} ${22 * size} ${-8 * size} ${26 * size} 0 C${22 * size} ${8 * size} ${8 * size} ${10 * size} 0 0 Z`,
      fill: d.lin([[0, '#4ade80'], [1, '#15803d']], 'v'), stroke: '#166534', 'stroke-width': 0.8,
      transform: `translate(${x} ${y}) rotate(${a})`,
    });
    const trio = (x, y, a) => [leaf(x, y, a - 50, 0.9), leaf(x, y, a + 50, 0.9), leaf(x, y, a, 1.05)];
    const pod = (x, y, a) => s('path', { d: 'M0 0 C4 10 4 26 -2 38 C-6 30 -4 12 0 0 Z', fill: d.lin([[0, '#a3e635'], [1, '#4d7c0f']]), stroke: '#3f6212', 'stroke-width': 0.8, transform: `translate(${x} ${y}) rotate(${a})` });
    plant.append(
      s('path', { d: `M${px} ${y0} C${px - 4} ${y0 - 40} ${px + 6} ${y0 - 70} ${px} ${y0 - 112}`, stroke: '#4d7c0f', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }),
      s('path', { d: `M${px + 1} ${y0 - 48} Q${px - 20} ${y0 - 60} ${px - 34} ${y0 - 58} M${px + 2} ${y0 - 80} Q${px + 22} ${y0 - 92} ${px + 36} ${y0 - 90}`, stroke: '#4d7c0f', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }),
      ...trio(px - 34, y0 - 58, 200),
      ...trio(px + 36, y0 - 90, -20),
      ...trio(px, y0 - 112, -90),
      pod(px - 8, y0 - 44, 20),
      pod(px + 8, y0 - 70, -18),
      pod(px - 4, y0 - 76, 12),
    );
  }

  function launch(i, len) {
    const f = flyers.find((x) => !x.live);
    if (!f) return;
    const k = seeds(params).slice(0, i).filter((v) => v === len).length;
    Object.assign(f, { live: true, t: 0, i, from: [BAGS[params.bed] + (i % 5) * 8 - 16, BAG.bottom - BAG.h - 10], to: [colX(len), slotY(k)] });
  }

  function updateFlyers(dt) {
    for (const f of flyers) {
      if (!f.live) continue;
      f.t += dt / FLIGHT;
      if (f.t >= 1) {
        f.live = false;
        f.b.setAttribute('opacity', 0);
        continue;
      }
      const t = f.t;
      const x = f.from[0] + (f.to[0] - f.from[0]) * t;
      const y = f.from[1] + (f.to[1] - f.from[1]) * t - Math.sin(Math.PI * t) * 70;
      f.b.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(t * 360).toFixed(0)})`);
      f.b.setAttribute('opacity', 1);
    }
  }

  function updateCurve(dt, counts, n) {
    curveK = params.curve ? Math.min(1, curveK + dt / 1.4) : 0;
    const st = n ? stats(params, n) : null;
    const pts = [];
    if (st) {
      // Кривая начинается и заканчивается на нуле — за пределами размаха семян нет
      const from = Math.max(LENGTH_MIN, st.min - 1);
      const to = Math.min(LENGTH_MAX, st.max + 1);
      for (let v = from; v <= to; v++) pts.push([colX(v), AXIS_Y - counts[v - LENGTH_MIN] * STACK]);
    }
    const key = pts.map((p) => p.join(',')).join(' ');
    if (key !== curveKey) {
      curveKey = key;
      curvePath.setAttribute('d', pts.length > 1 ? smoothPath(pts) : '');
      curveLen = pts.length > 1 ? curvePath.getTotalLength() : 0;
      curveDots.replaceChildren(...pts.map(([x, y]) => s('circle', { cx: x, cy: y, r: 3.5, fill: '#dc2626', stroke: '#ffffff', 'stroke-width': 1.2 })));
    }
    const on = params.curve && pts.length > 1;
    curvePath.setAttribute('opacity', on ? 1 : 0);
    curvePath.setAttribute('stroke-dasharray', `${curveLen.toFixed(1)} ${curveLen.toFixed(1)}`);
    curvePath.setAttribute('stroke-dashoffset', (curveLen * (1 - curveK)).toFixed(1));
    curveDots.setAttribute('opacity', on && curveK >= 1 ? 1 : 0);

    // Пока кривая чертится, маркер ведёт её; потом возвращается на полочку
    let mx = MARKER.x;
    let my = MARKER.y;
    let ma = 0;
    if (on && curveK < 1 && curveLen) {
      const p = curvePath.getPointAtLength(curveLen * curveK);
      mx = p.x;
      my = p.y;
      ma = -35;
    }
    marker.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${ma})`);

    const showMean = on && curveK >= 1;
    if (st) {
      const x = colX(st.mean);
      meanLine.setAttribute('x1', x.toFixed(1));
      meanLine.setAttribute('x2', x.toFixed(1));
      meanTag.setAttribute('transform', `translate(${x.toFixed(1)} 58)`);
    }
    meanLine.setAttribute('opacity', showMean ? 1 : 0);
    meanTag.setAttribute('opacity', showMean ? 1 : 0);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
