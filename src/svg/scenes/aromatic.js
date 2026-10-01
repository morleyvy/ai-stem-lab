// Сцена «Бензол, толуол, фенол»: вытяжной шкаф (бензол и фенол ядовиты, бензол и толуол
// легко воспламеняются — поэтому греют не спиртовкой, а электроплиткой с водяной баней).
// Слева — склянки с бензолом, толуолом и фенольной водой; в центре — водяная баня на плитке,
// в ней закреплённая в штативе пробирка и термометр; справа — склянки с реактивами и капельницами:
// бромная вода, подкисленный раствор KMnO₄ и раствор FeCl₃.
//   щелчок по склянке с веществом → вещество наливается в чистую пробирку (substance);
//   капельницу переносят к горлышку пробирки или просто нажимают на неё → реактив капает (reagent);
//   щелчок по плитке → баня греется до 80 °C или остывает до 20 °C, ручку плитки можно поворачивать (T).
// Бензол и толуол с водой не смешиваются и легче её — сверху лежит бесцветный органический слой,
// в который из бромной воды переходит бром (слой оранжевеет). Окраска гаснет по той же константе
// скорости, что считает модель, а часы на табло показывают модельное время опыта при текущей температуре бани.

import { bubblePool, createScene, draggable, floorShadow, hotplate, mixHex, readout, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 456;
const PLATE = { x: 430, y: 410, w: 236 };
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 };
const BATH = { x: 430, bottom: 402, w: 176, h: 160, level: 0.5 };
const BATH_TOP = BATH.bottom - BATH.h;
const WATER_Y = BATH.bottom - BATH.h * BATH.level;
const TUBE = { x: 450, top: 176, bottom: 392, w: 40 };
const THERMO = { x: 372, top: 176, bulb: 390 };
const ROD = { x: 604, top: 120 };
const ARM_Y = 204;
const MOUTH = { x: TUBE.x, y: TUBE.top + 12 }; // где капельница держится над горлышком

// Высота слоёв в пробирке, px: 2 мл вещества и 3 мл реактива
const ORG_H = 46;
const AQ_H = 66;
const INNER_BOTTOM = TUBE.bottom - 3;

const SUB_X = [86, 170, 254];
const REAG_X = [702, 800, 898];
const BOTTLE = { w: 60, h: 86 };

// Цвета: бромная вода — оранжево-жёлтая, KMnO₄ — фиолетовый, FeCl₃ — жёлто-бурый
const REAGENT_COLOR = ['#eef2f7', '#e39a2d', '#7a1e8c', '#dca73a'];
const CLEAR = '#b9d3ea'; // бесцветная жидкость: лёгкий голубоватый отлив, чтобы слой был виден
const BROMINE_ORG = '#d9661c'; // бром, перешедший в бензол или толуол
const PHENOL_VIOLET = '#4c1d7a'; // комплекс железа(III) с фенолом
const OXIDIZED_PHENOL = '#e8d6ab'; // продукты окисления фенола слегка буреют

// Скорость часов сцены: 4 модельные минуты в секунду — 5 минут наблюдения проходят за ≈ 1,3 с
const MIN_PER_S = 4;
const OBSERVE = 5;

function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

const lerp = (a, b, k) => a + (b - a) * k;

export function aromaticScene(container, params, set, { rate, SUBSTANCES }) {
  // Пробирка: что в ней сейчас показано и как далеко зашло добавление
  // left — доля ещё не обесцветившегося реактива, age — модельные минуты с добавления реактива
  // (по ним идёт экстракция брома и развитие окраски с FeCl₃), clock — табло: время опыта при текущей температуре
  const tube = { sub: params.substance, reag: 0, fill: 1, added: 0, clock: 0, age: 0, left: 1 };
  let shownT = params.T;
  let knob, sediment, orgRect, aqRect, interface_, surface, milky, column, timeBox, plate, knobPointer, steamOn;
  const flakes = [];
  const drops = [];
  const steam = [];
  const subMarks = [];
  const reagMarks = [];
  let boil;
  let boilAcc = 0;
  let topLayer;

  // Капельницы: rest — в склянке, drag — в руке, fly — летит к пробирке, drip — капает, back — возвращается
  const droppers = REAG_X.map((x, i) => ({ i, x, state: 'rest', pos: { x, y: BENCH - 26 }, rest: { x, y: BENCH - 26 }, node: null, home: null, fill: null, dripT: 0, moved: false, grab: { dx: 0, dy: 0 } }));

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'hood' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ── Штатив: основание, стержень, лапка с пробиркой ──
      svg.append(
        floorShadow(ROD.x, BENCH + 2, 56, d),
        s('rect', { x: ROD.x - 50, y: BENCH - 12, width: 100, height: 12, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
        s('rect', { x: ROD.x - 5, y: ROD.top, width: 10, height: BENCH - 12 - ROD.top, rx: 3, fill: d.url('metal') }),
        s('rect', { x: ROD.x - 12, y: ARM_Y - 10, width: 24, height: 20, rx: 4, fill: d.lin([[0, '#475569'], [0.5, '#94a3b8'], [1, '#334155']]) }),
        s('rect', { x: TUBE.x + TUBE.w / 2 + 4, y: ARM_Y - 4, width: ROD.x - 12 - TUBE.x - TUBE.w / 2 - 4, height: 8, rx: 3, fill: d.lin([[0, '#cbd5e1'], [1, '#64748b']], 'v') }),
      );

      // ── Плитка и водяная баня ──
      plate = hotplate(d, PLATE);
      plate.g.style.cursor = 'pointer';
      plate.g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('T', params.T > 20 ? 20 : 80);
      });
      touchTarget(plate.g);
      knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
      knob = s('g', {}, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 17, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
        knobPointer,
      ]);
      svg.append(plate.g, knob);

      // Баня: стакан с водой; пузыри у дна, когда вода горячая
      const bathW = BATH.w;
      const bathClip = `bath${uid}`;
      defs.append(s('clipPath', { id: bathClip }, [s('rect', { x: BATH.x - bathW / 2, y: BATH_TOP, width: bathW, height: BATH.h, rx: 14 })]));
      svg.append(
        floorShadow(BATH.x, BATH.bottom + 2, bathW * 0.6, d),
        s('rect', { x: BATH.x - bathW / 2, y: BATH_TOP, width: bathW, height: BATH.h, rx: 14, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: BATH.x - bathW / 2, y: WATER_Y, width: bathW, height: BATH.bottom - WATER_Y, fill: '#cfe7f3', 'fill-opacity': 0.7, 'clip-path': `url(#${bathClip})` }),
        s('rect', { x: BATH.x - bathW / 2, y: WATER_Y, width: bathW, height: BATH.bottom - WATER_Y, fill: d.lin([[0, '#ffffff', 0.2], [1, '#0f172a', 0.1]], 'v'), 'clip-path': `url(#${bathClip})` }),
      );
      const bathContent = s('g', { 'clip-path': `url(#${bathClip})` });
      svg.append(bathContent);
      boil = bubblePool(bathContent, 22, { color: '#f8fafc' });

      // Термометр в бане
      column = s('rect', { x: THERMO.x - 1.8, width: 3.6, rx: 1.8, fill: '#dc2626' });
      svg.append(
        s('rect', { x: THERMO.x - 7, y: THERMO.top, width: 14, height: THERMO.bulb - THERMO.top, rx: 7, fill: d.lin([[0, '#ffffff', 0.6], [0.5, '#f8fafc', 0.25], [1, '#cbd5e1', 0.55]]), stroke: '#94a3b8', 'stroke-width': 1.2 }),
        ...Array.from({ length: 11 }, (_, i) => s('line', { x1: THERMO.x + 2.5, x2: THERMO.x + (i % 5 ? 5.5 : 7), y1: 378 - i * 18, y2: 378 - i * 18, stroke: '#64748b', 'stroke-width': 1 })),
        column,
        s('circle', { cx: THERMO.x, cy: THERMO.bulb, r: 7.5, fill: d.rad(['#f87171', '#991b1b']) }),
      );

      // ── Пробирка: органический слой сверху, водный снизу, осадок у дна ──
      const tubeClip = `tube${uid}`;
      defs.append(s('clipPath', { id: tubeClip }, [s('path', { d: tubePath(TUBE.x, TUBE.top, INNER_BOTTOM, TUBE.w - 5) })]));
      const tubeContent = s('g', { 'clip-path': `url(#${tubeClip})` });
      aqRect = s('rect', { x: TUBE.x - 22, width: 44, fill: CLEAR, 'fill-opacity': 0.88 });
      orgRect = s('rect', { x: TUBE.x - 22, width: 44, fill: CLEAR, 'fill-opacity': 0.75 });
      milky = s('rect', { x: TUBE.x - 22, width: 44, fill: '#f5f3ee', opacity: 0 });
      // Слой осадка на дне: хлопья трибромфенола оседают белой рыхлой массой
      sediment = s('path', { d: `M${TUBE.x - 20} ${INNER_BOTTOM - 22} Q${TUBE.x - 8} ${INNER_BOTTOM - 28} ${TUBE.x} ${INNER_BOTTOM - 24} Q${TUBE.x + 10} ${INNER_BOTTOM - 29} ${TUBE.x + 20} ${INNER_BOTTOM - 22} V${INNER_BOTTOM + 4} H${TUBE.x - 20} Z`, fill: '#fbfaf7', stroke: '#a8b0bd', 'stroke-width': 1, opacity: 0 });
      interface_ = s('line', { x1: TUBE.x - 20, x2: TUBE.x + 20, stroke: '#7c93ab', 'stroke-width': 1.4, 'stroke-opacity': 0.8, opacity: 0 });
      surface = s('ellipse', { cx: TUBE.x, rx: 17, ry: 2.6, fill: '#ffffff', 'fill-opacity': 0.6, stroke: '#7c93ab', 'stroke-opacity': 0.7, 'stroke-width': 1 });
      tubeContent.append(aqRect, orgRect, milky, sediment);
      // Хлопья трибромфенола: оседают на дно и мутят раствор
      for (let i = 0; i < 26; i++) {
        const c = s('circle', { cx: TUBE.x - 14 + ((i * 37) % 29), cy: INNER_BOTTOM - 10 - ((i * 13) % 40), r: 1.8 + (i % 3) * 0.8, fill: '#fafafa', stroke: '#8b95a5', 'stroke-width': 0.8, opacity: 0 });
        flakes.push(c);
        tubeContent.append(c);
      }
      tubeContent.append(
        s('rect', { x: TUBE.x - 22, y: TUBE.top, width: 44, height: TUBE.bottom - TUBE.top, fill: d.lin([[0, '#0f172a', 0.12], [0.35, '#ffffff', 0.22], [1, '#0f172a', 0.15]]) }),
        interface_,
        surface,
      );
      for (let i = 0; i < 4; i++) {
        const c = s('ellipse', { rx: 2.6, ry: 3.4, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.7, opacity: 0, 'pointer-events': 'none' });
        drops.push({ c, y: 0, v: 0, live: false });
      }
      svg.append(
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.3 }),
        tubeContent,
        ...drops.map((p) => p.c),
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 3, y: TUBE.top - 3, width: TUBE.w + 6, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 + 5, y: TUBE.top + 10, width: 3.5, height: TUBE.bottom - TUBE.top - 36, rx: 1.75, fill: '#ffffff', 'fill-opacity': 0.75 }),
        // Лапка штатива обжимает пробирку
        s('rect', { x: TUBE.x - TUBE.w / 2 - 6, y: ARM_Y - 9, width: TUBE.w + 12, height: 18, rx: 5, fill: d.lin([[0, '#475569'], [0.5, '#cbd5e1'], [1, '#334155']]), stroke: '#334155', 'stroke-width': 1 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 2, y: ARM_Y - 6, width: TUBE.w + 4, height: 12, rx: 3, fill: '#7c5a3a', 'fill-opacity': 0.85 }),
      );
      // Погружённые части пробирки и термометра видны сквозь воду бани
      svg.append(
        s('rect', { x: TUBE.x - TUBE.w / 2 - 2, y: WATER_Y, width: TUBE.w + 4, height: TUBE.bottom - WATER_Y + 2, rx: 8, fill: '#bcd8e6', 'fill-opacity': 0.22 }),
        s('rect', { x: THERMO.x - 9, y: WATER_Y, width: 18, height: THERMO.bulb - WATER_Y + 9, rx: 8, fill: '#bcd8e6', 'fill-opacity': 0.25 }),
        s('line', { x1: BATH.x - bathW / 2 + 3, x2: BATH.x + bathW / 2 - 3, y1: WATER_Y, y2: WATER_Y, stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': 2 }),
        s('rect', { x: BATH.x - bathW / 2, y: BATH_TOP, width: bathW, height: BATH.h, rx: 14, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 3 }),
        s('path', { d: `M${BATH.x - bathW / 2} ${BATH_TOP} H${BATH.x + bathW / 2}`, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }),
        s('rect', { x: BATH.x - bathW / 2 + 10, y: BATH_TOP + 16, width: 8, height: BATH.h - 40, rx: 4, fill: '#ffffff', 'fill-opacity': 0.6 }),
      );

      // Пар над горячей баней
      for (let i = 0; i < 5; i++) {
        const e = s('ellipse', { rx: 14, ry: 7, fill: '#e2e8f0', opacity: 0, 'pointer-events': 'none' });
        svg.append(e);
        steam.push({ e, x: BATH.x - 66 + i * 33, phase: i / 5 });
      }

      // ── Склянки с веществами ──
      svg.append(text(SUB_X[1], 300, tr('Вещества'), { size: 15, weight: 700, fill: '#334155' }));
      SUBSTANCES.forEach((sub, i) => {
        const x = SUB_X[i];
        const mark = s('rect', { x: x - 38, y: BENCH - 130, width: 76, height: 130, rx: 12, fill: '#bae6fd', 'fill-opacity': 0.45, stroke: '#0ea5e9', 'stroke-width': 2, opacity: 0 });
        subMarks.push(mark);
        const g = s('g', {}, [
          floorShadow(x, BENCH + 2, 34, d),
          ...bottle(d, x, CLEAR, 0.35),
          // Притёртая стеклянная пробка
          s('rect', { x: x - 8, y: BENCH - BOTTLE.h - 24, width: 16, height: 14, rx: 3, fill: d.lin([[0, '#e2e8f0'], [0.5, '#ffffff'], [1, '#cbd5e1']]), stroke: '#94a3b8', 'stroke-width': 1 }),
          s('rect', { x: x - 27, y: BENCH - 52, width: 54, height: 24, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
          text(x, BENCH - 39.5, tr(capital(sub.name)), { size: 13, weight: 700, fill: '#1e3a8a' }),
        ]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('substance', i);
          if (params.substance === i) freshTube();
        });
        touchTarget(g, 12);
        svg.append(mark, g, text(x, BENCH + 36, sub.formula.split(' ')[1], { size: 14, weight: 600, fill: '#e2e8f0' }));
      });

      // ── Склянки с реактивами и капельницами ──
      svg.append(text(REAG_X[1], 300, tr('Реактивы'), { size: 15, weight: 700, fill: '#334155' }));
      const captions = [tr('бромная вода'), 'KMnO₄ (H⁺)', 'FeCl₃'];
      const labels = ['Br₂', 'KMnO₄', 'FeCl₃'];
      for (const dr of droppers) {
        const x = dr.x;
        const mark = s('rect', { x: x - 38, y: BENCH - 140, width: 76, height: 140, rx: 12, fill: '#ddd6fe', 'fill-opacity': 0.4, stroke: '#7c3aed', 'stroke-width': 2, opacity: 0 });
        reagMarks.push(mark);
        dr.fill = s('rect', { x: -1.8, y: -34, width: 3.6, height: 30, fill: REAGENT_COLOR[dr.i + 1], 'fill-opacity': 0.95 });
        dr.node = s('g', {}, [
          // Зона захвата накрывает и склянку: нажатие на склянку тоже берёт капельницу
          s('rect', { x: -31, y: -110, width: 62, height: 134, fill: '#000', 'fill-opacity': 0 }),
          s('path', { d: 'M-1.1 0 L-3 -14 V-70 H3 V-14 L1.1 0 Z', fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.1 }),
          dr.fill,
          s('rect', { x: -11, y: -76, width: 22, height: 8, rx: 2, fill: '#1f2937' }),
          s('path', { d: 'M-7 -76 V-90 Q-9 -100 0 -104 Q9 -100 7 -90 V-76 Z', fill: d.lin([[0, '#111827'], [0.45, '#4b5563'], [1, '#111827']]) }),
        ]);
        dr.home = s('g', {}, [dr.node]);
        svg.append(mark, floorShadow(x, BENCH + 2, 34, d), dr.home);
        // Склянка поверх капельницы, но события пропускает к ней
        svg.append(
          s('g', { 'pointer-events': 'none' }, [
            ...bottle(d, x, REAGENT_COLOR[dr.i + 1], 0.8),
            s('rect', { x: x - 25, y: BENCH - 52, width: 50, height: 24, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
            text(x, BENCH - 39.5, labels[dr.i], { size: 14, weight: 700, fill: '#7c2d12' }),
          ]),
          text(x, BENCH + 36, captions[dr.i], { size: 13, weight: 600, fill: '#e2e8f0' }),
        );
      }

      // ── Табло: время после добавления реактива ──
      timeBox = readout(d, { x: 650, y: 150, w: 150, caption: tr('Время, мин'), color: '#fcd34d' });
      svg.append(timeBox.g);
      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt, now) {
      // Баня догоняет заданную температуру за пару секунд — видно, как нагревается
      shownT += Math.sign(params.T - shownT) * Math.min(Math.abs(params.T - shownT), dt * 40);
      plate.setTemp(shownT);
      plate.setHeat(Math.max(0, (shownT - 20) / 60));
      knobPointer.setAttribute('transform', `rotate(${-135 + ((params.T - 20) / 60) * 270} ${KNOB.x} ${KNOB.y})`);
      const colTop = 378 - (shownT / 100) * 180;
      column.setAttribute('y', colTop.toFixed(1));
      column.setAttribute('height', (THERMO.bulb - colTop).toFixed(1));

      if (shownT >= 70) {
        boilAcc += dt * (shownT - 66) * 0.8;
        while (boilAcc >= 1) {
          boilAcc -= 1;
          boil.spawn(BATH.x - 70 + Math.random() * 140, BATH.bottom - 8, 1.5 + Math.random() * 2.5);
        }
      }
      boil.update(dt, WATER_Y + 2, 0.3);
      steamOn = Math.max(0, Math.min(1, (shownT - 50) / 30));
      for (const p of steam) {
        const k = (now * 0.35 + p.phase) % 1;
        p.e.setAttribute('cx', (p.x + Math.sin(now + p.phase * 9) * 6).toFixed(1));
        p.e.setAttribute('cy', (BATH_TOP - 14 - k * 60).toFixed(1));
        p.e.setAttribute('opacity', (steamOn * 0.5 * (1 - k)).toFixed(2));
      }

      updateTube(dt);
      droppers.forEach((dr) => updateDropper(dr, dt));
      drawTube(dt);

      subMarks.forEach((m, i) => m.setAttribute('opacity', i === params.substance ? 1 : 0));
      reagMarks.forEach((m, i) => m.setAttribute('opacity', i + 1 === params.reagent ? 1 : 0));
      timeBox.set(params.reagent && tube.reag ? tube.clock.toFixed(1).replace('.', ',') : '—');
    },
  });

  // ── Пробирка ──
  // Новое вещество или новый реактив — это свежая пробирка: старое содержимое выливается,
  // наливается вещество, затем выбранный реактив подлетает на капельнице (если его не принесли рукой)
  const want = { sub: params.substance, reag: params.reagent };
  let phase = 'pour'; // drain → pour → ready
  tube.fill = 0;
  function freshTube() {
    want.sub = params.substance;
    want.reag = params.reagent;
    phase = 'drain';
  }

  function updateTube(dt) {
    if (params.substance !== want.sub || params.reagent !== want.reag) freshTube();
    if (phase === 'drain') {
      tube.fill = Math.max(0, tube.fill - dt * 4);
      tube.added = Math.max(0, tube.added - dt * 4);
      if (tube.fill <= 0 && tube.added <= 0) {
        tube.sub = want.sub;
        tube.reag = 0;
        tube.clock = 0;
        tube.age = 0;
        tube.left = 1;
        phase = 'pour';
      }
    } else if (phase === 'pour') {
      tube.fill = Math.min(1, tube.fill + dt * 2.5);
      if (tube.fill >= 1) {
        phase = 'ready';
        const dr = droppers[want.reag - 1];
        if (dr && dr.state === 'rest') dr.state = 'fly';
      }
    } else if (tube.reag) {
      tube.age += dt * MIN_PER_S;
      // Температуру сменили — опыт продолжается в той же пробирке: отсчёт 5 минут начинается заново,
      // когда баня дойдёт до новой температуры, а реактив расходуется уже с новой скоростью.
      // Поэтому после нагрева толуол обесцвечивает остаток KMnO₄ за те же ≈ 2 мин, что пишет модель.
      if (Math.abs(shownT - params.T) > 0.5) tube.clock = 0;
      else if (tube.clock < OBSERVE) {
        const step = Math.min(OBSERVE - tube.clock, dt * MIN_PER_S);
        tube.clock += step;
        tube.left *= Math.exp(-rate({ substance: tube.sub, reagent: tube.reag, T: params.T }) * step);
      }
    }
  }

  // Капля долетела до жидкости — слой реактива растёт; капли старого реактива уже не в счёт
  function dropLanded(dr) {
    if (dr.i + 1 !== want.reag || phase !== 'ready') return;
    tube.reag = dr.i + 1;
    tube.added = Math.min(1, tube.added + 0.34);
  }

  const liquidTop = () => INNER_BOTTOM - ORG_H * tube.fill - AQ_H * tube.added;

  function drawTube(dt) {
    const sub = SUBSTANCES[tube.sub];
    const r = tube.left;
    const rc = REAGENT_COLOR[tube.reag];
    const aqH = AQ_H * tube.added;
    const orgH = ORG_H * tube.fill;
    let aqColor = rc;
    let orgColor = CLEAR;
    let flakeK = 0;
    if (tube.reag === 1) {
      if (sub.organicLayer) {
        // Бром переходит из воды в неполярный слой бензола/толуола: вода бледнеет, верхний слой оранжевеет
        const ext = 1 - Math.exp(-1.2 * tube.age);
        aqColor = mixHex(rc, '#f5ecd6', 0.8 * ext);
        orgColor = mixHex(CLEAR, BROMINE_ORG, ext);
      } else {
        aqColor = mixHex('#efece4', rc, r);
        flakeK = 1 - r;
      }
    } else if (tube.reag === 2) {
      aqColor = mixHex(tube.sub === 2 ? OXIDIZED_PHENOL : CLEAR, rc, r);
    } else if (tube.reag === 3 && tube.sub === 2) {
      aqColor = mixHex(rc, PHENOL_VIOLET, 1 - Math.exp(-3 * tube.age));
    }

    if (sub.organicLayer) {
      // Два слоя: вода с реактивом внизу, вещество (плотность меньше 1 г/мл) сверху
      aqRect.setAttribute('y', (INNER_BOTTOM - aqH).toFixed(1));
      aqRect.setAttribute('height', (aqH + 4).toFixed(1));
      aqRect.setAttribute('fill', aqColor);
      orgRect.setAttribute('y', (INNER_BOTTOM - aqH - orgH).toFixed(1));
      orgRect.setAttribute('height', orgH.toFixed(1));
      orgRect.setAttribute('fill', orgColor);
      orgRect.setAttribute('fill-opacity', 0.8);
      interface_.setAttribute('y1', (INNER_BOTTOM - aqH).toFixed(1));
      interface_.setAttribute('y2', (INNER_BOTTOM - aqH).toFixed(1));
      interface_.setAttribute('opacity', aqH > 2 && orgH > 2 ? 1 : 0);
    } else {
      // Фенольная вода смешивается с водными растворами реактивов — один слой
      const h = aqH + orgH;
      const k = aqH / Math.max(1, h);
      aqRect.setAttribute('y', (INNER_BOTTOM - h).toFixed(1));
      aqRect.setAttribute('height', (h + 4).toFixed(1));
      aqRect.setAttribute('fill', mixHex(CLEAR, aqColor, tube.reag ? Math.min(1, k * 1.6) : 0));
      orgRect.setAttribute('height', 0);
      interface_.setAttribute('opacity', 0);
    }
    const top = liquidTop();
    surface.setAttribute('cy', top.toFixed(1));
    surface.setAttribute('opacity', tube.fill > 0.05 ? 1 : 0);
    milky.setAttribute('y', top.toFixed(1));
    milky.setAttribute('height', (INNER_BOTTOM - top + 4).toFixed(1));
    milky.setAttribute('opacity', (0.6 * flakeK * tube.added).toFixed(2));
    sediment.setAttribute('opacity', (flakeK * tube.added).toFixed(2));
    const shown = Math.round(flakes.length * flakeK * tube.added);
    flakes.forEach((c, i) => c.setAttribute('opacity', i < shown ? 1 : 0));

    for (const p2 of drops) {
      if (!p2.live) {
        p2.c.setAttribute('opacity', 0);
        continue;
      }
      p2.v += 900 * dt;
      p2.y += p2.v * dt;
      if (p2.y >= top - 2) {
        p2.live = false;
        dropLanded(p2.dr);
      }
      p2.c.setAttribute('cx', MOUTH.x);
      p2.c.setAttribute('cy', p2.y.toFixed(1));
      p2.c.setAttribute('fill', REAGENT_COLOR[p2.dr.i + 1]);
      p2.c.setAttribute('opacity', p2.live ? 1 : 0);
    }
  }

  // ── Капельницы ──
  function updateDropper(dr, dt) {
    const target = { x: MOUTH.x, y: MOUTH.y };
    if (dr.state === 'fly' && want.reag !== dr.i + 1) dr.state = 'back';
    if (dr.state === 'fly') {
      // Пока пробирку меняют, капельница ждёт над ней
      const k = Math.min(1, dt * 7);
      dr.pos.x = lerp(dr.pos.x, target.x, k);
      dr.pos.y = lerp(dr.pos.y, target.y, k);
      if (Math.hypot(dr.pos.x - target.x, dr.pos.y - target.y) < 2 && phase === 'ready') {
        dr.state = 'drip';
        dr.dripT = 0;
      }
    } else if (dr.state === 'drip') {
      const before = Math.floor(dr.dripT / 0.16);
      dr.dripT += dt;
      const after = Math.floor(dr.dripT / 0.16);
      if (after > before && before < 3) {
        const free = drops.find((p) => !p.live);
        if (free) Object.assign(free, { y: MOUTH.y + 4, v: 0, live: true, dr });
      }
      if (dr.dripT > 0.6) dr.state = 'back';
    } else if (dr.state === 'back') {
      const k = Math.min(1, dt * 6);
      dr.pos.x = lerp(dr.pos.x, dr.rest.x, k);
      dr.pos.y = lerp(dr.pos.y, dr.rest.y, k);
      if (Math.hypot(dr.pos.x - dr.rest.x, dr.pos.y - dr.rest.y) < 1) dr.state = 'rest';
    }
    if (dr.state === 'rest') Object.assign(dr.pos, dr.rest);
    dr.fill.setAttribute('height', dr.state === 'drip' ? Math.max(0, 30 * (1 - dr.dripT / 0.6)).toFixed(1) : 30);
    dr.fill.setAttribute('y', dr.state === 'drip' ? (-4 - Math.max(0, 30 * (1 - dr.dripT / 0.6))).toFixed(1) : -34);
    dr.node.style.pointerEvents = dr.state === 'rest' || dr.state === 'drag' ? '' : 'none';
    if (!held.has(dr.node)) place(dr.node, dr.state === 'rest' ? dr.home : topLayer);
    dr.node.setAttribute('transform', `translate(${dr.pos.x.toFixed(1)} ${dr.pos.y.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  const held = new Set();

  for (const dr of droppers) {
    // Взятую капельницу поднимаем над сценой до того, как draggable() захватит указатель
    dr.node.addEventListener('pointerdown', () => {
      if (dr.state !== 'rest') return;
      held.add(dr.node);
      dr.moved = false;
      place(dr.node, topLayer);
    });
    const release = () => held.delete(dr.node);
    dr.node.addEventListener('pointerup', release);
    dr.node.addEventListener('pointercancel', release);

    draggable(scene, dr.node, {
      onDrag(x, y) {
        if (dr.state !== 'rest' && dr.state !== 'drag') return;
        if (dr.state === 'rest') {
          dr.grab.dx = dr.pos.x - x;
          dr.grab.dy = dr.pos.y - y;
          dr.state = 'drag';
        }
        dr.pos.x = Math.max(20, Math.min(940, x + dr.grab.dx));
        dr.pos.y = Math.max(40, Math.min(BENCH - 4, y + dr.grab.dy));
        if (Math.hypot(dr.pos.x - dr.rest.x, dr.pos.y - dr.rest.y) > 6) dr.moved = true;
      },
      onEnd() {
        if (dr.state !== 'rest' && dr.state !== 'drag') return;
        // Кончик у горлышка пробирки — или простое нажатие без переноса (на телефоне так проще)
        const near = Math.abs(dr.pos.x - MOUTH.x) < 70 && dr.pos.y > TUBE.top - 90 && dr.pos.y < TUBE.top + 120;
        if (near || !dr.moved) {
          dr.state = 'fly';
          set('reagent', dr.i + 1);
          // Тот же реактив ещё раз — повтор опыта в чистой пробирке
          if (params.reagent === dr.i + 1) freshTube();
        } else {
          dr.state = 'back';
        }
      },
    });
  }

  // Ручку плитки ведут влево-вправо: 20…80 °C, как у регулятора
  draggable(scene, knob, {
    onDrag: (x) => set('T', 20 + Math.max(0, Math.min(1, (x - (KNOB.x - 90)) / 180)) * 60),
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}

// Склянка для реактивов: стеклянный корпус, плечики, горлышко; жидкость внутри
function bottle(d, x, color, opacity) {
  const b = BENCH - 2;
  const { w, h } = BOTTLE;
  const body = `M${x - w / 2} ${b - 6} V${b - h + 22} Q${x - w / 2} ${b - h + 8} ${x - 12} ${b - h + 2} V${b - h - 10} H${x + 12} V${b - h + 2} Q${x + w / 2} ${b - h + 8} ${x + w / 2} ${b - h + 22} V${b - 6} Q${x + w / 2} ${b} ${x + w / 2 - 6} ${b} H${x - w / 2 + 6} Q${x - w / 2} ${b} ${x - w / 2} ${b - 6} Z`;
  return [
    s('path', { d: body, fill: '#e2e8f0', 'fill-opacity': 0.35 }),
    s('path', { d: `M${x - w / 2 + 2} ${b - 6} V${b - h + 34} H${x + w / 2 - 2} V${b - 6} Q${x + w / 2 - 2} ${b - 2} ${x + w / 2 - 8} ${b - 2} H${x - w / 2 + 8} Q${x - w / 2 + 2} ${b - 2} ${x - w / 2 + 2} ${b - 6} Z`, fill: color, 'fill-opacity': opacity }),
    s('path', { d: body, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.6 }),
    s('rect', { x: x - w / 2 + 6, y: b - h + 26, width: 4, height: h - 40, rx: 2, fill: '#ffffff', 'fill-opacity': 0.6 }),
  ];
}

const capital = (w) => w[0].toUpperCase() + w.slice(1);
