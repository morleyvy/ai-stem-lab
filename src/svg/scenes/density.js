// Сцена «Плотность вещества»: стол физкабинета. Слева — деревянная подставка с телами (три цилиндра
// равного объёма и тело X), в центре — электронные весы, справа — мензурка на 200 мл с водой.
// Расчёт и таблицы на сцене нет: числа — только на табло весов, у мензурки и в панели показаний,
// чтобы ничто не отвлекало от самого измерения. Ученик сам ведёт измерение:
//   тело тащат (или нажимают на него) с подставки на чашу весов → весы показывают массу (weighed = 1);
//   с весов — в мензурку: тело на нити опускается в воду, уровень поднимается на его объём (dipped = 1);
//   нажатие на другое тело на подставке заменяет тело (body): прежнее возвращается на подставку,
//   новое проходит тот же путь — весы, затем мензурка, — чтобы каждое значение было измерено заново.
// Масштаб единый: 1 мл в мензурке — 1,25 px по высоте, внутренний диаметр мензурки 4 см, поэтому
// уровень воды поднимается ровно на объём погружённой части тела, а тела нарисованы в своих размерах.

import { tr } from '../../i18n.js';
import { bubblePool, createScene, cylinderShade, draggable, floorShadow, room, s, shade, text } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 400;
const ML = 1.25; // px на 1 мл по высоте мензурки
const CYL_D = 4; // см — внутренний диаметр мензурки
const PX_CM = (ML * Math.PI * CYL_D * CYL_D) / 4; // px на 1 см — в том же масштабе, что и шкала
const CX = 720; // ось мензурки
const Y0 = 382; // дно мензурки изнутри (отметка 0 мл)
const RIM = 112; // верхний край мензурки
const INNER = CYL_D * PX_CM; // внутренняя ширина, px
const SX = 540; // ось весов
const PAN_Y = BENCH - 62; // верх чаши весов
const TRAY_TOP = BENCH - 28;
const SLOT = (i) => 175 + i * 70;
const ABOVE = { x: CX, y: RIM - 10 }; // тело висит на нити над мензуркой
// Скорости подобраны так, чтобы замена тела (весы → мензурка) укладывалась примерно в 1,6 с:
// наблюдение на шаге работы появляется через 1,8 с после действия
const SPEED = 1300; // px/с — тело переносят рукой
const SINK = 300; // px/с — в воде тело опускают на нити медленнее, чтобы вода не выплеснулась
const HOLD = 0.4; // с — тело лежит на весах, пока показание не установится
const TAGS = ['алюминий', 'сталь', 'латунь', 'X']; // подписи веществ на торце подставки

export function densityScene(container, params, set, { BODIES, mass }) {
  const items = [];
  let pan, scaleValue, levelTag, startLine, water, meniscus, bubbles;
  let prevBody = params.body;
  let clock = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      buildTray(svg, d);
      buildScale(svg, d);
      buildCylinderBack(svg, d);
      // Тела рисуются между задней и передней стенками мензурки: погружённое тело видно сквозь воду
      const bodiesLayer = s('g');
      svg.append(bodiesLayer);
      BODIES.forEach((b, i) => {
        const item = buildBody(d, b, i);
        items.push(item);
        bodiesLayer.append(item.thread, item.g);
      });
      buildCylinderFront(svg, d);
      // Начальная расстановка — сразу на местах, без анимации
      items.forEach((it, i) => {
        const spot = wanted(i);
        Object.assign(it.pos, point(spot, i));
        it.spot = spot;
      });
    },

    frame(dt) {
      clock += dt;
      if (params.body !== prevBody) {
        // Новое тело проходит тот же путь, что прошло прежнее: весы (если взвешивали), затем мензурка
        const it = items[params.body];
        if (!it.drag) plan(params.body, wanted(params.body), Boolean(params.weighed && params.dipped));
        prevBody = params.body;
      }
      items.forEach((it, i) => {
        if (!it.drag && !it.route.length && it.spot !== wanted(i)) plan(i, wanted(i), false);
        move(it, dt);
      });

      // Уровень воды: V₁ плюс объём погружённых частей тел. Уровень сам зависит от погружения,
      // поэтому уточняем его несколькими итерациями — сходится за 3–4 шага
      let lvl = params.V0;
      for (let k = 0; k < 5; k++) {
        const surf = Y0 - lvl * ML;
        let sub = 0;
        items.forEach((it, i) => {
          if (Math.abs(it.pos.x - CX) > INNER / 2 - it.w / 2 + 1) return;
          const depth = Math.max(0, Math.min(it.h, it.pos.y - surf));
          sub += (BODIES[i].V * depth) / it.h;
        });
        lvl = params.V0 + sub;
      }
      const surf = Y0 - lvl * ML;
      water.setAttribute('y', surf.toFixed(1));
      water.setAttribute('height', (Y0 - surf).toFixed(1));
      meniscus.setAttribute('d', `M${CX - INNER / 2} ${(surf - 4).toFixed(1)} Q ${CX - INNER / 2 + 6} ${surf.toFixed(1)} ${CX} ${surf.toFixed(1)} Q ${CX + INNER / 2 - 6} ${surf.toFixed(1)} ${CX + INNER / 2} ${(surf - 4).toFixed(1)}`);

      // Пузырьки воздуха срываются с тела, пока оно уходит под воду
      items.forEach((it) => {
        if (it.sinking && it.pos.y > surf + 6 && Math.random() < dt * 14) bubbles.spawn(CX + (Math.random() - 0.5) * it.w * 0.8, it.pos.y - it.h * Math.random(), 1.5 + Math.random() * 2);
      });
      bubbles.update(dt, surf + 3, 0.15);

      // Показание мензурки по нижнему краю мениска; прежний уровень V₁ — пунктиром, когда тело в воде
      const shown = Math.round(lvl);
      levelTag.text.textContent = params.dipped && lvl - params.V0 > 0.5 ? `V₂ = ${shown} ${tr('мл')}` : `V₁ = ${shown} ${tr('мл')}`;
      levelTag.g.setAttribute('transform', `translate(0 ${surf.toFixed(1)})`);
      const showStart = params.dipped && lvl - params.V0 > 6;
      const y1 = Y0 - params.V0 * ML;
      startLine.setAttribute('d', `M${CX - INNER / 2} ${y1} H${CX + INNER / 2}`);
      startLine.setAttribute('opacity', showStart ? 1 : 0);

      // Весы показывают массу тела, которое лежит на чаше и уже не движется
      const onPan = items.findIndex((it, i) => !it.drag && Math.abs(it.pos.x - SX) < 2 && Math.abs(it.pos.y - PAN_Y) < 1 && (i !== params.body || it.route.length || params.weighed));
      scaleValue.textContent = onPan >= 0 ? fmt(mass({ ...params, body: onPan }), 1) : '0,0';
      pan.setAttribute('transform', `translate(0 ${onPan >= 0 ? 1.5 : 0})`);

      // Нить: у тела в мензурке она тянется над краем — тело опускают и держат за неё
      items.forEach((it) => {
        const top = it.pos.y - it.h;
        const inCyl = Math.abs(it.pos.x - CX) < 30 && it.pos.y > RIM - 30;
        const end = inCyl ? Math.min(top - 14, RIM - 44) : top - 14;
        it.threadPath.setAttribute('d', `M${it.pos.x.toFixed(1)} ${top.toFixed(1)} V${end.toFixed(1)}`);
        it.loop.setAttribute('cy', (end - 4).toFixed(1));
        it.loop.setAttribute('cx', it.pos.x.toFixed(1));
        it.g.setAttribute('transform', `translate(${it.pos.x.toFixed(1)} ${it.pos.y.toFixed(1)})`);
        // Тень на столе — только у стоящего тела, а не у висящего на нити или в воде
        const resting = !inCyl && (Math.abs(it.pos.y - TRAY_TOP) < 1 || Math.abs(it.pos.y - PAN_Y) < 1);
        it.shadow.setAttribute('opacity', resting ? 1 : 0);
        it.g.style.cursor = it.route.length ? 'default' : 'grab';
      });
    },
  });

  // ---------- Где должно быть тело ----------

  function wanted(i) {
    if (i !== params.body) return 'tray';
    if (params.dipped) return 'cyl';
    return params.weighed ? 'scale' : 'tray';
  }

  function point(spot, i) {
    if (spot === 'scale') return { x: SX, y: PAN_Y };
    if (spot === 'cyl') return { x: CX, y: Y0 };
    return { x: SLOT(i), y: TRAY_TOP };
  }

  // Маршрут: тело поднимают, переносят и ставят; в мензурку — опускают на нити сверху
  function plan(i, spot, viaScale) {
    const it = items[i];
    const route = [];
    let from = { ...it.pos };
    const inCyl = Math.abs(from.x - CX) < 30 && from.y > RIM - 20;
    if (inCyl) {
      route.push({ x: CX, y: Math.min(from.y, waterY() + 2), v: SINK }, { ...ABOVE });
      from = { ...ABOVE };
    }
    const hop = (to, extra = {}) => {
      // Над мензуркой тело и так выше всего на столе; между подставкой и весами его поднимают
      // выше соседних тел, чтобы оно не проходило сквозь них
      const low = Math.min(from.y, to.y);
      const lift = low <= ABOVE.y + 1 ? low : low - 75;
      if (Math.abs(from.x - to.x) > 2) route.push({ x: from.x, y: lift }, { x: to.x, y: lift });
      route.push({ ...to, ...extra });
      from = { ...to };
    };
    if (viaScale && spot === 'cyl') hop(point('scale', i), { hold: HOLD });
    if (spot === 'cyl') {
      hop(ABOVE);
      // Над водой — быстро, в воде — медленно
      route.push({ x: CX, y: waterY() - 2 }, { ...point('cyl', i), v: SINK, sink: true });
    } else {
      hop(point(spot, i));
    }
    it.route = route;
    it.spot = spot;
  }

  // Поверхность воды без погружённых тел — до неё тело опускают быстро
  const waterY = () => Y0 - params.V0 * ML;

  function move(it, dt) {
    it.sinking = false;
    let left = dt;
    while (left > 0 && it.route.length) {
      const wp = it.route[0];
      if (wp.wait > 0) {
        wp.wait -= left;
        left = 0;
        if (wp.wait <= 0) it.route.shift();
        break;
      }
      const dx = wp.x - it.pos.x;
      const dy = wp.y - it.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = (wp.v ?? SPEED) * left;
      it.sinking = Boolean(wp.sink);
      if (dist <= step) {
        it.pos.x = wp.x;
        it.pos.y = wp.y;
        left -= dist / (wp.v ?? SPEED);
        if (wp.hold) {
          wp.wait = wp.hold;
          wp.hold = 0;
        } else {
          it.route.shift();
        }
      } else {
        it.pos.x += (dx / dist) * step;
        it.pos.y += (dy / dist) * step;
        left = 0;
      }
    }
  }

  // ---------- Действия ученика ----------

  // Щелчок по текущему телу продвигает опыт на шаг: подставка → весы → мензурка (и обратно на весы);
  // по другому телу на подставке — заменяет тело, и его измеряют так же, как прежнее
  function click(i) {
    if (i !== params.body) {
      set('body', i);
      return;
    }
    if (params.dipped) set('dipped', 0);
    else if (params.weighed) set('dipped', 1);
    else set('weighed', 1);
  }

  // Порядок установки параметров важен: промежуточное состояние не должно случайно совпасть
  // с целью шага работы (например, «стальной цилиндр в мензурке») раньше, чем тело туда опущено
  function drop(i, at) {
    const toScale = Math.abs(at.x - SX) < 90 && at.y > PAN_Y - 150 && at.y < BENCH + 10;
    const toCyl = Math.abs(at.x - CX) < 70 && at.y > RIM - 170 && at.y < Y0 + 10;
    if (i === params.body) {
      if (toScale) {
        set('dipped', 0);
        set('weighed', 1);
      } else if (toCyl) {
        set('dipped', 1);
      }
      return;
    }
    if (toScale) {
      set('dipped', 0);
      set('body', i);
      set('weighed', 1);
    } else if (toCyl) {
      set('weighed', 0);
      set('body', i);
      set('dipped', 1);
    }
  }

  // ---------- Оборудование ----------

  // Подставка для тел с подписями веществ на торце
  function buildTray(svg, d) {
    const x = SLOT(0) - 40;
    const w = 290;
    svg.append(
      floorShadow(x + w / 2, BENCH + 2, w * 0.56, d, 7),
      s('rect', { x, y: TRAY_TOP - 4, width: w, height: 8, rx: 3, fill: d.lin([[0, '#e9d3ad'], [1, '#c9a978']], 'v') }),
      s('rect', { x, y: TRAY_TOP + 2, width: w, height: BENCH - TRAY_TOP - 2, rx: 3, fill: d.lin([[0, '#b98f5c'], [1, '#8a6a43']], 'v'), stroke: '#6b4f33', 'stroke-width': 1.2 }),
    );
    BODIES.forEach((_, i) => {
      svg.append(text(SLOT(i), TRAY_TOP + 15, tr(TAGS[i]), { size: 13, weight: 600, fill: '#fef3c7' }));
    });
  }

  // Электронные весы: корпус с табло, чаша на ножке
  function buildScale(svg, d) {
    scaleValue = text(SX + 18, BENCH - 22, '0,0', { size: 20, weight: 700, fill: '#22d3ee', anchor: 'end' });
    scaleValue.style.fontVariantNumeric = 'tabular-nums';
    pan = s('g', {}, [
      s('rect', { x: SX - 8, y: PAN_Y + 4, width: 16, height: 12, fill: d.lin(['#64748b', '#cbd5e1', '#475569']) }),
      s('rect', { x: SX - 60, y: PAN_Y, width: 120, height: 6, rx: 3, fill: d.lin([[0, '#f1f5f9'], [0.5, '#cbd5e1'], [1, '#64748b']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
    ]);
    svg.append(
      floorShadow(SX, BENCH + 2, 92, d, 7),
      s('rect', { x: SX - 78, y: BENCH - 46, width: 156, height: 46, rx: 9, fill: d.lin([[0, '#f8fafc'], [0.15, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.2 }),
      s('rect', { x: SX - 70, y: BENCH - 36, width: 104, height: 28, rx: 5, fill: '#0f172a' }),
      scaleValue,
      text(SX + 26, BENCH - 21, 'г', { size: 14, weight: 700, fill: '#22d3ee', anchor: 'start' }),
      s('circle', { cx: SX + 52, cy: BENCH - 22, r: 7, fill: d.rad(['#f87171', '#b91c1c']) }),
      s('circle', { cx: SX + 68, cy: BENCH - 22, r: 5, fill: d.rad(['#86efac', '#15803d']) }),
      pan,
    );
  }

  // Мензурка: задняя стенка, вода и деления. Тела вставляются между ней и передним стеклом
  function buildCylinderBack(svg, d) {
    const L = CX - INNER / 2;
    svg.append(
      floorShadow(CX, BENCH + 2, 62, d, 7),
      // шестигранная подставка мензурки
      s('path', { d: `M${CX - 54} ${BENCH} L${CX - 44} ${BENCH - 12} H${CX + 44} L${CX + 54} ${BENCH} Z`, fill: d.lin([[0, '#bfdbfe', 0.7], [1, '#93c5fd', 0.9]], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('rect', { x: L - 4, y: RIM, width: INNER + 8, height: BENCH - 12 - RIM, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
    );
  }

  function buildCylinderFront(svg, d) {
    const L = CX - INNER / 2;
    const clip = `dn${Math.random().toString(36).slice(2)}`;
    water = s('rect', { x: L, y: Y0, width: INNER, height: 0, fill: '#7dd3fc', 'fill-opacity': 0.42, 'clip-path': `url(#${clip})`, 'pointer-events': 'none' });
    meniscus = s('path', { fill: 'none', stroke: '#e0f2fe', 'stroke-width': 2.5, 'pointer-events': 'none' });
    const bubbleLayer = s('g', { 'clip-path': `url(#${clip})`, 'pointer-events': 'none' });
    svg.append(
      s('clipPath', { id: clip }, [s('rect', { x: L, y: RIM, width: INNER, height: Y0 - RIM })]),
      water,
      s('rect', { x: L, y: Y0 - 260, width: INNER, height: 260, fill: d.lin([[0, '#0f172a', 0.1], [0.3, '#ffffff', 0.1], [0.75, '#ffffff', 0], [1, '#0f172a', 0.12]]), 'clip-path': `url(#${clip})`, 'pointer-events': 'none' }),
      bubbleLayer,
      meniscus,
    );
    bubbles = bubblePool(bubbleLayer, 16);
    // Стекло поверх воды и тела: блики, толстое дно, носик
    svg.append(
      s('path', { d: `M${L - 4} ${RIM} V${Y0 + 6} H${L + INNER + 4} V${RIM}`, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'pointer-events': 'none' }),
      s('rect', { x: L - 4, y: Y0, width: INNER + 8, height: 6, fill: '#cbd5e1', 'fill-opacity': 0.6, 'pointer-events': 'none' }),
      s('rect', { x: L - 6, y: Y0 + 6, width: INNER + 12, height: BENCH - 12 - Y0 - 6, rx: 2, fill: '#e2e8f0', 'fill-opacity': 0.7, stroke: '#94a3b8' }),
      s('path', { d: `M${L - 10} ${RIM - 3} Q ${L - 3} ${RIM - 3} ${L - 3} ${RIM + 6}`, stroke: '#94a3b8', 'stroke-width': 3.5, 'stroke-linecap': 'round', fill: 'none' }),
      s('path', { d: `M${L - 4} ${RIM} H${L + INNER + 4}`, stroke: '#cbd5e1', 'stroke-width': 4, 'stroke-linecap': 'round', 'pointer-events': 'none' }),
      s('rect', { x: L + 4, y: RIM + 18, width: 5, height: Y0 - RIM - 40, rx: 2.5, fill: '#ffffff', 'fill-opacity': 0.6, 'pointer-events': 'none' }),
    );
    // Шкала на 200 мл, цена деления 5 мл; цифры через 20 мл
    const ticks = s('g', { 'pointer-events': 'none' });
    const R = L + INNER;
    for (let v = 5; v <= 200; v += 5) {
      const y = Y0 - v * ML;
      const len = v % 20 === 0 ? 16 : v % 10 === 0 ? 11 : 7;
      ticks.append(s('line', { x1: R - len, x2: R, y1: y, y2: y, stroke: '#334155', 'stroke-opacity': 0.75, 'stroke-width': v % 20 === 0 ? 1.6 : 1 }));
      if (v % 20 === 0) ticks.append(text(R + 7, y, String(v), { size: 13, weight: 600, fill: '#334155', anchor: 'start' }));
    }
    ticks.append(text(R + 7, Y0 - 200 * ML - 20, tr('мл'), { size: 13, weight: 700, fill: '#334155', anchor: 'start' }));
    svg.append(ticks);

    // Отметка уровня слева от мензурки: стрелка к мениску и показание
    levelTag = { text: text(CX - INNER / 2 - 22, 0, '', { size: 14, weight: 700, fill: '#0369a1', anchor: 'end' }) };
    levelTag.g = s('g', { 'pointer-events': 'none' }, [
      s('path', { d: `M${CX - INNER / 2 - 18} 0 H${CX - INNER / 2 - 6} M${CX - INNER / 2 - 11} -4 L${CX - INNER / 2 - 6} 0 L${CX - INNER / 2 - 11} 4`, stroke: '#0369a1', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
      levelTag.text,
    ]);
    startLine = s('path', { stroke: '#64748b', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none' });
    svg.append(startLine, levelTag.g);
  }

  // Тело: цилиндр в своих размерах (масштаб мензурки), с нитяной петлёй сверху
  function buildBody(d, b, i) {
    const w = b.d * PX_CM;
    const h = (b.V / (Math.PI * (b.d / 2) ** 2)) * PX_CM;
    const ry = w * 0.16;
    const shadow = floorShadow(0, 1, w * 0.75, d, 4);
    const parts = [
      shadow,
      s('path', { d: `M${-w / 2} ${-h + ry} V${-ry} A ${w / 2} ${ry} 0 0 0 ${w / 2} ${-ry} V${-h + ry} Z`, fill: cylinderShade(d, b.color), stroke: shade(b.color, -0.45), 'stroke-width': 1 }),
      s('ellipse', { cx: 0, cy: -h + ry, rx: w / 2, ry, fill: d.lin([[0, shade(b.color, 0.35)], [1, shade(b.color, -0.05)]], 'v'), stroke: shade(b.color, -0.45), 'stroke-width': 1 }),
      // ушко для нити
      s('path', { d: `M-3 ${-h + ry} v-5 a3 3 0 0 1 6 0 v5`, fill: 'none', stroke: shade(b.color, -0.5), 'stroke-width': 1.8 }),
    ];
    if (i === 3) parts.push(text(0, -h / 2 + 2, 'X', { size: 18, weight: 800, fill: '#1e293b' }));
    const g = s('g', {}, parts);
    const thread = s('path', { stroke: '#57534e', 'stroke-width': 1.4, fill: 'none', 'pointer-events': 'none' });
    const loop = s('circle', { r: 4, fill: 'none', stroke: '#57534e', 'stroke-width': 1.4, 'pointer-events': 'none' });
    const threadG = s('g', {}, [thread, loop]);
    const it = { g, thread: threadG, threadPath: thread, loop, shadow, w, h, pos: { x: SLOT(i), y: TRAY_TOP }, route: [], spot: 'tray', drag: null, sinking: false };
    return it;
  }

  // Перенос тела мышью или пальцем; короткое касание без движения — щелчок
  function wire(it, i) {
    let start = null;
    it.g.addEventListener('pointerdown', (e) => {
      start = it.route.length ? null : scene.point(e);
    });
    draggable(scene, it.g, {
      onDrag(x, y) {
        if (!start) return;
        if (!it.drag && Math.hypot(x - start.x, y - start.y) < 6) return;
        if (!it.drag) it.drag = { dx: it.pos.x - x, dy: it.pos.y - y };
        it.pos.x = Math.max(30, Math.min(930, x + it.drag.dx));
        it.pos.y = Math.max(it.h + 20, Math.min(BENCH, y + it.drag.dy));
      },
      onEnd() {
        if (!start) return;
        start = null;
        if (!it.drag) {
          click(i);
          return;
        }
        it.drag = null;
        // После броска тело само вернётся на своё место или пойдёт туда, куда его положили
        it.spot = 'air';
        drop(i, it.pos);
      },
    });
  }

  // draggable() нужна готовая сцена, поэтому тела оживляем после createScene
  items.forEach(wire);
  scene.svg.style.userSelect = 'none';
  return scene;
}
