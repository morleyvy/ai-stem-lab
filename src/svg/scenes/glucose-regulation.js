// Сцена «Регуляция уровня глюкозы»: главный прибор — монитор с кривой глюкозы в крови за 0…180 мин
// (зелёная полоса — норма натощак, пунктир — почечный порог). Слева — учебная схема без тела человека:
// поджелудочная железа → инсулин и глюкагон → печень. Клетки железы светятся, когда выделяют гормон,
// толщина стрелок — сколько гормона в крови, зёрна в печени — запас гликогена. Щелчок по железе
// выключает и включает β-клетки (модель сахарного диабета). На столе — стакан с раствором глюкозы
// (щелчок — раствор выпит) и глюкометр: это единственное число на сцене, остальные — в показаниях.

import { createScene, floorShadow, mixHex, room, s, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const CARD = { x: 24, y: 30, w: 282, h: 300 };
const MON = { x: 330, y: 30, w: 606, h: 300 };
const PLOT = { x1: 392, x2: 900, top: 84, bottom: 266, gMax: 16 };
const GLASS = { x: 150, bottom: 466, w: 76, h: 90 };
const METER = { x: 480, top: 352, bottom: 464, w: 110 };
const INSULIN = '#3b82f6';
const GLUCAGON = '#f97316';
const ARROW = { top: 128, bottom: 232, ins: 118, gcg: 210 };

const PANCREAS = 'M64 100 Q 60 76 92 78 Q 160 86 232 74 Q 264 70 264 90 Q 262 110 230 112 Q 160 118 96 122 Q 66 124 64 100 Z';
const LIVER = 'M70 262 Q 120 234 222 242 Q 266 246 258 266 Q 242 294 150 306 Q 90 312 74 294 Q 64 282 70 262 Z';

const px = (t, T) => PLOT.x1 + (t / T) * (PLOT.x2 - PLOT.x1);
const py = (g) => PLOT.bottom - (Math.min(g, PLOT.gMax) / PLOT.gMax) * (PLOT.bottom - PLOT.top);

export function glucoseScene(container, params, set, { course, NORM, RENAL, T_MAX }) {
  let curve, curveDot, meterValue, glass, glassLiquid, glassCue, insArrow, gcgArrow;
  const betaCells = [];
  const alphaCells = [];
  const granules = [];
  let shownTime = params.time;
  // Уровень раствора в стакане: 1 — полный; после щелчка он плавно пустеет
  let level = params.meal ? 0 : 1;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      buildScheme(svg, d);
      buildMonitor(svg, d);
      buildGlass(svg, d);
      buildMeter(svg, d);
    },

    frame(dt, now) {
      // Кривая «пишется» вперёд постепенно, а назад откатывается быстро
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * 40) : Math.max(params.time, shownTime - dt * 160);
      const data = course(params);
      const st = data[Math.round(shownTime)];

      drawCurve(data, st);
      meterValue.textContent = fmt(st.G, 1);
      // Цвет — по округлённому числу на экране, как и подпись «в пределах нормы» в показаниях
      const shownG = Math.round(st.G * 10) / 10;
      meterValue.setAttribute('fill', shownG > NORM[1] ? '#b91c1c' : shownG < NORM[0] ? '#1d4ed8' : '#0f172a');

      // Без инсулина β-клетки серые и перечёркнуты
      const bOn = params.beta ? 0 : Math.min(1, st.I / 30);
      betaCells.forEach((c) => {
        c.body.setAttribute('fill', params.beta ? '#cbd5e1' : mixHex('#dbeafe', INSULIN, bOn));
        c.cross.setAttribute('opacity', params.beta ? 1 : 0);
        c.mark.setAttribute('opacity', params.beta ? 0 : 1);
      });
      const aOn = Math.min(1, st.C / 170);
      alphaCells.forEach((c) => c.setAttribute('fill', mixHex('#ffedd5', GLUCAGON, aOn)));
      setArrow(insArrow, bOn);
      setArrow(gcgArrow, aOn);

      const nGran = Math.round((st.Y / 120) * granules.length);
      granules.forEach((g, i) => g.setAttribute('opacity', i < nGran ? 1 : 0));

      // Стакан: после «выпит» раствор убывает; при новом опыте стакан снова полный
      level = params.meal ? Math.max(0, level - dt * 0.8) : 1;
      const top = -GLASS.h + 14 + (1 - level) * (GLASS.h - 14);
      glassLiquid.setAttribute('y', top.toFixed(1));
      glassLiquid.setAttribute('height', Math.max(0, -top).toFixed(1));
      glass.style.cursor = params.meal ? 'default' : 'pointer';
      // Мягкая пульсация вокруг полного стакана подсказывает, куда нажать
      glassCue.setAttribute('opacity', params.meal ? 0 : (0.35 + 0.35 * Math.sin(now / 300)).toFixed(2));
    },
  });

  // ── Схема: поджелудочная железа → гормоны → печень ──
  function buildScheme(svg, d) {
    const cx = CARD.x + CARD.w / 2;
    svg.append(
      s('rect', { x: CARD.x, y: CARD.y, width: CARD.w, height: CARD.h, rx: 14, fill: '#ffffff', stroke: '#e2e8f0', 'stroke-width': 1.2, filter: d.url('soft') }),
      text(cx, CARD.y + 24, tr('Поджелудочная железа'), { size: 14, weight: 700, fill: '#92400e' }),
    );
    const panc = s('g', { cursor: 'pointer' }, [s('path', { d: PANCREAS, fill: '#fde7c8', stroke: '#c2873f', 'stroke-width': 1.4 })]);
    // β-клетки (инсулин) — ближе к головке железы, α-клетки (глюкагон) — к хвосту
    for (const [x, y] of [[106, 101], [132, 99], [158, 98]]) {
      const body = s('circle', { cx: x, cy: y, r: 10, fill: '#dbeafe', stroke: '#1d4ed8', 'stroke-width': 1.2 });
      const cross = s('path', { d: `M${x - 5} ${y - 5} L ${x + 5} ${y + 5} M${x + 5} ${y - 5} L ${x - 5} ${y + 5}`, stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0 });
      // Буква на клетке связывает схему с текстом работы, где говорится о β- и α-клетках
      const mark = text(x, y + 1, 'β', { size: 12, weight: 700, fill: '#1e3a8a' });
      betaCells.push({ body, cross, mark });
      panc.append(body, mark, cross);
    }
    for (const [x, y] of [[198, 94], [224, 91]]) {
      const c = s('circle', { cx: x, cy: y, r: 9, fill: '#ffedd5', stroke: '#c2410c', 'stroke-width': 1.2 });
      alphaCells.push(c);
      panc.append(c, text(x, y + 1, 'α', { size: 12, weight: 700, fill: '#7c2d12' }));
    }
    panc.addEventListener('click', () => set('beta', params.beta ? 0 : 1));
    svg.append(panc);
    touchTarget(panc, 10);

    insArrow = arrow(ARROW.ins, INSULIN);
    gcgArrow = arrow(ARROW.gcg, GLUCAGON);
    svg.append(
      insArrow.g,
      gcgArrow.g,
      text(ARROW.ins - 10, (ARROW.top + ARROW.bottom) / 2, tr('инсулин'), { size: 13, weight: 700, fill: '#1e40af', anchor: 'end' }),
      text(ARROW.gcg + 10, (ARROW.top + ARROW.bottom) / 2, tr('глюкагон'), { size: 13, weight: 700, fill: '#9a3412', anchor: 'start' }),
      s('path', { d: LIVER, fill: d.lin([[0, '#c2675a'], [1, '#8f3a2e']], 'v'), stroke: '#6b2118', 'stroke-width': 1.2 }),
    );
    // Зёрна гликогена: видно столько, сколько запасено в печени
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9; i++) {
        const x = 98 + i * 16 + row * 4;
        const y = 262 + row * 14;
        if (x > 236 - row * 22) continue; // нижний край печени скошен
        const g = s('circle', { cx: x, cy: y, r: 3.6, fill: '#f3e8ff', stroke: '#7e22ce', 'stroke-width': 0.8 });
        granules.push(g);
        svg.append(g);
      }
    }
    svg.append(text(cx, CARD.y + CARD.h - 14, tr('Печень'), { size: 14, weight: 700, fill: '#7f1d1d' }));
  }

  function arrow(x, color) {
    const line = s('line', { x1: x, y1: ARROW.top, x2: x, y2: ARROW.bottom - 12, stroke: color, 'stroke-linecap': 'round' });
    const head = s('path', { d: `M${x - 9} ${ARROW.bottom - 14} L ${x} ${ARROW.bottom} L ${x + 9} ${ARROW.bottom - 14} Z`, fill: color });
    return { g: s('g', {}, [line, head]), line };
  }

  // Толщина и яркость стрелки показывают, сколько гормона в крови
  function setArrow(a, k) {
    a.line.setAttribute('stroke-width', (2 + 6 * k).toFixed(1));
    a.g.setAttribute('opacity', (0.25 + 0.75 * k).toFixed(2));
  }

  // ── Монитор: кривая глюкозы, норма, почечный порог ──
  function buildMonitor(svg, d) {
    const { x, y, w, h } = MON;
    svg.append(
      s('rect', { x, y, width: w, height: h, rx: 14, fill: d.lin([[0, '#334155'], [1, '#111827']], 'v'), filter: d.url('soft') }),
      s('rect', { x: x + 10, y: y + 10, width: w - 20, height: h - 20, rx: 8, fill: d.lin([[0, '#0b1220'], [1, '#111b2e']], 'v') }),
      s('rect', { x: x + w / 2 - 30, y: y + h, width: 60, height: 8, fill: '#475569' }),
      text(PLOT.x1 - 30, y + 32, tr('Глюкоза в крови, ммоль/л'), { size: 15, weight: 700, fill: '#e2e8f0', anchor: 'start' }),
    );
    for (let g = 0; g <= PLOT.gMax; g += 4) {
      svg.append(
        s('line', { x1: PLOT.x1, x2: PLOT.x2, y1: py(g), y2: py(g), stroke: '#334155', 'stroke-width': 1 }),
        text(PLOT.x1 - 8, py(g), String(g), { size: 13, weight: 500, fill: '#94a3b8', anchor: 'end' }),
      );
    }
    for (let t = 0; t <= T_MAX; t += 30) {
      svg.append(text(px(t, T_MAX), PLOT.bottom + 15, String(t), { size: 13, weight: 500, fill: '#94a3b8' }));
    }
    svg.append(
      text(PLOT.x2, PLOT.bottom + 34, tr('время, мин'), { size: 13, weight: 500, fill: '#94a3b8', anchor: 'end' }),
      s('rect', { x: PLOT.x1, y: py(NORM[1]), width: PLOT.x2 - PLOT.x1, height: py(NORM[0]) - py(NORM[1]), fill: '#22c55e', 'fill-opacity': 0.2 }),
      text(PLOT.x2 - 6, py(NORM[1]) + 11, tr('норма'), { size: 13, weight: 600, fill: '#4ade80', anchor: 'end' }),
      s('line', { x1: PLOT.x1, x2: PLOT.x2, y1: py(RENAL), y2: py(RENAL), stroke: '#f59e0b', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }),
      // Подпись под линией: сюда не заходит ни кривая здорового (ниже 7,5), ни кривая без инсулина (выше 10 к концу)
      text(PLOT.x2 - 6, py(RENAL) + 11, tr('почечный порог'), { size: 13, weight: 600, fill: '#fbbf24', anchor: 'end' }),
      s('line', { x1: PLOT.x1, x2: PLOT.x1, y1: PLOT.top, y2: PLOT.bottom, stroke: '#64748b', 'stroke-width': 1.2 }),
      s('line', { x1: PLOT.x1, x2: PLOT.x2, y1: PLOT.bottom, y2: PLOT.bottom, stroke: '#64748b', 'stroke-width': 1.2 }),
    );
    curve = s('path', { fill: 'none', stroke: '#38bdf8', 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    curveDot = s('circle', { r: 6, fill: '#f8fafc', stroke: '#38bdf8', 'stroke-width': 3 });
    svg.append(curve, curveDot);
  }

  function drawCurve(data, st) {
    const end = Math.round(shownTime);
    let dPath = '';
    for (let t = 0; t <= end; t += 2) dPath += `${t ? 'L' : 'M'}${px(t, T_MAX).toFixed(1)} ${py(data[t].G).toFixed(1)} `;
    if (end % 2) dPath += `L${px(end, T_MAX).toFixed(1)} ${py(data[end].G).toFixed(1)}`;
    curve.setAttribute('d', dPath);
    curveDot.setAttribute('cx', px(end, T_MAX).toFixed(1));
    curveDot.setAttribute('cy', py(st.G).toFixed(1));
  }

  // ── Стакан с раствором глюкозы: щелчок — раствор выпит ──
  function buildGlass(svg, d) {
    const { w, h } = GLASS;
    const path = `M${-w / 2} ${-h} L ${-w / 2 + 5} -4 Q ${-w / 2 + 6} 0 ${-w / 2 + 10} 0 L ${w / 2 - 10} 0 Q ${w / 2 - 6} 0 ${w / 2 - 5} -4 L ${w / 2} ${-h} Z`;
    const clipId = `glass${Math.random().toString(36).slice(2)}`;
    glassLiquid = s('rect', { x: -w / 2, y: -h + 14, width: w, height: h - 14, fill: '#fde68a', 'fill-opacity': 0.85, 'clip-path': `url(#${clipId})` });
    glassCue = s('ellipse', { cx: 0, cy: -h / 2, rx: w / 2 + 16, ry: h / 2 + 16, fill: 'none', stroke: '#f59e0b', 'stroke-width': 2.5, 'stroke-dasharray': '6 5' });
    glass = s('g', { transform: `translate(${GLASS.x} ${GLASS.bottom})` }, [
      s('rect', { x: -w / 2 - 12, y: -h - 12, width: w + 24, height: h + 14, fill: '#000', 'fill-opacity': 0 }), // зона нажатия
      s('clipPath', { id: clipId }, [s('path', { d: path })]),
      s('path', { d: path, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      glassLiquid,
      s('rect', { x: -w / 2 + 7, y: -50, width: w - 14, height: 36, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
      text(0, -39, tr('Глюкоза'), { size: 13, weight: 700, fill: '#a16207' }),
      text(0, -23, '75 г', { size: 13, weight: 600, fill: '#64748b' }),
      s('path', { d: path, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
      s('path', { d: `M${-w / 2} ${-h} H ${w / 2}`, stroke: '#cbd5e1', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      glassCue,
    ]);
    glass.addEventListener('click', () => {
      if (!params.meal) set('meal', 1);
    });
    svg.append(floorShadow(GLASS.x, GLASS.bottom + 3, w * 0.55, d), glass);
    touchTarget(glass);
  }

  // ── Глюкометр с тест-полоской ──
  function buildMeter(svg, d) {
    const { x, top, bottom, w } = METER;
    meterValue = text(x, top + 44, '', { size: 30, weight: 800, fill: '#0f172a' });
    meterValue.style.fontVariantNumeric = 'tabular-nums';
    svg.append(
      floorShadow(x, bottom + 3, w * 0.6, d),
      s('rect', { x: x - 7, y: top - 30, width: 14, height: 36, rx: 2, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1 }),
      s('circle', { cx: x, cy: top - 22, r: 3.5, fill: '#b91c1c' }),
      s('rect', { x: x - w / 2, y: top, width: w, height: bottom - top, rx: 20, fill: d.lin([[0, '#3f4b5f'], [0.5, '#64748b'], [1, '#334155']]), stroke: '#1e293b', 'stroke-width': 1.2 }),
      s('rect', { x: x - w / 2 + 10, y: top + 14, width: w - 20, height: 62, rx: 8, fill: d.lin([[0, '#d5e2d2'], [1, '#b3c6b0']], 'v'), stroke: '#1e293b', 'stroke-width': 1.5 }),
      meterValue,
      text(x, top + 66, tr('ммоль/л'), { size: 12, weight: 600, fill: '#334155' }),
      text(x, bottom - 18, tr('Глюкометр'), { size: 13, weight: 700, fill: '#e2e8f0' }),
    );
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
