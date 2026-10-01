// Сцена «Поглощение ионизирующего излучения»: физический кабинет. На столе — скамья, на ней слева
// направо: держатель источника, держатель пластин-поглотителей и счётчик Гейгера с торцевым
// слюдяным окном; кабель от счётчика идёт к радиометру. Слева на столе — три свинцовых контейнера
// с источниками α, β и γ: щелчок по контейнеру переносит источник на скамью, щелчок по источнику
// на скамье возвращает его в контейнер. На полке — стопки бумаги, алюминиевых и свинцовых пластин:
// щелчок ставит пластины в держатель, щелчок по держателю убирает их. Щелчок по радиометру включает счётчик.
// Частицы летят от источника к окну счётчика; поглощённые гаснут внутри пластин со вспышкой —
// видно, что α застревают уже на первом листе, β — в алюминии, а γ лишь редеют в свинце.
// Фон показан редкими треками сверху, попадающими в трубку счётчика.
// Числа (кроме табло радиометра) — только в панели показаний под сценой, чтобы сцена не шумела.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 400;
const AXIS = 300; // высота оси пучка: центр источника, пластин и окна счётчика
const SRC = { x: 388, face: 398 }; // держатель источника и его излучающая грань
const HOLD = { x: 486, h: 92 }; // держатель пластин
const TUBE = { x1: 580, x2: 716, r: 17 }; // трубка счётчика: x1 — торцевое окно
const BOX = { x: 742, y: 290, w: 196, h: 110 }; // радиометр
const CONTAINERS = [70, 165, 260]; // центры свинцовых контейнеров на столе
const CONT = { w: 62, h: 50 };
const SHELF = { y: 204, groups: [82, 172, 262] }; // полка с поглотителями
const PLATE_W = [0, 2.2, 4, 8]; // ширина пластины на рисунке по материалам (не в масштабе — схема)
const MAX_PLATES = 10;
const POOL = 36;
const FLIGHT = 0.6; // с — перенос источника из контейнера на скамью
const DROP = 0.35; // с — пластины опускаются в держатель
const SPEED = [0, 260, 400, 560]; // px/с — скорость частиц на рисунке (условная)

export function nucleus11Scene(container, params, set, { SOURCES, MATERIALS, transmission, totalRate }) {
  const parts = [];
  const flashes = [];
  const lids = [];
  const shelfPlates = [];
  const holderPlates = [];
  const plateFill = []; // градиенты пластин по материалам — создаются в buildShelf
  let rateText, rateCaption, powerLed, clickLed, waves, lever;
  let srcBody, srcFace, srcLabel, srcCaption, flyDisc, holderG, plateG;

  let shownSrc = params.src;
  let flight = 1;
  let flyFrom = null;
  let flyTo = null;
  let shownPlates = '';
  let drop = 1;
  let emitAcc = 0;
  let bgAcc = 0;
  let clickGlow = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      buildShelf(svg, d);
      buildContainers(svg, d);
      buildBench(svg, d);
      buildCounter(svg, d);
      buildRadiometer(svg, d);
    },

    frame(dt) {
      const p = params;
      // Смена источника: новый летит из своего контейнера на скамью, убранный — обратно в контейнер
      if (p.src !== shownSrc) {
        if (p.src) {
          flyFrom = [CONTAINERS[p.src - 1], BENCH - CONT.h - 6];
          flyTo = [SRC.x, AXIS];
        } else {
          flyFrom = [SRC.x, AXIS];
          flyTo = [CONTAINERS[shownSrc - 1], BENCH - CONT.h - 6];
          flyDisc.firstChild.setAttribute('fill', SOURCES[shownSrc].color);
        }
        shownSrc = p.src;
        flight = 0;
      }
      flight = Math.min(1, flight + dt / FLIGHT);
      const landed = flight >= 1;
      const src = SOURCES[shownSrc];
      if (shownSrc) flyDisc.firstChild.setAttribute('fill', src.color);
      if (!landed) {
        const e = flight;
        const x = flyFrom[0] + (flyTo[0] - flyFrom[0]) * e;
        const y = flyFrom[1] + (flyTo[1] - flyFrom[1]) * e - Math.sin(Math.PI * e) * 70;
        flyDisc.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        flyDisc.setAttribute('opacity', 1);
      } else {
        flyDisc.setAttribute('opacity', 0);
      }
      const onBench = landed && shownSrc > 0;
      srcBody.setAttribute('opacity', onBench ? 1 : 0);
      srcFace.setAttribute('fill', src.color);
      srcLabel.textContent = onBench ? src.short : '';
      srcCaption.textContent = onBench ? tr(src.name) : tr('источник излучения');
      srcLabel.setAttribute('fill', shade(src.color, -0.25));
      // Открыт контейнер, чей источник сейчас на скамье (или летит туда)
      lids.forEach((lid, i) => lid.setAttribute('transform', i + 1 === p.src ? `rotate(-24 ${CONTAINERS[i] - CONT.w / 2 - 3} ${BENCH - CONT.h})` : ''));

      updatePlates(dt);

      // Радиометр
      const on = Boolean(p.counter);
      powerLed.setAttribute('fill', on ? '#22c55e' : '#334155');
      lever.setAttribute('transform', on ? `rotate(30 ${BOX.x + BOX.w - 36} ${BOX.y + 44})` : `rotate(-30 ${BOX.x + BOX.w - 36} ${BOX.y + 44})`);
      rateText.textContent = on ? String(totalRate(p)) : '';
      rateCaption.setAttribute('opacity', on ? 1 : 0.35);

      // Источник испускает частицы всегда, счётчик лишь регистрирует их. Настоящие тысячи импульсов
      // в минуту — десятки в секунду; на экране частоту уменьшаем, чтобы треки различались.
      if (onBench) {
        emitAcc += Math.min(14, src.rate / 150) * dt;
        while (emitAcc >= 1) {
          emitAcc -= 1;
          spawn(shownSrc, Math.random() < transmission(p));
        }
      }
      // Фон: космические лучи и излучение стен — редкие треки сверху в трубку
      bgAcc += 0.6 * dt;
      if (bgAcc >= 1) {
        bgAcc = 0;
        spawnBackground();
      }
      moveParticles(dt, on);

      clickGlow = Math.max(0, clickGlow - dt);
      clickLed.setAttribute('fill', clickGlow > 0 ? '#f87171' : '#7f1d1d');
      waves.setAttribute('opacity', clickGlow > 0 ? 1 : 0);
      for (const fl of flashes) {
        if (fl.life <= 0) continue;
        fl.life -= dt;
        const k = Math.max(0, fl.life / 0.35);
        fl.el.setAttribute('opacity', k.toFixed(2));
        fl.el.setAttribute('r', (2 + (1 - k) * 7).toFixed(1));
      }
    },
  });

  // ---------- Частицы ----------

  // Пластины в держателе: x-координаты передней и задней граней пачки
  function stackSpan() {
    const w = PLATE_W[params.mat];
    const total = params.mat ? params.n * (w + 1.4) - 1.4 : 0;
    return [HOLD.x - total / 2, HOLD.x + total / 2];
  }

  function spawn(kind, passes) {
    const pt = parts.find((x) => !x.alive);
    if (!pt) return;
    const y0 = AXIS + (Math.random() - 0.5) * 22;
    const y1 = AXIS + (Math.random() - 0.5) * 20;
    let stopX = TUBE.x1;
    const [a, b] = stackSpan();
    if (!passes && params.mat) {
      // α застревают на передней грани первого листа, β и γ — на случайной глубине внутри пачки
      stopX = kind === 1 ? a + 1 : a + Math.random() * (b - a);
    }
    Object.assign(pt, { alive: true, kind, x: SRC.face, x0: SRC.face, y0, y1, stopX, bg: false, phase: Math.random() * 6 });
    pt.el.setAttribute('stroke', SOURCES[kind].color);
    pt.el.setAttribute('stroke-width', kind === 1 ? 5 : kind === 2 ? 2.6 : 2);
    pt.el.setAttribute('opacity', 1);
  }

  function spawnBackground() {
    const pt = parts.find((x) => !x.alive);
    if (!pt) return;
    // Трек сверху под случайным углом в корпус трубки
    const tx = TUBE.x1 + 20 + Math.random() * (TUBE.x2 - TUBE.x1 - 40);
    Object.assign(pt, { alive: true, kind: 0, bg: true, tx, ty: AXIS, sx: tx + (Math.random() - 0.5) * 120, sy: 200, k: 0 });
    pt.el.setAttribute('stroke', '#64748b');
    pt.el.setAttribute('stroke-width', 1.6);
    pt.el.setAttribute('opacity', 0.8);
  }

  function hit(on) {
    if (!on) return;
    clickGlow = 0.1;
  }

  function moveParticles(dt, on) {
    for (const pt of parts) {
      if (!pt.alive) continue;
      if (pt.bg) {
        pt.k = Math.min(1, pt.k + dt * 3);
        const x = pt.sx + (pt.tx - pt.sx) * pt.k;
        const y = pt.sy + (pt.ty - pt.sy) * pt.k;
        const bx = pt.sx + (pt.tx - pt.sx) * Math.max(0, pt.k - 0.25);
        const by = pt.sy + (pt.ty - pt.sy) * Math.max(0, pt.k - 0.25);
        pt.el.setAttribute('d', `M${bx.toFixed(1)} ${by.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`);
        if (pt.k >= 1) {
          pt.alive = false;
          pt.el.setAttribute('opacity', 0);
          hit(on);
        }
        continue;
      }
      pt.x = Math.min(pt.stopX, pt.x + SPEED[pt.kind] * dt);
      const t = (pt.x - pt.x0) / (TUBE.x1 - pt.x0);
      const y = pt.y0 + (pt.y1 - pt.y0) * t;
      if (pt.kind === 3) {
        // γ-квант — электромагнитная волна: рисуем отрезок синусоиды
        let dPath = '';
        for (let i = 0; i <= 12; i++) {
          const xx = Math.max(pt.x0, pt.x - 30 + i * 2.5);
          dPath += `${i ? 'L' : 'M'}${xx.toFixed(1)} ${(y + Math.sin(xx * 0.5 + pt.phase) * 4).toFixed(1)} `;
        }
        pt.el.setAttribute('d', dPath);
      } else if (pt.kind === 2) {
        // β-электрон лёгкий и рассеивается: трек слегка извилист
        const yy = y + Math.sin(pt.x * 0.12 + pt.phase) * 2.5;
        pt.el.setAttribute('d', `M${Math.max(pt.x0, pt.x - 16).toFixed(1)} ${yy.toFixed(1)} L${pt.x.toFixed(1)} ${yy.toFixed(1)}`);
      } else {
        pt.el.setAttribute('d', `M${Math.max(pt.x0, pt.x - 10).toFixed(1)} ${y.toFixed(1)} L${pt.x.toFixed(1)} ${y.toFixed(1)}`);
      }
      if (pt.x >= pt.stopX) {
        pt.alive = false;
        pt.el.setAttribute('opacity', 0);
        if (pt.stopX >= TUBE.x1) hit(on);
        else flash(pt.stopX, y, SOURCES[pt.kind].color);
      }
    }
  }

  function flash(x, y, color) {
    const fl = flashes.find((f) => f.life <= 0);
    if (!fl) return;
    fl.life = 0.35;
    fl.el.setAttribute('cx', x.toFixed(1));
    fl.el.setAttribute('cy', y.toFixed(1));
    fl.el.setAttribute('stroke', color);
  }

  // ---------- Пластины ----------

  function updatePlates(dt) {
    const key = `${params.mat}|${params.n}`;
    if (key !== shownPlates) {
      // Новый материал опускается в держатель сверху; смена числа пластин — без анимации
      if (shownPlates.split('|')[0] !== String(params.mat) && params.mat) drop = 0;
      shownPlates = key;
      const w = PLATE_W[params.mat];
      const [a] = stackSpan();
      const m = MATERIALS[params.mat];
      holderPlates.forEach((pl, i) => {
        const vis = params.mat && i < params.n;
        pl.setAttribute('opacity', vis ? 1 : 0);
        if (!vis) return;
        pl.setAttribute('x', (a + i * (w + 1.4)).toFixed(1));
        pl.setAttribute('width', w);
        pl.setAttribute('fill', plateFill[params.mat]);
        pl.setAttribute('stroke', shade(m.color, -0.45));
      });
      // На полке остаётся столько пластин, сколько не поставлено в держатель
      shelfPlates.forEach((list, gi) => list.forEach((pl, i) => pl.setAttribute('opacity', gi + 1 === params.mat && i >= MAX_PLATES - params.n ? 0.12 : 1)));
      holderG.style.cursor = params.mat ? 'pointer' : 'default';
    }
    drop = Math.min(1, drop + dt / DROP);
    const e = 1 - (1 - drop) ** 3;
    plateG.setAttribute('transform', `translate(0 ${(-(1 - e) * 60).toFixed(1)})`);
  }

  // ---------- Построение ----------

  // Полка с поглотителями: стопки пластин стоят на ребре, под ними — подписи и толщина одной пластины
  function buildShelf(svg, d) {
    plateFill[1] = d.lin([[0, '#e7e5e4'], [0.5, '#ffffff'], [1, '#d6d3d1']]);
    plateFill[2] = d.lin([[0, '#94a3b8'], [0.45, '#f1f5f9'], [1, '#94a3b8']]);
    plateFill[3] = d.lin([[0, '#374151'], [0.45, '#9ca3af'], [1, '#374151']]);
    const x0 = 36;
    const x1 = 308;
    svg.append(
      text((x0 + x1) / 2, 46, tr('Поглотители'), { size: 15, weight: 700, fill: '#334155' }),
      // кронштейны и доска полки
      s('path', { d: `M${x0 + 24} ${SHELF.y + 10} v26 l22 -26 Z M${x1 - 24} ${SHELF.y + 10} v26 l-22 -26 Z`, fill: '#94a3b8', stroke: '#64748b', 'stroke-width': 1 }),
      s('rect', { x: x0, y: SHELF.y, width: x1 - x0, height: 11, rx: 2, fill: d.lin([[0, '#d9bf98'], [1, '#9c7b55']], 'v'), filter: d.url('soft') }),
    );
    SHELF.groups.forEach((gx, gi) => {
      const mat = gi + 1;
      const m = MATERIALS[mat];
      const w = PLATE_W[mat] + (mat === 1 ? 0.6 : 0);
      const gap = mat === 1 ? 1.2 : 1.6;
      const total = MAX_PLATES * (w + gap) - gap;
      const list = [];
      const g = s('g', {}, [
        // зона щелчка на всю стопку: между тонкими листами иначе был бы «промах»
        s('rect', { x: gx - 42, y: SHELF.y - 92, width: 84, height: 170, fill: 'transparent' }),
        // подставка-гребёнка, в которой стоят пластины
        s('rect', { x: gx - 36, y: SHELF.y - 8, width: 72, height: 8, rx: 2, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
      ]);
      for (let i = 0; i < MAX_PLATES; i++) {
        const pl = s('rect', { x: gx - total / 2 + i * (w + gap), y: SHELF.y - 8 - 76, width: w, height: 80, rx: 1, fill: plateFill[mat], stroke: shade(m.color, -0.45), 'stroke-width': 0.6 });
        list.push(pl);
        g.append(pl);
      }
      shelfPlates.push(list);
      g.append(
        text(gx, SHELF.y + 52, tr(m.name), { size: 14, weight: 700, fill: '#1e293b' }),
        text(gx, SHELF.y + 70, `${fmt(m.plate, mat === 1 ? 1 : 0)} ${tr('мм')}`, { size: 13, weight: 500, fill: '#475569' }),
      );
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('mat', mat);
      });
      touchTarget(g, 8);
      svg.append(g);
    });
  }

  function trefoil(cx, cy, r) {
    const blades = [];
    for (const a of [-90, 30, 150]) {
      const a1 = ((a - 30) * Math.PI) / 180;
      const a2 = ((a + 30) * Math.PI) / 180;
      const ri = r * 0.28;
      const ro = r * 0.86;
      blades.push(s('path', {
        d: `M${cx + Math.cos(a1) * ri} ${cy + Math.sin(a1) * ri} L${cx + Math.cos(a1) * ro} ${cy + Math.sin(a1) * ro} A ${ro} ${ro} 0 0 1 ${cx + Math.cos(a2) * ro} ${cy + Math.sin(a2) * ro} L${cx + Math.cos(a2) * ri} ${cy + Math.sin(a2) * ri} A ${ri} ${ri} 0 0 0 ${cx + Math.cos(a1) * ri} ${cy + Math.sin(a1) * ri} Z`,
        fill: '#111827',
      }));
    }
    return s('g', {}, [
      s('circle', { cx, cy, r, fill: '#facc15', stroke: '#111827', 'stroke-width': 1 }),
      ...blades,
      s('circle', { cx, cy, r: r * 0.18, fill: '#111827' }),
    ]);
  }

  // Свинцовые контейнеры с источниками: щелчок — источник переносят щипцами на скамью
  function buildContainers(svg, d) {
    const lead = (c) => d.lin([[0, shade(c, -0.25)], [0.3, shade(c, 0.3)], [0.6, c], [1, shade(c, -0.45)]]);
    CONTAINERS.forEach((cx, i) => {
      const src = SOURCES[i + 1];
      const top = BENCH - CONT.h;
      const lid = s('g', {}, [
        s('rect', { x: cx - CONT.w / 2 - 3, y: top - 12, width: CONT.w + 6, height: 14, rx: 4, fill: lead('#6b7280'), stroke: '#374151', 'stroke-width': 1 }),
        s('rect', { x: cx - 9, y: top - 20, width: 18, height: 9, rx: 3, fill: lead('#4b5563') }),
      ]);
      lids.push(lid);
      const g = s('g', {}, [
        floorShadow(cx, BENCH + 2, CONT.w * 0.62, d),
        s('rect', { x: cx - CONT.w / 2, y: top, width: CONT.w, height: CONT.h, rx: 5, fill: lead('#6b7280'), stroke: '#374151', 'stroke-width': 1 }),
        s('ellipse', { cx, cy: top + 2, rx: CONT.w / 2 - 6, ry: 5, fill: '#1f2937' }),
        s('rect', { x: cx - 25, y: top + 12, width: 50, height: 30, rx: 3, fill: '#fefce8', stroke: '#a16207', 'stroke-width': 0.8 }),
        trefoil(cx - 12, top + 27, 9),
        text(cx + 12, top + 28, src.short, { size: 20, weight: 800, fill: shade(src.color, -0.3) }),
        lid,
      ]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('src', i + 1);
      });
      touchTarget(g, 12);
      svg.append(g);
    });
  }

  // Скамья с держателем источника и держателем пластин
  function buildBench(svg, d) {
    const rail = d.lin([[0, '#e2e8f0'], [0.4, '#94a3b8'], [1, '#475569']], 'v');
    svg.append(
      floorShadow(530, BENCH + 2, 230, d, 7),
      s('rect', { x: 330, y: BENCH - 16, width: 400, height: 12, rx: 3, fill: rail, stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: 340, y: BENCH - 5, width: 22, height: 5, rx: 1, fill: '#334155' }),
      s('rect', { x: 698, y: BENCH - 5, width: 22, height: 5, rx: 1, fill: '#334155' }),
    );
    const carriage = (x) => s('rect', { x: x - 20, y: BENCH - 26, width: 40, height: 12, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') });
    const post = (x, top) => s('rect', { x: x - 3.5, y: top, width: 7, height: BENCH - 26 - top, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) });

    // Держатель источника: стойка с кольцом; источник — диск, излучающей гранью к счётчику
    svg.append(carriage(SRC.x), post(SRC.x, AXIS + 20));
    srcFace = s('rect', { x: SRC.face - 3, y: AXIS - 15, width: 4, height: 30, rx: 1.5, fill: '#ef4444' });
    srcLabel = text(SRC.x, AXIS - 42, '', { size: 22, weight: 800, fill: '#7f1d1d' });
    srcBody = s('g', { opacity: 0 }, [
      s('rect', { x: SRC.x - 10, y: AXIS - 20, width: 18, height: 40, rx: 4, fill: d.lin([[0, '#4b5563'], [0.4, '#9ca3af'], [1, '#374151']]), stroke: '#1f2937', 'stroke-width': 1 }),
      srcFace,
    ]);
    const srcG = s('g', {}, [
      s('rect', { x: SRC.x - 14, y: AXIS - 24, width: 26, height: 48, rx: 6, fill: 'none', stroke: '#64748b', 'stroke-width': 3 }),
      srcBody,
    ]);
    srcG.style.cursor = 'pointer';
    srcG.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (params.src) set('src', 0);
    });
    touchTarget(srcG, 12);
    // Подпись источника над скамьёй: какой источник стоит сейчас (торец стола закрыт панелью регуляторов)
    srcCaption = text(SRC.x + 32, 214, '', { size: 13, weight: 700, fill: '#334155' });
    svg.append(srcG, srcLabel, srcCaption);

    // Держатель пластин: рамка-паз на стойке; пластины опускаются в паз сверху
    svg.append(carriage(HOLD.x), post(HOLD.x, AXIS + HOLD.h / 2 + 8));
    plateG = s('g');
    for (let i = 0; i < MAX_PLATES; i++) {
      const pl = s('rect', { x: HOLD.x, y: AXIS - HOLD.h / 2, width: 0, height: HOLD.h, rx: 1, opacity: 0, 'stroke-width': 0.6 });
      holderPlates.push(pl);
      plateG.append(pl);
    }
    holderG = s('g', {}, [
      s('rect', { x: HOLD.x - 58, y: AXIS - HOLD.h / 2 - 16, width: 116, height: HOLD.h + 32, fill: 'transparent' }),
      plateG,
      // паз-основание с бортиками
      s('rect', { x: HOLD.x - 56, y: AXIS + HOLD.h / 2, width: 112, height: 8, rx: 2, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
      s('rect', { x: HOLD.x - 56, y: AXIS + HOLD.h / 2 - 10, width: 5, height: 12, rx: 1, fill: '#475569' }),
      s('rect', { x: HOLD.x + 51, y: AXIS + HOLD.h / 2 - 10, width: 5, height: 12, rx: 1, fill: '#475569' }),
    ]);
    holderG.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (params.mat) set('mat', 0);
    });
    touchTarget(holderG, 6);
    svg.append(holderG);

    // Пул треков частиц и вспышек поглощения — поверх пластин
    const layer = s('g', { fill: 'none', 'stroke-linecap': 'round', 'pointer-events': 'none' });
    for (let i = 0; i < POOL; i++) {
      const el = s('path', { opacity: 0 });
      parts.push({ el, alive: false });
      layer.append(el);
    }
    for (let i = 0; i < 12; i++) {
      const el = s('circle', { r: 3, fill: 'none', 'stroke-width': 2, opacity: 0 });
      flashes.push({ el, life: 0 });
      layer.append(el);
    }
    flyDisc = s('g', { opacity: 0, 'pointer-events': 'none' }, [s('circle', { r: 10, fill: '#ef4444', stroke: '#1f2937', 'stroke-width': 2 })]);
    svg.append(layer, flyDisc);

    svg.append(
      text(HOLD.x + 14, 236, tr('держатель пластин'), { size: 13, weight: 700, fill: '#334155' }),
    );
  }

  // Счётчик Гейгера с торцевым слюдяным окном на стойке, кабель к радиометру
  function buildCounter(svg, d) {
    const { x1, x2, r } = TUBE;
    const px = (x1 + x2) / 2 + 20;
    svg.append(
      s('rect', { x: px - 20, y: BENCH - 26, width: 40, height: 12, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: px - 3.5, y: AXIS + r, width: 7, height: BENCH - 26 - AXIS - r, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
      s('path', { d: `M${x2} ${AXIS} C ${x2 + 40} ${AXIS}, ${BOX.x + 30} ${AXIS - 30}, ${BOX.x + 40} ${BOX.y}`, fill: 'none', stroke: '#1e293b', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      s('rect', { x: x1, y: AXIS - r, width: x2 - x1, height: 2 * r, rx: 5, fill: d.lin([[0, '#475569'], [0.3, '#e2e8f0'], [0.6, '#cbd5e1'], [1, '#475569']], 'v'), stroke: '#334155', 'stroke-width': 1 }),
      // хомут крепления к стойке
      s('rect', { x: px - 9, y: AXIS - r - 3, width: 18, height: 2 * r + 6, rx: 3, fill: '#1e293b' }),
      // торцевое окно из тонкой слюды — через него влетают частицы
      s('rect', { x: x1 - 5, y: AXIS - r - 2, width: 7, height: 2 * r + 4, rx: 2, fill: '#334155' }),
      s('rect', { x: x1 - 6, y: AXIS - r + 5, width: 3, height: 2 * r - 10, rx: 1, fill: '#b45309', 'fill-opacity': 0.7 }),
      s('rect', { x: x2 - 4, y: AXIS - 8, width: 14, height: 16, rx: 3, fill: '#1e293b' }),
      text(px, AXIS - TUBE.r - 16, tr('счётчик Гейгера'), { size: 13, weight: 700, fill: '#334155' }),
    );
  }

  // Радиометр: табло скорости счёта, тумблер питания, индикатор щелчков и динамик
  function buildRadiometer(svg, d) {
    const { x, y, w, h } = BOX;
    lever = s('rect', { x: x + w - 39, y: y + 22, width: 6, height: 24, rx: 3, fill: d.lin(['#e2e8f0', '#94a3b8']) });
    powerLed = s('circle', { cx: x + w - 18, cy: y + 18, r: 4, fill: '#334155' });
    clickLed = s('circle', { cx: x + w - 18, cy: y + 72, r: 5, fill: '#7f1d1d' });
    rateText = text(x + 72, y + 40, '', { size: 24, weight: 700, fill: '#34d399' });
    rateText.style.fontVariantNumeric = 'tabular-nums';
    rateCaption = text(x + 72, y + 74, tr('имп/мин'), { size: 13, weight: 600, fill: '#e2e8f0' });
    const grille = s('g');
    for (let i = 0; i < 5; i++) grille.append(s('rect', { x: x + 136, y: y + 62 + i * 7, width: 30, height: 3, rx: 1.5, fill: '#0f172a' }));
    waves = s('g', { opacity: 0, fill: 'none', stroke: '#f87171', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
      s('path', { d: `M${x + 170} ${y + 66} q 5 10 0 20` }),
    ]);
    const g = s('g', {}, [
      floorShadow(x + w / 2, BENCH + 2, w * 0.55, d),
      s('rect', { x, y, width: w, height: h, rx: 10, fill: d.lin([[0, '#e5e7eb'], [0.15, '#cbd5e1'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.2 }),
      s('rect', { x: x + 2, y: y + 2, width: w - 4, height: 12, rx: 8, fill: '#ffffff', 'fill-opacity': 0.5 }),
      s('rect', { x: x + 12, y: y + 16, width: 120, height: 44, rx: 6, fill: d.lin([[0, '#05080d'], [1, '#111a27']], 'v'), stroke: '#475569', 'stroke-width': 1.5 }),
      rateText,
      s('rect', { x: x + 12, y: y + 64, width: 120, height: 20, rx: 4, fill: '#334155' }),
      rateCaption,
      text(x + 72, y + 98, tr('Радиометр'), { size: 13, weight: 700, fill: '#1e293b' }),
      grille,
      waves,
      s('rect', { x: x + w - 48, y: y + 30, width: 24, height: 28, rx: 5, fill: '#1e293b' }),
      lever,
      s('circle', { cx: x + w - 36, cy: y + 44, r: 5, fill: '#475569' }),
      powerLed,
      clickLed,
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('counter', params.counter ? 0 : 1);
    });
    touchTarget(g, 10);
    svg.append(g);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
