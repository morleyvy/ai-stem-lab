// Сцена «Смещение химического равновесия»: вытяжной шкаф (NO₂ ядовит), на столе три стакана —
// со льдом (0 °C), с водой комнатной температуры (25 °C) и с горячей водой (80 °C). В одном из них
// стоит запаянный шприц со смесью NO₂ и N₂O₄. Справа — модель: молекулы в шприце.
// Чисел на сцене нет: температура подписана на стаканах, остальное — в панели показаний под сценой.
// Ученик сам:
//   переносит шприц мышью в другой стакан или нажимает на стакан (bath = 0…2) — шприц поднимается,
//     переезжает и опускается, газ принимает температуру воды, окраска меняется;
//   тянет поршень за шляпку (V) — газ сжимается.
// Окраска газа пропорциональна концентрации NO₂. При сжатии она сначала резко темнеет (концентрация
// всех газов растёт сразу), а затем немного светлеет — равновесие смещается к N₂O₄. Чтобы это было
// видно, количество NO₂ в сцене догоняет равновесное с задержкой, а объём меняется почти мгновенно.

import { tr } from '../../i18n.js';
import { beaker, createScene, draggable, mixHex, room, s, text, touchTarget } from '../kit.js';

const BENCH = 450;
const BEAKERS = [
  { x: 110, water: '#dbeefa', label: 'Лёд с водой', tone: '#0284c7' },
  { x: 265, water: '#d6ebf7', label: 'Вода', tone: '#475569' },
  { x: 420, water: '#cfe6f6', label: 'Горячая вода', tone: '#dc2626' },
];
const BW = 124;
const BH = 140;
const LEVEL = 0.72; // доля высоты стакана, занятая водой
const SURFACE = BENCH - BH * LEVEL;
const OFFSET = -20; // шприц стоит левее центра стакана: справа на стекле — деления стакана
const REST_Y = BENCH - 14; // кончик шприца в стакане
const LIFT_Y = REST_Y - 150; // кончик над краем стакана при переносе
const K = 1.8; // px на 1 мл объёма газа
const HUB = 14; // высота носика с колпачком
const BARREL = 118;
const ROD = 128; // от низа уплотнителя поршня до шляпки
const R_IN = 18; // внутренняя полуширина цилиндра шприца

// Экран модели: камера с молекулами повторяет объём газа в шприце
const SCR = { x1: 590, x2: 930, top: 110, bottom: 436 };
const CH = { x1: 618, x2: 902, bottom: 386, k: 3.8 }; // высота камеры, px на 1 мл
const UNITS = 24; // столько «звеньев» NO₂ в модели (N₂O₄ = два звена)

// Цвет газа: N₂O₄ бесцветен, NO₂ — красно-бурый; насыщенность растёт с концентрацией NO₂
const gasColor = (mm) => mixHex('#fbf6e6', '#8a3510', 1 - Math.exp(-mm / 22));

const ease = (from, to, dt, tau) => from + (to - from) * (1 - Math.exp(-dt / tau));
const toward = (from, to, step) => (Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step);

export function equilibriumScene(container, params, set, { composition, BATHS, N0 }) {
  let syringe, body, plunger, gas, gasTip, seal, rod, thumb, chamberGas, chamberWalls, piston, pistonRod;
  const no2 = [];
  const n2o4 = [];

  // Шприц: положение кончика, температура газа, объём и количество NO₂ — всё, что показывает сцена,
  // догоняет параметры модели плавно
  const pos = { x: BEAKERS[params.bath].x + OFFSET, y: REST_Y };
  let tGas = BATHS[params.bath];
  let vGas = params.V;
  let nNO2 = composition(tGas, vGas).nNO2;
  let dragging = false;
  let grabDx = 0;
  let pumping = false;
  let pumpDy = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'hood' });

      // ── Три стакана с водой разной температуры ──
      BEAKERS.forEach((b, i) => {
        const g = beaker(d, { x: b.x, bottom: BENCH, w: BW, h: BH });
        g.setLevel(LEVEL);
        g.setColor(b.water);
        if (i === 0) {
          // Кубики льда у поверхности — по ним сразу видно, какой стакан холодный
          for (const [dx, dy, w, h, a] of [[-46, -6, 26, 20, -12], [16, -4, 28, 22, 10], [38, 2, 20, 16, 26]]) {
            g.content.append(s('rect', {
              x: b.x + dx, y: SURFACE + dy - h / 2, width: w, height: h, rx: 5,
              fill: d.lin([[0, '#ffffff', 0.95], [1, '#cfe3ee', 0.85]], 'v'), stroke: '#a9c6d8', 'stroke-width': 1,
              transform: `rotate(${a} ${b.x + dx + w / 2} ${SURFACE + dy})`,
            }));
          }
        }
        g.g.style.cursor = 'pointer';
        g.g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('bath', i);
        });
        touchTarget(g.g, 10);
        svg.append(g.g);
        // Подписи на стене над стаканом, правее шприца: низ сцены на странице закрывает панель регуляторов
        svg.append(
          text(b.x + 14, 256, tr(b.label), { size: 14, weight: 600, fill: '#334155', anchor: 'start' }),
          text(b.x + 14, 278, `${BATHS[i]} °C`, { size: 16, weight: 700, fill: b.tone, anchor: 'start' }),
        );
      });

      // ── Шприц: кончик в (0, 0), носик запаян резиновым колпачком ──
      gas = s('rect', { x: -R_IN, width: R_IN * 2, fill: '#c2410c' });
      gasTip = s('rect', { x: -3, y: -HUB + 2, width: 6, height: HUB - 6, fill: '#c2410c' });
      const ticks = [];
      for (let v = 5; v <= 60; v += 5) {
        const y = -HUB - v * K;
        ticks.push(s('line', { x1: R_IN - (v % 10 ? 6 : 11), x2: R_IN + 1, y1: y, y2: y, stroke: '#334155', 'stroke-width': v % 10 ? 1 : 1.6, 'stroke-opacity': 0.75 }));
        if (v % 20 === 0) ticks.push(text(-R_IN - 6, y, String(v), { size: 13, weight: 600, fill: '#1e293b', anchor: 'end' }));
      }
      body = s('g', {}, [
        s('rect', { x: -R_IN - 30, y: -BARREL - HUB - 8, width: R_IN * 2 + 50, height: BARREL + HUB + 10, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        // Носик и резиновый колпачок — шприц запаян
        s('path', { d: `M-5 ${-HUB} L-3 -2 H3 L5 ${-HUB} Z`, fill: '#f1f5f9', 'fill-opacity': 0.6, stroke: '#94a3b8', 'stroke-width': 1 }),
        gasTip,
        s('rect', { x: -7, y: -9, width: 14, height: 11, rx: 3, fill: d.lin([[0, '#7f1d1d'], [0.45, '#dc2626'], [1, '#7f1d1d']]) }),
        // Цилиндр: задняя стенка, газ, стекло с делениями
        s('rect', { x: -R_IN - 2, y: -HUB - BARREL, width: R_IN * 2 + 4, height: BARREL + 2, rx: 4, fill: '#f8fafc', 'fill-opacity': 0.35 }),
        gas,
      ]);
      seal = s('rect', { x: -R_IN, height: 9, width: R_IN * 2, rx: 2, fill: d.lin([[0, '#111827'], [0.4, '#4b5563'], [1, '#111827']]) });
      rod = s('rect', { x: -4, width: 8, fill: d.lin([[0, '#cbd5e1'], [0.5, '#ffffff'], [1, '#94a3b8']]), stroke: '#94a3b8', 'stroke-width': 0.8 });
      thumb = s('g', {}, [
        s('rect', { x: -40, y: -26, width: 80, height: 44, fill: '#000', 'fill-opacity': 0 }), // зона захвата шляпки
        s('rect', { x: -26, y: -5, width: 52, height: 9, rx: 4, fill: d.lin([[0, '#f8fafc'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
      ]);
      plunger = s('g', {}, [rod, seal, thumb]);
      const glass = s('g', { 'pointer-events': 'none' }, [
        s('rect', { x: -R_IN - 2, y: -HUB - BARREL, width: R_IN * 2 + 4, height: BARREL + 2, rx: 4, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: -R_IN + 4, y: -HUB - BARREL + 8, width: 4, height: BARREL - 20, rx: 2, fill: '#ffffff', 'fill-opacity': 0.7 }),
        ...ticks,
        // Упоры для пальцев у открытого конца цилиндра
        s('rect', { x: -R_IN - 18, y: -HUB - BARREL - 6, width: R_IN * 2 + 36, height: 7, rx: 3, fill: d.lin([[0, '#f1f5f9'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
      ]);
      syringe = s('g', {}, [body, plunger, glass]);
      svg.append(syringe);

      // Вода впереди погружённой части шприца: шприц виден сквозь неё чуть приглушённым
      for (const b of BEAKERS) {
        svg.append(s('rect', { x: b.x - BW / 2 + 3, y: SURFACE, width: BW - 6, height: BENCH - SURFACE - 3, rx: 14, fill: b.water, 'fill-opacity': 0.28, 'pointer-events': 'none' }));
      }

      // ── Модель: камера, объём которой равен объёму газа в шприце. Простая карточка, как схема в учебнике ──
      svg.append(
        s('rect', { x: SCR.x1, y: SCR.top, width: SCR.x2 - SCR.x1, height: SCR.bottom - SCR.top, rx: 12, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 }),
        text((SCR.x1 + SCR.x2) / 2, SCR.top + 24, tr('Молекулы в шприце'), { size: 15, weight: 700, fill: '#334155' }),
      );
      chamberGas = s('rect', { x: CH.x1, width: CH.x2 - CH.x1, fill: '#c2410c' });
      pistonRod = s('rect', { x: (CH.x1 + CH.x2) / 2 - 4, width: 8, fill: '#94a3b8' });
      piston = s('rect', { x: CH.x1 + 2, width: CH.x2 - CH.x1 - 4, height: 7, rx: 2, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') });
      chamberWalls = s('path', { fill: 'none', stroke: '#64748b', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
      const molecules = s('g', { 'pointer-events': 'none' });
      svg.append(chamberGas, molecules, pistonRod, piston, chamberWalls);

      // Модели молекул: N — синий, O — красный (как в учебнике); у NO₂ — бурый ореол, N₂O₄ бесцветен
      for (let i = 0; i < UNITS; i++) {
        const g = s('g', { opacity: 0 }, [
          s('circle', { r: 11, fill: '#b45309', 'fill-opacity': 0.22 }),
          s('circle', { cx: -6, cy: 3.5, r: 4, fill: '#ef4444', stroke: '#991b1b', 'stroke-width': 0.6 }),
          s('circle', { cx: 6, cy: 3.5, r: 4, fill: '#ef4444', stroke: '#991b1b', 'stroke-width': 0.6 }),
          s('circle', { r: 4.6, fill: '#3b82f6', stroke: '#1e3a8a', 'stroke-width': 0.6 }),
        ]);
        molecules.append(g);
        no2.push(spawn(g, i));
      }
      for (let i = 0; i < UNITS / 2; i++) {
        const g = s('g', { opacity: 0 }, [
          ...[[-8, -5], [-8, 5], [8, -5], [8, 5]].map(([cx, cy]) => s('circle', { cx, cy, r: 4, fill: '#ef4444', stroke: '#991b1b', 'stroke-width': 0.6 })),
          s('circle', { cx: -3.4, r: 4.3, fill: '#3b82f6', stroke: '#1e3a8a', 'stroke-width': 0.6 }),
          s('circle', { cx: 3.4, r: 4.3, fill: '#3b82f6', stroke: '#1e3a8a', 'stroke-width': 0.6 }),
        ]);
        molecules.append(g);
        n2o4.push(spawn(g, i + 100));
      }

      // Легенда
      const ly = SCR.bottom - 26;
      svg.append(
        s('circle', { cx: 632, cy: ly, r: 9, fill: '#b45309', 'fill-opacity': 0.22 }),
        s('circle', { cx: 632, cy: ly, r: 4.2, fill: '#3b82f6' }),
        text(646, ly, tr('NO₂ — бурый'), { size: 13, weight: 600, fill: '#7c2d12', anchor: 'start' }),
        s('circle', { cx: 762, cy: ly, r: 4.2, fill: '#3b82f6' }),
        s('circle', { cx: 770, cy: ly, r: 4.2, fill: '#3b82f6' }),
        text(782, ly, tr('N₂O₄ — бесцветный'), { size: 13, weight: 600, fill: '#334155', anchor: 'start' }),
      );
    },

    frame(dt) {
      // ── Перенос шприца: поднять над краем, переехать, опустить ──
      const tx = BEAKERS[params.bath].x + OFFSET;
      if (dragging) {
        pos.y = toward(pos.y, LIFT_Y, dt * 700);
      } else {
        const away = Math.abs(pos.x - tx) > 0.5;
        pos.y = toward(pos.y, away ? LIFT_Y : REST_Y, dt * 600);
        if (away && pos.y <= LIFT_Y + 0.5) pos.x = toward(pos.x, tx, dt * 700);
      }
      // Газ принимает температуру воды, когда шприц погружён; в воздухе вытяжного шкафа — медленно к 25 °C
      const near = BEAKERS.reduce((best, b, i) => (Math.abs(b.x + OFFSET - pos.x) < Math.abs(BEAKERS[best].x + OFFSET - pos.x) ? i : best), 0);
      const immersed = pos.y > REST_Y - 60 && Math.abs(BEAKERS[near].x + OFFSET - pos.x) < 30;
      tGas = immersed ? ease(tGas, BATHS[near], dt, 0.2) : ease(tGas, 25, dt, 4);
      vGas = ease(vGas, params.V, dt, 0.1);
      // Равновесие устанавливается не мгновенно: количество NO₂ догоняет равновесное
      nNO2 = ease(nNO2, composition(tGas, vGas).nNO2, dt, 0.35);
      const mm = (nNO2 / (vGas / 1000)) * 1000; // ммоль/л

      // ── Шприц ──
      syringe.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
      const sealY = -HUB - vGas * K;
      gas.setAttribute('y', sealY.toFixed(1));
      gas.setAttribute('height', (vGas * K).toFixed(1));
      const color = gasColor(mm);
      gas.setAttribute('fill', color);
      gasTip.setAttribute('fill', color);
      seal.setAttribute('y', (sealY - 9).toFixed(1));
      rod.setAttribute('y', (sealY - ROD).toFixed(1));
      rod.setAttribute('height', ROD - 9);
      thumb.setAttribute('transform', `translate(0 ${(sealY - ROD).toFixed(1)})`);
      const idle = !dragging && Math.abs(pos.x - tx) < 0.5 && pos.y >= REST_Y - 0.5;
      thumb.style.cursor = idle ? 'ns-resize' : '';

      // ── Модель ──
      const h = vGas * CH.k;
      const top = CH.bottom - h;
      chamberGas.setAttribute('y', top.toFixed(1));
      chamberGas.setAttribute('height', h.toFixed(1));
      chamberGas.setAttribute('fill', color);
      chamberGas.setAttribute('fill-opacity', 0.45);
      piston.setAttribute('y', (top - 7).toFixed(1));
      const rodTop = SCR.top + 44;
      pistonRod.setAttribute('y', rodTop);
      pistonRod.setAttribute('height', Math.max(0, top - 7 - rodTop).toFixed(1));
      chamberWalls.setAttribute('d', `M${CH.x1} ${SCR.top + 44} V${CH.bottom} H${CH.x2} V${SCR.top + 44}`);
      // Число молекул NO₂ — чётное: оставшиеся звенья объединены в молекулы N₂O₄
      const k = Math.max(0, Math.min(UNITS, 2 * Math.round((UNITS * nNO2) / N0 / 2)));
      no2.forEach((m, i) => move(m, dt, i < k, top, h));
      n2o4.forEach((m, i) => move(m, dt, i < (UNITS - k) / 2, top, h));
    },
  });

  // Молекула в камере: координаты в долях камеры, поэтому при сжатии все молекулы сближаются
  // Начальные места — по «золотому» шагу: молекулы равномерно заполняют камеру, а не сбиваются в кучу
  function spawn(g, seed) {
    const r = (n) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const u = (seed * 0.618034 + 0.13) % 1;
    const v = (seed * 0.414214 + 0.37) % 1;
    return { g, u, v, du: (r(3) - 0.5) * 0.6, dv: (r(4) - 0.5) * 0.6, a: r(5) * 360, on: 0 };
  }

  function move(m, dt, visible, top, h) {
    m.u += m.du * dt;
    m.v += m.dv * dt;
    if (m.u < 0 || m.u > 1) { m.du = -m.du; m.u = Math.max(0, Math.min(1, m.u)); }
    if (m.v < 0 || m.v > 1) { m.dv = -m.dv; m.v = Math.max(0, Math.min(1, m.v)); }
    m.a += m.du * 120 * dt;
    m.on = ease(m.on, visible ? 1 : 0, dt, 0.15);
    const x = CH.x1 + 16 + m.u * (CH.x2 - CH.x1 - 32);
    const y = CH.bottom - 14 - m.v * Math.max(0, h - 30);
    m.g.setAttribute('transform', `translate(${x.toFixed(1)} ${Math.max(top + 14, y).toFixed(1)}) rotate(${m.a.toFixed(0)})`);
    m.g.setAttribute('opacity', m.on.toFixed(2));
  }

  // Шприц тащат вдоль стола и отпускают над нужным стаканом; щелчок без переноса ничего не меняет
  draggable(scene, body, {
    onDrag(x) {
      if (!dragging) {
        dragging = true;
        grabDx = pos.x - x;
      }
      pos.x = Math.max(40, Math.min(500, x + grabDx));
    },
    onEnd() {
      if (!dragging) return;
      dragging = false;
      const near = BEAKERS.reduce((best, b, i) => (Math.abs(b.x + OFFSET - pos.x) < Math.abs(BEAKERS[best].x + OFFSET - pos.x) ? i : best), 0);
      set('bath', near);
    },
  });

  // Поршень: тянем шляпку вверх или вниз — объём газа меняется (шаг регулятора — 5 мл)
  draggable(scene, thumb, {
    onDrag(_x, y) {
      if (dragging || pos.y < REST_Y - 0.5) return;
      const thumbY = pos.y - HUB - params.V * K - ROD;
      if (!pumping) {
        pumping = true;
        pumpDy = thumbY - y;
      }
      set('V', (pos.y - HUB - ROD - (y + pumpDy)) / K);
    },
    onEnd() {
      pumping = false;
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
