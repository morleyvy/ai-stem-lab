// Сцена «Ферменты слюны»: кабинет биологии, водяная баня (стеклянный бачок на плитке) с пробиркой
// крахмального клейстера и термометром; на столе — стаканчик со слюной и пипеткой, склянка с йодом
// и капельницей, белая капельная пластинка с одиннадцатью лунками — пробы смеси за 0…10 минут.
// Ученик сам переносит пипетку к пробирке (слюна капает в клейстер) и капельницу к пластинке
// (капельница проходит над лунками, и пробы окрашиваются йодом). По мере расщепления крахмала
// клейстер в пробирке светлеет, а пробы меняют цвет: тёмно-синий → фиолетовый → красно-бурый → жёлто-бурый.
// Ручку плитки можно поворачивать мышью; лёд в бане — при 0…5 °C, кипение и пар — у 100 °C.

import { bubblePool, createScene, draggable, floorShadow, hotplate, mixHex, room, s, text } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const PLATE = { x: 225, y: 426, w: 260 }; // плитка под водяной баней
const TANK = { x1: 120, x2: 330, top: 240, bottom: 416 };
const WATER_Y = 272;
const TUBE = { x: 225, top: 120, bottom: 400, w: 32 };
const PASTE_Y = 316; // уровень клейстера в пробирке — ниже уровня воды в бане, чтобы он прогревался
const THERMO = { x: 160, top: 100, bulb: 392 };
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 };
const CUP = { x: 420, bottom: 464, w: 76, h: 84 }; // стаканчик со слюной
const PIPETTE_REST = { x: 430, y: 452, angle: 10 }; // кончик пипетки в стаканчике
const MOUTH = { x: TUBE.x, y: TUBE.top + 14 }; // кончик пипетки над клейстером, внутри горлышка
const BOTTLE = { x: 520, bottom: 466 };
const DROPPER_REST = { x: BOTTLE.x, y: 462, angle: 0 }; // колпачок капельницы сидит на горлышке склянки
const DISH = { x1: 560, x2: 910, top: 402, bottom: 452 }; // капельная пластинка
const WELLS = 11;
const WELL_X = (i) => 588 + i * 29.5;
const WELL_Y = 436;
const SWEEP_Y = WELL_Y - 18; // высота кончика капельницы при обходе лунок
const DROPS = 4;

// Цвет пробы с йодом по доле оставшегося крахмала: синий комплекс йода с крахмалом,
// фиолетовый и красно-бурый — с декстринами, жёлто-бурый — сам йод (крахмала нет).
// Пороги совпадают с iodineColor() в модели, чтобы цвет в лунке и подпись в показаниях не расходились.
const COLOR_STOPS = [[1, '#1c2566'], [0.6, '#33388f'], [0.4, '#5b2f98'], [0.25, '#7e2c74'], [0.15, '#94381f'], [0.05, '#c27f34'], [0, '#d9aa4a']];
const MILKY = '#dbe1e8'; // проба без йода: мутноватый клейстер

function iodineTint(S) {
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [s1, c1] = COLOR_STOPS[i - 1];
    const [s0, c0] = COLOR_STOPS[i];
    if (S >= s0) return mixHex(c0, c1, (S - s0) / (s1 - s0));
  }
  return COLOR_STOPS.at(-1)[1];
}

// Контур пробирки: прямые стенки и полукруглое дно
function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function digestionScene(container, params, set, { starchLeft }) {
  let plate, knobPointer, knob, column, paste, iceGroup, pipette, pipetteFill, dropper;
  // Инструмент в покое стоит в своей посуде (за передней стенкой), в руке и в полёте — поверх всей сцены
  let pipetteHome, dropperHome, topLayer;
  const wells = [];
  const froth = [];
  const drops = [];
  const steam = [];
  let boil;
  let acc = 0;

  // Пипетка со слюной: rest — в стаканчике, drag — в руке, fly — летит к пробирке,
  // drip — капает, back — возвращается, used — слюна уже в пробирке
  let pip = params.saliva ? 'used' : 'rest';
  const pipPos = { ...PIPETTE_REST };
  let dripT = 0;
  let frothK = params.saliva ? 1 : 0;
  const grab = { dx: 0, dy: 0 };

  // Капельница с йодом: rest | drag | fly (к первой лунке) | sweep (над лунками) | back | used
  let drp = params.iodine ? 'used' : 'rest';
  const drpPos = { ...DROPPER_REST };
  let stained = params.iodine ? WELLS : 0; // сколько лунок уже получили каплю йода
  let shownTime = params.time;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ── Водяная баня: плитка, стеклянный бачок с водой ──
      plate = hotplate(d, PLATE);
      knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
      knob = s('g', {}, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 17, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
        knobPointer,
      ]);
      svg.append(plate.g, knob);

      const tankW = TANK.x2 - TANK.x1;
      const tankH = TANK.bottom - TANK.top;
      const tankClip = `tank${uid}`;
      defs.append(s('clipPath', { id: tankClip }, [s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 6 })]));
      svg.append(
        s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 6, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: TANK.x1, y: WATER_Y, width: tankW, height: TANK.bottom - WATER_Y, fill: '#cfe7f3', 'fill-opacity': 0.75, 'clip-path': `url(#${tankClip})` }),
        s('rect', { x: TANK.x1, y: WATER_Y, width: tankW, height: TANK.bottom - WATER_Y, fill: d.lin([[0, '#ffffff', 0.2], [1, '#0f172a', 0.1]], 'v'), 'clip-path': `url(#${tankClip})` }),
      );
      // Пузыри кипения поднимаются со дна бачка
      const tankContent = s('g', { 'clip-path': `url(#${tankClip})` });
      svg.append(tankContent);
      boil = bubblePool(tankContent, 26, { color: '#f8fafc' });

      // Термометр в бане: стеклянная трубка, красный спиртовой столбик
      column = s('rect', { x: THERMO.x - 1.8, width: 3.6, rx: 1.8, fill: '#dc2626' });
      svg.append(
        s('rect', { x: THERMO.x - 7, y: THERMO.top, width: 14, height: THERMO.bulb - THERMO.top, rx: 7, fill: d.lin([[0, '#ffffff', 0.6], [0.5, '#f8fafc', 0.25], [1, '#cbd5e1', 0.55]]), stroke: '#94a3b8', 'stroke-width': 1.2 }),
        ...Array.from({ length: 11 }, (_, i) => s('line', { x1: THERMO.x + 2.5, x2: THERMO.x + (i % 5 ? 5.5 : 7), y1: 380 - i * 24, y2: 380 - i * 24, stroke: '#64748b', 'stroke-width': 1 })),
        column,
        s('circle', { cx: THERMO.x, cy: THERMO.bulb, r: 7.5, fill: d.rad(['#f87171', '#991b1b']) }),
      );

      // ── Пробирка с крахмальным клейстером ──
      const tubeClip = `tube${uid}`;
      defs.append(s('clipPath', { id: tubeClip }, [s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom - 2.5, TUBE.w - 5) })]));
      const tubeContent = s('g', { 'clip-path': `url(#${tubeClip})` });
      paste = s('rect', { x: TUBE.x - 20, y: PASTE_Y, width: 40, height: TUBE.bottom - PASTE_Y, fill: '#ece5d3' });
      tubeContent.append(
        paste,
        s('rect', { x: TUBE.x - 20, y: PASTE_Y, width: 40, height: TUBE.bottom - PASTE_Y, fill: d.lin([[0, '#0f172a', 0.12], [0.35, '#ffffff', 0.25], [1, '#0f172a', 0.16]]) }),
      );
      // Пена слюны на поверхности клейстера
      for (let i = 0; i < 6; i++) {
        const c = s('circle', { cx: TUBE.x - 10 + i * 4, cy: PASTE_Y - 1.5 - (i % 2) * 1.5, r: 1.8 + (i % 3) * 0.6, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 0.6, opacity: 0 });
        froth.push(c);
        tubeContent.append(c);
      }
      for (let i = 0; i < DROPS; i++) {
        const c = s('ellipse', { rx: 2.6, ry: 3.4, fill: '#eef6fb', stroke: '#94a3b8', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
        drops.push({ c, y: 0, v: 0, live: false });
      }
      svg.append(
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.3 }),
        tubeContent,
        ...drops.map((p) => p.c),
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 3, y: TUBE.top - 3, width: TUBE.w + 6, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 + 5, y: TUBE.top + 10, width: 3.5, height: TUBE.bottom - TUBE.top - 34, rx: 1.75, fill: '#ffffff', 'fill-opacity': 0.75 }),
      );

      // Погружённые части пробирки и термометра видны сквозь воду — слегка тонированы
      svg.append(
        s('rect', { x: TUBE.x - TUBE.w / 2 - 2, y: WATER_Y, width: TUBE.w + 4, height: TUBE.bottom - WATER_Y + 2, rx: 6, fill: '#bcd8e6', 'fill-opacity': 0.25 }),
        s('rect', { x: THERMO.x - 9, y: WATER_Y, width: 18, height: THERMO.bulb - WATER_Y + 9, rx: 8, fill: '#bcd8e6', 'fill-opacity': 0.25 }),
      );

      // Лёд у поверхности холодной воды
      iceGroup = s('g', { 'clip-path': `url(#${tankClip})` }, [
        [128, -4, 28, 20, -10], [252, -2, 30, 22, 12], [282, 4, 22, 16, 24], [184, 3, 20, 15, -18],
      ].map(([x, dy, w, h, a]) => s('rect', {
        x, y: WATER_Y + dy - h / 2, width: w, height: h, rx: 5,
        fill: d.lin([[0, '#ffffff', 0.92], [1, '#cfe3ee', 0.8]], 'v'), stroke: '#b6cfdd', 'stroke-width': 1,
        transform: `rotate(${a} ${x + w / 2} ${WATER_Y + dy})`,
      })));
      svg.append(iceGroup);

      // Поверхность воды и стенки бачка поверх содержимого
      svg.append(
        s('line', { x1: TANK.x1 + 3, x2: TANK.x2 - 3, y1: WATER_Y, y2: WATER_Y, stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': 2 }),
        s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 6, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5 }),
        s('rect', { x: TANK.x1 + 8, y: TANK.top + 14, width: 7, height: tankH - 34, rx: 3.5, fill: '#ffffff', 'fill-opacity': 0.6 }),
      );
      // Крышка-штатив бачка: пластиковая планка с гнёздами держит пробирку и термометр
      svg.append(
        s('rect', { x: TANK.x1 - 10, y: TANK.top - 10, width: tankW + 20, height: 14, rx: 4, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 4, y: TANK.top - 12, width: TUBE.w + 8, height: 18, rx: 4, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']]) }),
        s('rect', { x: THERMO.x - 11, y: TANK.top - 12, width: 22, height: 18, rx: 4, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']]) }),
      );
      // Бирка на пробирке
      svg.append(
        s('path', { d: `M${TUBE.x + TUBE.w / 2} 152 L${TUBE.x + 30} 152`, stroke: '#94a3b8', 'stroke-width': 1.2 }),
        s('rect', { x: TUBE.x + 30, y: 140, width: 84, height: 24, rx: 5, fill: '#fffbeb', stroke: '#d6c7a1', 'stroke-width': 1.2 }),
        text(TUBE.x + 72, 152.5, tr('Крахмал'), { size: 13, weight: 600, fill: '#78350f' }),
      );

      // Пар над горячей баней — заранее созданные клубы
      for (let i = 0; i < 6; i++) {
        const e = s('ellipse', { rx: 15, ry: 8, fill: '#e2e8f0', opacity: 0, 'pointer-events': 'none' });
        svg.append(e);
        steam.push({ e, x: TANK.x1 + 22 + i * 34, phase: i / 6 });
      }

      // ── Стаканчик со слюной ──
      const cupTop = CUP.bottom - CUP.h;
      const cupPath = `M${CUP.x - CUP.w / 2} ${cupTop} V${CUP.bottom - 10} Q${CUP.x - CUP.w / 2} ${CUP.bottom} ${CUP.x - CUP.w / 2 + 10} ${CUP.bottom} H${CUP.x + CUP.w / 2 - 10} Q${CUP.x + CUP.w / 2} ${CUP.bottom} ${CUP.x + CUP.w / 2} ${CUP.bottom - 10} V${cupTop}`;
      const cupClip = `cup${uid}`;
      defs.append(s('clipPath', { id: cupClip }, [s('path', { d: cupPath })]));
      svg.append(
        floorShadow(CUP.x, CUP.bottom + 3, CUP.w * 0.62, d),
        s('path', { d: cupPath, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: CUP.x - CUP.w / 2, y: CUP.bottom - 34, width: CUP.w, height: 34, fill: '#e6f0f5', 'fill-opacity': 0.9, 'clip-path': `url(#${cupClip})` }),
        s('ellipse', { cx: CUP.x, cy: CUP.bottom - 34, rx: CUP.w / 2 - 2, ry: 4, fill: '#ffffff', 'fill-opacity': 0.7, 'clip-path': `url(#${cupClip})` }),
      );

      // Пипетка: кончик в (0, 0), стеклянная трубка вверх, резиновая груша сверху
      pipetteFill = s('rect', { x: -2, y: -46, width: 4, height: 42, fill: '#dbeaf2', 'fill-opacity': 0.95 });
      pipette = s('g', {}, [
        s('rect', { x: -16, y: -150, width: 32, height: 156, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M-1.2 0 L-3.5 -18 V-112 H3.5 V-18 L1.2 0 Z', fill: '#f1f5f9', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.2 }),
        pipetteFill,
        s('rect', { x: -1.5, y: -104, width: 1.6, height: 80, rx: 0.8, fill: '#ffffff', 'fill-opacity': 0.8 }),
        s('path', { d: 'M-5.5 -110 V-128 Q-9 -134 -8 -142 Q-6 -152 0 -152 Q6 -152 8 -142 Q9 -134 5.5 -128 V-110 Z', fill: d.lin([[0, '#9f1239'], [0.4, '#f43f5e'], [1, '#881337']]), stroke: '#881337', 'stroke-width': 1 }),
      ]);
      pipetteHome = s('g', {}, [pipette]);
      svg.append(pipetteHome);
      // Этикетка на стаканчике — поверх пипетки, как на настоящем стакане
      svg.append(
        s('rect', { x: CUP.x - 33, y: CUP.bottom - 62, width: 66, height: 22, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
        text(CUP.x, CUP.bottom - 50.5, tr('Слюна'), { size: 13, weight: 700, fill: '#0f766e' }),
        s('path', { d: cupPath, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.2 }),
        s('path', { d: `M${CUP.x - CUP.w / 2} ${cupTop} H${CUP.x + CUP.w / 2}`, stroke: '#cbd5e1', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      );

      // Капельница: кончик в (0, 0), стеклянная трубка с йодом, чёрная груша
      dropper = s('g', {}, [
        s('rect', { x: -15, y: -108, width: 30, height: 114, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M-1.1 0 L-3 -14 V-70 H3 V-14 L1.1 0 Z', fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.1 }),
        s('rect', { x: -1.8, y: -34, width: 3.6, height: 30, fill: '#b45309', 'fill-opacity': 0.9 }),
        s('rect', { x: -11, y: -76, width: 22, height: 8, rx: 2, fill: '#1f2937' }),
        s('path', { d: 'M-7 -76 V-90 Q-9 -100 0 -104 Q9 -100 7 -90 V-76 Z', fill: d.lin([[0, '#111827'], [0.45, '#4b5563'], [1, '#111827']]) }),
      ]);
      dropperHome = s('g', {}, [dropper]);
      svg.append(dropperHome);
      // ── Склянка с йодом (раствор Люголя) из тёмного стекла ──
      const bx = BOTTLE.x;
      const bb = BOTTLE.bottom;
      svg.append(
        floorShadow(bx, bb + 3, 32, d),
        s('path', { d: `M${bx - 22} ${bb - 4} V${bb - 54} Q${bx - 22} ${bb - 62} ${bx - 9} ${bb - 66} V${bb - 74} H${bx + 9} V${bb - 66} Q${bx + 22} ${bb - 62} ${bx + 22} ${bb - 54} V${bb - 4} Q${bx + 22} ${bb} ${bx + 18} ${bb} H${bx - 18} Q${bx - 22} ${bb} ${bx - 22} ${bb - 4} Z`, fill: d.lin([[0, '#451a03'], [0.3, '#92400e'], [0.6, '#78350f'], [1, '#2a1002']]), stroke: '#1c0a00', 'stroke-width': 1 }),
        s('rect', { x: bx - 16, y: bb - 56, width: 4, height: 44, rx: 2, fill: '#ffffff', 'fill-opacity': 0.3 }),
        s('rect', { x: bx - 19, y: bb - 44, width: 38, height: 22, rx: 3, fill: '#ffffff', stroke: '#d6d3d1', 'stroke-width': 1 }),
        text(bx, bb - 32.5, tr('Йод'), { size: 13, weight: 700, fill: '#7c2d12' }),
      );

      // ── Капельная пластинка: белый фарфор с лунками ──
      svg.append(
        text((DISH.x1 + DISH.x2) / 2, 386, tr('Пробы с йодом, мин'), { size: 14, weight: 600, fill: '#475569' }),
        floorShadow((DISH.x1 + DISH.x2) / 2, BENCH + 1, 190, d, 10),
        s('rect', { x: DISH.x1, y: DISH.top + 8, width: DISH.x2 - DISH.x1, height: DISH.bottom - DISH.top + 6, rx: 10, fill: '#cbd5e1' }),
        s('rect', { x: DISH.x1, y: DISH.top, width: DISH.x2 - DISH.x1, height: DISH.bottom - DISH.top, rx: 10, fill: d.lin([[0, '#ffffff'], [1, '#eef2f6']], 'v'), stroke: '#cbd5e1', 'stroke-width': 1.2 }),
      );
      const hollow = d.lin([[0, '#c7d0db'], [0.5, '#eef2f6'], [1, '#ffffff']], 'v');
      for (let i = 0; i < WELLS; i++) {
        const cx = WELL_X(i);
        const sample = s('ellipse', { cx, cy: WELL_Y + 1, rx: 9, ry: 5.2, fill: MILKY, opacity: 0 });
        svg.append(
          text(cx, 414, String(i), { size: 13, weight: 600, fill: '#64748b' }),
          s('ellipse', { cx, cy: WELL_Y, rx: 11.5, ry: 7.5, fill: hollow, stroke: '#b8c2ce', 'stroke-width': 1 }),
          sample,
        );
        wells.push(sample);
      }

      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt, now) {
      const T = params.T;
      plate.setTemp(T);
      plate.setHeat(Math.max(0, (T - 40) / 60));
      knobPointer.setAttribute('transform', `rotate(${-135 + (T / 100) * 270} ${KNOB.x} ${KNOB.y})`);
      const colTop = 380 - (T / 100) * 240;
      column.setAttribute('y', colTop);
      column.setAttribute('height', THERMO.bulb - colTop);
      iceGroup.setAttribute('opacity', Math.max(0, Math.min(1, (6 - T) / 4)));

      // Кипение — у 100 °C, пар — над горячей водой
      if (T >= 92) {
        acc += dt * (T - 90) * 3;
        while (acc >= 1) {
          acc -= 1;
          boil.spawn(TANK.x1 + 14 + Math.random() * (TANK.x2 - TANK.x1 - 28), TANK.bottom - 6, 2 + Math.random() * 3);
        }
      }
      boil.update(dt, WATER_Y + 2, 0.4);
      const steamOn = Math.max(0, Math.min(1, (T - 60) / 30));
      for (const p of steam) {
        const k = (now * 0.35 + p.phase) % 1;
        p.e.setAttribute('cx', p.x + Math.sin(now + p.phase * 9) * 6);
        p.e.setAttribute('cy', TANK.top - 18 - k * 70);
        p.e.setAttribute('opacity', steamOn * 0.55 * (1 - k));
      }

      // Лунки догоняют регулятор постепенно — пробы появляются одна за другой
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * 4) : Math.max(params.time, shownTime - dt * 8);

      updatePipette(dt);
      updateDropper(dt);

      // Клейстер мутный, пока крахмала много; расщеплённый — почти прозрачный
      const S = starchLeft(params, shownTime);
      paste.setAttribute('fill-opacity', (0.12 + 0.86 * S).toFixed(3));
      froth.forEach((c) => c.setAttribute('opacity', frothK));

      for (let i = 0; i < WELLS; i++) {
        const filled = i <= shownTime + 1e-6;
        wells[i].setAttribute('opacity', filled ? 1 : 0);
        wells[i].setAttribute('fill', i < stained ? iodineTint(starchLeft(params, i)) : MILKY);
      }

    },
  });

  // ── Пипетка ──
  function startDrip() {
    pip = 'drip';
    dripT = 0;
    Object.assign(pipPos, { x: MOUTH.x, y: MOUTH.y, angle: 0 });
    if (params.saliva !== 1) set('saliva', 1);
  }

  function updatePipette(dt) {
    if (params.saliva === 1 && (pip === 'rest' || pip === 'drag')) pip = 'fly';
    if (pip === 'fly') {
      const k = Math.min(1, dt * 6);
      pipPos.x += (MOUTH.x - pipPos.x) * k;
      pipPos.y += (MOUTH.y - pipPos.y) * k;
      pipPos.angle += (0 - pipPos.angle) * k;
      if (Math.hypot(pipPos.x - MOUTH.x, pipPos.y - MOUTH.y) < 2) startDrip();
    } else if (pip === 'drip') {
      // Три капли с интервалом: каждая падает на поверхность клейстера
      const before = Math.floor(dripT / 0.28);
      dripT += dt;
      const after = Math.floor(dripT / 0.28);
      if (after > before && before < 3) {
        const free = drops.find((p) => !p.live);
        if (free) Object.assign(free, { y: MOUTH.y + 4, v: 0, live: true });
      }
      pipetteFill.setAttribute('height', Math.max(0, 42 * (1 - dripT / 0.9)));
      pipetteFill.setAttribute('y', -4 - Math.max(0, 42 * (1 - dripT / 0.9)));
      if (dripT > 1.2) pip = 'back';
    } else if (pip === 'back') {
      const k = Math.min(1, dt * 5);
      pipPos.x += (PIPETTE_REST.x - pipPos.x) * k;
      pipPos.y += (PIPETTE_REST.y - pipPos.y) * k;
      pipPos.angle += (PIPETTE_REST.angle - pipPos.angle) * k;
      if (Math.hypot(pipPos.x - PIPETTE_REST.x, pipPos.y - PIPETTE_REST.y) < 1) pip = 'used';
    } else if (pip === 'used') {
      Object.assign(pipPos, PIPETTE_REST);
    }
    if (pip === 'used') {
      pipetteFill.setAttribute('height', 0);
      frothK = Math.min(1, frothK + dt * 2);
    }
    for (const p of drops) {
      if (!p.live) {
        p.c.setAttribute('opacity', 0);
        continue;
      }
      p.v += 900 * dt;
      p.y += p.v * dt;
      if (p.y >= PASTE_Y - 2) {
        p.live = false;
        frothK = Math.min(1, frothK + 0.34);
      }
      p.c.setAttribute('cx', MOUTH.x);
      p.c.setAttribute('cy', p.y);
      p.c.setAttribute('opacity', p.live ? 1 : 0);
    }
    pipette.style.pointerEvents = pip === 'rest' || pip === 'drag' ? '' : 'none';
    if (!held.has(pipette)) place(pipette, pip === 'rest' || pip === 'used' ? pipetteHome : topLayer);
    pipette.setAttribute('transform', `translate(${pipPos.x.toFixed(1)} ${pipPos.y.toFixed(1)}) rotate(${pipPos.angle.toFixed(1)})`);
  }

  // ── Капельница с йодом ──
  function startSweep() {
    drp = 'sweep';
    Object.assign(drpPos, { x: WELL_X(0), y: SWEEP_Y, angle: 0 });
    if (params.iodine !== 1) set('iodine', 1);
  }

  function updateDropper(dt) {
    if (params.iodine === 1 && (drp === 'rest' || drp === 'drag')) drp = 'fly';
    if (drp === 'fly') {
      const k = Math.min(1, dt * 6);
      drpPos.x += (WELL_X(0) - drpPos.x) * k;
      drpPos.y += (SWEEP_Y - drpPos.y) * k;
      if (Math.hypot(drpPos.x - WELL_X(0), drpPos.y - SWEEP_Y) < 2) startSweep();
    } else if (drp === 'sweep') {
      // Капельница идёт над лунками слева направо — каждая проба окрашивается, когда над ней капля
      drpPos.x += dt * 260;
      drpPos.y = SWEEP_Y - Math.abs(Math.sin((drpPos.x - WELL_X(0)) / 29.5 * Math.PI)) * 6;
      stained = Math.max(stained, Math.min(WELLS, Math.floor((drpPos.x - WELL_X(0)) / 29.5) + 1));
      if (drpPos.x >= WELL_X(WELLS - 1)) {
        stained = WELLS;
        drp = 'back';
      }
    } else if (drp === 'back') {
      const k = Math.min(1, dt * 5);
      drpPos.x += (DROPPER_REST.x - drpPos.x) * k;
      drpPos.y += (DROPPER_REST.y - drpPos.y) * k;
      if (Math.hypot(drpPos.x - DROPPER_REST.x, drpPos.y - DROPPER_REST.y) < 1) drp = 'used';
    } else if (drp === 'used') {
      Object.assign(drpPos, DROPPER_REST);
      stained = WELLS;
    }
    dropper.style.pointerEvents = drp === 'rest' || drp === 'drag' ? '' : 'none';
    if (!held.has(dropper)) place(dropper, drp === 'rest' || drp === 'used' ? dropperHome : topLayer);
    dropper.setAttribute('transform', `translate(${drpPos.x.toFixed(1)} ${drpPos.y.toFixed(1)}) rotate(${drpPos.angle})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  // Взятый инструмент поднимаем наверх до того, как draggable() захватит указатель (обработчик зарегистрирован раньше)
  // Пока инструмент держат, кадр анимации не должен переносить его обратно в посуду
  const held = new Set();
  for (const [node, state] of [[pipette, () => pip], [dropper, () => drp]]) {
    node.addEventListener('pointerdown', () => {
      if (state() !== 'rest') return;
      held.add(node);
      place(node, topLayer);
    });
    const release = () => held.delete(node);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
  }

  // Перенос мышью/пальцем: держим инструмент за ту точку, за которую взяли
  const carry = (state, pos, setState) => ({
    onDrag(x, y) {
      if (state() !== 'rest' && state() !== 'drag') return;
      if (state() === 'rest') {
        grab.dx = pos.x - x;
        grab.dy = pos.y - y;
        setState('drag');
      }
      pos.x = Math.max(20, Math.min(940, x + grab.dx));
      pos.y = Math.max(60, Math.min(BENCH - 4, y + grab.dy));
      pos.angle = 0;
    },
  });

  draggable(scene, pipette, {
    ...carry(() => pip, pipPos, (v) => { pip = v; }),
    onEnd() {
      if (pip !== 'drag') return;
      // Кончик пипетки поднесён к горлышку пробирки — слюна капает в клейстер
      if (Math.abs(pipPos.x - MOUTH.x) < 40 && pipPos.y > TUBE.top - 70 && pipPos.y < TUBE.top + 90) {
        pip = 'fly';
        set('saliva', 1);
      } else {
        pip = 'rest';
        Object.assign(pipPos, PIPETTE_REST);
      }
    },
  });

  draggable(scene, dropper, {
    ...carry(() => drp, drpPos, (v) => { drp = v; }),
    onEnd() {
      if (drp !== 'drag') return;
      // Капельница над пластинкой — йод капают во все лунки с пробами
      if (drpPos.x > DISH.x1 - 30 && drpPos.x < DISH.x2 + 10 && drpPos.y > DISH.top - 110 && drpPos.y < DISH.bottom) {
        drp = 'fly';
        set('iodine', 1);
      } else {
        drp = 'rest';
        Object.assign(drpPos, DROPPER_REST);
      }
    },
  });

  // Ручка плитки: ведём мышью влево-вправо — меняется температура бани
  draggable(scene, knob, {
    onDrag: (x) => set('T', Math.round(Math.max(0, Math.min(100, ((x - (KNOB.x - 100)) / 200) * 100)))),
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
