// Сцена «Диффузия в кубиках агара»: кабинет биологии. Слева — стеклянный кристаллизатор с раствором
// NaOH, справа — белая плитка с тремя кубиками агара с фенолфталеином (ребро 1, 2 и 3 см) и стакан
// со скальпелем. Числа выводит панель показаний под сценой, поэтому табло и таблиц на сцене нет. Ученик сам ведёт опыт:
//   кубики тащат с плитки в кристаллизатор → они погружаются в щёлочь (immerse = 1);
//   скальпель подносят к кубикам или щёлкают по нему → кубики вынимают на плитку и разрезают пополам,
//   на срезе видна малиновая окрашенная зона и бесцветная сердцевина (cut = 1).
// Щелчок по кубику выбирает, какой измерять (size). Масштаб — 4 единицы сцены на миллиметр,
// поэтому толщина малиновой каймы на срезе — настоящая глубина проникновения щёлочи.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, mixHex, room, s, shade, text } from '../kit.js';

const BENCH = 470;
const PX = 4; // единиц сцены на 1 мм
const DISH = { x1: 40, x2: 440, top: 282, bottom: 464, surface: 296 }; // кристаллизатор
const TILE = { x1: 470, x2: 870, top: 444, bottom: 464 }; // белая кафельная плитка
const HOLDER = { x: 912, top: 398, bottom: 464 }; // стакан со скальпелем
const SCALPEL_REST = { x: HOLDER.x - 4, y: 334, angle: 0 }; // кончик лезвия; ручка — в стакане
// Где стоят кубики: на плитке (до опыта и после разреза) и на дне кристаллизатора
const ON_TILE = [{ x: 495, y: TILE.top + 4 }, { x: 570, y: TILE.top + 4 }, { x: 690, y: TILE.top + 4 }];
const IN_DISH = [{ x: 70, y: DISH.bottom - 8 }, { x: 140, y: DISH.bottom - 8 }, { x: 268, y: DISH.bottom - 8 }];

const AGAR = '#efe8d2'; // агар без щёлочи: полупрозрачный, чуть желтоватый
const PINK = '#cf1a6c'; // фенолфталеин в щелочной среде — малиновый
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

export function transportScene(container, params, set, { depth, colored, EDGES }) {
  const cubes = [];
  let resetBtn, scalpel, scalpelHome, topLayer, cubeLayer;
  let shownTime = params.time;

  // Где кубики: 0 — на плитке, 1 — в кристаллизаторе; в полёте — промежуточные значения
  let place = params.immerse && !params.cut ? 1 : 0;
  const drag = { on: false, moved: false, dx: 0, dy: 0, sx: 0, sy: 0, index: 0 };
  // Разрез: какие кубики уже разрезаны (их передняя грань — срез)
  const halved = EDGES.map(() => Boolean(params.cut));
  // Скальпель: rest — в стакане, drag — в руке, wait — ждёт, пока кубики вынут на плитку,
  // slice — режет кубики по очереди, back — возвращается, used — лежит в стакане после разреза
  let sc = params.cut ? 'used' : 'rest';
  const scPos = { ...SCALPEL_REST };
  let sliceT = 0;
  const grab = { dx: 0, dy: 0 };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // Кнопка «Новые кубики» — повторить опыт с самого начала
      resetBtn = s('g', { opacity: 0 }, [
        s('rect', { x: 154, y: 196, width: 172, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M179.4 209.6 A9 9 0 1 0 180.8 220.5 M179.4 202.6 V209.6 H172.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(194, 216, tr('Новые кубики'), { size: 15, weight: 600, fill: '#1e293b', anchor: 'start' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (resetBtn.getAttribute('opacity') === '0') return;
        e.stopPropagation();
        set('cut', 0);
        set('immerse', 0);
        set('time', 0);
      });
      svg.append(resetBtn);

      // ── Кристаллизатор с раствором щёлочи ──
      const dw = DISH.x2 - DISH.x1;
      const body = `M${DISH.x1} ${DISH.top} V${DISH.bottom - 14} Q${DISH.x1} ${DISH.bottom} ${DISH.x1 + 14} ${DISH.bottom} H${DISH.x2 - 14} Q${DISH.x2} ${DISH.bottom} ${DISH.x2} ${DISH.bottom - 14} V${DISH.top}`;
      const clip = `dish${uid}`;
      defs.append(s('clipPath', { id: clip }, [s('path', { d: body })]));
      svg.append(
        text((DISH.x1 + DISH.x2) / 2, 266, tr('Раствор NaOH'), { size: 14, weight: 600, fill: '#475569' }),
        floorShadow((DISH.x1 + DISH.x2) / 2, DISH.bottom + 3, dw * 0.55, d, 10),
        s('path', { d: body, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: DISH.x1, y: DISH.surface, width: dw, height: DISH.bottom - DISH.surface, fill: '#dceef6', 'fill-opacity': 0.7, 'clip-path': `url(#${clip})` }),
      );
      // Кубики в растворе рисуются за передней стенкой — их видно сквозь воду и стекло
      cubeLayer = s('g');
      svg.append(cubeLayer);
      svg.append(
        s('rect', { x: DISH.x1, y: DISH.surface, width: dw, height: DISH.bottom - DISH.surface, fill: d.lin([[0, '#ffffff', 0.18], [1, '#0f172a', 0.08]], 'v'), 'clip-path': `url(#${clip})`, 'pointer-events': 'none' }),
        s('line', { x1: DISH.x1 + 3, x2: DISH.x2 - 3, y1: DISH.surface, y2: DISH.surface, stroke: '#ffffff', 'stroke-opacity': 0.9, 'stroke-width': 2, 'pointer-events': 'none' }),
        s('path', { d: body, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'pointer-events': 'none' }),
        s('path', { d: `M${DISH.x1} ${DISH.top} H${DISH.x2}`, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round', 'pointer-events': 'none' }),
        s('rect', { x: DISH.x1 + 9, y: DISH.top + 12, width: 6, height: DISH.bottom - DISH.top - 32, rx: 3, fill: '#ffffff', 'fill-opacity': 0.6, 'pointer-events': 'none' }),
      );

      // ── Белая кафельная плитка ──
      svg.append(
        floorShadow((TILE.x1 + TILE.x2) / 2, TILE.bottom + 2, 210, d, 9),
        s('rect', { x: TILE.x1, y: TILE.top + 6, width: TILE.x2 - TILE.x1, height: TILE.bottom - TILE.top - 6, rx: 3, fill: d.lin([[0, '#e2e8f0'], [1, '#cbd5e1']], 'v') }),
        s('rect', { x: TILE.x1, y: TILE.top, width: TILE.x2 - TILE.x1, height: 9, rx: 3, fill: d.lin([[0, '#ffffff'], [1, '#f1f5f9']], 'v'), stroke: '#cbd5e1', 'stroke-width': 1 }),
      );

      // ── Кубики агара ──
      // Каждый кубик: верхняя и правая грани, передняя грань (снаружи или срез), на срезе — малиновая кайма,
      // переходная зона и бесцветная сердцевина; пунктир — выбранный для измерения кубик
      const tileCubes = s('g');
      svg.append(tileCubes);
      EDGES.forEach((a, i) => {
        const el = {
          top: s('path', { stroke: '#b8ab8c', 'stroke-width': 1, 'stroke-linejoin': 'round' }),
          side: s('path', { stroke: '#b8ab8c', 'stroke-width': 1, 'stroke-linejoin': 'round' }),
          front: s('rect', { stroke: '#b8ab8c', 'stroke-width': 1 }),
          mid: s('rect', { fill: mixHex(PINK, AGAR, 0.55) }),
          core: s('rect', { fill: AGAR }),
          shine: s('path', { stroke: '#ffffff', 'stroke-opacity': 0.75, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
          gauge: s('path', { stroke: '#ffffff', 'stroke-width': 1.6, fill: 'none', opacity: 0 }),
          outline: s('path', { fill: 'none', stroke: '#0f766e', 'stroke-width': 2.2, 'stroke-dasharray': '6 4', 'stroke-linejoin': 'round', opacity: 0 }),
          label: text(0, 0, `${a} см`, { size: 14, weight: 700, fill: '#475569' }),
        };
        el.g = s('g', {}, [el.top, el.side, el.front, el.mid, el.core, el.shine, el.gauge, el.outline]);
        el.g.style.cursor = 'grab';
        el.g.addEventListener('pointerdown', (e) => pickCube(e, i));
        tileCubes.append(el.label);
        cubes.push({ a, w: a * 10 * PX, el, x: ON_TILE[i].x, y: ON_TILE[i].y });
      });

      // ── Стакан со скальпелем ──
      svg.append(
        floorShadow(HOLDER.x, HOLDER.bottom + 2, 28, d),
        s('rect', { x: HOLDER.x - 20, y: HOLDER.top, width: 40, height: HOLDER.bottom - HOLDER.top, rx: 5, fill: d.lin([[0, '#dbe4ef', 0.5], [1, '#cbd5e1', 0.55]]) }),
      );
      scalpel = s('g', {}, [
        s('rect', { x: -14, y: -6, width: 28, height: 140, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        // Лезвие: острая кромка слева, обух справа; кончик — в (0, 0)
        s('path', { d: 'M0 0 Q-7 14 -6 34 H4 V10 Z', fill: d.lin([[0, '#f8fafc'], [0.5, '#cbd5e1'], [1, '#94a3b8']]), stroke: '#64748b', 'stroke-width': 1 }),
        s('rect', { x: -4, y: 34, width: 7, height: 10, rx: 1.5, fill: '#94a3b8' }),
        s('rect', { x: -5, y: 44, width: 9, height: 82, rx: 3, fill: d.lin([[0, '#475569'], [0.4, '#cbd5e1'], [1, '#475569']]), stroke: '#334155', 'stroke-width': 0.8 }),
        s('path', { d: 'M-2 56 V116 M1.5 56 V116', stroke: '#334155', 'stroke-opacity': 0.4, 'stroke-width': 1 }),
      ]);
      scalpelHome = s('g', {}, [scalpel]);
      svg.append(scalpelHome);
      svg.append(
        s('rect', { x: HOLDER.x - 20, y: HOLDER.top, width: 40, height: HOLDER.bottom - HOLDER.top, rx: 5, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2, 'pointer-events': 'none' }),
      );

      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt) {
      // Окраска догоняет регулятор постепенно — видно, как щёлочь входит в агар
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * 6) : Math.max(params.time, shownTime - dt * 12);
      const dmm = depth(params, shownTime);

      updatePlace(dt);
      updateScalpel(dt);

      const k = ease(place);
      EDGES.forEach((_, i) => {
        const c = cubes[i];
        if (!(drag.on && drag.moved)) {
          // Путь с плитки в кристаллизатор — дугой над краем сосуда
          c.x = lerp(ON_TILE[i].x, IN_DISH[i].x, k);
          c.y = lerp(ON_TILE[i].y, IN_DISH[i].y, k) - Math.sin(Math.PI * k) * 150;
        }
        drawCube(c, i, dmm);
      });
      // Кубик в кристаллизаторе — за передней стенкой сосуда, на плитке и в руке — перед всем
      const inside = place > 0.98 && !drag.on;
      for (const c of cubes) {
        const parent = inside ? cubeLayer : topLayer;
        if (c.el.g.parentNode !== parent) parent.prepend(c.el.g);
      }

      resetBtn.setAttribute('opacity', params.cut && sc === 'used' ? 1 : 0);
    },
  });

  // Кубик: x, y — левый нижний угол передней грани. Наклонная проекция: глубина уходит вправо-вверх
  function drawCube(c, i, dmm) {
    const { w, el } = c;
    const cut = halved[i];
    const o = cut ? 0.5 : 1; // у половинки кубика глубина вдвое меньше
    const ox = 0.35 * w * o;
    const oy = 0.25 * w * o;
    const x = c.x;
    const y = c.y;
    const f = colored(c.a, dmm);
    // Снаружи агар полупрозрачен: малиновый слой виден сразу, и чем он толще, тем насыщеннее цвет
    const tint = dmm > 0 ? 0.25 + 0.5 * clamp01(dmm / 3) + 0.25 * f : 0;
    const skin = mixHex(AGAR, PINK, tint);
    el.top.setAttribute('d', `M${x} ${y - w} L${x + ox} ${y - w - oy} H${x + w + ox} L${x + w} ${y - w} Z`);
    el.top.setAttribute('fill', shade(skin, 0.22));
    el.side.setAttribute('d', `M${x + w} ${y} V${y - w} L${x + w + ox} ${y - w - oy} V${y - oy} Z`);
    el.side.setAttribute('fill', shade(skin, -0.14));
    for (const r of [el.front, el.mid, el.core]) r.setAttribute('y', y - w);
    el.front.setAttribute('x', x);
    el.front.setAttribute('width', w);
    el.front.setAttribute('height', w);
    // Срез: кайма толщиной d (в масштабе сцены), размытая граница фронта диффузии, бесцветная сердцевина
    const dp = Math.min(w / 2, dmm * PX);
    if (cut) {
      el.front.setAttribute('fill', dp > 0 ? PINK : AGAR);
      const mi = Math.max(0, dp - 2.5);
      const core = w - 2 * dp;
      el.mid.setAttribute('x', x + mi);
      el.mid.setAttribute('y', y - w + mi);
      el.mid.setAttribute('width', Math.max(0, w - 2 * mi));
      el.mid.setAttribute('height', Math.max(0, w - 2 * mi));
      el.mid.setAttribute('opacity', dp > 0 && core > 0 ? 1 : 0);
      el.core.setAttribute('x', x + dp);
      el.core.setAttribute('y', y - w + dp);
      el.core.setAttribute('width', Math.max(0, core));
      el.core.setAttribute('height', Math.max(0, core));
      el.core.setAttribute('opacity', core > 0 ? 1 : 0);
    } else {
      el.front.setAttribute('fill', skin);
      el.mid.setAttribute('opacity', 0);
      el.core.setAttribute('opacity', 0);
    }
    el.shine.setAttribute('d', `M${x + 3} ${y - 4} V${y - w + 3} H${x + w - 4}`);
    el.shine.setAttribute('opacity', cut ? 0.35 : 0.75);
    // Линейка глубины на срезе выбранного кубика: от края до границы окраски
    const sel = i === params.size;
    if (cut && sel && dp > 2 && w - 2 * dp > 0) {
      const gy = y - w / 2;
      el.gauge.setAttribute('d', `M${x + 1} ${gy} H${x + dp} M${x + 1} ${gy - 4} V${gy + 4} M${x + dp} ${gy - 4} V${gy + 4}`);
      el.gauge.setAttribute('opacity', 1);
    } else el.gauge.setAttribute('opacity', 0);
    el.outline.setAttribute('d', `M${x - 3} ${y + 3} V${y - w - 2} L${x + ox - 2} ${y - w - oy - 3} H${x + w + ox + 3} V${y - oy + 2} L${x + w + 2} ${y + 3} Z`);
    el.outline.setAttribute('opacity', sel ? 1 : 0);
    // Подпись ребра — над кубиком, только на плитке (в растворе её не видно за стеклом)
    el.label.setAttribute('x', x + (w + ox) / 2);
    el.label.setAttribute('y', y - w - oy - 14);
    el.label.setAttribute('opacity', place < 0.05 && !drag.moved ? 1 : 0);
    el.label.setAttribute('fill', sel ? '#0f766e' : '#475569');
  }

  // ── Кубики: перенос в раствор и выбор кубика для измерения ──
  function updatePlace(dt) {
    // Пока скальпель режет, кубики должны лежать на плитке; разрезанные в раствор не возвращаются
    const target = params.immerse && !params.cut ? 1 : 0;
    if (drag.on) return;
    const speed = dt * 2;
    place = target > place ? Math.min(target, place + speed) : Math.max(target, place - speed);
  }

  function pickCube(e, i) {
    e.stopPropagation();
    const p = scene.point(e);
    Object.assign(drag, { on: true, moved: false, sx: p.x, sy: p.y, index: i, dx: 0, dy: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = e.currentTarget;
    // Нести можно только целые кубики с плитки; в растворе и после разреза щелчок лишь выбирает кубик
    const canCarry = !params.immerse && !params.cut && place < 0.01;
    const move = (ev) => {
      const q = scene.point(ev);
      if (Math.hypot(q.x - drag.sx, q.y - drag.sy) > 6 && canCarry) drag.moved = true;
      if (!drag.moved) return;
      node.style.cursor = 'grabbing';
      drag.dx = q.x - drag.sx;
      drag.dy = q.y - drag.sy;
      // Все три кубика переносят вместе, как на ложечке
      cubes.forEach((c, j) => {
        c.x = ON_TILE[j].x + drag.dx;
        c.y = Math.min(ON_TILE[j].y, ON_TILE[j].y + drag.dy);
      });
    };
    const up = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.style.cursor = 'grab';
      const wasMoved = drag.moved;
      const q = { x: drag.sx + drag.dx, y: drag.sy + drag.dy };
      drag.on = false;
      drag.moved = false;
      if (!wasMoved) {
        set('size', i);
        return;
      }
      // Отпустили над кристаллизатором — кубики опускаются в щёлочь; иначе возвращаются на плитку
      if (q.x < DISH.x2 + 20 && q.y > DISH.top - 200) {
        // Полёт продолжается с того места, где кубики отпустили
        place = clamp01(drag.dx / (IN_DISH[2].x - ON_TILE[2].x));
        set('immerse', 1);
      }
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  // ── Скальпель ──
  const SLICE = 0.55; // с на один кубик: подвести, разрезать
  function sliceTarget(i) {
    const c = cubes[i];
    return { x: c.x + c.w * 0.5 + 0.35 * c.w * 0.25, top: c.y - c.w - 0.25 * c.w - 20, bottom: c.y - 2 };
  }

  function updateScalpel(dt) {
    if (params.cut && (sc === 'rest' || sc === 'drag')) {
      sc = 'wait';
      halved.fill(false);
    }
    if (sc === 'wait') {
      // Режут на плитке: сначала кубики вынимают из раствора
      const t0 = sliceTarget(0);
      const k = Math.min(1, dt * 6);
      scPos.x += (t0.x - scPos.x) * k;
      scPos.y += (t0.top - scPos.y) * k;
      scPos.angle += (180 - scPos.angle) * k;
      if (place < 0.001 && Math.abs(scPos.angle - 180) < 2) {
        sc = 'slice';
        sliceT = 0;
      }
    } else if (sc === 'slice') {
      sliceT += dt;
      const i = Math.min(EDGES.length - 1, Math.floor(sliceT / SLICE));
      const u = (sliceT - i * SLICE) / SLICE;
      const tg = sliceTarget(i);
      scPos.angle = 180;
      if (u < 0.35) {
        // Подводим скальпель к следующему кубику
        const from = i > 0 ? sliceTarget(i - 1) : tg;
        const m = ease(u / 0.35);
        scPos.x = lerp(from.x, tg.x, m);
        scPos.y = lerp(i > 0 ? from.bottom : tg.top, tg.top, m);
      } else {
        const m = ease(clamp01((u - 0.35) / 0.5));
        scPos.x = tg.x;
        scPos.y = lerp(tg.top, tg.bottom, m);
        if (m >= 1) halved[i] = true;
      }
      if (sliceT >= SLICE * EDGES.length) {
        halved.fill(true);
        sc = 'back';
      }
    } else if (sc === 'back') {
      const k = Math.min(1, dt * 5);
      scPos.x += (SCALPEL_REST.x - scPos.x) * k;
      scPos.y += (SCALPEL_REST.y - scPos.y) * k;
      scPos.angle += (0 - scPos.angle) * k;
      if (Math.hypot(scPos.x - SCALPEL_REST.x, scPos.y - SCALPEL_REST.y) < 1) sc = 'used';
    } else if (sc === 'used' || sc === 'rest') {
      if (!params.cut && sc === 'used') {
        // Опыт начали заново — кубики снова целые
        sc = 'rest';
        halved.fill(false);
      }
      Object.assign(scPos, SCALPEL_REST);
    }
    scalpel.style.pointerEvents = sc === 'rest' || sc === 'drag' ? '' : 'none';
    if (!held) place2(scalpel, sc === 'rest' || sc === 'used' ? scalpelHome : topLayer);
    scalpel.setAttribute('transform', `translate(${scPos.x.toFixed(1)} ${scPos.y.toFixed(1)}) rotate(${scPos.angle.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place2(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  let held = false;
  scalpel.addEventListener('pointerdown', () => {
    if (sc !== 'rest') return;
    held = true;
    place2(scalpel, topLayer);
  });
  const release = () => { held = false; };
  scalpel.addEventListener('pointerup', release);
  scalpel.addEventListener('pointercancel', release);

  draggable(scene, scalpel, {
    onDrag(x, y) {
      if (sc !== 'rest' && sc !== 'drag') return;
      if (sc === 'rest') {
        grab.dx = scPos.x - x;
        grab.dy = scPos.y - y;
        sc = 'drag';
      }
      scPos.x = Math.max(20, Math.min(940, x + grab.dx));
      scPos.y = Math.max(40, Math.min(BENCH - 4, y + grab.dy));
    },
    onEnd() {
      // Щелчок по скальпелю (без переноса) или скальпель поднесён к кубикам — режем
      const moved = sc === 'drag';
      const nearCubes = scPos.x < TILE.x2 + 10 && scPos.y > 200;
      if (!moved || nearCubes) {
        set('cut', 1);
        if (params.cut) return;
      }
      sc = 'rest';
      Object.assign(scPos, SCALPEL_REST);
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
