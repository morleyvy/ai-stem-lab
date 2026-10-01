// Сцена «Равноускоренное движение»: на столе физкабинета — металлический жёлоб с мерной лентой. Нижний
// конец жёлоба упирается в брусок на столе, верхний зажат в лапке штатива; лапку можно поднимать и опускать
// (угол наклона α). У старта стальной шарик держит электромагнит: щелчок по шарику отпускает его
// (released = 1) и запускает секундомер. Оптический датчик ставят на жёлоб на расстоянии s от старта
// (регулятором или перетаскиванием): когда шарик пересекает луч, секундомер останавливается. На экране
// справа по ходу опыта строятся графики s(t) и v(t), точки прошлых пусков остаются — по ним видно параболу
// и прямую. Остальные числа (путь, ускорение, скорость) — только в панели показаний под сценой.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, readout, room, s, shade, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 400;
const PIV = { x: 892, y: BENCH }; // нижний край жёлоба на столе — вокруг него жёлоб поворачивается
const PX = 400; // px на метр вдоль жёлоба
const X0 = -690; // центр шарика у старта в координатах жёлоба (0 — нижний конец, ось вдоль жёлоба)
const LEN = 770; // длина жёлоба, px (1,9 м)
const BALL_R = 11;
const BALL_Y = -33; // шарик лежит в канавке: нижнюю часть закрывает передний борт
const ROD_X = 160; // стержень штатива
const BACK_SPEED = 3; // м/с — шарик возвращают к старту рукой, быстро
const PAUSE = 0.4; // с — пауза у старта перед повторным пуском, чтобы был виден старт
const TURN_SPEED = 25; // °/с — жёлоб поворачивается плавно, а не прыжком
// Экран с графиками: оси s(t) и v(t)
const PLOT = { y0: 196, h: 120, w: 172, sx: 504, vx: 744, tMax: 4, sMax: 1.6, vMax: 2 };

export function kinematics9Scene(container, params, set, { accel, gateTime, END }) {
  let groove, ball, gate, gateIndex, magnetLed, gateLed, gateBeam;
  let clampBack, clampFront, timer, wireMagnet;
  let sTrace, vTrace, sNow, vNow, dotsG;
  // Ход опыта: held — у старта, run — катится, done — у упора, back — возвращается, pause — ждёт пуска
  let phase = params.released ? 'run' : 'held';
  let pos = 0; // м от старта
  let tRun = 0;
  let wait = 0;
  let crossed = false;
  let angle = params.alpha; // угол, на котором жёлоб нарисован сейчас (догоняет params.alpha)
  let prevKey = `${params.alpha}|${params.s}`;
  // Точки завершённых пусков на графиках: по одной на пару «угол, расстояние»
  const dots = new Map();
  let dotsKey = '';

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Единственное табло в сцене — секундомер: он идёт, пока шарик катится, и это видно прямо в опыте
      timer = readout(d, { x: 40, y: 40, w: 180, caption: tr('Секундомер, с'), color: '#fbbf24' });
      wireMagnet = s('path', { fill: 'none', stroke: '#1e293b', 'stroke-width': 3, 'stroke-linecap': 'round' });
      svg.append(timer.g);

      buildLogger(svg, d);
      buildStand(svg, d);
      svg.append(wireMagnet);

      // Брусок-упор под нижним концом жёлоба: жёлоб не сползает по столу
      svg.append(
        floorShadow(PIV.x + 6, BENCH + 2, 34, d),
        s('rect', { x: PIV.x - 2, y: BENCH - 20, width: 26, height: 20, rx: 3, fill: d.lin([[0, '#c49a68'], [1, '#8a6a43']], 'v'), stroke: '#6b4f33', 'stroke-width': 1.2 }),
      );

      groove = buildGroove(d);
      svg.append(groove);
      buildClampFront(svg, d);
    },

    frame(dt) {
      const a = accel(params);
      const tg = gateTime(params);
      const key = `${params.alpha}|${params.s}`;
      // Новый угол или новое место датчика во время опыта: шарик возвращают к старту и отпускают снова
      if (key !== prevKey) {
        prevKey = key;
        if (params.released && phase !== 'held') phase = 'back';
      }

      if (!params.released) {
        phase = 'held';
        pos = Math.max(0, pos - BACK_SPEED * dt);
      } else if (phase === 'held') {
        if (pos > 0) pos = Math.max(0, pos - BACK_SPEED * dt);
        else start();
      } else if (phase === 'back') {
        pos = Math.max(0, pos - BACK_SPEED * dt);
        if (pos === 0) {
          phase = 'pause';
          wait = PAUSE;
        }
      } else if (phase === 'pause') {
        wait -= dt;
        if (wait <= 0) start();
      } else if (phase === 'run') {
        // Равноускоренное движение без начальной скорости: s = a·t²/2
        tRun += dt;
        pos = 0.5 * a * tRun * tRun;
        if (pos >= END) {
          pos = END;
          phase = 'done';
        }
      }
      const moving = phase === 'run' || phase === 'done';
      if (moving && !crossed && tRun >= tg) {
        crossed = true;
        dots.set(key, { alpha: params.alpha, t: tg, s: params.s, v: a * tg });
      }

      // Жёлоб поворачивается к новому углу плавно
      const diff = params.alpha - angle;
      angle += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);
      groove.setAttribute('transform', `translate(${PIV.x} ${PIV.y}) rotate(${angle.toFixed(3)})`);
      placeClamp();

      ball.setAttribute('transform', `translate(${(X0 + pos * PX).toFixed(1)} ${BALL_Y})`);
      const gx = X0 + params.s * PX;
      gate.setAttribute('transform', `translate(${gx} 0)`);
      gateIndex.setAttribute('transform', `translate(${gx} 0)`);

      timer.set(moving ? fmt(Math.min(tRun, tg), 3) : '0,000');
      magnetLed.setAttribute('fill', moving ? '#475569' : '#ef4444');
      gateLed.setAttribute('fill', moving && crossed ? '#22c55e' : '#ef4444');
      gateBeam.setAttribute('fill', moving && crossed ? '#22c55e' : '#ef4444');

      // Провод от электромагнита к секундомеру: отпускание шарика запускает отсчёт
      const m = toScreen(X0 - BALL_R - 9, -48);
      wireMagnet.setAttribute('d', `M${m.x.toFixed(1)} ${m.y.toFixed(1)} C ${(m.x + 10).toFixed(1)} ${(m.y - 50).toFixed(1)}, 232 130, 220 92`);

      // Графики: кривая текущего пуска до момента, когда шарик пересёк луч датчика
      const tau = moving ? Math.min(tRun, tg) : 0;
      if (moving) {
        const sp = [];
        const vp = [];
        for (let i = 0; i <= 30; i++) {
          const t = (tau * i) / 30;
          sp.push(`${plotX(PLOT.sx, t)},${plotY(0.5 * a * t * t, PLOT.sMax)}`);
          vp.push(`${plotX(PLOT.vx, t)},${plotY(a * t, PLOT.vMax)}`);
        }
        sTrace.setAttribute('points', sp.join(' '));
        vTrace.setAttribute('points', vp.join(' '));
      } else {
        sTrace.setAttribute('points', '');
        vTrace.setAttribute('points', '');
      }
      sNow.setAttribute('opacity', moving ? 1 : 0);
      vNow.setAttribute('opacity', moving ? 1 : 0);
      sNow.setAttribute('cx', plotX(PLOT.sx, tau));
      sNow.setAttribute('cy', plotY(0.5 * a * tau * tau, PLOT.sMax));
      vNow.setAttribute('cx', plotX(PLOT.vx, tau));
      vNow.setAttribute('cy', plotY(a * tau, PLOT.vMax));
      renderDots();
    },
  });

  function start() {
    phase = 'run';
    tRun = 0;
    crossed = false;
  }

  // Точка в координатах жёлоба → координаты сцены (поворот на текущий угол вокруг нижнего конца)
  function toScreen(lx, ly) {
    const r = (angle * Math.PI) / 180;
    return { x: PIV.x + lx * Math.cos(r) - ly * Math.sin(r), y: PIV.y + lx * Math.sin(r) + ly * Math.cos(r) };
  }

  // Объявления функций, а не стрелки: build() рисует оси раньше, чем выполнение дойдёт до этих строк
  function plotX(x0, t) {
    return (x0 + (Math.min(t, PLOT.tMax) / PLOT.tMax) * PLOT.w).toFixed(1);
  }
  function plotY(v, max) {
    return (PLOT.y0 - (Math.min(v, max) / max) * PLOT.h).toFixed(1);
  }

  // Точки прошлых пусков: при текущем угле — яркие, при других углах — бледные
  function renderDots() {
    const k = `${params.alpha}|${dots.size}`;
    if (k === dotsKey) return;
    dotsKey = k;
    dotsG.replaceChildren();
    for (const p of dots.values()) {
      const op = p.alpha === params.alpha ? 1 : 0.35;
      dotsG.append(
        s('circle', { cx: plotX(PLOT.sx, p.t), cy: plotY(p.s, PLOT.sMax), r: 4.5, fill: '#38bdf8', stroke: '#0f172a', 'stroke-width': 1, opacity: op }),
        s('circle', { cx: plotX(PLOT.vx, p.t), cy: plotY(p.v, PLOT.vMax), r: 4.5, fill: '#fbbf24', stroke: '#0f172a', 'stroke-width': 1, opacity: op }),
      );
    }
  }

  // Экран компьютера с графиками движения: s(t) слева, v(t) справа
  function buildLogger(svg, d) {
    const x = 452;
    const y = 30;
    const w = 478;
    const h = 214;
    svg.append(
      s('rect', { x, y, width: w, height: h, rx: 12, fill: d.lin([[0, '#465467'], [0.5, '#2b3544'], [1, '#1a212c']], 'v'), stroke: '#0b1017', filter: d.url('soft') }),
      s('rect', { x: x + 8, y: y + 26, width: w - 16, height: h - 34, rx: 6, fill: d.lin([[0, '#0a0f18'], [1, '#111a27']], 'v') }),
      text(x + w / 2, y + 14, tr('Графики движения'), { size: 13, weight: 600, fill: '#c5cfdb' }),
      s('circle', { cx: x + w - 14, cy: y + 13, r: 3, fill: '#34d399' }),
    );
    axes(svg, PLOT.sx, 's, м', [[0, '0'], [0.8, '0,8'], [1.6, '1,6']], PLOT.sMax);
    axes(svg, PLOT.vx, 'v, м/с', [[0, '0'], [1, '1'], [2, '2']], PLOT.vMax);
    sTrace = s('polyline', { fill: 'none', stroke: '#38bdf8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    vTrace = s('polyline', { fill: 'none', stroke: '#fbbf24', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    sNow = s('circle', { r: 4, fill: '#e0f2fe', opacity: 0 });
    vNow = s('circle', { r: 4, fill: '#fef3c7', opacity: 0 });
    dotsG = s('g');
    svg.append(dotsG, sTrace, vTrace, sNow, vNow);
  }

  function axes(svg, x0, yName, yTicks, yMax) {
    const g = s('g');
    for (const [v, label] of yTicks) {
      const y = plotY(v, yMax);
      if (v > 0) g.append(s('line', { x1: x0, x2: x0 + PLOT.w, y1: y, y2: y, stroke: '#334155', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      g.append(text(x0 - 7, y, label, { size: 13, weight: 500, fill: '#94a3b8', anchor: 'end' }));
    }
    for (let t = 0; t <= PLOT.tMax; t++) {
      const x = plotX(x0, t);
      g.append(
        s('line', { x1: x, x2: x, y1: PLOT.y0, y2: PLOT.y0 + 4, stroke: '#64748b', 'stroke-width': 1.2 }),
        text(x, PLOT.y0 + 14, String(t), { size: 13, weight: 500, fill: '#94a3b8' }),
      );
    }
    g.append(
      s('path', { d: `M${x0} ${PLOT.y0 - PLOT.h - 12} V${PLOT.y0} H${x0 + PLOT.w + 10}`, fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('path', { d: `M${x0 - 4} ${PLOT.y0 - PLOT.h - 6} L${x0} ${PLOT.y0 - PLOT.h - 14} L${x0 + 4} ${PLOT.y0 - PLOT.h - 6} M${x0 + PLOT.w + 4} ${PLOT.y0 - 4} L${x0 + PLOT.w + 12} ${PLOT.y0} L${x0 + PLOT.w + 4} ${PLOT.y0 + 4}`, fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      text(x0 + 8, PLOT.y0 - PLOT.h - 12, tr(yName), { size: 13, weight: 700, fill: '#e2e8f0', anchor: 'start' }),
      text(x0 + PLOT.w + 2, PLOT.y0 + 30, tr('t, с'), { size: 13, weight: 700, fill: '#e2e8f0', anchor: 'end' }),
    );
    svg.append(g);
  }

  // Штатив: основание и стержень позади жёлоба, муфта перемещается по стержню вместе с лапкой
  function buildStand(svg, d) {
    svg.append(
      floorShadow(ROD_X, BENCH + 2, 80, d),
      s('rect', { x: ROD_X - 70, y: BENCH - 12, width: 140, height: 12, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: ROD_X - 64, y: BENCH - 11, width: 128, height: 2.5, rx: 1, fill: '#ffffff', 'fill-opacity': 0.18 }),
      s('rect', { x: ROD_X - 4, y: 206, width: 8, height: BENCH - 216, rx: 3, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
    );
    clampBack = s('g', {}, [
      s('rect', { x: ROD_X - 12, y: -13, width: 24, height: 26, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v'), stroke: '#1e293b', 'stroke-width': 1 }),
      // винт муфты
      s('rect', { x: ROD_X - 26, y: -3, width: 14, height: 6, rx: 2, fill: '#475569' }),
      s('circle', { cx: ROD_X - 28, cy: 0, r: 5, fill: d.rad(['#94a3b8', '#334155']) }),
    ]);
    svg.append(clampBack);
  }

  // Лапка штатива спереди жёлоба: щёки сжимают жёлоб сверху и снизу. Перетаскивание лапки меняет угол
  function buildClampFront(svg, d) {
    clampFront = s('g', {}, [
      s('rect', { x: ROD_X - 9, y: -32, width: 18, height: 64, rx: 4, fill: d.lin([[0, '#475569'], [0.5, '#64748b'], [1, '#334155']]), stroke: '#1e293b', 'stroke-width': 1 }),
      s('rect', { x: ROD_X - 6, y: -29, width: 12, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.25 }),
      s('circle', { cx: ROD_X, cy: 22, r: 5, fill: d.rad(['#e2e8f0', '#64748b']), stroke: '#1e293b', 'stroke-width': 1 }),
    ]);
    svg.append(clampFront);
  }

  // Муфта и лапка стоят там, где жёлоб пересекает стержень штатива
  function placeClamp() {
    const r = (angle * Math.PI) / 180;
    const cy = PIV.y - (PIV.x - ROD_X) * Math.tan(r) - 18 / Math.cos(r);
    clampBack.setAttribute('transform', `translate(0 ${cy.toFixed(1)})`);
    clampFront.setAttribute('transform', `translate(0 ${cy.toFixed(1)})`);
  }

  // Жёлоб в собственных координатах: x вдоль жёлоба (0 — нижний конец, влево — вверх по жёлобу), y вниз
  function buildGroove(d) {
    const g = s('g');
    const x1 = -LEN;
    // задняя стенка канавки — видна над передним бортом
    g.append(s('rect', { x: x1, y: -38, width: LEN, height: 16, rx: 2, fill: d.lin([[0, '#94a3b8'], [1, '#64748b']], 'v'), stroke: '#475569', 'stroke-width': 1 }));

    // Оптический датчик: стойка позади канавки, луч пересекает путь шарика
    gateLed = s('circle', { cx: 0, cy: -74, r: 3.5, fill: '#ef4444' });
    gateBeam = s('circle', { cx: 0, cy: BALL_Y, r: 4, fill: '#ef4444', 'fill-opacity': 0.9 });
    gate = s('g', {}, [
      s('rect', { x: -4, y: -64, width: 8, height: 70, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      s('rect', { x: -13, y: -86, width: 26, height: 24, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      gateLed,
      s('rect', { x: -7, y: BALL_Y - 7, width: 14, height: 14, rx: 3, fill: '#1e293b' }),
      gateBeam,
    ]);
    g.append(gate);

    // Стальной шарик
    ball = s('g', {}, [
      s('circle', { r: BALL_R, fill: d.rad([[0, '#ffffff'], [0.3, '#e2e8f0'], [0.75, '#94a3b8'], [1, '#334155']], 0.35, 0.3), stroke: '#334155', 'stroke-width': 1 }),
      s('circle', { cx: -3.5, cy: -4, r: 2.5, fill: '#ffffff', 'fill-opacity': 0.9 }),
    ]);
    ball.style.cursor = 'pointer';
    ball.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(ball);
    g.append(ball);

    // Передний борт жёлоба с мерной лентой: 0 — центр шарика у старта
    g.append(
      s('rect', { x: x1, y: -24, width: LEN, height: 24, rx: 2, fill: d.lin([[0, '#f1f5f9'], [0.35, '#cbd5e1'], [1, '#64748b']], 'v'), stroke: '#475569', 'stroke-width': 1.2 }),
      s('rect', { x: x1 + 2, y: -23, width: LEN - 4, height: 2, fill: '#ffffff', 'fill-opacity': 0.7 }),
      s('rect', { x: X0 - 10, y: -21, width: 1.65 * PX + 20, height: 19, rx: 2, fill: '#fef9c3', stroke: '#ca8a04', 'stroke-width': 1 }),
    );
    for (let cm = 0; cm <= 165; cm += 5) {
      const x = X0 + (cm / 100) * PX;
      const major = cm % 20 === 0;
      const mid = cm % 10 === 0;
      g.append(s('line', { x1: x, y1: -21, x2: x, y2: -21 + (major ? 8 : mid ? 5 : 3), stroke: '#334155', 'stroke-width': major ? 1.4 : 0.8 }));
      if (major) g.append(text(x, -8.5, String(cm), { size: 13, weight: 600, fill: '#334155' }));
    }
    g.append(text(-20, -8.5, tr('см'), { size: 13, weight: 600, fill: '#334155' }));

    // Метка датчика на ленте — по ней видно расстояние от старта
    gateIndex = s('path', { d: 'M-5 -21 L5 -21 L0 -13 Z', fill: '#dc2626' });
    g.append(gateIndex);

    // Резиновый упор в конце жёлоба
    g.append(
      s('rect', { x: -14, y: -52, width: 10, height: 30, rx: 2, fill: '#334155' }),
      s('rect', { x: -19, y: -46, width: 7, height: 20, rx: 3, fill: '#111827' }),
    );

    // Электромагнит у старта: катушка в корпусе, держит стальной шарик
    magnetLed = s('circle', { cx: X0 - BALL_R - 9, cy: -54, r: 3.5, fill: '#ef4444' });
    const coil = [];
    for (let y = -46; y < -26; y += 4) coil.push(s('rect', { x: X0 - BALL_R - 16, y, width: 14, height: 2.4, fill: '#b45309' }));
    const magnet = s('g', {}, [
      s('rect', { x: X0 - BALL_R - 20, y: -50, width: 20, height: 28, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      ...coil,
      s('rect', { x: X0 - BALL_R - 3, y: -42, width: 3, height: 16, rx: 1, fill: shade('#94a3b8', 0.2) }),
      magnetLed,
    ]);
    magnet.style.cursor = 'pointer';
    magnet.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(magnet);
    g.append(magnet);
    return g;
  }

  // Щелчок по шарику (электромагниту): у старта — отпустить; докатившийся до упора — вернуть к старту
  function toggle() {
    if (!params.released) set('released', 1);
    else if (phase === 'done') set('released', 0);
  }

  // Перетаскивание подключаем после createScene: draggable() переводит координаты указателя через scene
  // Лапку тянут вверх-вниз: угол наклона — по высоте лапки над нижним концом жёлоба
  draggable(scene, clampFront, {
    onDrag(x, y) {
      set('alpha', (Math.atan2(PIV.y - y, PIV.x - ROD_X) * 180) / Math.PI);
    },
  });
  // Датчик сдвигают вдоль жёлоба: проекция указателя на ось жёлоба
  draggable(scene, gate, {
    onDrag(x, y) {
      const r = (angle * Math.PI) / 180;
      const lx = (x - PIV.x) * Math.cos(r) + (y - PIV.y) * Math.sin(r);
      set('s', (lx - X0) / PX);
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
