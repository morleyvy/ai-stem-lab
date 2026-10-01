// Сцена «Прорастание семян»: кабинет биологии. Слева — термостат: на панели табло температуры
// и суток, ручка регулятора; за стеклянной дверцей на решётчатой полке — чашка Петри
// с фильтровальной бумагой и двадцатью семенами. Справа на столе — промывалка, стакан с водой
// и два пакета с семенами (фасоль, пшеница); на стене — плакат «Строение проростка», где под
// увеличением показан самый развитый проросток из чашки.
// Ученик сам ставит опыт:
//   промывалку тащат (или щёлкают) к чашке → бумага влажная (water = 1);
//   стакан с водой тащат к чашке → семена под слоем воды (water = 2); щелчок по залитой чашке
//   сливает лишнюю воду (water = 1);
//   щелчок по пакету → в чашке семена другого растения (seed);
//   ручку термостата ведут влево-вправо → температура (T).
// Проростки растут по модели: корешок → стебелёк (росток) → семядоли/первый лист. Сутки на табло
// догоняют регулятор постепенно, поэтому рост виден как ускоренная съёмка.

import { tr } from '../../i18n.js';
import { beaker, createScene, draggable, floorShadow, mixHex, readout, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 470;
const CAB = { x1: 16, x2: 356, top: 84, bottom: 468 }; // корпус термостата
const DOOR = { x1: 26, x2: 346, top: 186, bottom: 460 };
const IN = { x1: 36, x2: 334, top: 196, bottom: 450 }; // камера за стеклом
const KNOB = { x: 304, y: 126 };
const DISH = { x: 186, y: 394, rx: 138, ry: 40, h: 13 }; // верхняя кромка чашки Петри
const PAPER = { x: DISH.x, y: DISH.y + DISH.h - 2, rx: 128, ry: 33 }; // плоскость бумаги
const POSTER = { x1: 366, x2: 603, top: 26, bottom: 292 };
const LENS = { x: 400, y: 180 }; // семя на плакате
const LABEL_X = 446;
const BOTTLE_HOME = { x: 440, y: 466, a: 0 };
const BOTTLE_TIP = { x: -36, y: -146 }; // кончик трубки промывалки в её собственных координатах
const BEAKER_HOME = { x: 550, y: 466, a: 0 };
const BEAKER_LIP = { x: -40, y: -100 }; // носик стакана
const PACKETS = [{ x: 700, name: 'Фасоль' }, { x: 820, name: 'Пшеница' }];
const PACKET = { w: 100, h: 104, bottom: 466 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rotP = (p, deg) => {
  const r = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
};

// Семена лежат в четыре ряда по пять; задние ряды рисуются первыми, чтобы передние проростки их перекрывали
const SEEDS = Array.from({ length: 20 }, (_, i) => {
  const row = Math.floor(i / 5);
  const col = i % 5;
  const dy = [-21, -7, 7, 21][row];
  const dx = (col - 2) * 40 + (row % 2 ? -8 : 8);
  return {
    x: PAPER.x + dx,
    y: PAPER.y + dy,
    a: ((i * 47) % 60) - 30, // наклон семени
    dir: ((i * 71) % 140) + 20, // направление корешка по бумаге, градусы
    // Проростки в партии неодинаковы: разная высота и небольшой наклон, иначе чашка выглядит «по линейке»
    tall: 0.78 + (((i * 37) % 9) / 8) * 0.3,
    lean: (((i * 53) % 11) - 5) * 1.5,
  };
});

// Фасоль — почковидное семя с рубчиком, пшеница — зерновка с бороздкой (локальные координаты, центр в 0,0)
const BEAN_PATH = 'M-8 -1 C-8 -5.5 -3 -5.5 0 -3.6 C3 -5.5 8 -5.5 8 -0.5 C8 4.5 3 5.2 0 5.2 C-3 5.2 -8 4 -8 -1 Z';
const GRAIN_PATH = 'M-5.6 0 C-5.6 -3 -2.5 -3.4 0 -3.4 C3 -3.4 5.6 -2.4 5.6 0 C5.6 2.4 3 3.4 0 3.4 C-2.5 3.4 -5.6 3 -5.6 0 Z';
const SEED_COLOR = ['#efe2c4', '#d4a24e'];

export function plantReproductionScene(container, params, set, { development, stageOf, N }) {
  let tempBox, daysBox, knobPointer, coldTint, warmTint, pane, paper, flood, floodShine, dishHit;
  let posterSeed, posterRoot, posterLaterals, posterStem, posterCot, posterLeaves, posterCoat, posterWheat, posterStage;
  const posterLabels = [];
  const seedViews = [];
  const packetViews = [];
  let knob, bottleShadow, topLayer, bottle, beakerTool, beakerGlass, stream, drops;

  // Показанное состояние догоняет параметры плавно: рост проростков и смачивание бумаги видны как процесс
  let shownDays = params.days;
  let shownWater = params.water; // меняется, только когда инструмент долил воду (или параметр поставлен регулятором)
  let wet = params.water >= 1 ? 1 : 0;
  let deep = params.water === 2 ? 1 : 0;
  let shownSeed = params.seed;
  let swell = params.water >= 1 && params.days > 0 ? 1 : 0;
  const dev = development(params, params.days);
  let lastWater = params.water;
  let doorOpen = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });

      // ── Плакат «Строение проростка» на стене ──
      svg.append(
        s('rect', { x: POSTER.x1 + 3, y: POSTER.top + 5, width: POSTER.x2 - POSTER.x1, height: POSTER.bottom - POSTER.top, rx: 8, fill: '#0f172a', 'fill-opacity': 0.1 }),
        s('rect', { x: POSTER.x1, y: POSTER.top, width: POSTER.x2 - POSTER.x1, height: POSTER.bottom - POSTER.top, rx: 8, fill: d.lin([[0, '#fffdf7'], [1, '#f6f0e2']], 'v'), stroke: '#d6ccb8', 'stroke-width': 1.5 }),
        s('rect', { x: POSTER.x1, y: POSTER.top, width: POSTER.x2 - POSTER.x1, height: 34, rx: 8, fill: '#3f6212' }),
        s('rect', { x: POSTER.x1, y: POSTER.top + 26, width: POSTER.x2 - POSTER.x1, height: 8, fill: '#3f6212' }),
        text((POSTER.x1 + POSTER.x2) / 2, POSTER.top + 17, tr('Строение проростка'), { size: 15, weight: 700, fill: '#f7fee7' }),
        // Линия «поверхности бумаги» под увеличением
        s('path', { d: `M${POSTER.x1 + 12} ${LENS.y + 9} H${LABEL_X - 10}`, stroke: '#cbbf9f', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }),
      );
      posterRoot = s('path', { fill: 'none', stroke: '#f5f0e1', 'stroke-width': 5, 'stroke-linecap': 'round' });
      const posterRootEdge = s('path', { fill: 'none', stroke: '#b9a77f', 'stroke-width': 7, 'stroke-linecap': 'round' });
      posterLaterals = s('path', { fill: 'none', stroke: '#c9b88f', 'stroke-width': 2, 'stroke-linecap': 'round' });
      posterStem = s('path', { fill: 'none', stroke: '#9cc15a', 'stroke-width': 6, 'stroke-linecap': 'round' });
      const posterStemEdge = s('path', { fill: 'none', stroke: '#5b7f2a', 'stroke-width': 8, 'stroke-linecap': 'round' });
      // Корень рисуется двумя линиями (кайма + светлая середина) — так он читается на светлом плакате
      posterRoot.edge = posterRootEdge;
      posterStem.edge = posterStemEdge;
      posterCoat = s('path', { d: 'M-22 2 C-22 -12 -8 -14 0 -8 C8 -14 22 -12 22 0', fill: 'none', stroke: '#b7a074', 'stroke-width': 3, opacity: 0 });
      posterSeed = s('g', {}, [
        s('path', { d: BEAN_PATH, transform: 'scale(3.3)', fill: SEED_COLOR[0], stroke: '#a88d5c', 'stroke-width': 0.5 }),
        s('ellipse', { cx: 0, cy: 10, rx: 5, ry: 2.2, fill: '#7c5a2c' }),
      ]);
      posterWheat = s('g', {}, [
        s('path', { d: GRAIN_PATH, transform: 'rotate(-90) scale(3.4)', fill: SEED_COLOR[1], stroke: '#9a6b22', 'stroke-width': 0.4 }),
        s('path', { d: 'M0 -16 V16', stroke: '#9a6b22', 'stroke-width': 1.5, 'stroke-opacity': 0.7 }),
      ]);
      // Семядоли — две половинки семени, раскрываются, когда стебелёк выносит их наверх
      posterCot = s('g', {}, [
        s('path', { d: 'M0 0 C-6 -14 -26 -16 -26 -4 C-26 6 -10 6 0 0 Z', fill: '#d6d27c', stroke: '#8f8a3a', 'stroke-width': 1 }),
        s('path', { d: 'M0 0 C6 -14 26 -16 26 -4 C26 6 10 6 0 0 Z', fill: '#cfcb72', stroke: '#8f8a3a', 'stroke-width': 1 }),
      ]);
      posterLeaves = s('g', {}, [
        s('path', { d: 'M0 0 C-6 -20 -34 -26 -38 -12 C-34 -2 -12 2 0 0 Z', fill: '#4d9a3a', stroke: '#2f6b22', 'stroke-width': 1 }),
        s('path', { d: 'M0 0 C6 -20 34 -26 38 -12 C34 -2 12 2 0 0 Z', fill: '#58a843', stroke: '#2f6b22', 'stroke-width': 1 }),
      ]);
      svg.append(posterCoat, posterRootEdge, posterRoot, posterLaterals, posterStemEdge, posterStem, posterLeaves, posterCot, posterSeed, posterWheat);
      for (let i = 0; i < 4; i++) {
        const line = s('path', { fill: 'none', stroke: '#78716c', 'stroke-width': 1 });
        const dot = s('circle', { r: 2.2, fill: '#78716c' });
        const label = text(LABEL_X, 0, '', { size: 13, weight: 600, fill: '#3f3a2e', anchor: 'start' });
        svg.append(line, dot, label);
        posterLabels.push({ line, dot, label });
      }
      posterStage = text((POSTER.x1 + POSTER.x2) / 2, POSTER.bottom - 16, '', { size: 13, weight: 600, fill: '#3f6212' });
      svg.append(posterStage);

      // ── Термостат ──
      const cw = CAB.x2 - CAB.x1;
      svg.append(
        floorShadow((CAB.x1 + CAB.x2) / 2, CAB.bottom + 2, cw * 0.56, d, 9),
        s('rect', { x: CAB.x1, y: CAB.top, width: cw, height: CAB.bottom - CAB.top, rx: 12, fill: d.lin([[0, '#e2e8f0'], [0.08, '#f8fafc'], [0.85, '#e2e8f0'], [1, '#cbd5e1']]), stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('rect', { x: CAB.x1 + 6, y: CAB.top + 6, width: cw - 12, height: 88, rx: 8, fill: d.lin([[0, '#475569'], [1, '#334155']], 'v') }),
        s('rect', { x: CAB.x1 + 8, y: CAB.top + 8, width: cw - 16, height: 10, rx: 5, fill: '#ffffff', 'fill-opacity': 0.12 }),
      );
      tempBox = readout(d, { x: 24, y: 96, w: 124, caption: tr('Температура, °C'), color: '#fb923c' });
      daysBox = readout(d, { x: 154, y: 96, w: 106, caption: tr('Прошло суток'), color: '#86efac' });
      svg.append(tempBox.g, daysBox.g);
      knobPointer = s('rect', { x: KNOB.x - 1.6, y: KNOB.y - 15, width: 3.2, height: 9, rx: 1.6, fill: '#fff7ed' });
      knob = s('g', {}, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 24, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 18, fill: '#1e293b' }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 15, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
        knobPointer,
      ]);
      svg.append(knob, text(KNOB.x, KNOB.y + 36, tr('Термостат'), { size: 13, weight: 700, fill: '#e2e8f0' }));

      // Камера: задняя стенка и холодный/тёплый оттенок по температуре
      const iw = IN.x2 - IN.x1;
      const ih = IN.bottom - IN.top;
      svg.append(
        s('rect', { x: DOOR.x1, y: DOOR.top, width: DOOR.x2 - DOOR.x1, height: DOOR.bottom - DOOR.top, rx: 6, fill: '#cbd5e1' }),
        s('rect', { x: IN.x1, y: IN.top, width: iw, height: ih, rx: 3, fill: d.lin([[0, '#f1f5f9'], [1, '#dfe6ee']], 'v') }),
        // Боковые стенки камеры уходят вглубь — видна толщина
        s('path', { d: `M${IN.x1} ${IN.top} L${IN.x1 + 18} ${IN.top + 14} V${IN.bottom - 10} L${IN.x1} ${IN.bottom} Z`, fill: '#0f172a', 'fill-opacity': 0.06 }),
        s('path', { d: `M${IN.x2} ${IN.top} L${IN.x2 - 18} ${IN.top + 14} V${IN.bottom - 10} L${IN.x2} ${IN.bottom} Z`, fill: '#0f172a', 'fill-opacity': 0.09 }),
        s('path', { d: `M${IN.x1} ${IN.top} L${IN.x1 + 18} ${IN.top + 14} H${IN.x2 - 18} L${IN.x2} ${IN.top} Z`, fill: '#0f172a', 'fill-opacity': 0.12 }),
      );
      coldTint = s('rect', { x: IN.x1, y: IN.top, width: iw, height: ih, rx: 3, fill: '#93c5fd', opacity: 0 });
      warmTint = s('rect', { x: IN.x1, y: IN.top, width: iw, height: ih, rx: 3, fill: d.lin([[0, '#fed7aa', 0], [1, '#fdba74', 1]], 'v'), opacity: 0 });
      svg.append(coldTint, warmTint);

      // Решётчатая полка
      const shelf = s('g', {});
      shelf.append(s('rect', { x: IN.x1 + 4, y: IN.bottom - 10, width: iw - 8, height: 4, rx: 2, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }));
      for (let k = 0; k < 15; k++) shelf.append(s('line', { x1: IN.x1 + 14 + k * 19.5, x2: IN.x1 + 8 + k * 20.5, y1: IN.bottom - 10, y2: IN.bottom - 4, stroke: '#94a3b8', 'stroke-width': 1.5 }));
      svg.append(shelf);

      // ── Чашка Петри: дно, бумага, семена, вода, кромка ──
      const { x, y, rx, ry, h } = DISH;
      svg.append(
        s('ellipse', { cx: x, cy: y + h + 4, rx: rx + 6, ry: ry + 4, fill: '#0f172a', 'fill-opacity': 0.12 }),
        s('path', { d: `M${x - rx} ${y} V${y + h} A ${rx} ${ry} 0 0 0 ${x + rx} ${y + h} V${y}`, fill: d.lin([[0, '#cbd5e1', 0.7], [0.3, '#f8fafc', 0.5], [1, '#94a3b8', 0.7]]) }),
        s('ellipse', { cx: x, cy: y, rx, ry, fill: '#e2e8f0', 'fill-opacity': 0.5 }),
      );
      paper = s('ellipse', { cx: PAPER.x, cy: PAPER.y, rx: PAPER.rx, ry: PAPER.ry, fill: '#fbfaf5', stroke: '#e7e2d3', 'stroke-width': 1 });
      svg.append(paper);
      const seedLayer = s('g', {});
      svg.append(seedLayer);
      for (const sd of SEEDS) {
        const root = s('path', { fill: 'none', stroke: '#fffdf5', 'stroke-width': 2.8, 'stroke-linecap': 'round' });
        const rootEdge = s('path', { fill: 'none', stroke: '#bfae86', 'stroke-width': 4, 'stroke-linecap': 'round' });
        const stemEdge = s('path', { fill: 'none', stroke: '#4d6b22', 'stroke-width': 4.2, 'stroke-linecap': 'round' });
        const stem = s('path', { fill: 'none', stroke: '#a3c46a', 'stroke-width': 2.8, 'stroke-linecap': 'round' });
        const body = s('path', { d: BEAN_PATH, fill: SEED_COLOR[0], stroke: '#a88d5c', 'stroke-width': 0.7 });
        const mark = s('path', { d: 'M-1.6 3.6 H1.6', stroke: '#6b4b22', 'stroke-width': 1.6, 'stroke-linecap': 'round' });
        const seedG = s('g', {}, [body, mark]);
        const cot = s('g', {}, [
          s('ellipse', { cx: -4.5, cy: 0, rx: 5, ry: 3, fill: '#d6d27c', stroke: '#8f8a3a', 'stroke-width': 0.6, transform: 'rotate(-18 -4.5 0)' }),
          s('ellipse', { cx: 4.5, cy: 0, rx: 5, ry: 3, fill: '#cfcb72', stroke: '#8f8a3a', 'stroke-width': 0.6, transform: 'rotate(18 4.5 0)' }),
        ]);
        const leaf = s('g', {}, [
          s('ellipse', { cx: -6, cy: -3, rx: 7, ry: 3.6, fill: '#4d9a3a', stroke: '#2f6b22', 'stroke-width': 0.6, transform: 'rotate(-28 -6 -3)' }),
          s('ellipse', { cx: 6, cy: -3, rx: 7, ry: 3.6, fill: '#58a843', stroke: '#2f6b22', 'stroke-width': 0.6, transform: 'rotate(28 6 -3)' }),
        ]);
        const blade = s('path', { fill: 'none', stroke: '#4d9a3a', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
        seedLayer.append(rootEdge, root, seedG, stemEdge, stem, blade, cot, leaf);
        seedViews.push({ ...sd, root, rootEdge, stem, stemEdge, body, mark, seedG, cot, leaf, blade });
      }
      // Слой воды над семенами, когда их залили: семена видны сквозь воду
      flood = s('ellipse', { cx: PAPER.x, cy: PAPER.y - 4, rx: PAPER.rx + 6, ry: PAPER.ry + 3, fill: d.lin([[0, '#bfdbfe', 0.55], [1, '#7dd3fc', 0.5]], 'v'), opacity: 0 });
      floodShine = s('path', { d: `M${PAPER.x - 70} ${PAPER.y - 18} Q ${PAPER.x} ${PAPER.y - 26} ${PAPER.x + 64} ${PAPER.y - 18}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0 });
      svg.append(flood, floodShine);
      svg.append(
        s('path', { d: `M${x - rx} ${y} A ${rx} ${ry} 0 0 0 ${x + rx} ${y}`, fill: 'none', stroke: '#94a3b8', 'stroke-width': 2 }),
        s('path', { d: `M${x - rx} ${y} V${y + h} A ${rx} ${ry} 0 0 0 ${x + rx} ${y + h} V${y}`, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('path', { d: `M${x - rx} ${y} A ${rx} ${ry} 0 0 1 ${x + rx} ${y}`, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1.5 }),
      );
      // Невидимая зона щелчка по чашке: залитую чашку щелчком сливают
      dishHit = s('g', {}, [s('ellipse', { cx: x, cy: y + 6, rx: rx + 4, ry: ry + 10, fill: '#000', 'fill-opacity': 0 })]);
      svg.append(dishHit);

      // Дверца: стекло с бликами, рама и ручка. Пока воду наливают, дверца открыта — она пропадает,
      // и струя идёт прямо в чашку, а не сквозь стекло
      pane = s('g', { 'pointer-events': 'none' }, [
        s('rect', { x: IN.x1, y: IN.top, width: iw, height: ih, rx: 3, fill: d.url('glass') }),
        s('path', { d: `M${IN.x1 + 30} ${IN.top} L${IN.x1 + 90} ${IN.top} L${IN.x1 + 10} ${IN.bottom - 120} L${IN.x1} ${IN.bottom - 150} Z`, fill: '#ffffff', 'fill-opacity': 0.18 }),
        s('path', { d: `M${DOOR.x1} ${DOOR.top} H${DOOR.x2} V${DOOR.bottom} H${DOOR.x1} Z M${IN.x1} ${IN.top} V${IN.bottom} H${IN.x2} V${IN.top} Z`, 'fill-rule': 'evenodd', fill: d.lin([[0, '#e2e8f0'], [1, '#cbd5e1']], 'v'), stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: DOOR.x2 - 7, y: 280, width: 8, height: 96, rx: 4, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
      ]);
      svg.append(pane);

      // ── Промывалка: мягкая бутылка с изогнутой трубкой ──
      bottle = s('g', {}, [
        s('rect', { x: -40, y: -160, width: 76, height: 166, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M-27 -4 V-74 Q-27 -94 -10 -98 H10 Q27 -94 27 -74 V-4 Q27 0 23 0 H-23 Q-27 0 -27 -4 Z', fill: d.lin([[0, '#dbeafe', 0.8], [0.3, '#f8fafc', 0.9], [1, '#cbd5e1', 0.85]]), stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('rect', { x: -25, y: -52, width: 50, height: 48, rx: 4, fill: '#bae6fd', 'fill-opacity': 0.75 }),
        s('rect', { x: -19, y: -84, width: 6, height: 70, rx: 3, fill: '#ffffff', 'fill-opacity': 0.7 }),
        s('rect', { x: -11, y: -110, width: 22, height: 14, rx: 3, fill: '#2563eb' }),
        s('path', { d: 'M0 -110 V-132 Q0 -146 -14 -148 L-36 -146', fill: 'none', stroke: '#e2e8f0', 'stroke-width': 4.5, 'stroke-linecap': 'round' }),
        s('path', { d: 'M0 -110 V-132 Q0 -146 -14 -148 L-36 -146', fill: 'none', stroke: '#94a3b8', 'stroke-width': 1, 'stroke-linecap': 'round' }),
        text(0, -28, 'H₂O', { size: 14, weight: 700, fill: '#1e40af' }),
      ]);
      // ── Стакан с водой ──
      beakerGlass = beaker(d, { x: 0, bottom: 0, w: 80, h: 100 });
      beakerGlass.setLevel(0.6);
      beakerGlass.setColor('#bfe3f7');
      beakerTool = s('g', {}, [s('rect', { x: -48, y: -110, width: 96, height: 116, fill: '#000', 'fill-opacity': 0 }), beakerGlass.g]);
      bottleShadow = floorShadow(BOTTLE_HOME.x, BOTTLE_HOME.y + 2, 34, d);
      svg.append(bottleShadow, bottle, beakerTool);

      // ── Пакеты с семенами ──
      PACKETS.forEach((pk, i) => {
        const top = PACKET.bottom - PACKET.h;
        const ring = s('rect', { x: pk.x - PACKET.w / 2 - 5, y: top - 5, width: PACKET.w + 10, height: PACKET.h + 10, rx: 9, fill: 'none', stroke: '#16a34a', 'stroke-width': 3, opacity: 0 });
        const art = i === 0
          ? s('g', {}, [[-14, -6, -20], [10, -10, 25], [-4, 10, 5], [16, 10, -35]].map(([dx, dy, a]) => s('path', { d: BEAN_PATH, transform: `translate(${pk.x + dx} ${top + 46 + dy}) rotate(${a}) scale(1.5)`, fill: SEED_COLOR[0], stroke: '#a88d5c', 'stroke-width': 0.5 })))
          : s('g', {}, [
            s('path', { d: `M${pk.x} ${top + 74} V${top + 22}`, stroke: '#a16207', 'stroke-width': 2 }),
            ...Array.from({ length: 6 }, (_, k) => [-1, 1].map((side) => s('path', { d: GRAIN_PATH, transform: `translate(${pk.x + side * 6} ${top + 30 + k * 7.5}) rotate(${side * 55}) scale(1.05)`, fill: SEED_COLOR[1], stroke: '#9a6b22', 'stroke-width': 0.4 }))).flat(),
          ]);
        const g = s('g', { style: 'cursor:pointer' }, [
          floorShadow(pk.x, PACKET.bottom + 2, 46, d, 6),
          ring,
          s('path', { d: `M${pk.x - PACKET.w / 2} ${top + 6} L${pk.x - PACKET.w / 2 + 6} ${top} H${pk.x + PACKET.w / 2 - 6} L${pk.x + PACKET.w / 2} ${top + 6} V${PACKET.bottom} H${pk.x - PACKET.w / 2} Z`, fill: d.lin([[0, '#fefce8'], [1, '#f5e9c8']], 'v'), stroke: '#c8b48a', 'stroke-width': 1.2 }),
          s('path', { d: `M${pk.x - PACKET.w / 2} ${top + 10} H${pk.x + PACKET.w / 2}`, stroke: '#c8b48a', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
          art,
          s('rect', { x: pk.x - PACKET.w / 2 + 5, y: PACKET.bottom - 24, width: PACKET.w - 10, height: 19, rx: 3, fill: i === 0 ? '#7c2d12' : '#a16207' }),
          text(pk.x, PACKET.bottom - 14, tr(pk.name), { size: 13, weight: 700, fill: '#fffbeb' }),
        ]);
        svg.append(g);
        touchTarget(g, 10);
        g.addEventListener('click', () => {
          if (params.seed !== i) set('seed', i);
        });
        packetViews.push({ g, ring });
      });

      topLayer = s('g', { 'pointer-events': 'none' });
      stream = s('path', { fill: 'none', stroke: '#7dd3fc', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0 });
      drops = Array.from({ length: 5 }, () => s('ellipse', { rx: 2.4, ry: 3.2, fill: '#bae6fd', stroke: '#60a5fa', 'stroke-width': 0.8, opacity: 0 }));
      topLayer.append(stream, ...drops);
      svg.append(topLayer);
    },

    frame(dt, now) {
      const T = params.T;
      tempBox.set(String(T));
      knobPointer.setAttribute('transform', `rotate(${-135 + (T / 40) * 270} ${KNOB.x} ${KNOB.y})`);
      coldTint.setAttribute('opacity', (clamp01((12 - T) / 12) * 0.35).toFixed(3));
      warmTint.setAttribute('opacity', (clamp01((T - 24) / 16) * 0.45).toFixed(3));

      updateTools(dt);
      const open = tools.some((t) => t.state === 'fly' || t.state === 'pour') ? 1 : 0;
      doorOpen += (open - doorOpen) * Math.min(1, dt * 6);
      pane.setAttribute('opacity', (1 - doorOpen).toFixed(3));

      // Сутки догоняют регулятор: проростки растут на глазах, как при ускоренной съёмке
      const dir = Math.sign(params.days - shownDays);
      shownDays = dir > 0 ? Math.min(params.days, shownDays + dt * 4) : Math.max(params.days, shownDays - dt * 10);
      daysBox.set(String(Math.round(shownDays)));

      const k = Math.min(1, dt * 2.5);
      wet += ((shownWater >= 1 ? 1 : 0) - wet) * k;
      deep += ((shownWater === 2 ? 1 : 0) - deep) * k;
      swell += ((shownWater >= 1 && shownDays > 0.05 ? 1 : 0) - swell) * Math.min(1, dt * 2);
      if (shownSeed !== params.seed) {
        // Другие семена — новая закладка опыта: прежние проростки исчезают, новые растут заново
        shownSeed = params.seed;
        dev.fill(-1);
        swell = 0;
      }
      const target = development({ ...params, water: shownWater, seed: shownSeed }, shownDays);
      for (let i = 0; i < N; i++) dev[i] += (target[i] - dev[i]) * Math.min(1, dt * 4);

      paper.setAttribute('fill', mixHex('#fbfaf5', '#d5dfe4', wet));
      flood.setAttribute('opacity', deep.toFixed(3));
      floodShine.setAttribute('opacity', (deep * (0.6 + 0.3 * Math.sin(now * 2))).toFixed(3));
      dishHit.style.cursor = params.water === 2 ? 'pointer' : '';

      // Под водой семена со временем темнеют — без воздуха зародыш гибнет
      const rot = shownWater === 2 ? clamp01((shownDays - 3) / 8) : 0;
      seedViews.forEach((v, i) => drawSeedling(v, dev[i], rot));
      drawPoster(Math.max(...dev));
      packetViews.forEach((p, i) => {
        p.ring.setAttribute('opacity', params.seed === i ? 1 : 0);
        p.g.setAttribute('transform', params.seed === i ? 'translate(0 -6)' : '');
      });
    },
  });

  // ── Один проросток в чашке ──
  function drawSeedling(v, dv, rot) {
    const wheat = shownSeed === 1;
    const sc = 1 + 0.22 * swell;
    const color = mixHex(shade(SEED_COLOR[shownSeed], -0.08 * wet), '#6b5a3a', rot * 0.55);
    v.body.setAttribute('d', wheat ? GRAIN_PATH : BEAN_PATH);
    v.body.setAttribute('fill', color);
    v.mark.setAttribute('d', wheat ? 'M-4 0 H4' : 'M-1.6 3.6 H1.6');
    v.mark.setAttribute('stroke', wheat ? '#9a6b22' : '#6b4b22');
    v.mark.setAttribute('stroke-width', wheat ? 0.8 : 1.6);

    const g = Math.max(0, dv);
    const rootLen = dv < 0 ? 0 : 4 + 34 * clamp01(g / 1.5);
    const shoot = clamp01((g - 0.5) / 1.5);
    const lift = wheat ? 0 : clamp01((g - 1.3) / 0.5);
    const leafK = wheat ? clamp01((g - 1.5) / 1.5) : clamp01((g - 2.2) / 1);
    const h = (88 * shoot + 24 * leafK) * v.tall;

    // Корешки идут по бумаге: в перспективе путь по вертикали сплющен
    let rd = '';
    if (rootLen > 0) {
      const angles = wheat ? [v.dir - 25, v.dir, v.dir + 30] : [v.dir];
      angles.forEach((a, j) => {
        const L = rootLen * (j ? 0.75 : 1);
        const r = (a * Math.PI) / 180;
        // Корешок упирается в край чашки и дальше не идёт — укорачиваем, пока конец не окажется на бумаге
        let len = L;
        const inside = (q) => ((v.x + Math.cos(r) * q - PAPER.x) / PAPER.rx) ** 2 + ((v.y + 3 + Math.sin(r) * q * 0.38 - PAPER.y) / PAPER.ry) ** 2 < 0.9;
        while (len > 2 && !inside(len)) len *= 0.85;
        const ex = v.x + Math.cos(r) * len;
        const ey = v.y + 3 + Math.sin(r) * len * 0.38;
        rd += `M${v.x} ${v.y + 2} Q${(v.x + ex) / 2 + 3} ${(v.y + ey) / 2 + 3} ${ex.toFixed(1)} ${ey.toFixed(1)} `;
      });
    }
    v.root.setAttribute('d', rd);
    v.rootEdge.setAttribute('d', rd);

    // Стебелёк фасоли сначала изогнут петлёй, потом выпрямляется и выносит семядоли; у пшеницы росток прямой
    let sd = '';
    const topX = v.x + (wheat ? 1 : -2) + v.lean * shoot;
    const topY = v.y - 2 - h;
    if (h > 0.5) {
      if (wheat) sd = `M${v.x} ${v.y - 2} L${topX} ${topY + 24 * leafK}`;
      else sd = `M${v.x} ${v.y} C${v.x - 6} ${v.y - h * 0.5} ${topX - 2} ${topY + 4} ${topX} ${topY} Q${topX + 6 * (1 - lift)} ${topY + 2} ${topX + 7 * (1 - lift)} ${topY + 8 * (1 - lift)}`;
    }
    v.stem.setAttribute('d', sd);
    v.stemEdge.setAttribute('d', sd);
    v.blade.setAttribute('d', wheat && leafK > 0 ? `M${topX} ${topY + 24 * leafK} Q${topX + 2} ${topY + 6} ${topX + 6 * leafK} ${topY - 4 * leafK}` : '');

    // Семя остаётся на бумаге; у фасоли семядоли поднимаются на верх стебелька
    v.seedG.setAttribute('transform', `translate(${v.x} ${v.y}) rotate(${v.a}) scale(${(1.3 * sc * (1 - lift * 0.35)).toFixed(3)})`);
    v.seedG.setAttribute('opacity', (1 - lift * 0.45).toFixed(3));
    v.cot.setAttribute('opacity', lift.toFixed(3));
    v.cot.setAttribute('transform', `translate(${topX} ${topY}) scale(${(0.8 + 0.5 * lift).toFixed(3)})`);
    v.leaf.setAttribute('opacity', wheat ? 0 : leafK.toFixed(3));
    v.leaf.setAttribute('transform', `translate(${topX} ${topY - 2}) scale(${(0.4 + 0.9 * leafK).toFixed(3)})`);
  }

  // ── Плакат: самый развитый проросток под увеличением с подписями частей ──
  function drawPoster(best) {
    const wheat = shownSeed === 1;
    const g = Math.max(0, best);
    const sprouted = best >= 0;
    const { x, y } = LENS;
    const sc = 1 + 0.18 * swell;
    const rootLen = sprouted ? 8 + 62 * clamp01(g / 1.5) : 0;
    const shoot = clamp01((g - 0.5) / 1.5);
    const lift = wheat ? 0 : clamp01((g - 1.3) / 0.5);
    const leafK = wheat ? clamp01((g - 1.5) / 1.5) : clamp01((g - 2.2) / 1);
    const h = (wheat ? 48 : 74) * shoot;

    posterSeed.setAttribute('opacity', wheat ? 0 : 1 - lift);
    posterSeed.setAttribute('transform', `translate(${x} ${y}) scale(${sc.toFixed(3)})`);
    posterWheat.setAttribute('opacity', wheat ? 1 : 0);
    posterWheat.setAttribute('transform', `translate(${x} ${y}) scale(${sc.toFixed(3)})`);
    posterCoat.setAttribute('opacity', wheat ? 0 : lift);
    posterCoat.setAttribute('transform', `translate(${x + 4} ${y + 6})`);

    // Корешок вниз от семени; у пшеницы — пучок зародышевых корешков
    const ry = y + 14;
    let rd = '';
    let lat = '';
    if (rootLen > 0) {
      const ends = wheat ? [[0, 1], [-16, 0.8], [16, 0.75]] : [[0, 1]];
      for (const [dx, f] of ends) rd += `M${x} ${ry} Q${x + dx * 0.4 + 6} ${ry + rootLen * f * 0.5} ${x + dx} ${ry + rootLen * f} `;
      // Боковые корни у фасоли появляются на окрепшем корешке
      const latK = wheat ? 0 : clamp01((g - 1) / 1);
      if (latK > 0) {
        for (const [t, side] of [[0.35, -1], [0.5, 1], [0.65, -1], [0.78, 1]]) {
          const py = ry + rootLen * t;
          const px = x + 3 * t;
          lat += `M${px} ${py} q${side * 8 * latK} ${4 * latK} ${side * 14 * latK} ${12 * latK} `;
        }
      }
    }
    posterRoot.setAttribute('d', rd);
    posterRoot.edge.setAttribute('d', rd);
    posterLaterals.setAttribute('d', lat);

    // Стебелёк (росток) вверх; у фасоли он выносит семядоли, между ними — первые листья
    const topY = y - 12 - h;
    let sd = '';
    if (h > 1) {
      if (wheat) sd = `M${x} ${y - 14} L${x} ${topY}`;
      else sd = `M${x} ${y + 8} C${x - 10} ${y - h * 0.4} ${x - 4} ${topY + 6} ${x} ${topY} Q${x + 14 * (1 - lift)} ${topY + 2} ${x + 16 * (1 - lift)} ${topY + 18 * (1 - lift)}`;
    }
    if (wheat && leafK > 0) sd += ` M${x} ${topY + 2} Q${x + 4} ${topY - 28 * leafK} ${x + 16 * leafK} ${topY - 44 * leafK}`;
    posterStem.setAttribute('d', sd);
    posterStem.edge.setAttribute('d', sd);
    posterStem.setAttribute('stroke', wheat ? '#86b84a' : '#9cc15a');
    posterCot.setAttribute('opacity', wheat ? 0 : lift);
    posterCot.setAttribute('transform', `translate(${x} ${topY}) rotate(0) scale(${(0.5 + 0.5 * lift).toFixed(3)})`);
    posterLeaves.setAttribute('opacity', wheat ? 0 : leafK);
    posterLeaves.setAttribute('transform', `translate(${x} ${topY - 4}) scale(${(0.3 + 0.5 * leafK).toFixed(3)})`);

    // Подписи стоят в фиксированных строках — так они не наезжают друг на друга; линия ведёт к части.
    // Строк четыре: у фасоли «Семя» и «Семядоли» не показываются одновременно (смена при lift = 0,5)
    const items = wheat
      ? [
        [leafK > 0.15, 'Первый лист', 84, x + 10 * leafK, topY - 32 * leafK],
        [h > 8, 'Росток', 128, x, topY + h * 0.4],
        [true, 'Зерновка', 178, x + 10, y],
        [rootLen > 4, 'Корешки', 236, x + 8, ry + rootLen * 0.6],
      ]
      : [
        [leafK > 0.15, 'Первые листья', 76, x + 18 * leafK, topY - 14 * leafK],
        [lift > 0.5, 'Семядоли', 116, x + 16, topY - 2],
        [h > 8, 'Стебелёк', 156, x - 4, Math.max(topY + 10, y - h * 0.45)],
        [lift < 0.5, 'Семя', 196, x + 18, y + 2],
        [rootLen > 4, 'Корешок', 240, x + 4, ry + rootLen * 0.55],
      ];
    const shown = items.filter((it) => it[0]);
    posterLabels.forEach((l, i) => {
      const it = shown[i];
      if (!it) {
        l.label.textContent = '';
        l.line.setAttribute('d', '');
        l.dot.setAttribute('opacity', 0);
        return;
      }
      const [, name, ly, px, py] = it;
      l.label.textContent = tr(name);
      l.label.setAttribute('y', ly);
      l.line.setAttribute('d', `M${LABEL_X - 5} ${ly} H${LABEL_X - 16} L${px.toFixed(1)} ${py.toFixed(1)}`);
      l.dot.setAttribute('cx', px.toFixed(1));
      l.dot.setAttribute('cy', py.toFixed(1));
      l.dot.setAttribute('opacity', 1);
    });
    posterStage.textContent = tr(stageOf(shownSeed, best) ?? (shownWater === 0 ? 'сухое семя в покое' : 'проростков нет'));
  }

  // ── Промывалка и стакан: тащат или щёлкают; долетев до чашки, наливают воду ──
  const tools = [
    {
      node: bottle, home: BOTTLE_HOME, tip: BOTTLE_TIP, value: 1, pourA: -38, dur: 1.3,
      canAct: () => params.water === 0,
    },
    {
      node: beakerTool, home: BEAKER_HOME, tip: BEAKER_LIP, value: 2, pourA: -62, dur: 1.5,
      canAct: () => params.water !== 2,
    },
  ];
  for (const t of tools) {
    Object.assign(t, { pos: { ...t.home }, state: 'rest', time: 0, moved: false, grab: { dx: 0, dy: 0 } });
    draggable(scene, t.node, {
      onDrag(x, y) {
        if (t.state !== 'rest' && t.state !== 'drag') return;
        if (t.state === 'rest') {
          t.grab = { dx: t.pos.x - x, dy: t.pos.y - y };
          t.state = 'drag';
          t.start = { x, y };
        }
        if (Math.hypot(x - t.start.x, y - t.start.y) > 6) t.moved = true;
        t.pos.x = Math.max(40, Math.min(920, x + t.grab.dx));
        t.pos.y = Math.max(160, Math.min(BENCH + 2, y + t.grab.dy));
      },
      onEnd() {
        if (t.state !== 'drag' && t.state !== 'rest') return;
        // Щелчок без перетаскивания тоже наливает — на телефоне тащить мелкий предмет неудобно
        const nearDish = Math.abs(t.pos.x - DISH.x) < 200 && t.pos.y < BENCH + 4 && t.pos.x < IN.x2 + 60;
        if ((!t.moved || nearDish) && t.canAct()) act(t);
        else t.state = 'back';
        t.moved = false;
      },
    });
  }

  // Куда встаёт инструмент, чтобы вода текла из кончика в середину чашки
  function pourPose(t) {
    const tip = rotP(t.tip, t.pourA);
    return { x: DISH.x + 40 - tip.x, y: DISH.y - 70 - tip.y, a: t.pourA };
  }

  function act(t) {
    t.state = 'fly';
    t.time = 0;
    t.pending = true;
  }

  function updateTools(dt) {
    // Воду налили регулятором (или проверочным прогоном) — инструмент всё равно отрабатывает действие
    if (params.water !== lastWater) {
      const up = params.water > lastWater;
      lastWater = params.water;
      const t = tools.find((x) => x.value === params.water);
      if (up && t && t.state === 'rest') {
        t.state = 'fly';
        t.time = 0;
      } else if (!tools.some((x) => x.state === 'fly' || x.state === 'pour')) shownWater = params.water;
    }
    let pouring = null;
    for (const t of tools) {
      if (t.state === 'fly') {
        const to = pourPose(t);
        const k = Math.min(1, dt * 6);
        t.pos.x = lerp(t.pos.x, to.x, k);
        t.pos.y = lerp(t.pos.y, to.y, k);
        t.pos.a = lerp(t.pos.a, to.a, k);
        if (Math.hypot(t.pos.x - to.x, t.pos.y - to.y) < 2 && Math.abs(t.pos.a - to.a) < 1) {
          t.state = 'pour';
          t.time = 0;
          if (t.pending) {
            t.pending = false;
            set('water', t.value);
            lastWater = params.water;
          }
        }
      } else if (t.state === 'pour') {
        t.time += dt;
        pouring = t;
        if (t.time > 0.25) shownWater = t.value;
        if (t.time > t.dur) t.state = 'back';
      } else if (t.state === 'back') {
        const k = Math.min(1, dt * 5);
        t.pos.x = lerp(t.pos.x, t.home.x, k);
        t.pos.y = lerp(t.pos.y, t.home.y, k);
        t.pos.a = lerp(t.pos.a, 0, k);
        if (Math.hypot(t.pos.x - t.home.x, t.pos.y - t.home.y) < 1) {
          Object.assign(t.pos, t.home);
          t.state = 'rest';
        }
      }
      if (t.state === 'rest') Object.assign(t.pos, t.home);
      t.node.setAttribute('transform', `translate(${t.pos.x.toFixed(1)} ${t.pos.y.toFixed(1)}) rotate(${t.pos.a.toFixed(1)})`);
      t.node.style.pointerEvents = t.state === 'rest' || t.state === 'drag' ? '' : 'none';
    }
    // Тень промывалки остаётся на столе, только пока бутылка стоит на месте
    bottleShadow.setAttribute('opacity', tools[0].state === 'rest' ? 1 : 0);
    // Уровень воды в стакане падает, пока из него льют
    if (pouring === tools[1]) beakerGlass.setLevel(lerp(0.6, 0.3, clamp01(pouring.time / pouring.dur)));
    else if (params.water !== 2 && tools[1].state === 'rest') beakerGlass.setLevel(0.6);

    // Струя из стакана и капли из промывалки
    if (pouring) {
      const tip = rotP(pouring.tip, pouring.pos.a);
      const sx = pouring.pos.x + tip.x;
      const sy = pouring.pos.y + tip.y;
      if (pouring === tools[1]) {
        stream.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${(sx - 6).toFixed(1)} ${(sy + 30).toFixed(1)} ${(sx - 4).toFixed(1)} ${PAPER.y - 6}`);
        stream.setAttribute('opacity', pouring.time < pouring.dur - 0.2 ? 0.85 : 0);
        drops.forEach((dp) => dp.setAttribute('opacity', 0));
      } else {
        stream.setAttribute('opacity', 0);
        drops.forEach((dp, i) => {
          const ph = (pouring.time * 1.6 + i / drops.length) % 1;
          dp.setAttribute('cx', (sx - 2 - ph * 4).toFixed(1));
          dp.setAttribute('cy', (sy + ph * (PAPER.y - 6 - sy)).toFixed(1));
          dp.setAttribute('opacity', pouring.time < pouring.dur - 0.2 ? 0.95 : 0);
        });
      }
    } else {
      stream.setAttribute('opacity', 0);
      drops.forEach((dp) => dp.setAttribute('opacity', 0));
    }
  }

  // Ручку термостата ведут мышью влево-вправо — температура в камере
  draggable(scene, knob, { onDrag: (x) => set('T', Math.round(clamp01((x - (KNOB.x - 110)) / 220) * 40)) });

  // В руке и в полёте инструменты проходят перед дверцей термостата — рисуем их поверх всей сцены
  tools.forEach((t) => topLayer.before(t.node));

  // Щелчок по залитой чашке — лишнюю воду сливают, бумага остаётся влажной
  touchTarget(dishHit, 6);
  dishHit.addEventListener('click', () => {
    if (params.water === 2) set('water', 1);
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
