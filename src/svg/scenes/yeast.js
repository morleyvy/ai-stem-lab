// Сцена «Брожение дрожжей»: колба с раствором дрожжей в водяной бане на плитке, на горлышке —
// шарик, надувающийся от CO₂. Пузырьки газа поднимаются в растворе, температура — на табло плитки,
// объём CO₂ — на отдельном табло. Шарик ученик сам надевает на горлышко: пока он лежит на столе,
// газ из колбы уходит в воздух (видны струйки над горлышком), и собрать его нельзя.

import { bubblePool, createScene, draggable, floorShadow, hotplate, readout, room, s } from '../kit.js';

const FLASK_X = 480;
const FLASK = { bottom: 386, bodyW: 150, bodyH: 130, neckW: 44, neckTop: 190 };
const BATH = { x: FLASK_X, bottom: 400, w: 260, h: 56 };
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const BALLOON_REST = { x: 668, y: 434, angle: 84 }; // сдутый шарик лежит на столе горлышком влево
const NECK = { x: FLASK_X, y: FLASK.neckTop };
const WISPS = 6;

// Контур конической колбы (Эрлеймейера): широкое дно, сужающиеся плечи, прямое горлышко
function flaskPath({ x, bottom, bodyW, bodyH, neckW, neckTop }) {
  const shoulderY = bottom - bodyH;
  const r = 14;
  return `M${x - bodyW / 2} ${bottom - r}
    Q${x - bodyW / 2} ${bottom} ${x - bodyW / 2 + r} ${bottom}
    H${x + bodyW / 2 - r}
    Q${x + bodyW / 2} ${bottom} ${x + bodyW / 2} ${bottom - r}
    L${x + neckW / 2} ${shoulderY}
    V${neckTop}
    H${x - neckW / 2}
    V${shoulderY}
    Z`;
}

export function yeastScene(container, params, set, { co2Volume, yeastActivity }) {
  let balloon, collar, loose, bubbles, co2Readout, heater, liquid;
  let shownV = co2Volume(params);
  let attached = params.balloon === 1;
  let looseState = attached ? 'gone' : 'rest'; // rest | drag | fly (кнопка шага надевает сама) | gone
  const loosePos = { ...BALLOON_REST };
  const wisps = [];

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: 440 });

      // Плитка нагревает водяную баню; её собственное табло уже показывает температуру
      heater = hotplate(d, { x: BATH.x, y: 398, w: 260 });
      svg.append(heater.g);

      // Водяная баня: широкий металлический таз с водой, колба стоит внутри
      const bathTop = BATH.bottom - BATH.h;
      const bathClip = 'bath' + Math.random().toString(36).slice(2);
      svg.append(
        floorShadow(BATH.x, BATH.bottom + 6, BATH.w * 0.56, d),
        s('clipPath', { id: bathClip }, [s('path', { d: `M${BATH.x - BATH.w / 2} ${bathTop} H${BATH.x + BATH.w / 2} V${BATH.bottom} H${BATH.x - BATH.w / 2} Z` })]),
      );
      svg.append(
        s('path', { d: `M${BATH.x - BATH.w / 2 - 8} ${bathTop - 4} H${BATH.x + BATH.w / 2 + 8} V${BATH.bottom} Q${BATH.x} ${BATH.bottom + 14} ${BATH.x - BATH.w / 2 - 8} ${BATH.bottom} Z`, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'h') }),
        s('rect', { x: BATH.x - BATH.w / 2, y: bathTop, width: BATH.w, height: BATH.h - 6, fill: '#7dd3fc', 'fill-opacity': 0.55, 'clip-path': `url(#${bathClip})` }),
        s('ellipse', { cx: BATH.x, cy: bathTop, rx: BATH.w / 2 - 4, ry: 8, fill: '#bae6fd', 'fill-opacity': 0.7 }),
      );

      // Колба с раствором дрожжей и сахара
      const clip = 'flask' + Math.random().toString(36).slice(2);
      const path = flaskPath({ x: FLASK_X, ...FLASK });
      svg.append(
        s('clipPath', { id: clip }, [s('path', { d: path })]),
        s('path', { d: path, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.15], [1, '#cbd5e1', 0.5]]) }),
      );
      liquid = s('rect', { x: FLASK_X - FLASK.bodyW / 2, y: FLASK.bottom - FLASK.bodyH * 0.62, width: FLASK.bodyW, height: FLASK.bodyH * 0.62, fill: '#fcd34d', 'fill-opacity': 0.55, 'clip-path': `url(#${clip})` });
      const content = s('g', { 'clip-path': `url(#${clip})` });
      svg.append(liquid, content);
      bubbles = bubblePool(content, 40, { color: '#fffbeb' });
      svg.append(
        s('path', { d: path, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5 }),
      );

      // Шарик на горлышке колбы, надувается от выделяющегося CO₂
      const rubber = d.rad([[0, '#fca5a5'], [0.6, '#f43f5e'], [1, '#9f1239']], 0.35, 0.3);
      balloon = s('ellipse', { cx: FLASK_X, cy: FLASK.neckTop - 20, rx: 12, ry: 14, fill: rubber });
      collar = s('rect', { x: FLASK_X - 16, y: FLASK.neckTop - 8, width: 32, height: 10, rx: 2, fill: '#be123c' });
      svg.append(collar, balloon);

      // Струйки газа над открытым горлышком (без шарика) — пул, в кадре меняется только положение
      for (let i = 0; i < WISPS; i++) {
        const c = s('circle', { r: 5, fill: '#cbd5e1', opacity: 0 });
        wisps.push({ c, k: i / WISPS, ph: i * 2.3 });
        svg.append(c);
      }

      // Сдутый шарик на столе: в собственных координатах горлышко в (0, 0), тело — вверх
      loose = s('g', {}, [
        s('rect', { x: -26, y: -64, width: 52, height: 72, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M-5 0 L-6 -9 C -14 -16, -13 -50, -3 -64 C 3 -60, 5 -64, 8 -58 C 14 -44, 13 -16, 6 -9 L5 0 Z', fill: rubber, stroke: '#9f1239', 'stroke-width': 1 }),
        s('path', { d: 'M-9 -28 Q -2 -24 8 -30 M-7 -44 Q 0 -40 8 -46', stroke: '#9f1239', 'stroke-opacity': 0.45, 'stroke-width': 1.2, fill: 'none' }),
        s('rect', { x: -9, y: -2, width: 18, height: 6, rx: 3, fill: '#be123c' }),
      ]);
      svg.append(loose);

      // Табло с объёмом выделившегося CO₂
      co2Readout = readout(d, { x: 760, y: 60, w: 150, caption: 'CO₂, мл', color: '#fda4af' });
      svg.append(co2Readout.g);
    },

    frame(dt) {
      const V = co2Volume(params);
      shownV += (V - shownV) * Math.min(1, dt * 1.5);
      const act = yeastActivity(params.T);

      heater.setHeat(params.T / 60);
      heater.setTemp(params.T);

      // Пузырьки газа поднимаются в растворе тем чаще, чем активнее дрожжи
      const surfaceY = FLASK.bottom - FLASK.bodyH * 0.62;
      if (Math.random() < act * dt * 14) {
        bubbles.spawn(FLASK_X + (Math.random() - 0.5) * (FLASK.bodyW - 40), FLASK.bottom - 10);
      }
      bubbles.update(dt, surfaceY, 6);

      updateLoose(dt);
      // Шарик растёт как ∛V — так его объём пропорционален количеству газа
      const r = Math.min(12 + Math.cbrt(shownV) * 6.5, 62);
      balloon.setAttribute('rx', r * 0.82);
      balloon.setAttribute('ry', r);
      balloon.setAttribute('cy', FLASK.neckTop - 8 - r * 0.95);
      balloon.setAttribute('opacity', attached ? 1 : 0);
      collar.setAttribute('opacity', attached ? 1 : 0);

      // Без шарика газ выходит из горлышка в воздух
      const leak = attached ? 0 : act;
      for (const w of wisps) {
        w.k = (w.k + dt * 0.45) % 1;
        w.c.setAttribute('cx', NECK.x + Math.sin(w.k * 9 + w.ph) * 6 + w.k * 8);
        w.c.setAttribute('cy', NECK.y - 4 - w.k * 80);
        w.c.setAttribute('r', 3 + w.k * 9);
        w.c.setAttribute('opacity', leak * 0.5 * (1 - w.k));
      }

      co2Readout.set(`${fmt(shownV)} мл`);
    },
  });

  // Надеть шарик: отпущен над горлышком или кнопка шага — шарик сам «перелетает» на колбу
  function attach() {
    attached = true;
    looseState = 'gone';
    if (params.balloon !== 1) set('balloon', 1);
  }

  function updateLoose(dt) {
    if (params.balloon === 1 && !attached && looseState !== 'fly') looseState = 'fly';
    if (looseState === 'fly') {
      const k = Math.min(1, dt * 5);
      loosePos.x += (NECK.x - loosePos.x) * k;
      loosePos.y += (NECK.y - loosePos.y) * k;
      loosePos.angle += (0 - loosePos.angle) * k;
      if (Math.hypot(loosePos.x - NECK.x, loosePos.y - NECK.y) < 3) attach();
    }
    loose.setAttribute('opacity', looseState === 'gone' ? 0 : 1);
    loose.style.pointerEvents = looseState === 'gone' ? 'none' : '';
    loose.setAttribute('transform', `translate(${loosePos.x} ${loosePos.y}) rotate(${looseState === 'drag' ? 0 : loosePos.angle})`);
  }

  draggable(scene, loose, {
    onDrag: (x, y) => {
      if (looseState !== 'rest' && looseState !== 'drag') return;
      looseState = 'drag';
      loosePos.x = x;
      loosePos.y = y;
      loosePos.angle = 0;
    },
    onEnd: () => {
      if (looseState !== 'drag') return;
      if (Math.abs(loosePos.x - NECK.x) < 36 && Math.abs(loosePos.y - NECK.y) < 50) attach();
      else {
        looseState = 'rest';
        Object.assign(loosePos, BALLOON_REST);
      }
    },
  });

  return scene;
}
