// Сцена «Равномерное движение»: на столе физкабинета — запаянная стеклянная трубка с водой и пузырьком
// воздуха, вдоль трубки — линейка с метками 0…40 см и резиновые кольца. Верхний конец трубки кладут
// в лапку штатива, нижний упирается в стол через резиновую подкладку — получается наклонная плоскость.
// Щелчок по трубке поднимает её в лапку (run = 1), пузырёк ползёт вверх; секундомер идёт с момента,
// когда пузырёк проходит метку 0, до выбранного кольца. Щелчок по кольцу выбирает метку (mark).
// Лапку можно перетаскивать по стойке — так меняется угол наклона (tilt).
// Если во время опыта поменять угол или метку, трубку опускают и опыт повторяют: каждое время измерено заново.
// На доске справа точки измерений складываются в график пути s(t) — по прямой на каждый угол.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, readout, room, s, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 410;
const R = 8; // наружный радиус трубки
const AXIS_Y = BENCH - R - 1; // ось трубки, лежащей на столе
const PX = 10; // px на сантиметр шкалы
const U0 = 56; // метка 0 — в 56 px от нижнего конца трубки
const LEN = 508; // длина трубки
const CLAMP_U = 490; // в этом месте трубку держит лапка штатива
const ROD_X = 540; // стойка штатива: верхний конец трубки всегда у неё, нижний скользит по столу
const ROD_TOP = 62;
const B_START = 24; // центр пузырька у нижней пробки
const B_END = 487; // центр пузырька у верхней пробки
const LIFT_SPEED = 50; // °/с — трубку поднимают и опускают рукой
const BACK_SPEED = 260; // px/с — пузырёк возвращается к нижнему концу, пока трубка лежит
const MARKS = [10, 20, 30, 40];
// График на доске: t от 0 до 16 с, s от 0 до 40 см
const G = { x: 652, y: 318, w: 256, h: 220, tMax: 16, sMax: 40 };
// Цвет прямой на графике — по углу наклона, чтобы прямые разных опытов не путались
const LINE_COLORS = { 10: '#0891b2', 15: '#16a34a', 20: '#2563eb', 25: '#9333ea', 30: '#ea580c', 35: '#db2777', 40: '#dc2626' };

export function motionScene(container, params, set, { speed, timeTo }) {
  let tube, tubeHit, bubble, padG, arc, refLine, angleText, clamp, timer, plot;
  const rings = new Map();
  // Ход опыта: flat — трубка лежит, lift — её поднимают, run — пузырёк ползёт, done — дошёл до верха,
  // back — трубку опустили для повторного опыта
  let phase = 'flat';
  let angle = 0;
  let u = B_START;
  let prevKey = `${params.tilt}|${params.mark}`;
  // Измерения для графика: угол → (метка → время). Точка ставится, когда секундомер остановлен
  const measured = new Map();
  let plotted = '';

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Единственный прибор на стенде — секундомер: путь видно по красному кольцу, остальные числа — в панели показаний
      timer = readout(d, { x: 44, y: 40, w: 196, caption: tr('Секундомер, с'), color: '#fbbf24' });
      svg.append(timer.g);
      svg.append(
        s('rect', { x: 64, y: 128, width: 156, height: 46, rx: 8, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 2.5 }),
        text(142, 152, 'v = s / t', { size: 24, weight: 700, fill: '#f8fafc' }),
      );

      buildBoard(svg, d);
      buildStand(svg, d);

      // Резиновая подкладка под нижним концом трубки: не даёт ему скользить по столу
      padG = s('g', {}, [
        floorShadow(0, 1, 26, d, 4),
        s('rect', { x: -20, y: -5, width: 40, height: 6, rx: 2, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      ]);
      svg.append(padG);

      // Транспортир у нижнего конца: дуга между столом и трубкой и подпись угла
      refLine = s('line', { stroke: '#64748b', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' });
      arc = s('path', { fill: '#fbbf24', 'fill-opacity': 0.22, stroke: '#b45309', 'stroke-width': 1.8 });
      angleText = text(0, 0, '', { size: 15, weight: 700, fill: '#92400e', anchor: 'start' });
      svg.append(refLine, arc, angleText);

      tube = buildTube(d);
      svg.append(tube);

      clamp = buildClamp(d);
      svg.append(clamp);
    },

    frame(dt) {
      const key = `${params.tilt}|${params.mark}`;
      // Новый угол или метка во время опыта: трубку опускают, пузырёк возвращается, опыт повторяют
      if (key !== prevKey) {
        prevKey = key;
        if (params.run && phase !== 'flat') phase = 'back';
      }
      if (!params.run) phase = 'flat';
      else if (phase === 'flat') phase = 'lift';

      const target = phase === 'flat' || phase === 'back' ? 0 : params.tilt;
      const da = LIFT_SPEED * dt;
      angle = Math.abs(target - angle) <= da ? target : angle + Math.sign(target - angle) * da;

      const v = speed(params) * PX;
      if (phase === 'flat' || phase === 'back') {
        u = Math.max(B_START, u - BACK_SPEED * dt);
        if (phase === 'back' && angle === 0 && u === B_START) phase = 'lift';
      } else if (phase === 'lift') {
        u = Math.max(B_START, u - BACK_SPEED * dt);
        if (angle === params.tilt && u === B_START) phase = 'run';
      } else if (phase === 'run') {
        u += v * dt;
        if (u >= B_END) {
          u = B_END;
          phase = 'done';
        }
      }

      // Секундомер: от прохождения метки 0 до выбранного кольца
      const tMark = timeTo(params);
      const elapsed = phase === 'run' || phase === 'done' ? Math.max(0, (u - U0) / v) : 0;
      timer.set(fmt(Math.min(elapsed, tMark)));
      if (elapsed >= tMark) {
        if (!measured.has(params.tilt)) measured.set(params.tilt, new Map());
        measured.get(params.tilt).set(params.mark, tMark);
      }

      // Трубка поворачивается вокруг точки опоры на столе; верхний её конец всегда у стойки штатива
      const rad = (angle * Math.PI) / 180;
      const px = ROD_X - CLAMP_U * Math.cos(rad);
      const py = AXIS_Y;
      tube.setAttribute('transform', `translate(${px.toFixed(1)} ${py}) rotate(${(-angle).toFixed(2)})`);
      bubble.setAttribute('transform', `translate(${u.toFixed(1)} 0)`);
      padG.setAttribute('transform', `translate(${px.toFixed(1)} ${BENCH})`);

      // Лапка всегда стоит на высоте, нужной для выбранного угла, — трубку поднимают к ней
      const set0 = (params.tilt * Math.PI) / 180;
      clamp.setAttribute('transform', `translate(0 ${(-CLAMP_U * Math.sin(set0)).toFixed(1)})`);

      const ar = 70;
      refLine.setAttribute('x1', px);
      refLine.setAttribute('y1', py);
      refLine.setAttribute('x2', px + ar + 18);
      refLine.setAttribute('y2', py);
      arc.setAttribute('d', `M${px.toFixed(1)} ${py} H${(px + ar).toFixed(1)} A ${ar} ${ar} 0 0 0 ${(px + ar * Math.cos(rad)).toFixed(1)} ${(py - ar * Math.sin(rad)).toFixed(1)} Z`);
      arc.setAttribute('opacity', angle > 0.5 ? 1 : 0);
      angleText.setAttribute('x', (px + ar + 22).toFixed(1));
      angleText.setAttribute('y', py + 6);
      angleText.textContent = angle > 0.5 ? `α = ${Math.round(angle)}°` : '';

      for (const [m, ring] of rings) {
        const on = m === params.mark;
        ring.band.setAttribute('fill', on ? '#dc2626' : '#1f2937');
        ring.label.setAttribute('fill', on ? '#b91c1c' : '#334155');
      }
      tube.style.cursor = !params.run || phase === 'done' ? 'pointer' : 'default';

      drawPlot();
    },
  });

  // Стеклянная трубка с водой: пробки на концах, линейка с метками, резиновые кольца, пузырёк
  function buildTube(d) {
    const g = s('g');
    tubeHit = s('g', {}, [
      floorShadow(LEN / 2, R + 2, LEN / 2, d, 4),
      s('rect', { x: 0, y: -R, width: LEN, height: 2 * R, rx: R, fill: '#bfdbfe', 'fill-opacity': 0.55 }),
      // вода: светлее у верхней стенки, темнее у нижней
      s('rect', { x: 8, y: -R + 2, width: LEN - 16, height: 2 * R - 4, rx: 4, fill: d.lin([[0, '#e0f2fe'], [0.5, '#7dd3fc'], [1, '#38bdf8']], 'v'), 'fill-opacity': 0.75 }),
    ]);
    bubble = s('g', {}, [
      s('ellipse', { cx: 0, cy: -2, rx: 11, ry: 4.2, fill: '#ffffff', 'fill-opacity': 0.92, stroke: '#0284c7', 'stroke-width': 1 }),
      s('ellipse', { cx: -3, cy: -3.5, rx: 5, ry: 1.3, fill: '#ffffff' }),
    ]);
    tubeHit.append(
      bubble,
      // стекло поверх воды: блик по верхней кромке
      s('rect', { x: 0, y: -R, width: LEN, height: 2 * R, rx: R, fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.6 }),
      s('rect', { x: 14, y: -R + 2, width: LEN - 28, height: 2.2, rx: 1.1, fill: '#ffffff', 'fill-opacity': 0.85 }),
      // резиновые пробки
      s('rect', { x: -2, y: -R - 1, width: 12, height: 2 * R + 2, rx: 3, fill: d.lin([[0, '#57534e'], [1, '#292524']], 'v') }),
      s('rect', { x: LEN - 10, y: -R - 1, width: 12, height: 2 * R + 2, rx: 3, fill: d.lin([[0, '#57534e'], [1, '#292524']], 'v') }),
    );
    tubeHit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(tubeHit, 16);

    // Линейка над трубкой: деления через 1 см, цифры через 10 см
    const ruler = s('g', { 'pointer-events': 'none' });
    ruler.append(s('rect', { x: U0 - 14, y: -R - 26, width: 40 * PX + 28, height: 22, rx: 3, fill: '#fef9c3', stroke: '#ca8a04', 'stroke-width': 1 }));
    for (let cm = 0; cm <= 40; cm++) {
      const x = U0 + cm * PX;
      const major = cm % 10 === 0;
      const mid = cm % 5 === 0;
      ruler.append(s('line', { x1: x, y1: -R - 4, x2: x, y2: -R - 4 - (major ? 9 : mid ? 6 : 3.5), stroke: '#334155', 'stroke-width': major ? 1.3 : 0.7 }));
    }
    ruler.append(text(U0 - 30, -R - 14, tr('см'), { size: 13, weight: 600, fill: '#334155' }));
    g.append(tubeHit, ruler);

    // Резиновые кольца: на метке 0 — чёрное (пуск секундомера), на 10…40 см — выбираются щелчком
    g.append(
      s('rect', { x: U0 - 2.5, y: -R - 2, width: 5, height: 2 * R + 4, rx: 2, fill: '#111827', 'pointer-events': 'none' }),
      text(U0, -R - 17, '0', { size: 13, weight: 700, fill: '#334155' }),
    );
    for (const m of MARKS) {
      const x = U0 + m * PX;
      const band = s('rect', { x: x - 2.5, y: -R - 2, width: 5, height: 2 * R + 4, rx: 2, fill: '#1f2937' });
      const label = text(x, -R - 17, String(m), { size: 13, weight: 700, fill: '#334155' });
      const ring = s('g', {}, [
        s('rect', { x: x - 13, y: -R - 28, width: 26, height: 2 * R + 32, fill: 'transparent' }),
        band,
        label,
      ]);
      ring.style.cursor = 'pointer';
      ring.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('mark', m);
      });
      touchTarget(ring, 6);
      rings.set(m, { band, label });
      g.append(ring);
    }
    return g;
  }

  // Штатив: чугунное основание, стойка и лапка с муфтой. Лапку перетаскивают вверх-вниз по стойке
  function buildStand(svg, d) {
    svg.append(
      // основание штатива уходит от стойки вправо, под доску: лежащая трубка заходит на него только пробкой
      floorShadow(ROD_X + 56, BENCH + 2, 86, d, 6),
      s('rect', { x: ROD_X - 22, y: BENCH - 14, width: 150, height: 14, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: ROD_X - 18, y: BENCH - 13, width: 142, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.18 }),
      s('rect', { x: ROD_X - 4, y: ROD_TOP, width: 8, height: BENCH - 14 - ROD_TOP, rx: 3, fill: d.lin(['#64748b', '#f1f5f9', '#475569']) }),
      s('circle', { cx: ROD_X, cy: ROD_TOP, r: 4, fill: '#94a3b8' }),
    );
  }

  // Лапка рисуется для угла 0 (у оси лежащей трубки) и сдвигается вверх целиком
  function buildClamp(d) {
    const y = AXIS_Y;
    const g = s('g', {}, [
      // муфта на стойке с винтом
      s('rect', { x: ROD_X - 12, y: y - 13, width: 24, height: 26, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v'), stroke: '#1e293b', 'stroke-width': 1 }),
      s('rect', { x: ROD_X + 12, y: y - 3, width: 14, height: 6, rx: 2, fill: '#475569' }),
      s('circle', { cx: ROD_X + 30, cy: y, r: 6, fill: d.rad([[0, '#e2e8f0'], [1, '#475569']], 0.4, 0.35), stroke: '#334155', 'stroke-width': 1 }),
      // губки лапки с пробковыми накладками: трубка лежит между ними
      s('rect', { x: ROD_X - 11, y: y - 21, width: 22, height: 8, rx: 2, fill: '#78716c', stroke: '#44403c', 'stroke-width': 1 }),
      s('rect', { x: ROD_X - 11, y: y + 13, width: 22, height: 8, rx: 2, fill: '#78716c', stroke: '#44403c', 'stroke-width': 1 }),
      s('rect', { x: ROD_X - 9, y: y - 14, width: 18, height: 3, fill: '#d6a46b' }),
      s('rect', { x: ROD_X - 9, y: y + 11, width: 18, height: 3, fill: '#d6a46b' }),
    ]);
    return g;
  }

  // Доска с графиком пути: оси, сетка, подписи; прямые измерений рисует drawPlot()
  function buildBoard(svg, d) {
    const bx = G.x - 62;
    const by = 32;
    const bw = G.w + 96;
    const bh = G.y - by + 52;
    svg.append(
      s('rect', { x: bx - 5, y: by - 5, width: bw + 10, height: bh + 10, rx: 8, fill: d.lin([[0, '#cbd5e1'], [1, '#94a3b8']], 'v') }),
      s('rect', { x: bx, y: by, width: bw, height: bh, rx: 5, fill: '#ffffff', filter: d.url('soft') }),
      text(bx + bw / 2, by + 22, tr('График пути s(t)'), { size: 16, weight: 700, fill: '#1e293b' }),
    );
    const grid = s('g', { stroke: '#e2e8f0', 'stroke-width': 1 });
    for (let t = 2; t <= G.tMax; t += 2) grid.append(s('line', { x1: tx(t), y1: G.y, x2: tx(t), y2: G.y - G.h }));
    for (let cm = 5; cm <= G.sMax; cm += 5) grid.append(s('line', { x1: G.x, y1: sy(cm), x2: G.x + G.w, y2: sy(cm) }));
    svg.append(grid);
    svg.append(
      s('path', { d: `M${G.x} ${G.y - G.h - 10} V${G.y} H${G.x + G.w + 12}`, fill: 'none', stroke: '#334155', 'stroke-width': 2 }),
      s('path', { d: `M${G.x - 5} ${G.y - G.h - 4} L${G.x} ${G.y - G.h - 14} L${G.x + 5} ${G.y - G.h - 4} Z`, fill: '#334155' }),
      s('path', { d: `M${G.x + G.w + 6} ${G.y - 5} L${G.x + G.w + 16} ${G.y} L${G.x + G.w + 6} ${G.y + 5} Z`, fill: '#334155' }),
      text(G.x + 12, G.y - G.h - 12, tr('s, см'), { size: 14, weight: 700, fill: '#334155', anchor: 'start' }),
      text(G.x + G.w + 6, G.y + 17, tr('t, с'), { size: 14, weight: 700, fill: '#334155' }),
      text(G.x - 8, G.y + 14, '0', { size: 13, weight: 600, fill: '#64748b', anchor: 'end' }),
    );
    for (let t = 4; t < G.tMax; t += 4) svg.append(text(tx(t), G.y + 16, String(t), { size: 13, weight: 600, fill: '#64748b' }));
    for (let cm = 10; cm <= G.sMax; cm += 10) svg.append(text(G.x - 8, sy(cm), String(cm), { size: 13, weight: 600, fill: '#64748b', anchor: 'end' }));
    plot = s('g');
    svg.append(plot);
  }

  // Объявления функций, а не стрелки: build() вызывает их раньше, чем дойдёт до этих строк
  function tx(t) { return G.x + (t / G.tMax) * G.w; }
  function sy(cm) { return G.y - (cm / G.sMax) * G.h; }

  // Перерисовка графика только при новом измерении: прямая из начала координат через точки опыта
  function drawPlot() {
    const key = [...measured].map(([a, m]) => `${a}:${[...m.keys()].join(',')}`).join(';');
    if (key === plotted) return;
    plotted = key;
    plot.replaceChildren();
    for (const [a, points] of [...measured].sort((x, y) => x[0] - y[0])) {
      const color = LINE_COLORS[a];
      const far = Math.max(...points.keys());
      const t = points.get(far);
      plot.append(s('line', { x1: G.x, y1: G.y, x2: tx(t), y2: sy(far), stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      for (const [m, tm] of points) plot.append(s('circle', { cx: tx(tm), cy: sy(m), r: 4.5, fill: color, stroke: '#ffffff', 'stroke-width': 1.5 }));
      plot.append(text(tx(t) + 8, sy(far) - 2, `${a}°`, { size: 14, weight: 700, fill: color, anchor: 'start' }));
    }
  }

  // Щелчок по трубке: лежащую — поднять в лапку; когда пузырёк дошёл до верха — опустить
  function toggle() {
    if (!params.run) set('run', 1);
    else if (phase === 'done') set('run', 0);
  }

  // Подключаем после createScene: перетаскиванию нужен scene.point(), а во время build() сцены ещё нет
  draggable(scene, clamp, {
    onDrag(_x, py) {
      const h = Math.max(0, Math.min(CLAMP_U, AXIS_Y - py));
      set('tilt', (Math.asin(h / CLAMP_U) * 180) / Math.PI);
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
