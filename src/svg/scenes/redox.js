// Сцена «Перманганат и среда»: химический стол. Слева — склянка с раствором Na₂SO₃ и пипеткой,
// в центре — штатив с тремя пробирками фиолетового раствора KMnO₄ перед белым экраном (на белом
// фоне оттенки видны лучше): 1 — с серной кислотой, 2 — с водой, 3 — со щёлочью. Над штативом —
// одна табличка с полуреакцией марганца для последней пробирки; числа показывает панель показаний.
// Ученик сам переносит пипетку к горлышку пробирки (или нажимает на пробирку): Na₂SO₃ капает,
// пока не исчезнет фиолетовая окраска, — столько капель, сколько посчитала модель (dropsNeeded).
// Окраска меняется с каждой каплей: в кислой среде раствор обесцвечивается, в нейтральной мутнеет
// и выпадает бурый осадок MnO₂, который потом оседает на дно, в щелочной — синеет и зеленеет.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, mixHex, room, s, text, touchTarget } from '../kit.js';

const BENCH = 440;
const TX = [430, 530, 630]; // пробирки в штативе
const TUBE = { top: 196, bottom: 430, w: 40 };
const PLATE = { x1: 372, x2: 688, top: 258, h: 30 }; // верхняя планка штатива с подписями пробирок
const PX_PER_ML = 56; // высота столбика жидкости на 1 мл
const MEDIUM_ML = 0.5; // мл кислоты, воды или щёлочи, добавленных в каждую пробирку заранее
const DROP_ML = 0.05;
const BOTTLE = { x: 220, bottom: BENCH };
const PIPETTE_REST = { x: BOTTLE.x, y: BENCH - 4 }; // кончик пипетки в склянке, колпачок — на горлышке
const MOUTH_Y = TUBE.top + 12; // кончик пипетки внутри горлышка пробирки
const PLAQUE = { x: 826, y: 150, w: 220, h: 48 }; // табличка с полуреакцией справа от штатива: над ним пролетает пипетка
const DROPS = 7;

// Окраски: разбавленный KMnO₄ — фиолетово-малиновый; Mn²⁺ почти бесцветен (едва розоватый);
// взвесь MnO₂ — бурая; манганат MnO₄²⁻ — зелёный, по пути от фиолетового раствор проходит синий оттенок
const VIOLET = '#9b2d9a';
const CLEAR = '#f6eef3';
const MUDDY = '#8a5a2b';
const SETTLED = '#eadfcd';
const BLUE = '#4f46b8';
const GREEN = '#22a25a';

// Контур пробирки: прямые стенки и полукруглое дно
function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function redoxScene(container, params, set, { MEDIA, dropsNeeded }) {
  const tubes = MEDIA.map(() => ({ state: 'idle', shown: 0, settle: 0, ripple: 1 }));
  const queue = [];
  let focus = null; // пробирка, для которой табличка показывает полуреакцию
  // Пипетка: home — в склянке, drag — в руке, fly — к пробирке, drip — капает, back — возвращается
  let pip = 'home';
  let target = null;
  let released = 0;
  let dripT = 0;
  let held = false; // пипетку держат указателем — её нельзя переносить между слоями
  let lastV = params.V;
  const pos = { ...PIPETTE_REST };
  const grab = { dx: 0, dy: 0 };
  const drops = [];
  const view = []; // элементы каждой пробирки
  let pipette, pipetteFill, pipetteHome, topLayer, resetBtn;
  let plaque;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'lab' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ── Белый экран за штативом ──
      svg.append(
        floorShadow((PLATE.x1 + PLATE.x2) / 2, BENCH + 2, 170, d, 9),
        s('rect', { x: PLATE.x1 + 6, y: 120, width: PLATE.x2 - PLATE.x1 - 12, height: BENCH - 118, rx: 6, fill: d.lin([[0, '#ffffff'], [1, '#eef2f6']], 'v'), stroke: '#cbd5e1', 'stroke-width': 1.5 }),
        s('rect', { x: PLATE.x1 + 6, y: 120, width: PLATE.x2 - PLATE.x1 - 12, height: 10, rx: 5, fill: '#0f172a', 'fill-opacity': 0.04 }),
      );

      // ── Штатив: основание и две стойки ──
      const post = d.lin(['#94a3b8', '#e2e8f0', '#64748b']);
      svg.append(
        s('rect', { x: PLATE.x1 + 12, y: PLATE.top + 10, width: 10, height: BENCH - PLATE.top - 18, fill: post }),
        s('rect', { x: PLATE.x2 - 22, y: PLATE.top + 10, width: 10, height: BENCH - PLATE.top - 18, fill: post }),
        s('rect', { x: PLATE.x1, y: BENCH - 14, width: PLATE.x2 - PLATE.x1, height: 14, rx: 4, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
      );

      // ── Пробирки ──
      MEDIA.forEach((m, i) => {
        const x = TX[i];
        const clip = `rt${uid}${i}`;
        defs.append(s('clipPath', { id: clip }, [s('path', { d: tubePath(x, TUBE.top, TUBE.bottom - 2.5, TUBE.w - 5) })]));
        const liquid = s('rect', { x: x - 22, width: 44, fill: VIOLET });
        const sediment = s('path', { fill: d.lin([[0, '#7a4a1c'], [1, '#4a2a0e']], 'v'), opacity: 0 });
        const grains = s('g', { opacity: 0 });
        for (let k = 0; k < 14; k++) {
          grains.append(s('circle', { cx: x - 14 + ((k * 7.3) % 28), cy: TUBE.bottom - 8 - ((k * 5.1) % 9), r: 1.1 + (k % 3) * 0.5, fill: '#3b2008', 'fill-opacity': 0.7 }));
        }
        const surface = s('rect', { x: x - 22, width: 44, height: 2.5, fill: '#ffffff', 'fill-opacity': 0.55 });
        const ripple = s('ellipse', { cx: x, rx: 4, ry: 1.6, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.4, opacity: 0 });
        const content = s('g', { 'clip-path': `url(#${clip})` }, [
          liquid,
          // Объём жидкости: светлее по центру, темнее у стенок
          s('rect', { x: x - 22, y: TUBE.top, width: 44, height: TUBE.bottom - TUBE.top, fill: d.lin([[0, '#0f172a', 0.22], [0.35, '#ffffff', 0.18], [0.65, '#ffffff', 0.04], [1, '#0f172a', 0.26]]), 'pointer-events': 'none' }),
          sediment, grains, surface, ripple,
        ]);
        const g = s('g', {}, [
          s('rect', { x: x - TUBE.w / 2 - 8, y: TUBE.top - 20, width: TUBE.w + 16, height: TUBE.bottom - TUBE.top + 24, fill: '#000', 'fill-opacity': 0 }), // зона нажатия
          s('path', { d: tubePath(x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.35 }),
          content,
          s('path', { d: tubePath(x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
          s('rect', { x: x - TUBE.w / 2 - 3, y: TUBE.top - 3, width: TUBE.w + 6, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
          s('rect', { x: x - TUBE.w / 2 + 6, y: TUBE.top + 10, width: 4, height: TUBE.bottom - TUBE.top - 36, rx: 2, fill: '#ffffff', 'fill-opacity': 0.7 }),
        ]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          if (params[m.id] === 1) return;
          e.stopPropagation();
          set(m.id, 1);
        });
        touchTarget(g);
        svg.append(g);
        view.push({ liquid, sediment, grains, surface, ripple });
      });

      // ── Верхняя планка штатива поверх пробирок: номер, среда и степень окисления марганца ──
      svg.append(
        s('rect', { x: PLATE.x1, y: PLATE.top, width: PLATE.x2 - PLATE.x1, height: PLATE.h, rx: 5, fill: d.lin([[0, '#f8fafc'], [1, '#d5dde6']], 'v'), stroke: '#64748b', 'stroke-width': 1.2 }),
        s('rect', { x: PLATE.x1 + 2, y: PLATE.top + 1.5, width: PLATE.x2 - PLATE.x1 - 4, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.9 }),
      );
      MEDIA.forEach((m, i) => {
        const label = ['H₂SO₄', 'H₂O', 'KOH'][i];
        svg.append(text(TX[i], PLATE.top + 20, `${i + 1} · ${label}`, { size: 14, weight: 700, fill: '#334155' }));
      });
      // Среда — над пробирками, на экране
      MEDIA.forEach((m, i) => {
        view[i].word = text(TX[i], 150, tr(m.word), { size: 14, weight: 600, fill: '#475569' });
        svg.append(view[i].word);
      });

      // ── Склянка с Na₂SO₃ и пипеткой: пипетка за передней стенкой склянки ──
      pipetteFill = s('rect', { x: -1.8, y: -34, width: 3.6, height: 30, fill: '#dbeafe', 'fill-opacity': 0.95 });
      pipette = s('g', {}, [
        s('rect', { x: -18, y: -132, width: 36, height: 138, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M-1.2 0 L-3.4 -16 V-92 H3.4 V-16 L1.2 0 Z', fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.2 }),
        pipetteFill,
        s('rect', { x: -1.5, y: -86, width: 1.3, height: 68, rx: 0.6, fill: '#ffffff', 'fill-opacity': 0.8 }),
        s('rect', { x: -12, y: -99, width: 24, height: 9, rx: 2, fill: '#334155' }),
        s('path', { d: 'M-8 -99 V-114 Q-10 -126 0 -130 Q10 -126 8 -114 V-99 Z', fill: d.lin([[0, '#9f1239'], [0.45, '#f43f5e'], [1, '#881337']]), stroke: '#881337', 'stroke-width': 1 }),
      ]);
      pipetteHome = s('g', {}, [pipette]);
      const bx = BOTTLE.x;
      svg.append(
        floorShadow(bx, BENCH + 3, 44, d),
        s('path', { d: bottlePath(bx, BENCH, 34, 96), fill: d.lin([[0, '#dbe4ef', 0.55], [0.5, '#f1f5f9', 0.25], [1, '#cbd5e1', 0.6]]) }),
        s('rect', { x: bx - 33, y: BENCH - 60, width: 66, height: 56, fill: '#e0f2fe', 'fill-opacity': 0.55 }),
        pipetteHome,
        s('path', { d: bottlePath(bx, BENCH, 34, 96), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.8 }),
        s('rect', { x: bx - 30, y: BENCH - 50, width: 60, height: 28, rx: 3, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
        text(bx, BENCH - 35.5, 'Na₂SO₃', { size: 15, weight: 700, fill: '#0f766e' }),
      );

      // ── Капли Na₂SO₃ ──
      for (let i = 0; i < DROPS; i++) {
        const c = s('ellipse', { rx: 2.6, ry: 3.4, fill: '#eef6fb', stroke: '#94a3b8', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
        drops.push({ c, x: 0, y: 0, v: 0, tube: 0, live: false });
      }

      // ── Табличка с полуреакцией ──
      const { x, y, w, h } = PLAQUE;
      plaque = text(x, y + 31, '', { size: 20, weight: 700, fill: '#6b21a8' });
      svg.append(
        s('rect', { x: x - w / 2, y, width: w, height: h, rx: 10, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5, filter: d.url('soft') }),
        plaque,
      );

      // Кнопка «Новые пробирки» — вверху слева: низ сцены на странице может закрывать панель регуляторов
      resetBtn = s('g', { opacity: 0 }, [
        s('rect', { x: 24, y: 26, width: 214, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M51.4 39.6 A9 9 0 1 0 52.8 50.5 M51.4 32.6 V39.6 H44.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(138, 46, tr('Новые пробирки'), { size: 15, weight: 600, fill: '#1e293b' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (resetBtn.getAttribute('opacity') === '0') return;
        e.stopPropagation();
        for (const m of MEDIA) set(m.id, 0);
      });
      svg.append(resetBtn);

      topLayer = s('g', {}, drops.map((p) => p.c));
      svg.append(topLayer);
    },

    frame(dt) {
      sync();
      updatePipette(dt);
      updateDrops(dt);
      MEDIA.forEach((m, i) => drawTube(i, dt));
      // Полуреакция появляется, когда реакция в пробирке закончилась, — как вывод из наблюдения
      plaque.textContent = focus !== null && tubes[focus].state === 'done' ? MEDIA[focus].half : 'Mn⁺⁷ + ? ē → ?';
      resetBtn.setAttribute('opacity', MEDIA.some((m) => params[m.id] === 1) ? 1 : 0);
    },
  });

  function bottlePath(x, bb, r, h) {
    return `M${x - r} ${bb - 4} V${bb - h + 20} Q${x - r} ${bb - h + 12} ${x - 9} ${bb - h + 8} V${bb - h} H${x + 9} V${bb - h + 8} Q${x + r} ${bb - h + 12} ${x + r} ${bb - h + 20} V${bb - 4} Q${x + r} ${bb} ${x + r - 4} ${bb} H${x - r + 4} Q${x - r} ${bb} ${x - r} ${bb - 4} Z`;
  }

  // Состояние пробирок следует за параметрами: действие пришло со сцены, из урока или кнопкой сброса
  function sync() {
    // Другой объём KMnO₄ — это новый опыт: пипетка заново приливает Na₂SO₃ во все пробирки,
    // где реакция уже шла, и ученик видит новый расход капель, а не просто сменившуюся цифру
    if (params.V !== lastV) {
      lastV = params.V;
      MEDIA.forEach((m, i) => {
        const t = tubes[i];
        if (t.state === 'idle' || t.state === 'queued') return;
        Object.assign(t, { state: 'queued', shown: 0, settle: 0 });
        queue.push(i);
        if (target === i && (pip === 'fly' || pip === 'drip')) pip = 'back';
      });
    }
    MEDIA.forEach((m, i) => {
      const t = tubes[i];
      if (params[m.id] === 1 && t.state === 'idle') {
        t.state = 'queued';
        queue.push(i);
      } else if (params[m.id] !== 1 && t.state !== 'idle') {
        Object.assign(t, { state: 'idle', shown: 0, settle: 0 });
        const q = queue.indexOf(i);
        if (q >= 0) queue.splice(q, 1);
        if (target === i && (pip === 'fly' || pip === 'drip')) pip = 'back';
        if (focus === i) focus = null;
      }
    });
  }

  function mouth(i) {
    return { x: TX[i], y: MOUTH_Y };
  }

  function updatePipette(dt) {
    if ((pip === 'home' || pip === 'back') && queue.length) {
      target = queue.shift();
      tubes[target].state = 'fly';
      focus = target;
      pip = 'fly';
    }
    if (pip === 'fly') {
      const to = mouth(target);
      const k = Math.min(1, dt * 7);
      pos.x += (to.x - pos.x) * k;
      pos.y += (to.y - pos.y) * k;
      if (Math.hypot(pos.x - to.x, pos.y - to.y) < 2) {
        Object.assign(pos, to);
        pip = 'drip';
        tubes[target].state = 'drip';
        released = 0;
        dripT = 0;
      }
    } else if (pip === 'drip') {
      const need = dropsNeeded(params, target);
      // Капли идут чаще, когда их нужно много: опыт длится 2–3 с при любом расходе
      const every = Math.max(0.09, Math.min(0.3, 2.2 / need));
      dripT += dt;
      while (dripT >= every && released < need) {
        dripT -= every;
        const free = drops.find((p) => !p.live);
        if (!free) break;
        Object.assign(free, { x: pos.x, y: pos.y + 4, v: 0, tube: target, live: true });
        released++;
      }
      pipetteFill.setAttribute('height', (30 * (1 - 0.7 * Math.min(1, released / Math.max(1, need)))).toFixed(1));
      if (tubes[target].shown >= need && !drops.some((p) => p.live)) {
        tubes[target].state = 'done';
        pip = 'back';
      }
    } else if (pip === 'back') {
      const k = Math.min(1, dt * 5);
      pos.x += (PIPETTE_REST.x - pos.x) * k;
      pos.y += (PIPETTE_REST.y - pos.y) * k;
      if (Math.hypot(pos.x - PIPETTE_REST.x, pos.y - PIPETTE_REST.y) < 1) {
        Object.assign(pos, PIPETTE_REST);
        pipetteFill.setAttribute('height', 30);
        pip = 'home';
      }
    }
    pipette.style.pointerEvents = pip === 'home' || pip === 'drag' ? '' : 'none';
    if (!held) place(pipette, pip === 'home' ? pipetteHome : topLayer);
    pipette.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
  }

  function surfaceY(i, shown = tubes[i].shown) {
    return TUBE.bottom - 3 - (params.V + MEDIUM_ML + shown * DROP_ML) * PX_PER_ML;
  }

  function updateDrops(dt) {
    for (const p of drops) {
      if (!p.live) {
        p.c.setAttribute('opacity', 0);
        continue;
      }
      p.v += 900 * dt;
      p.y += p.v * dt;
      const t = tubes[p.tube];
      if (p.y >= surfaceY(p.tube) - 2) {
        p.live = false;
        // Капля упала в пробирку, которую уже сбросили, — не считаем её
        if (t.state === 'drip') {
          t.shown = Math.min(dropsNeeded(params, p.tube), t.shown + 1);
          t.ripple = 0;
        }
      }
      p.c.setAttribute('cx', p.x.toFixed(1));
      p.c.setAttribute('cy', p.y.toFixed(1));
      p.c.setAttribute('opacity', p.live ? 1 : 0);
    }
  }

  // Цвет раствора по доле восстановленного перманганата f (0…1) и осаждению взвеси MnO₂
  function liquidColor(i, f, settle) {
    if (i === 0) return mixHex(VIOLET, CLEAR, f);
    if (i === 1) return f < 1 ? mixHex(VIOLET, MUDDY, f) : mixHex(MUDDY, SETTLED, settle);
    return f < 0.5 ? mixHex(VIOLET, BLUE, f * 2) : mixHex(BLUE, GREEN, (f - 0.5) * 2);
  }

  function drawTube(i, dt) {
    const t = tubes[i];
    const v = view[i];
    const need = dropsNeeded(params, i);
    const f = t.state === 'idle' ? 0 : Math.min(1, t.shown / need);
    // Бурая взвесь MnO₂ оседает на дно за несколько секунд после конца реакции
    if (i === 1 && t.state === 'done') t.settle = Math.min(1, t.settle + dt / 3);
    const y = surfaceY(i);
    v.liquid.setAttribute('y', y.toFixed(1));
    v.liquid.setAttribute('height', (TUBE.bottom - y + 4).toFixed(1));
    v.liquid.setAttribute('fill', liquidColor(i, f, t.settle));
    // Бесцветный раствор Mn²⁺ почти прозрачен, остальные — насыщенные
    v.liquid.setAttribute('fill-opacity', (i === 0 ? 0.9 - 0.45 * f : 0.9).toFixed(3));
    v.surface.setAttribute('y', (y - 1).toFixed(1));
    // Осадок: слой на дне растёт по мере оседания
    const sh = i === 1 ? 16 * t.settle : 0;
    const x = TX[i];
    v.sediment.setAttribute('d', `M${x - 20} ${TUBE.bottom - 20 - sh * 0.5} Q${x} ${TUBE.bottom - 22 - sh} ${x + 20} ${TUBE.bottom - 20 - sh * 0.5} V${TUBE.bottom + 2} H${x - 20} Z`);
    v.sediment.setAttribute('opacity', sh > 0.5 ? 1 : 0);
    v.grains.setAttribute('opacity', i === 1 ? (t.state === 'done' ? 1 - t.settle * 0.6 : f) : 0);
    v.grains.setAttribute('transform', `translate(0 ${(-(TUBE.bottom - 12 - y) * (1 - t.settle) * 0.5).toFixed(1)})`);
    // Круги на поверхности от упавшей капли
    t.ripple = Math.min(1, t.ripple + dt * 2.5);
    v.ripple.setAttribute('cy', (y + 1).toFixed(1));
    v.ripple.setAttribute('rx', (4 + 14 * t.ripple).toFixed(1));
    v.ripple.setAttribute('opacity', (0.9 * (1 - t.ripple)).toFixed(2));
    // Груша пипетки над пробиркой закрывает подпись среды — подпись бледнеет, пока пипетка там
    v.word.setAttribute('opacity', target === i && (pip === 'fly' || pip === 'drip') ? 0.15 : 1);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  // Взятую пипетку поднимаем наверх до того, как draggable() захватит указатель
  pipette.addEventListener('pointerdown', () => {
    if (pip !== 'home') return;
    held = true;
    place(pipette, topLayer);
  });
  const release = () => { held = false; };
  pipette.addEventListener('pointerup', release);
  pipette.addEventListener('pointercancel', release);

  draggable(scene, pipette, {
    onDrag(x, y) {
      if (pip !== 'home' && pip !== 'drag') return;
      if (pip === 'home') {
        grab.dx = pos.x - x;
        grab.dy = pos.y - y;
        pip = 'drag';
      }
      pos.x = Math.max(20, Math.min(940, x + grab.dx));
      pos.y = Math.max(110, Math.min(BENCH - 4, y + grab.dy));
    },
    onEnd() {
      if (pip !== 'drag') return;
      // Кончик пипетки у горлышка пробирки, в которую ещё не добавляли Na₂SO₃, — начинаем приливать
      const i = TX.findIndex((x) => Math.abs(pos.x - x) < 40);
      if (i >= 0 && pos.y > TUBE.top - 80 && pos.y < TUBE.top + 90 && params[MEDIA[i].id] !== 1) set(MEDIA[i].id, 1);
      pip = 'back';
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
