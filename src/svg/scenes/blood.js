// Сцена «Состав крови и группы крови»: кабинет биологии. Слева — световой микроскоп, рядом на столе —
// предметное стекло с окрашенным мазком крови; в центре — крупно поле зрения окуляра. Справа —
// штатив с четырьмя пробирками крови (образцы № 1–4), склянки с сыворотками анти-A и анти-B
// с капельницами и белая пластинка с двумя каплями крови выбранного образца.
// Ученик сам переносит стекло на столик (slide = 1), щёлкает по револьверу — меняется объектив
// и увеличение, щёлкает по пробирке — на пластинке новые капли этой крови, переносит капельницу
// к своей капле (antiA / antiB = 1) — капля сыворотки смешивается с кровью, и, если на эритроцитах
// есть нужный агглютиноген, кровь распадается на тёмные хлопья (агглютинация).
// Клетки в поле зрения рисуются по тем же координатам препарата, по которым модель считает
// их число, поэтому картинка и показания совпадают при любом увеличении.

import { createScene, cylinderShade, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const MX = 125; // микроскоп: центр основания
const STAGE = { x: MX + 34, y: BENCH - 95 }; // где лежит стекло на предметном столике
const SLIDE_REST = { x: 312, y: BENCH - 10 };
const FIELD = { x: 420, y: 208, r: 165 };
const SCALE_BAR = [200, 50, 20]; // мкм — длина масштабной линейки при ×100, ×400, ×1000
const BAR_X = FIELD.x + 62; // табличка линейки целиком внутри круга поля зрения
const TUBES = [614, 641, 668, 695];
const TUBE = { top: 318, bottom: 444, w: 18 };
const BOTTLE_BOTTOM = 404;
const WELLS = [{ x: 782, serum: 'A', param: 'antiA', color: '#3b82f6' }, { x: 890, serum: 'B', param: 'antiB', color: '#ec4899' }];
const WELL_Y = 440;
const WELL_R = { x: 46, y: 16 };
const PLATE = { x1: 724, x2: 948, top: 414, bottom: 466 };
const CLUMPS = 20;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Кружок как часть одного path: сотни эритроцитов при ×400 — один элемент вместо тысячи
const dot = (x, y, r) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;

function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function bloodScene(container, params, set, { smear, agglutinates, MAGS, SIZE }) {
  let D, fieldView, emptyLight, fieldLayer, fadeLayer, barLine, barText, oilDrop;
  let slideNode, slideHome, slideLabel, topLayer, revolver;
  const objectives = [];
  const tubeNodes = [];
  const wells = [];
  const droppers = [];
  let shownMag = -1;
  let shownSlide = false;
  let fade = 1;

  // Предметное стекло: rest — на столе, drag — в руке, fly — летит на столик, on — на столике
  let sl = params.slide ? 'on' : 'rest';
  const slPos = params.slide ? { ...STAGE } : { ...SLIDE_REST };
  const grab = { dx: 0, dy: 0 };
  let shownSample = params.sample;

  const scene = createScene(container, {
    build(svg, d) {
      D = d;
      // Тема без окна: окно было лишним украшением и отвлекало от микроскопа и пластинки
      room(svg, d, { benchY: BENCH, theme: 'lab' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ---------- Микроскоп ----------
      const mx = MX;
      const metalBody = d.lin([[0, '#3f4652'], [0.35, '#6b7482'], [1, '#262b33']]);
      svg.append(
        floorShadow(mx + 10, BENCH + 2, 110, d),
        s('path', { d: `M${mx - 80} ${BENCH} L${mx - 70} ${BENCH - 26} H${mx + 96} L${mx + 106} ${BENCH} Z`, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
        s('rect', { x: mx - 70, y: BENCH - 27, width: 166, height: 3, rx: 1.5, fill: '#9ca3af', 'fill-opacity': 0.5 }),
        // Осветитель в основании горит — свет идёт снизу через препарат
        s('ellipse', { cx: mx + 24, cy: BENCH - 30, rx: 26, ry: 9, fill: d.rad([[0, '#fef9c3', 0.9], [1, '#fef9c3', 0]], 0.5, 0.5) }),
        s('ellipse', { cx: mx + 24, cy: BENCH - 30, rx: 18, ry: 5, fill: '#fef9c3', stroke: '#6b7280', 'stroke-width': 1.5 }),
        s('path', { d: `M${mx - 40} ${BENCH - 26} C ${mx - 80} ${BENCH - 110}, ${mx - 70} ${BENCH - 220}, ${mx - 10} ${BENCH - 262} L${mx + 8} ${BENCH - 236} C ${mx - 36} ${BENCH - 200}, ${mx - 44} ${BENCH - 110}, ${mx - 6} ${BENCH - 26} Z`, fill: metalBody }),
        // конденсор под столиком
        s('rect', { x: mx + 12, y: BENCH - 80, width: 24, height: 22, rx: 3, fill: cylinderShade(d, '#4b5563') }),
        s('rect', { x: mx - 40, y: BENCH - 92, width: 150, height: 12, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#111827']], 'v') }),
      );
      // Винт фокусировки — для узнаваемости прибора
      svg.append(
        s('circle', { cx: mx - 38, cy: BENCH - 150, r: 17, fill: d.rad(['#9ca3af', '#1f2937']) }),
        s('circle', { cx: mx - 38, cy: BENCH - 150, r: 7, fill: d.rad(['#d1d5db', '#4b5563']) }),
      );
      svg.append(s('g', { transform: `rotate(-18 ${mx + 24} ${BENCH - 250})` }, [
        s('rect', { x: mx + 6, y: BENCH - 330, width: 36, height: 100, rx: 4, fill: cylinderShade(d, '#4b5563') }),
        s('rect', { x: mx + 12, y: BENCH - 370, width: 24, height: 44, rx: 3, fill: cylinderShade(d, '#374151') }),
        s('rect', { x: mx + 9, y: BENCH - 374, width: 30, height: 8, rx: 3, fill: cylinderShade(d, '#1f2937') }),
        s('rect', { x: mx + 12, y: BENCH - 344, width: 24, height: 3, fill: '#9ca3af' }),
      ]));

      // Револьвер с тремя объективами; цветное кольцо — как маркировка настоящих объективов:
      // ×10 — жёлтое, ×40 — голубое, ×100 (иммерсионный) — белое с чёрным
      const rings = [['#facc15', 36], ['#38bdf8', 42], ['#f8fafc', 46]];
      revolver = s('g', { style: 'cursor: pointer' }, [
        s('rect', { x: mx - 30, y: BENCH - 232, width: 110, height: 116, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        s('path', { d: `M${mx - 14} ${BENCH - 200} Q ${mx + 24} ${BENCH - 222} ${mx + 64} ${BENCH - 200} L ${mx + 56} ${BENCH - 186} H ${mx - 6} Z`, fill: d.lin([[0, '#6b7280'], [1, '#1f2937']], 'v') }),
      ]);
      // Позиции: 0 — рабочая (вертикально над препаратом), 1 и 2 — отведённые в стороны
      const SLOTS = [
        { x: mx + 24, y: BENCH - 188, a: 0 },
        { x: mx - 3, y: BENCH - 188, a: 18 },
        { x: mx + 53, y: BENCH - 188, a: -18 },
      ];
      rings.forEach(([ring, len], i) => {
        const g = s('g', {}, [
          s('rect', { x: -10, y: 0, width: 20, height: len - 18, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
          s('rect', { x: -10, y: 14, width: 20, height: 4, fill: ring, stroke: i === 2 ? '#111827' : 'none', 'stroke-width': 1 }),
          s('rect', { x: -6, y: len - 19, width: 12, height: 18, rx: 2, fill: cylinderShade(d, '#9ca3af') }),
        ]);
        objectives.push({ g, slots: SLOTS });
        revolver.append(g);
      });
      svg.append(revolver);
      touchTarget(revolver, 10);
      revolver.addEventListener('click', () => set('mag', (params.mag + 1) % MAGS.length));

      // Капля иммерсионного масла между объективом ×100 и стеклом
      oilDrop = s('ellipse', { cx: STAGE.x, cy: STAGE.y - 5, rx: 7, ry: 3, fill: '#fcd34d', 'fill-opacity': 0.8, opacity: 0 });

      // Предметное стекло с мазком: начало координат — середина стекла
      slideNode = s('g', { style: 'cursor: grab' }, [
        s('rect', { x: -50, y: -22, width: 100, height: 34, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('rect', { x: -40, y: -3, width: 80, height: 6, rx: 1, fill: '#dbeafe', 'fill-opacity': 0.85, stroke: '#94a3b8', 'stroke-width': 0.8 }),
        s('rect', { x: -40, y: -3, width: 16, height: 6, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 0.6 }), // матовое поле для подписи
        s('ellipse', { cx: 8, cy: -3.5, rx: 24, ry: 2.6, fill: d.lin([[0, '#c084fc', 0.35], [0.4, '#e879a0', 0.85], [1, '#be185d', 0.6]]) }),
      ]);
      slideHome = s('g', {}, [slideNode]);
      slideLabel = text(SLIDE_REST.x, SLIDE_REST.y - 26, tr('Мазок крови'), { size: 13, weight: 600, fill: '#9f1239' });
      svg.append(
        floorShadow(SLIDE_REST.x, BENCH + 1, 52, d, 5),
        slideLabel,
        slideHome,
        oilDrop,
        // Лапки-зажимы столика прижимают стекло
        s('rect', { x: mx - 30, y: BENCH - 100, width: 16, height: 4, rx: 1, fill: '#9ca3af' }),
        s('rect', { x: mx + 82, y: BENCH - 100, width: 16, height: 4, rx: 1, fill: '#9ca3af' }),
      );

      // ---------- Поле зрения окуляра ----------
      const clip = `fov${uid}`;
      defs.append(s('clipPath', { id: clip }, [s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r })]));
      fieldView = s('g', { 'clip-path': `url(#${clip})` });
      emptyLight = s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: d.rad([[0, '#fffbeb'], [1, '#fdf2d6']], 0.5, 0.5) });
      fadeLayer = s('g');
      fieldLayer = s('g');
      // Масштабная линейка в углу поля — видно, во сколько раз выросли клетки
      barLine = s('rect', { y: FIELD.y + 96, height: 4, rx: 1, fill: '#1e293b' });
      barText = text(BAR_X, FIELD.y + 113, '', { size: 13, weight: 700, fill: '#1e293b' });
      const bar = s('g', {}, [s('rect', { x: BAR_X - 36, y: FIELD.y + 86, width: 72, height: 38, rx: 6, fill: '#ffffff', 'fill-opacity': 0.8 }), barLine, barText]);
      fieldView.append(emptyLight, fadeLayer, fieldLayer, bar);
      fieldView.append(s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: d.rad([[0, '#000000', 0], [0.8, '#000000', 0], [1, '#0f172a', 0.4]], 0.5, 0.5), 'pointer-events': 'none' }));
      svg.append(
        s('circle', { cx: FIELD.x, cy: FIELD.y + 8, r: FIELD.r + 14, fill: '#0f172a', 'fill-opacity': 0.12, filter: d.url('soft') }),
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 12, fill: d.lin([[0, '#4b5563'], [0.5, '#1f2937'], [1, '#111827']], 'v') }),
        fieldView,
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 1, fill: 'none', stroke: '#0b0f14', 'stroke-width': 3 }),
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 11, fill: 'none', stroke: '#9ca3af', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }),
        // Увеличение показано только в панели показаний — здесь просто подпись круга
        text(FIELD.x, FIELD.y + FIELD.r + 30, tr('Поле зрения'), { size: 14, weight: 600, fill: '#475569' }),
      );

      // ---------- Штатив с образцами крови ----------
      svg.append(
        text((TUBES[0] + TUBES[3]) / 2, 284, tr('Образцы крови'), { size: 13, weight: 600, fill: '#475569' }),
        floorShadow((TUBES[0] + TUBES[3]) / 2, BENCH + 1, 76, d, 7),
        s('rect', { x: TUBES[0] - 22, y: 362, width: TUBES[3] - TUBES[0] + 44, height: 10, rx: 3, fill: d.lin([[0, '#e7d3b5'], [1, '#c9ad85']], 'v'), stroke: '#a68a64', 'stroke-width': 1 }),
        s('rect', { x: TUBES[0] - 20, y: 372, width: 6, height: BENCH - 380, fill: '#c9ad85' }),
        s('rect', { x: TUBES[3] + 14, y: 372, width: 6, height: BENCH - 380, fill: '#b69871' }),
      );
      TUBES.forEach((x, i) => {
        const clipId = `tube${uid}${i}`;
        defs.append(s('clipPath', { id: clipId }, [s('path', { d: tubePath(x, TUBE.top, TUBE.bottom - 2, TUBE.w - 4) })]));
        const glow = s('rect', { x: x - 15, y: TUBE.top - 12, width: 30, height: TUBE.bottom - TUBE.top + 22, rx: 15, fill: '#fde68a', 'fill-opacity': 0.55, opacity: 0 });
        const g = s('g', { style: 'cursor: pointer' }, [
          s('rect', { x: x - 13, y: TUBE.top - 10, width: 26, height: TUBE.bottom - TUBE.top + 16, fill: '#000', 'fill-opacity': 0 }),
          glow,
          s('path', { d: tubePath(x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.35 }),
          s('rect', { x: x - 9, y: 372, width: 18, height: TUBE.bottom - 372, fill: d.lin([[0, '#7f1d1d'], [0.35, '#dc2626'], [1, '#7f1d1d']]), 'clip-path': `url(#${clipId})` }),
          s('path', { d: tubePath(x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.6 }),
          s('rect', { x: x - TUBE.w / 2 - 2, y: TUBE.top - 3, width: TUBE.w + 4, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
          s('rect', { x: x - 9, y: 334, width: 18, height: 20, rx: 2, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 0.8 }),
          text(x, 344.5, String(i + 1), { size: 13, weight: 700, fill: '#9f1239' }),
        ]);
        g.addEventListener('click', () => set('sample', i));
        touchTarget(g, 6);
        tubeNodes.push({ g, glow, x });
        svg.append(g);
      });
      // Передняя планка штатива — поверх пробирок
      svg.append(s('rect', { x: TUBES[0] - 22, y: 424, width: TUBES[3] - TUBES[0] + 44, height: 12, rx: 3, fill: d.lin([[0, '#e7d3b5'], [1, '#c9ad85']], 'v'), stroke: '#a68a64', 'stroke-width': 1 }));

      // ---------- Склянки с сыворотками и капельницы ----------
      WELLS.forEach((w) => {
        const bx = w.x;
        const bb = BOTTLE_BOTTOM;
        const dropper = s('g', { style: 'cursor: grab' }, [
          s('rect', { x: -26, y: -108, width: 52, height: 114, fill: '#000', 'fill-opacity': 0 }), // зона захвата — во всю ширину склянки
          s('path', { d: 'M-1.1 0 L-3 -14 V-70 H3 V-14 L1.1 0 Z', fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.1 }),
          s('rect', { x: -1.8, y: -34, width: 3.6, height: 30, fill: w.color, 'fill-opacity': 0.8 }),
          s('rect', { x: -11, y: -76, width: 22, height: 8, rx: 2, fill: '#1f2937' }),
          s('path', { d: 'M-7 -76 V-90 Q-9 -100 0 -104 Q9 -100 7 -90 V-76 Z', fill: d.lin([[0, '#111827'], [0.45, '#4b5563'], [1, '#111827']]) }),
        ]);
        const home = s('g', {}, [dropper]);
        const rest = { x: bx, y: bb - 4 };
        droppers.push({ w, node: dropper, home, rest, pos: { ...rest }, state: params[w.param] ? 'used' : 'rest', dripT: 0, drops: [] });
        // Склянка прозрачна для указателя: взяв её, ученик берёт капельницу, а не промахивается мимо груши
        const bottle = s('g', { 'pointer-events': 'none' });
        svg.append(floorShadow(bx, bb + 3, 34, d), home, bottle);
        bottle.append(
          s('path', { d: `M${bx - 26} ${bb - 4} V${bb - 50} Q${bx - 26} ${bb - 60} ${bx - 9} ${bb - 66} V${bb - 74} H${bx + 9} V${bb - 66} Q${bx + 26} ${bb - 60} ${bx + 26} ${bb - 50} V${bb - 4} Q${bx + 26} ${bb} ${bx + 22} ${bb} H${bx - 22} Q${bx - 26} ${bb} ${bx - 26} ${bb - 4} Z`, fill: d.lin([[0, w.color, 0.5], [0.3, w.color, 0.28], [1, w.color, 0.55]]), stroke: '#64748b', 'stroke-width': 1.2 }),
          s('rect', { x: bx - 20, y: bb - 52, width: 4, height: 42, rx: 2, fill: '#ffffff', 'fill-opacity': 0.5 }),
          s('rect', { x: bx - 24, y: bb - 42, width: 48, height: 22, rx: 3, fill: '#ffffff', stroke: '#d6d3d1', 'stroke-width': 1 }),
          text(bx, bb - 30.5, tr(w.serum === 'A' ? 'анти-A' : 'анти-B'), { size: 13, weight: 700, fill: w.serum === 'A' ? '#1d4ed8' : '#be185d' }),
        );
      });

      // ---------- Пластинка с каплями крови ----------
      svg.append(
        floorShadow((PLATE.x1 + PLATE.x2) / 2, BENCH + 1, 120, d, 9),
        s('rect', { x: PLATE.x1, y: PLATE.top + 8, width: PLATE.x2 - PLATE.x1, height: PLATE.bottom - PLATE.top, rx: 10, fill: '#cbd5e1' }),
        s('rect', { x: PLATE.x1, y: PLATE.top, width: PLATE.x2 - PLATE.x1, height: PLATE.bottom - PLATE.top, rx: 10, fill: d.lin([[0, '#ffffff'], [1, '#eef2f6']], 'v'), stroke: '#cbd5e1', 'stroke-width': 1.2 }),
      );
      const hollow = d.lin([[0, '#c7d0db'], [0.5, '#eef2f6'], [1, '#ffffff']], 'v');
      WELLS.forEach((w, i) => {
        const rnd = rng(31 + i * 17);
        const blood = s('ellipse', { cx: w.x, cy: WELL_Y + 1, rx: WELL_R.x - 12, ry: WELL_R.y - 5, fill: '#b91c1c' });
        const serum = s('ellipse', { cx: w.x, cy: WELL_Y + 1, rx: WELL_R.x - 9, ry: WELL_R.y - 4, fill: '#fde7d4', opacity: 0 });
        const clumps = s('g', { opacity: 0 });
        for (let j = 0; j < CLUMPS; j++) {
          const a = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd());
          const cx = w.x + Math.cos(a) * r * (WELL_R.x - 18);
          const cy = WELL_Y + 1 + Math.sin(a) * r * (WELL_R.y - 8);
          clumps.append(s('ellipse', { cx, cy, rx: 2.2 + rnd() * 2.8, ry: 1.6 + rnd() * 1.4, fill: j % 3 ? '#7f1d1d' : '#991b1b', transform: `rotate(${Math.round(rnd() * 180)} ${cx.toFixed(1)} ${cy.toFixed(1)})` }));
        }
        const sheen = s('ellipse', { cx: w.x - 8, cy: WELL_Y - 3, rx: 12, ry: 2.2, fill: '#ffffff', 'fill-opacity': 0.45 });
        svg.append(
          s('ellipse', { cx: w.x, cy: WELL_Y, rx: WELL_R.x, ry: WELL_R.y, fill: hollow, stroke: '#b8c2ce', 'stroke-width': 1 }),
          serum, blood, clumps, sheen,
        );
        wells.push({ w, blood, serum, clumps, mix: params[w.param] ? 1 : 0, k: 0 });
      });
      for (const dr of droppers) {
        for (let i = 0; i < 3; i++) {
          const c = s('ellipse', { rx: 2.4, ry: 3.2, fill: dr.w.color, 'fill-opacity': 0.8, opacity: 0, 'pointer-events': 'none' });
          dr.drops.push({ c, y: 0, v: 0, live: false });
          svg.append(c);
        }
      }
      topLayer = s('g');
      svg.append(topLayer);
      // Агглютинация в уже обработанных сыворотками каплях видна сразу (свободный опыт, возврат к работе)
      wells.forEach((wl) => { wl.k = wl.mix && agglutinates(params.sample, wl.w.serum) ? 1 : 0; });
    },

    frame(dt) {
      updateSlide(dt);
      const on = sl === 'on';
      if (on !== shownSlide || params.mag !== shownMag) {
        if (on && shownSlide) {
          // Смена объектива: старая картинка гаснет, новая проявляется
          fadeLayer.replaceChildren(...fieldLayer.childNodes);
          fade = 0;
        }
        shownSlide = on;
        shownMag = params.mag;
        fieldLayer.replaceChildren(...(on ? drawField(params.mag) : []));
        objectives.forEach((o, i) => {
          const slot = o.slots[(i - params.mag + 3) % 3];
          o.g.setAttribute('transform', `translate(${slot.x} ${slot.y}) rotate(${slot.a})`);
        });
        const bar = SCALE_BAR[params.mag];
        const k = FIELD.r / (MAGS[params.mag].fov / 2);
        barLine.setAttribute('width', (bar * k).toFixed(1));
        barLine.setAttribute('x', (BAR_X - (bar * k) / 2).toFixed(1));
        barText.textContent = `${bar} мкм`;
        barLine.parentNode.setAttribute('opacity', on ? 1 : 0);
      }
      if (fade < 1) {
        fade = Math.min(1, fade + dt * 3.5);
        fieldLayer.setAttribute('opacity', fade.toFixed(2));
        fadeLayer.setAttribute('opacity', (1 - fade).toFixed(2));
        if (fade >= 1) fadeLayer.replaceChildren();
      }
      oilDrop.setAttribute('opacity', on && params.mag === 2 ? 1 : 0);

      // Новый образец — на пластинке свежие капли этой крови; уже взятые сыворотки капают снова,
      // чтобы ученик видел, к чему относится новая реакция
      if (params.sample !== shownSample) {
        shownSample = params.sample;
        wells.forEach((wl) => { wl.k = 0; wl.mix = 0; });
        for (const dr of droppers) if (dr.state === 'used' || dr.state === 'back') dr.state = 'fly';
      }
      tubeNodes.forEach((t, i) => {
        const sel = i === params.sample;
        t.g.setAttribute('transform', sel ? 'translate(0 -10)' : '');
        t.glow.setAttribute('opacity', sel ? 1 : 0);
      });
      for (const dr of droppers) updateDropper(dr, dt);
      for (const wl of wells) {
        const added = params[wl.w.param] === 1 && droppers.find((x) => x.w === wl.w).state !== 'fly' && droppers.find((x) => x.w === wl.w).state !== 'drip';
        wl.mix = added ? Math.min(1, wl.mix + dt * 1.5) : 0;
        // Эритроциты склеиваются за пару секунд после смешивания (в настоящем опыте — за 1–3 минуты)
        const target = wl.mix >= 1 && agglutinates(params.sample, wl.w.serum) ? 1 : 0;
        wl.k = target ? Math.min(1, wl.k + dt * 0.6) : Math.max(0, wl.k - dt * 3);
        wl.serum.setAttribute('opacity', Math.min(1, wl.mix * 1.5).toFixed(2));
        // Без агглютинации кровь с сывороткой — ровная красная взвесь; при агглютинации — хлопья в прозрачной жидкости
        wl.blood.setAttribute('fill-opacity', (1 - 0.92 * wl.k).toFixed(2));
        wl.blood.setAttribute('fill', wl.mix > 0.5 ? '#c81e1e' : '#b91c1c');
        wl.clumps.setAttribute('opacity', wl.k.toFixed(2));
      }
    },
  });

  // ---------- Поле зрения: клетки препарата при данном увеличении ----------
  function drawField(mag) {
    const R = MAGS[mag].fov / 2;
    const k = FIELD.r / R;
    const sm = smear();
    const px = (x) => FIELD.x + x * k;
    const py = (y) => FIELD.y + y * k;
    const near = (x, y, pad) => x * x + y * y <= (R + pad) * (R + pad);
    const out = [s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: '#f6eef2' })];
    if (mag === 0) {
      // При ×100 эритроцит меньше 1,5 точки сцены — они сливаются в розовый «ковёр»
      const speck = D.pattern('rbc100', 24, 24, [
        s('rect', { width: 24, height: 24, fill: '#eab0b9' }),
        ...[[3, 4], [11, 2], [19, 6], [7, 12], [15, 14], [22, 18], [2, 20], [10, 21], [18, 23], [13, 8]].map(([x, y], i) => s('circle', { cx: x, cy: y, r: 1.1, fill: i % 2 ? '#d98d99' : '#f6d2d7' })),
      ]);
      out.push(s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: speck }));
    } else if (mag === 1) {
      const r = (SIZE.rbc / 2) * k;
      let body = '';
      let pale = '';
      for (const [x, y] of sm.rbc) {
        if (!near(x, y, 6)) continue;
        body += dot(px(x), py(y), r);
        pale += dot(px(x), py(y), r * 0.4);
      }
      out.push(
        s('path', { d: body, fill: '#e59aa6', stroke: '#c9788a', 'stroke-width': 0.5 }),
        s('path', { d: pale, fill: '#f6d4d9' }),
      );
      let pl = '';
      for (const [x, y] of sm.platelets) if (near(x, y, 3)) pl += dot(px(x), py(y), Math.max(0.9, (SIZE.platelet / 2) * k));
      out.push(s('path', { d: pl, fill: '#7c3aed', 'fill-opacity': 0.85 }));
    } else {
      // Эритроцит — двояковогнутый диск: по краю толще и темнее, в центре просветление
      const grad = D.rad([[0, '#f8dde0'], [0.42, '#f2c2c8'], [0.78, '#e39ba6'], [1, '#d07f8c']], 0.5, 0.5);
      for (const [i, [x, y]] of sm.rbc.entries()) {
        if (!near(x, y, 6)) continue;
        const rr = (SIZE.rbc / 2) * k * (0.94 + ((i * 37) % 13) / 100);
        out.push(s('circle', { cx: px(x).toFixed(1), cy: py(y).toFixed(1), r: rr.toFixed(2), fill: grad, stroke: '#c47585', 'stroke-width': 0.6 }));
      }
      for (const [i, [x, y]] of sm.platelets.entries()) {
        if (!near(x, y, 3)) continue;
        const cx = px(x).toFixed(1);
        const cy = py(y).toFixed(1);
        out.push(s('ellipse', { cx, cy, rx: (1.5 * k).toFixed(2), ry: (1.05 * k).toFixed(2), fill: '#8b5cf6', 'fill-opacity': 0.8, transform: `rotate(${(i * 47) % 180} ${cx} ${cy})` }));
      }
    }
    for (const w of sm.wbc) if (near(w.x, w.y, 8)) out.push(leukocyte(px(w.x), py(w.y), w.type, k, mag));
    return out;
  }

  // Лейкоцит: нейтрофил — ядро из 3 сегментов, лимфоцит — крупное круглое ядро и узкий ободок цитоплазмы
  function leukocyte(cx, cy, type, k, mag) {
    const r = (SIZE[type] / 2) * k;
    if (mag === 0) return s('circle', { cx, cy, r: Math.max(1.8, r * 1.2), fill: '#5b2a86' });
    if (mag === 1) {
      // При ×400 сегменты ядра нейтрофила сливаются в одно тёмное пятно — видно ядро и светлый ободок цитоплазмы
      return s('g', {}, [
        s('circle', { cx, cy, r, fill: type === 'lymphocyte' ? '#c9d6f2' : '#e2cfea', stroke: '#8b6aa6', 'stroke-width': 0.7 }),
        s('circle', { cx, cy, r: r * (type === 'lymphocyte' ? 0.78 : 0.6), fill: '#4c1d95' }),
      ]);
    }
    if (type === 'lymphocyte') {
      return s('g', {}, [
        s('circle', { cx, cy, r, fill: '#c3d3f2', stroke: '#8fa5d3', 'stroke-width': 0.7 }),
        s('circle', { cx: cx + 0.3 * k, cy: cy - 0.2 * k, r: r * 0.8, fill: D.rad(['#6b3fa0', '#3f1a6e'], 0.4, 0.35) }),
      ]);
    }
    const lobes = [[-2.4, -1.1], [0.2, 1.7], [2.5, -0.5]];
    const g = s('g', {}, [s('circle', { cx, cy, r, fill: '#ecdcef', stroke: '#b9a0c8', 'stroke-width': 0.7 })]);
    if (mag === 2) {
      // Мелкая зернистость цитоплазмы нейтрофила
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4;
        const d = (0.35 + ((i * 7) % 10) / 16) * r;
        g.append(s('circle', { cx: cx + Math.cos(a) * d, cy: cy + Math.sin(a) * d, r: 0.25 * k, fill: '#c4a3d4' }));
      }
    }
    g.append(s('path', { d: `M${cx + lobes[0][0] * k} ${cy + lobes[0][1] * k} L${cx + lobes[1][0] * k} ${cy + lobes[1][1] * k} L${cx + lobes[2][0] * k} ${cy + lobes[2][1] * k}`, stroke: '#4c1d95', 'stroke-width': 0.8 * k, fill: 'none', 'stroke-linecap': 'round' }));
    for (const [lx, ly] of lobes) g.append(s('ellipse', { cx: cx + lx * k, cy: cy + ly * k, rx: 1.9 * k, ry: 1.55 * k, fill: '#5b2a86' }));
    return g;
  }

  // ---------- Предметное стекло ----------
  function updateSlide(dt) {
    if (params.slide === 1 && (sl === 'rest' || sl === 'drag')) sl = 'fly';
    if (sl === 'fly') {
      const k = Math.min(1, dt * 6);
      slPos.x += (STAGE.x - slPos.x) * k;
      slPos.y += (STAGE.y - slPos.y) * k;
      if (Math.hypot(slPos.x - STAGE.x, slPos.y - STAGE.y) < 1) {
        sl = 'on';
        Object.assign(slPos, STAGE);
        if (params.slide !== 1) set('slide', 1);
      }
    }
    slideNode.style.pointerEvents = sl === 'rest' || sl === 'drag' ? '' : 'none';
    slideNode.style.cursor = sl === 'rest' || sl === 'drag' ? 'grab' : '';
    slideLabel.setAttribute('opacity', sl === 'rest' ? 1 : 0);
    if (!held.has(slideNode)) place(slideNode, sl === 'drag' || sl === 'fly' ? topLayer : slideHome);
    slideNode.setAttribute('transform', `translate(${slPos.x.toFixed(1)} ${slPos.y.toFixed(1)})`);
  }

  // ---------- Капельницы ----------
  function wellTarget(dr) {
    return { x: dr.w.x, y: WELL_Y - 18 };
  }

  function updateDropper(dr, dt) {
    const p = params[dr.w.param];
    if (p === 1 && (dr.state === 'rest' || dr.state === 'drag')) dr.state = 'fly';
    const to = wellTarget(dr);
    if (dr.state === 'fly') {
      const k = Math.min(1, dt * 6);
      dr.pos.x += (to.x - dr.pos.x) * k;
      dr.pos.y += (to.y - dr.pos.y) * k;
      if (Math.hypot(dr.pos.x - to.x, dr.pos.y - to.y) < 2) {
        dr.state = 'drip';
        dr.dripT = 0;
        Object.assign(dr.pos, to);
      }
    } else if (dr.state === 'drip') {
      const before = Math.floor(dr.dripT / 0.3);
      dr.dripT += dt;
      const after = Math.floor(dr.dripT / 0.3);
      if (after > before && before < 2) {
        const free = dr.drops.find((x) => !x.live);
        if (free) Object.assign(free, { y: to.y + 4, v: 0, live: true });
      }
      if (dr.dripT > 0.8) {
        dr.state = 'back';
        if (params[dr.w.param] !== 1) set(dr.w.param, 1);
      }
    } else if (dr.state === 'back') {
      const k = Math.min(1, dt * 5);
      dr.pos.x += (dr.rest.x - dr.pos.x) * k;
      dr.pos.y += (dr.rest.y - dr.pos.y) * k;
      if (Math.hypot(dr.pos.x - dr.rest.x, dr.pos.y - dr.rest.y) < 1) dr.state = 'used';
    } else if (dr.state === 'used') {
      Object.assign(dr.pos, dr.rest);
    }
    for (const q of dr.drops) {
      if (!q.live) {
        q.c.setAttribute('opacity', 0);
        continue;
      }
      q.v += 900 * dt;
      q.y += q.v * dt;
      if (q.y >= WELL_Y - 2) q.live = false;
      q.c.setAttribute('cx', dr.w.x);
      q.c.setAttribute('cy', q.y);
      q.c.setAttribute('opacity', q.live ? 1 : 0);
    }
    const free = dr.state === 'rest' || dr.state === 'drag';
    dr.node.style.pointerEvents = free ? '' : 'none';
    dr.node.style.cursor = free ? 'grab' : '';
    if (!held.has(dr.node)) place(dr.node, dr.state === 'rest' || dr.state === 'used' ? dr.home : topLayer);
    dr.node.setAttribute('transform', `translate(${dr.pos.x.toFixed(1)} ${dr.pos.y.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  // Взятый предмет поднимаем наверх до того, как draggable() захватит указатель
  const held = new Set();
  for (const [node, state] of [[slideNode, () => sl], ...droppers.map((dr) => [dr.node, () => dr.state])]) {
    node.addEventListener('pointerdown', () => {
      if (state() !== 'rest') return;
      held.add(node);
      place(node, topLayer);
    });
    const release = () => held.delete(node);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
  }

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
    },
  });

  draggable(scene, slideNode, {
    ...carry(() => sl, slPos, (v) => { sl = v; }),
    onEnd() {
      if (sl !== 'drag') return;
      // Стекло отпустили над предметным столиком — оно ложится под объектив
      if (Math.abs(slPos.x - STAGE.x) < 80 && Math.abs(slPos.y - STAGE.y) < 70) {
        sl = 'fly';
        set('slide', 1);
      } else {
        sl = 'rest';
        Object.assign(slPos, SLIDE_REST);
      }
    },
  });

  for (const dr of droppers) {
    draggable(scene, dr.node, {
      ...carry(() => dr.state, dr.pos, (v) => { dr.state = v; }),
      onEnd() {
        if (dr.state !== 'drag') return;
        // Каждая сыворотка — только к своей капле: перепутать капли значит испортить анализ
        const to = wellTarget(dr);
        if (Math.abs(dr.pos.x - to.x) < WELL_R.x && dr.pos.y > to.y - 60 && dr.pos.y < PLATE.bottom) {
          dr.state = 'fly';
        } else {
          dr.state = 'rest';
          Object.assign(dr.pos, dr.rest);
        }
      },
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
