// Сцена «Каталаза в картофеле»: водяная баня (стакан с водой на нагревательной плитке),
// в неё опущена пробирка с пероксидом водорода и кусочком картофеля, закреплённая в штативе.
// Над жидкостью в пробирке поднимается пена — тем выше, чем активнее фермент.
// Температура видна на табло плитки и на термометре; ручку плитки можно поворачивать мышью.
// Опыт начинается с действия ученика: кусочек картофеля пинцетом переносят с часового стекла
// к горлышку пробирки — он падает на дно, и только тогда фермент начинает работать.

import { beaker, bubblePool, createScene, cylinderShade, draggable, floorShadow, hotplate, readout, room, s, text } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const PLATE = { x: 470, y: BENCH - 44, w: 300 };
const BATH = { x: 470, bottom: PLATE.y - 8, w: 250, h: 190 };
const WATER = 0.62;
const TUBE = { x: 425, top: 72, bottom: 392, w: 44 };
const LIQUID_TOP = 322; // уровень пероксида в пробирке
const FOAM_MAX = LIQUID_TOP - TUBE.top + 2; // при оптимуме пена доходит до края и выползает шапкой
const THERMO = { x: 506, y: 394 }; // центр шарика термометра
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 };
const DISH = { x: 668, y: BENCH - 6 }; // часовое стекло с пинцетом и картофелем
const TWEEZERS_REST = { x: DISH.x - 30, y: DISH.y - 6, angle: 78 }; // пинцет лежит, кончики на стекле
const DROP_TIME = 0.9; // с — падение кусочка на дно пробирки
const CAP = 7; // «шапка» пены из нескольких крупных пузырей
const POPS = 6;
// Пузыри пены над краем пробирки: [смещение по x, радиус]
const OVERFLOW = [[-14, 8], [-5, 10], [5, 9.5], [14, 8], [0, 7]];
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

// Контур пробирки: прямые стенки и полукруглое дно
function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function enzymeScene(container, params, set, { activity }) {
  let plate, bath, column, foamRect, foamCap, potato, tubeBubbles, foamDots, steam, ice, foamMeter, rawFill, cookedFill;
  let tweezers, heldPotato;
  let landed = params.added === 1; // кусочек лежит на дне пробирки
  let dropT = -1; // время падения; −1 — не падает
  let tweezState = landed ? 'empty' : 'rest'; // rest | drag | empty
  const tweezPos = { ...TWEEZERS_REST };
  const act = () => (landed ? activity(params.T) : 0);
  let foam = act();
  let acc = 0;
  let knob, pointer;
  const capBubbles = [];
  const pops = [];
  let overflow = [];

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });

      // Штатив: чугунное основание, стальной стержень, муфта и лапка с пробкой-прокладкой
      const rodX = 196;
      svg.append(
        floorShadow(214, BENCH + 2, 100, d),
        s('rect', { x: 128, y: BENCH - 14, width: 176, height: 14, rx: 4, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
        s('rect', { x: 132, y: BENCH - 14, width: 168, height: 2, fill: '#9ca3af', 'fill-opacity': 0.5 }),
        s('rect', { x: rodX - 5, y: 44, width: 10, height: BENCH - 58, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
        s('circle', { cx: rodX, cy: 44, r: 5, fill: '#d1d5db' }),
        // лапка к пробирке
        s('rect', { x: rodX + 8, y: 126, width: TUBE.x - rodX - 36, height: 8, rx: 3, fill: d.lin(['#d1d5db', '#6b7280'], 'v') }),
        s('rect', { x: rodX - 12, y: 116, width: 24, height: 28, rx: 4, fill: d.lin([[0, '#6b7280'], [0.4, '#d1d5db'], [1, '#4b5563']]) }),
        s('circle', { cx: rodX - 18, cy: 130, r: 6, fill: d.rad(['#e5e7eb', '#4b5563']) }),
        s('rect', { x: rodX - 30, y: 127, width: 12, height: 6, rx: 2, fill: '#6b7280' }),
      );

      // Нагревательная плитка и водяная баня
      plate = hotplate(d, PLATE);
      // Своя ручка регулятора поверх штатной: графитовая, указатель поворачивается вместе с температурой
      pointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#e5e7eb' });
      knob = s('g', {}, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 16, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#9ca3af', '#1f2937']), stroke: '#111827' }),
        pointer,
      ]);
      svg.append(plate.g, knob);
      bath = beaker(d, BATH);
      bath.setLevel(WATER);
      bath.setColor('#d6e9f2');
      // Кубики льда плавают у поверхности, пока вода холодная
      ice = s('g', {}, [
        [372, -6, 30, 22, -12], [520, -4, 26, 20, 9], [404, 2, 22, 17, 20],
      ].map(([x, dy, w, h, a]) => s('rect', {
        x, y: BATH.bottom - BATH.h * WATER + dy - h / 2, width: w, height: h, rx: 5,
        fill: d.lin([[0, '#ffffff', 0.9], [1, '#cfe3ee', 0.75]], 'v'), stroke: '#b6cfdd', 'stroke-width': 1,
        transform: `rotate(${a} ${x + w / 2} ${BATH.bottom - BATH.h * WATER + dy})`,
      })));
      bath.content.append(ice);
      svg.append(bath.g);

      // Пар над горячей водой — заранее созданные клубы, в кадре меняется только положение
      steam = Array.from({ length: 7 }, (_, i) => {
        const e = s('ellipse', { rx: 16, ry: 9, fill: '#e2e8f0', opacity: 0 });
        svg.append(e);
        return { e, x: BATH.x - 95 + i * 30, phase: i / 7 };
      });

      // Термометр прислонён к стенке стакана: стеклянная трубка, спиртовой столбик, шкала 0–100 °C
      const ticks = [];
      for (let t = 0; t <= 100; t += 5) {
        const y = -40 - t * 2.1;
        ticks.push(s('line', { x1: 5, x2: t % 10 ? 9 : 12, y1: y, y2: y, stroke: '#475569', 'stroke-width': 1 }));
        if (t % 20 === 0) ticks.push(text(20, y, String(t), { size: 8, weight: 600, fill: '#475569', anchor: 'start' }));
      }
      column = s('rect', { x: -1.8, width: 3.6, rx: 1.8, fill: '#b91c1c' });
      svg.append(s('g', { transform: `translate(${THERMO.x} ${THERMO.y}) rotate(-3)` }, [
        s('rect', { x: -8, y: -278, width: 36, height: 272, rx: 8, fill: d.lin([[0, '#ffffff', 0.55], [0.5, '#f8fafc', 0.25], [1, '#cbd5e1', 0.5]]), stroke: '#94a3b8', 'stroke-width': 1.2 }),
        ...ticks,
        column,
        s('circle', { cx: 0, cy: 0, r: 7, fill: d.rad(['#f87171', '#991b1b']) }),
        s('rect', { x: -5, y: -272, width: 3, height: 250, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.7 }),
      ]));

      // Пробирка: содержимое обрезается по внутреннему контуру стекла
      const clip = `tube${Math.random().toString(36).slice(2)}`;
      const inner = tubePath(TUBE.x, TUBE.top, TUBE.bottom - 2.5, TUBE.w - 5);
      svg.querySelector('defs').append(s('clipPath', { id: clip }, [s('path', { d: inner })]));
      const content = s('g', { 'clip-path': `url(#${clip})` });
      rawFill = d.lin([[0, '#e8dcae'], [0.4, '#f5edcf'], [1, '#cdbb82']], 'v');
      cookedFill = d.lin([[0, '#cdb877'], [0.4, '#dcc98f'], [1, '#a8935a']], 'v');
      potato = s('path', { d: `M${TUBE.x - 15} ${TUBE.bottom - 10} L${TUBE.x - 13} ${TUBE.bottom - 34} L${TUBE.x + 4} ${TUBE.bottom - 40} L${TUBE.x + 15} ${TUBE.bottom - 30} L${TUBE.x + 13} ${TUBE.bottom - 8} Z`, fill: rawFill, stroke: '#a8935a', 'stroke-width': 1, 'stroke-linejoin': 'round', opacity: landed ? 1 : 0 });
      content.append(
        s('rect', { x: TUBE.x - 30, y: LIQUID_TOP, width: 60, height: TUBE.bottom - LIQUID_TOP, fill: '#e3eef5', 'fill-opacity': 0.85 }),
        s('rect', { x: TUBE.x - 30, y: LIQUID_TOP, width: 60, height: TUBE.bottom - LIQUID_TOP, fill: d.lin([[0, '#0f172a', 0.15], [0.35, '#ffffff', 0.2], [1, '#0f172a', 0.2]]) }),
        potato,
      );
      tubeBubbles = bubblePool(content, 30, { color: '#ffffff' });
      // Пена: плотная белая масса с крупными пузырьками внутри и выпуклой шапкой сверху
      foamRect = s('rect', { x: TUBE.x - 30, width: 60, fill: d.lin([[0, '#bcc6d1'], [0.25, '#eef1f4'], [0.55, '#f8f9fb'], [1, '#aeb9c6']]) });
      foamCap = s('ellipse', { cx: TUBE.x, rx: TUBE.w / 2 - 2, ry: 7, fill: '#f4f6f8', stroke: '#b3bdc9', 'stroke-width': 1 });
      // Пузырьки внутри пены: мелкие и крупные вперемешку, у верха пена крупнопузыристая
      const hash = (n) => { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); }; // псевдослучайно, но стабильно
      foamDots = Array.from({ length: 150 }, (_, i) => {
        const v = hash(i * 78.233 + 1.7);
        const c = s('circle', { cx: TUBE.x - 17 + hash(i * 12.9898 + 4.1) * 34, r: 1.2 + ((i * 7) % 5) * 0.55 + v * 1.6, fill: '#ffffff', stroke: '#7d8a9a', 'stroke-width': 0.8, opacity: 0 });
        return { c, v };
      });
      // Шапка пены — гроздь крупных пузырей, слегка «дышит»
      const capFill = d.rad([[0, '#ffffff'], [0.7, '#f1f4f7'], [1, '#c9d2dc']], 0.35, 0.3);
      for (let i = 0; i < CAP; i++) {
        const c = s('circle', { r: 0, fill: capFill, stroke: '#aab5c2', 'stroke-width': 0.9, opacity: 0 });
        capBubbles.push({ c, dx: -16 + (i * 32) / (CAP - 1), r: 6.5 + ((i * 5) % 4) * 1.2, ph: i * 1.7 });
      }
      // Лопающиеся пузырьки на поверхности пены — пул, без создания элементов в кадре
      for (let i = 0; i < POPS; i++) {
        const c = s('circle', { r: 2, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.2, opacity: 0 });
        pops.push({ c, t: 1, x: 0 });
      }
      content.append(foamRect, ...foamDots.map((f) => f.c), foamCap, ...capBubbles.map((b) => b.c), ...pops.map((p) => p.c));
      // Пена, «вылезающая» из горлышка, рисуется вне обрезки по стеклу — поверх края пробирки
      const spill = OVERFLOW.map(([dx, r]) => ({ c: s('circle', { cx: TUBE.x + dx, r: 0, fill: capFill, stroke: '#aab5c2', 'stroke-width': 0.9, opacity: 0 }), dx, r }));
      overflow = spill;
      svg.append(
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.25 }),
        content,
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.2 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 4, y: TUBE.top - 4, width: TUBE.w + 8, height: 6, rx: 3, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1.2 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 + 6, y: TUBE.top + 12, width: 4, height: TUBE.bottom - TUBE.top - 40, rx: 2, fill: '#ffffff', 'fill-opacity': 0.75 }),
        ...overflow.map((o) => o.c),
      );
      // Погружённая часть пробирки видна сквозь воду — слегка тонирована
      const surf = BATH.bottom - BATH.h * WATER;
      svg.append(
        s('rect', { x: TUBE.x - TUBE.w / 2 - 2, y: surf, width: TUBE.w + 4, height: TUBE.bottom - surf + 2, rx: 6, fill: '#bcd8e6', 'fill-opacity': 0.22 }),
        s('ellipse', { cx: TUBE.x, cy: surf, rx: TUBE.w / 2 + 6, ry: 3, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 1.5 }),
      );

      // Губки лапки зажимают пробирку поверх стекла
      svg.append(
        s('rect', { x: TUBE.x - TUBE.w / 2 - 12, y: 118, width: 10, height: 24, rx: 3, fill: d.lin(['#6b7280', '#d1d5db', '#4b5563']) }),
        s('rect', { x: TUBE.x + TUBE.w / 2 + 2, y: 118, width: 10, height: 24, rx: 3, fill: d.lin(['#6b7280', '#d1d5db', '#4b5563']) }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 4, y: 121, width: TUBE.w + 8, height: 18, rx: 3, fill: '#8b6f4e', 'fill-opacity': 0.55 }),
      );

      // Часовое стекло и пинцет с кусочком сырого картофеля
      svg.append(
        floorShadow(DISH.x, BENCH + 1, 44, d),
        s('path', { d: `M${DISH.x - 42} ${DISH.y - 4} Q${DISH.x} ${DISH.y + 10} ${DISH.x + 42} ${DISH.y - 4}`, fill: '#e2e8f0', 'fill-opacity': 0.6, stroke: '#94a3b8', 'stroke-width': 1.4 }),
      );
      heldPotato = s('path', { d: 'M-10 2 L-9 17 L8 19 L11 5 L4 -1 Z', fill: rawFill, stroke: '#a8935a', 'stroke-width': 1, 'stroke-linejoin': 'round' });
      const steel = d.lin([[0, '#6b7280'], [0.45, '#e5e7eb'], [1, '#4b5563']]);
      tweezers = s('g', {}, [
        s('rect', { x: -16, y: -120, width: 32, height: 138, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        heldPotato,
        s('path', { d: 'M-2.5 2 L-8 -104 Q0 -118 8 -104 L2.5 2', fill: 'none', stroke: steel, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('path', { d: 'M-6.2 -70 L-7 -86 M6.2 -70 L7 -86', stroke: '#9ca3af', 'stroke-width': 1.4 }),
      ]);
      svg.append(tweezers);

      // Измеритель высоты пены стоит на столе справа
      foamMeter = readout(d, { x: 760, y: BENCH - 76, w: 150, caption: tr('Высота пены, см') });
      svg.append(foamMeter.g);
    },

    frame(dt, now) {
      const T = params.T;
      updateDrop(dt);
      const a = act();
      foam += (a - foam) * Math.min(1, dt * 1.5);

      plate.setTemp(T);
      pointer.setAttribute('transform', `rotate(${-135 + (T / 80) * 270} ${KNOB.x} ${KNOB.y})`);
      plate.setHeat(Math.max(0, (T - 25) / 55));
      column.setAttribute('y', -40 - T * 2.1);
      column.setAttribute('height', 36 + T * 2.1);
      ice.setAttribute('opacity', Math.max(0, Math.min(1, (10 - T) / 6)));
      potato.setAttribute('fill', T > 60 ? cookedFill : rawFill);

      // Пар — только над горячей водой
      const steamOn = Math.max(0, Math.min(1, (T - 50) / 20));
      for (const p of steam) {
        const k = (now * 0.35 + p.phase) % 1;
        p.e.setAttribute('cx', p.x + Math.sin(now + p.phase * 9) * 6);
        p.e.setAttribute('cy', BATH.bottom - BATH.h - 6 - k * 70);
        p.e.setAttribute('opacity', steamOn * 0.55 * (1 - k));
      }

      const h = foam * FOAM_MAX;
      const topY = LIQUID_TOP - h;
      foamRect.setAttribute('y', topY);
      foamRect.setAttribute('height', h + 2);
      foamRect.setAttribute('opacity', h > 1 ? 1 : 0);
      foamCap.setAttribute('cy', topY);
      foamCap.setAttribute('opacity', h > 1 ? 1 : 0);
      for (const f of foamDots) {
        f.c.setAttribute('cy', LIQUID_TOP - 3 - f.v * (h - 6));
        f.c.setAttribute('opacity', h > 8 ? 1 : 0);
      }
      // Пышная шапка: крупные пузыри растут вместе с пеной и покачиваются
      const capK = Math.min(1, h / 40);
      for (const b of capBubbles) {
        b.c.setAttribute('cx', TUBE.x + b.dx);
        b.c.setAttribute('cy', topY - 2 + Math.sin(now * 2.2 + b.ph) * 1.3 * capK);
        b.c.setAttribute('r', b.r * capK);
        b.c.setAttribute('opacity', capK > 0.1 ? 1 : 0);
      }
      // Пена поднялась до горлышка — над краем вырастает пышная шапка
      const ov = Math.max(0, Math.min(1, (TUBE.top + 14 - topY) / 16));
      overflow.forEach((o, i) => {
        o.c.setAttribute('cy', TUBE.top - 3 - ov * (i === 4 ? 12 : 5) + Math.sin(now * 2 + i) * ov);
        o.c.setAttribute('r', o.r * ov);
        o.c.setAttribute('opacity', ov > 0.05 ? 1 : 0);
      });
      for (const p of pops) {
        if (p.t >= 1 && capK > 0.5 && Math.random() < a * dt * 2) {
          p.t = 0;
          p.x = TUBE.x + (Math.random() - 0.5) * 30;
        }
        if (p.t < 1) p.t = Math.min(1, p.t + dt * 2.5);
        p.c.setAttribute('cx', p.x);
        p.c.setAttribute('cy', topY - 6);
        p.c.setAttribute('r', 1.5 + p.t * 4);
        p.c.setAttribute('opacity', p.t < 1 ? 0.9 * (1 - p.t) : 0);
      }

      // Пузырьки кислорода отрываются от картофеля и поднимаются к пене
      acc += a * dt * 40;
      while (acc >= 1) {
        acc -= 1;
        tubeBubbles.spawn(TUBE.x + (Math.random() - 0.5) * 26, TUBE.bottom - 38, 1.5 + Math.random() * 2);
      }
      tubeBubbles.update(dt, LIQUID_TOP + 2, 0.3);
      foamMeter.set(fmt(foam * 6));
    },
  });

  // Падение кусочка картофеля в пробирку: запускается отпусканием пинцета над горлышком или кнопкой шага
  function startDrop() {
    if (landed || dropT >= 0) return;
    dropT = 0;
    tweezState = 'empty';
    Object.assign(tweezPos, TWEEZERS_REST);
  }

  function updateDrop(dt) {
    if (params.added === 1 && !landed && dropT < 0) startDrop();
    if (dropT >= 0) {
      dropT += dt;
      const k = Math.min(1, dropT / DROP_TIME);
      // Сначала свободное падение, в жидкости — плавное торможение
      const fall = k < 0.45 ? (k / 0.45) ** 2 * 0.6 : 0.6 + 0.4 * (1 - (1 - (k - 0.45) / 0.55) ** 2);
      const lift = (TUBE.bottom - 40 - (TUBE.top + 8)) * (1 - fall);
      potato.setAttribute('opacity', 1);
      potato.setAttribute('transform', `translate(0 ${-lift}) rotate(${(1 - k) * 40} ${TUBE.x} ${TUBE.bottom - 24})`);
      if (k >= 1) {
        dropT = -1;
        landed = true;
        potato.removeAttribute('transform');
        // Всплеск: пузырьки воздуха с поверхности кусочка
        for (let i = 0; i < 8; i++) tubeBubbles.spawn(TUBE.x + (Math.random() - 0.5) * 24, TUBE.bottom - 30 - Math.random() * 10, 1.5 + Math.random() * 2.5);
        if (params.added !== 1) set('added', 1);
      }
    }
    heldPotato.setAttribute('opacity', tweezState === 'empty' ? 0 : 1);
    const angle = tweezState === 'drag' ? 0 : tweezPos.angle;
    tweezers.setAttribute('transform', `translate(${tweezPos.x} ${tweezPos.y}) rotate(${angle})`);
  }

  draggable(scene, tweezers, {
    onDrag: (x, y) => {
      if (tweezState === 'empty') return;
      tweezState = 'drag';
      tweezPos.x = x;
      tweezPos.y = y;
    },
    onEnd: () => {
      if (tweezState !== 'drag') return;
      // Кончики пинцета над горлышком пробирки — разжимаем, кусочек падает внутрь
      if (Math.abs(tweezPos.x - TUBE.x) < 34 && tweezPos.y < TUBE.top + 60 && tweezPos.y > TUBE.top - 90) startDrop();
      else {
        tweezState = 'rest';
        Object.assign(tweezPos, TWEEZERS_REST);
      }
    },
  });

  // Ручка плитки: ведём мышью влево-вправо — меняется заданная температура
  draggable(scene, knob, {
    onDrag: (x) => set('T', Math.round(Math.max(0, Math.min(80, ((x - (KNOB.x - 100)) / 200) * 80)))),
  });
  return scene;
}
