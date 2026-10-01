// Сцена «Митоз в клетках корня лука»: кабинет биологии. Слева — световой микроскоп с револьвером
// на два объектива (×10 и ×40) и винтом препаратоводителя под столиком; в центре — крупно поле зрения
// окуляра; справа на стене — карточка с образцами фаз и схемой кончика корня, на столе — предметное
// стекло с давленым препаратом. Числа подсчёта сцена не дублирует — они в показаниях под сценой.
// Ученик сам переносит стекло на столик (slide = 1), щёлкает по револьверу (mag), щёлкает по винту
// препаратоводителя — препарат сдвигается к следующему полю зрения (fields), и перетаскивает рамку
// на схеме корня — меняется расстояние от кончика (dist).
// Клетки в окуляре рисуются по тем же координатам, по которым модель их считает (fieldCells),
// поэтому картинка и подсчёт в показаниях совпадают.

import { createScene, cylinderShade, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const MX = 110; // микроскоп: центр основания
const STAGE = { x: MX + 34, y: BENCH - 95 }; // где лежит стекло на предметном столике
const SLIDE_REST = { x: 700, y: BENCH - 10 };
const FIELD = { x: 410, y: 222, r: 170 };
const KNOB = { x: MX + 98, y: BENCH - 60 }; // винт препаратоводителя
const BOARD = { x1: 600, x2: 946, y1: 10, y2: 300 };
const ROOT = { x0: 664, mm: 50, y: 256, h: 22 }; // схема корня на доске: кончик слева, 50 точек на 1 мм
const CAP_MM = 0.35; // длина корневого чехлика
const DIV_MM = 2.3; // граница зоны деления на схеме
const ROW_Y = [66, 96, 126, 156, 186];

// Цвета ацетокармина: хроматин красно-малиновый, цитоплазма бледно-розовая
const WALL = '#c993a8';
const CYTO = '#f4d3df';
const CYTO_PALE = '#f9e8ee';
const CHROM = '#8a1a52';
const NUC_LIGHT = '#efbcd0';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (v) => v.toFixed(1);
// Прямоугольник и кружок как части одного path: тысячи клеток при ×100 — пара элементов вместо тысяч
const box = (x, y, w, h) => `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}Z`;
const dot = (x, y, r) => `M${f1(x - r)} ${f1(y)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;

// Одна клетка при большом увеличении. cx, cy — центр в точках сцены, w, h — размер в точках,
// seed — своё случайное число клетки (наклон хромосом, положение ядра).
// Деление идёт поперёк оси корня: метафазная пластинка горизонтальна, хроматиды расходятся вверх и вниз.
export function cellNode(D, cx, cy, w, h, phase, seed) {
  const rnd = rng(Math.floor(seed * 1e9));
  const long = h > w * 1.8; // клетка зоны растяжения: вытянутая, с крупной вакуолью
  const g = s('g', {}, [
    s('rect', { x: f1(cx - w / 2 + 0.5), y: f1(cy - h / 2 + 0.5), width: f1(w - 1), height: f1(h - 1), rx: 2.5, fill: long ? CYTO_PALE : CYTO, stroke: WALL, 'stroke-width': 0.9 }),
  ]);
  // Вакуоль занимает почти всю вытянутую клетку: цитоплазма остаётся тонким слоем у стенок
  if (long) g.append(s('rect', { x: f1(cx - w / 2 + 3), y: f1(cy - h / 2 + 3), width: f1(w - 6), height: f1(h - 6), rx: 3, fill: '#fefafc', stroke: '#ead0db', 'stroke-width': 0.6 }));
  const m = Math.min(w, h);
  const line = (d, width = 1.4, color = CHROM) => s('path', { d, stroke: color, 'stroke-width': width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

  if (phase === 'interphase') {
    const r = long ? w * 0.27 : m * 0.3;
    const ny = long ? cy + (seed - 0.5) * h * 0.4 : cy + (rnd() - 0.5) * 2;
    g.append(
      s('circle', { cx: f1(cx), cy: f1(ny), r: f1(r), fill: D.rad([[0, '#eaa6c2'], [1, '#b64a7d']], 0.4, 0.35), stroke: '#a33d6e', 'stroke-width': 0.6 }),
      s('circle', { cx: f1(cx + r * 0.25), cy: f1(ny - r * 0.2), r: f1(r * 0.28), fill: '#6d1240' }),
    );
  } else if (phase === 'prophase') {
    // Ядро ещё на месте, ядрышка нет, внутри — спирализующиеся нити хромосом
    const r = m * 0.36;
    g.append(s('circle', { cx: f1(cx), cy: f1(cy), r: f1(r), fill: NUC_LIGHT, stroke: '#b4577f', 'stroke-width': 0.7 }));
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = r * (0.2 + rnd() * 0.5);
      const x0 = cx + Math.cos(a) * rr;
      const y0 = cy + Math.sin(a) * rr;
      const b = a + 1.2 + rnd() * 1.6;
      const x1 = cx + Math.cos(b) * r * 0.55;
      const y1 = cy + Math.sin(b) * r * 0.55;
      d += `M${f1(x0)} ${f1(y0)}Q${f1(cx + (rnd() - 0.5) * r)} ${f1(cy + (rnd() - 0.5) * r)} ${f1(x1)} ${f1(y1)}`;
    }
    g.append(line(d, 1.3));
  } else if (phase === 'metaphase') {
    // Нити веретена от полюсов к хромосомам на экваторе
    const pole = h * 0.4;
    const half = w * 0.32;
    g.append(s('path', { d: `M${f1(cx)} ${f1(cy - pole)}L${f1(cx - half)} ${f1(cy)}M${f1(cx)} ${f1(cy - pole)}L${f1(cx + half)} ${f1(cy)}M${f1(cx)} ${f1(cy + pole)}L${f1(cx - half)} ${f1(cy)}M${f1(cx)} ${f1(cy + pole)}L${f1(cx + half)} ${f1(cy)}M${f1(cx)} ${f1(cy - pole)}V${f1(cy + pole)}`, stroke: '#d9a7bd', 'stroke-width': 0.6, fill: 'none' }));
    let d = '';
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = cx - half + (2 * half * i) / (n - 1);
      const len = h * (0.1 + rnd() * 0.06);
      const tilt = (rnd() - 0.5) * 2;
      d += `M${f1(x - tilt)} ${f1(cy - len)}L${f1(x + tilt)} ${f1(cy + len)}`;
    }
    g.append(line(d, 1.7));
  } else if (phase === 'anaphase') {
    // Хроматиды V-образно тянутся центромерами к полюсам
    let d = '';
    for (const dir of [-1, 1]) {
      const y = cy + dir * h * 0.2;
      for (let i = 0; i < 5; i++) {
        const x = cx - w * 0.26 + (w * 0.52 * i) / 4;
        const arm = h * (0.08 + rnd() * 0.04);
        d += `M${f1(x - 2.2)} ${f1(y - dir * arm)}L${f1(x)} ${f1(y + dir * arm * 0.5)}L${f1(x + 2.2)} ${f1(y - dir * arm)}`;
      }
    }
    g.append(line(d, 1.2));
  } else {
    // Телофаза: два плотных дочерних ядра у полюсов и клеточная пластинка между ними
    const ry = Math.min(h * 0.13, w * 0.2);
    for (const dir of [-1, 1]) {
      g.append(s('ellipse', { cx: f1(cx), cy: f1(cy + dir * h * 0.27), rx: f1(w * 0.28), ry: f1(ry), fill: D.rad([[0, '#c75a8c'], [1, '#7f1a4b']], 0.4, 0.35) }));
    }
    g.append(s('path', { d: `M${f1(cx - w / 2 + 2)} ${f1(cy)}H${f1(cx + w / 2 - 2)}`, stroke: '#b97a97', 'stroke-width': 1, 'stroke-dasharray': '2 1.5' }));
  }
  return g;
}

export function mitosisScene(container, params, set, { MAGS, FIELD_R, FIELDS, PHASES, PHASE_NAME, fieldCells, cellLength, dividingFactor }) {
  let D, fieldLayer, fadeLayer, fieldCaption, aimRing;
  let slideNode, slideHome, slideLabel, slideShadow, topLayer, revolver, knob, marker;
  const objectives = [];
  let shown = '';
  let fade = 1;
  let shift = 0; // сдвиг стекла на столике при переходе к новому полю зрения

  // Предметное стекло: rest — на столе, drag — в руке, fly — летит на столик, on — на столике
  let sl = params.slide ? 'on' : 'rest';
  const slPos = params.slide ? { ...STAGE } : { ...SLIDE_REST };
  const grab = { dx: 0, dy: 0 };
  let moved = false;

  const scene = createScene(container, {
    build(svg, d) {
      D = d;
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ---------- Карточка на стене: образцы фаз — по ним узнают клетки в окуляре ----------
      svg.append(
        s('rect', { x: BOARD.x1, y: BOARD.y1 + 4, width: BOARD.x2 - BOARD.x1, height: BOARD.y2 - BOARD.y1, rx: 10, fill: '#0f172a', 'fill-opacity': 0.1 }),
        s('rect', { x: BOARD.x1, y: BOARD.y1, width: BOARD.x2 - BOARD.x1, height: BOARD.y2 - BOARD.y1, rx: 10, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 }),
        text(BOARD.x1 + 18, 38, tr('Образцы клеток'), { size: 16, weight: 700, fill: '#334155', anchor: 'start' }),
      );
      PHASES.forEach((ph, i) => {
        const y = ROW_Y[i];
        svg.append(cellNode(d, 634, y, 26, 28, ph, 0.37 + i * 0.11), text(660, y, tr(PHASE_NAME[ph]), { size: 17, weight: 600, fill: '#334155', anchor: 'start' }));
      });

      // Схема кончика корня: чехлик, зона деления (мелкие клетки), зона растяжения (длинные клетки)
      const rx = (mm) => ROOT.x0 + mm * ROOT.mm;
      const top = ROOT.y - ROOT.h / 2;
      const bot = ROOT.y + ROOT.h / 2;
      const end = rx(5.4);
      const rootPath = `M${end} ${top} H${rx(0.45)} Q${rx(0.05)} ${top + 2} ${ROOT.x0} ${ROOT.y} Q${rx(0.05)} ${bot - 2} ${rx(0.45)} ${bot} H${end}`;
      const rootClip = `root${uid}`;
      defs.append(s('clipPath', { id: rootClip }, [s('path', { d: `${rootPath} Z` })]));
      let walls = '';
      for (let mm = CAP_MM; mm < 5.4;) {
        const L = cellLength(mm) / 1000 * ROOT.mm * 1.6; // на схеме клетки крупнее, чтобы разница была заметна
        walls += `M${f1(rx(mm))} ${top}V${bot}`;
        mm += L / ROOT.mm;
      }
      svg.append(
        s('g', { 'clip-path': `url(#${rootClip})` }, [
          s('rect', { x: ROOT.x0, y: top, width: end - ROOT.x0, height: ROOT.h, fill: d.lin([[0, '#efc3d3'], [(DIV_MM / 5.4) * 0.9, '#efc3d3'], [DIV_MM / 5.4 + 0.08, '#f8e4ec'], [1, '#faeef2']]) }),
          s('rect', { x: ROOT.x0, y: top, width: CAP_MM * ROOT.mm, height: ROOT.h, fill: '#efe2cf' }),
          s('path', { d: `${walls}M${ROOT.x0} ${ROOT.y - 4}H${end}M${ROOT.x0} ${ROOT.y + 4}H${end}`, stroke: WALL, 'stroke-width': 0.8, fill: 'none' }),
        ]),
        s('path', { d: rootPath, fill: 'none', stroke: '#a8708a', 'stroke-width': 1.4 }),
      );
      for (let i = 1; i <= 5; i++) {
        svg.append(
          s('path', { d: `M${rx(i)} ${top - 6}V${top - 1}`, stroke: '#64748b', 'stroke-width': 1 }),
          text(rx(i), top - 14, String(i), { size: 13, weight: 600, fill: '#64748b' }),
        );
      }
      svg.append(
        text(BOARD.x1 + 18, top - 14, tr('мм'), { size: 13, weight: 600, fill: '#64748b', anchor: 'start' }),
        text(rx(CAP_MM) + 2, bot + 16, tr('чехлик'), { size: 13, weight: 600, fill: '#92400e', anchor: 'end' }),
        text(rx((CAP_MM + DIV_MM) / 2) + 10, bot + 16, tr('зона деления'), { size: 13, weight: 600, fill: '#be185d' }),
        text(rx(4), bot + 16, tr('зона растяжения'), { size: 13, weight: 600, fill: '#475569' }),
        s('path', { d: `M${rx(DIV_MM)} ${top - 3}V${bot + 8}`, stroke: '#be185d', 'stroke-width': 1, 'stroke-dasharray': '3 2' }),
      );
      // Рамка — участок, который сейчас в поле зрения; её можно перетаскивать вдоль корня
      const fw = Math.max(14, (FIELD_R * 2) / 1000 * ROOT.mm);
      marker = s('g', { style: 'cursor: ew-resize' }, [
        s('rect', { x: -18, y: top - 10, width: 36, height: ROOT.h + 20, fill: '#000', 'fill-opacity': 0 }),
        s('rect', { x: -fw / 2, y: top - 4, width: fw, height: ROOT.h + 8, rx: 3, fill: '#f59e0b', 'fill-opacity': 0.18, stroke: '#d97706', 'stroke-width': 2 }),
      ]);
      svg.append(marker);

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
        s('rect', { x: mx + 12, y: BENCH - 80, width: 24, height: 22, rx: 3, fill: cylinderShade(d, '#4b5563') }),
        s('rect', { x: mx - 40, y: BENCH - 92, width: 150, height: 12, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#111827']], 'v') }),
        // Направляющая препаратоводителя вдоль столика
        s('rect', { x: mx - 36, y: BENCH - 80, width: 142, height: 5, rx: 2, fill: '#6b7280' }),
        s('rect', { x: KNOB.x - 3, y: BENCH - 80, width: 6, height: KNOB.y - BENCH + 80, fill: '#4b5563' }),
      );
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

      // Револьвер с двумя объективами: ×10 — жёлтое кольцо, ×40 — голубое, как на настоящих объективах
      revolver = s('g', { style: 'cursor: pointer' }, [
        s('rect', { x: mx - 30, y: BENCH - 232, width: 110, height: 116, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        s('path', { d: `M${mx - 14} ${BENCH - 200} Q ${mx + 24} ${BENCH - 222} ${mx + 64} ${BENCH - 200} L ${mx + 56} ${BENCH - 186} H ${mx - 6} Z`, fill: d.lin([[0, '#6b7280'], [1, '#1f2937']], 'v') }),
      ]);
      const SLOTS = [{ x: mx + 24, y: BENCH - 188, a: 0 }, { x: mx + 50, y: BENCH - 190, a: -24 }];
      [['#facc15', 36], ['#38bdf8', 44]].forEach(([ring, len]) => {
        const g = s('g', {}, [
          s('rect', { x: -10, y: 0, width: 20, height: len - 18, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
          s('rect', { x: -10, y: 14, width: 20, height: 4, fill: ring }),
          s('rect', { x: -6, y: len - 19, width: 12, height: 18, rx: 2, fill: cylinderShade(d, '#9ca3af') }),
        ]);
        objectives.push({ g, slots: SLOTS });
        revolver.append(g);
      });
      svg.append(revolver);
      touchTarget(revolver, 10);
      revolver.addEventListener('click', () => set('mag', 1 - params.mag));

      // Предметное стекло с давленым кончиком корня под покровным стеклом
      slideNode = s('g', { style: 'cursor: grab' }, [
        s('rect', { x: -50, y: -22, width: 100, height: 34, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('rect', { x: -40, y: -3, width: 80, height: 6, rx: 1, fill: '#dbeafe', 'fill-opacity': 0.85, stroke: '#94a3b8', 'stroke-width': 0.8 }),
        s('rect', { x: -40, y: -3, width: 16, height: 6, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 0.6 }),
        s('rect', { x: -6, y: -5, width: 32, height: 2, fill: '#e0f2fe', stroke: '#94a3b8', 'stroke-width': 0.5 }),
        s('ellipse', { cx: 10, cy: -3.2, rx: 11, ry: 1.8, fill: '#be185d', 'fill-opacity': 0.8 }),
      ]);
      slideHome = s('g', {}, [slideNode]);
      slideShadow = floorShadow(SLIDE_REST.x, BENCH + 1, 52, d, 5);
      slideLabel = text(SLIDE_REST.x, SLIDE_REST.y - 24, tr('Препарат кончика корня'), { size: 13, weight: 600, fill: '#9f1239' });
      svg.append(
        slideShadow,
        slideLabel,
        slideHome,
        s('rect', { x: mx - 30, y: BENCH - 100, width: 16, height: 4, rx: 1, fill: '#9ca3af' }),
        s('rect', { x: mx + 82, y: BENCH - 100, width: 16, height: 4, rx: 1, fill: '#9ca3af' }),
      );

      // Винт препаратоводителя: щелчок — препарат сдвигается к следующему полю зрения
      knob = s('g', { style: 'cursor: pointer' }, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 20, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 12, fill: d.rad(['#9ca3af', '#1f2937']), stroke: '#111827', 'stroke-width': 1 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 6.5, fill: d.rad(['#d1d5db', '#4b5563']) }),
        s('path', { d: `M${KNOB.x + 15} ${KNOB.y - 9} A 17 17 0 0 1 ${KNOB.x + 14} ${KNOB.y + 10}`, stroke: '#d97706', 'stroke-width': 2, fill: 'none' }),
        s('path', { d: `M${KNOB.x + 9} ${KNOB.y + 9} L${KNOB.x + 15} ${KNOB.y + 12} L${KNOB.x + 16} ${KNOB.y + 5} Z`, fill: '#d97706' }),
      ]);
      svg.append(knob);
      touchTarget(knob, 8);
      knob.addEventListener('click', () => set('fields', (params.fields % FIELDS) + 1));

      // ---------- Поле зрения окуляра ----------
      const clip = `fov${uid}`;
      defs.append(s('clipPath', { id: clip }, [s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r })]));
      const fieldView = s('g', { 'clip-path': `url(#${clip})` });
      fadeLayer = s('g');
      fieldLayer = s('g');
      fieldView.append(
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: d.rad([[0, '#fffbeb'], [1, '#fdf2d6']], 0.5, 0.5) }),
        fadeLayer,
        fieldLayer,
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: d.rad([[0, '#000000', 0], [0.8, '#000000', 0], [1, '#0f172a', 0.4]], 0.5, 0.5), 'pointer-events': 'none' }),
      );
      // При ×100 пунктирный круг показывает участок, который будет виден при ×400
      aimRing = s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r * (MAGS[1].fov / MAGS[0].fov), fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-dasharray': '6 4', opacity: 0 });
      fieldCaption = text(FIELD.x, FIELD.y + FIELD.r + 30, '', { size: 14, weight: 600, fill: '#475569' });
      svg.append(
        s('circle', { cx: FIELD.x, cy: FIELD.y + 8, r: FIELD.r + 14, fill: '#0f172a', 'fill-opacity': 0.12, filter: d.url('soft') }),
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 12, fill: d.lin([[0, '#4b5563'], [0.5, '#1f2937'], [1, '#111827']], 'v') }),
        fieldView,
        aimRing,
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 1, fill: 'none', stroke: '#0b0f14', 'stroke-width': 3 }),
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 11, fill: 'none', stroke: '#9ca3af', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }),
        fieldCaption,
      );
      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt) {
      updateSlide(dt);
      const on = sl === 'on';
      const key = on ? `${params.mag}:${params.dist}:${params.fields}` : 'off';
      if (key !== shown) {
        // Смена объектива, участка или поля: старая картинка гаснет, новая проявляется
        if (shown && shown !== 'off' && on) {
          fadeLayer.replaceChildren(...fieldLayer.childNodes);
          fade = 0;
        }
        shown = key;
        fieldLayer.replaceChildren(...(on ? (params.mag === 0 ? drawOverview(params.dist) : drawCells(params.dist, params.fields)) : []));
        objectives.forEach((o, i) => {
          const slot = o.slots[(i - params.mag + 2) % 2];
          o.g.setAttribute('transform', `translate(${slot.x} ${slot.y}) rotate(${slot.a})`);
        });
      }
      if (fade < 1) {
        fade = Math.min(1, fade + dt * 3.5);
        fieldLayer.setAttribute('opacity', fade.toFixed(2));
        fadeLayer.setAttribute('opacity', (1 - fade).toFixed(2));
        if (fade >= 1) fadeLayer.replaceChildren();
      }
      // Стекло на столике чуть сдвигается вместе с полем зрения — препаратоводитель двигает его вбок
      const target = on ? (params.fields - 1) * 3 : 0;
      shift += (target - shift) * Math.min(1, dt * 6);
      const total = MAGS[params.mag].total;
      fieldCaption.textContent = on && params.mag === 1 ? `${tr('Поле зрения')} ${params.fields} / ${FIELDS}, ×${total}` : `${tr('Поле зрения')}, ×${total}`;
      aimRing.setAttribute('opacity', on && params.mag === 0 ? 0.9 : 0);
      marker.setAttribute('transform', `translate(${ROOT.x0 + params.dist * ROOT.mm} 0)`);
    },
  });

  // ---------- Поле зрения при ×400: клетки модели ----------
  function drawCells(mm, f) {
    const k = FIELD.r / FIELD_R;
    const out = [s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: '#f8eef1' })];
    const lim = FIELD_R + 30;
    for (const c of fieldCells(mm, f)) {
      if (Math.abs(c.x) - c.w / 2 > lim || Math.abs(c.y) - c.h / 2 > lim) continue;
      out.push(cellNode(D, FIELD.x + c.x * k, FIELD.y + c.y * k, c.w * k, c.h * k, c.phase, c.seed));
    }
    return out;
  }

  // ---------- Поле зрения при ×100: весь кончик корня ----------
  // Фазы при таком увеличении не различить: клетки — крохотные прямоугольники с точками ядер.
  // Ширина корня ≈ 1 мм; у самого кончика корень сужается, его прикрывает корневой чехлик.
  function drawOverview(mm) {
    const R = MAGS[0].fov / 2;
    const k = FIELD.r / R;
    const rnd = rng(mm * 31 + 5);
    const X = (x) => FIELD.x + x * k;
    const Y = (y) => FIELD.y + y * k;
    const local = (y) => mm - y / 1000; // мм от кончика: кончик внизу
    const halfW = (s0) => (s0 <= 0 ? 0 : 500 * Math.min(1, Math.sqrt(s0 / 0.7)));
    // Контур корня
    let outline = '';
    const steps = 60;
    const yTip = (mm * 1000);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = -R - 40 + ((Math.min(yTip, R + 40) + R + 40) * i) / steps;
      pts.push([halfW(local(y)), y]);
    }
    outline = `M${f1(X(-pts[0][0]))} ${f1(Y(pts[0][1]))}` + pts.map(([w, y]) => `L${f1(X(-w))} ${f1(Y(y))}`).join('')
      + [...pts].reverse().map(([w, y]) => `L${f1(X(w))} ${f1(Y(y))}`).join('') + 'Z';
    let mer = '';
    let elong = '';
    let cap = '';
    let nuc = '';
    let dark = '';
    for (let x0 = -520 - rnd() * 30; x0 < 520;) {
      const w = 30 * (0.88 + rnd() * 0.24);
      let y = Math.min(yTip, R + 40);
      while (y > -R - 40) {
        const s0 = local(y);
        const L = (s0 < 0.35 ? 42 : cellLength(s0)) * (0.85 + rnd() * 0.3);
        const cy = y - L / 2;
        const sc = local(cy);
        const path = box(X(x0) + 0.4, Y(y - L) + 0.4, w * k - 0.8, L * k - 0.8);
        if (sc < 0.35) cap += path;
        else if (sc < 2.3) mer += path;
        else elong += path;
        if (sc >= 0.35) {
          const divides = rnd() < 0.11 * dividingFactor(sc);
          const r = (sc < 2.3 ? 9 : 7) * k;
          if (divides) dark += dot(X(x0 + w / 2), Y(cy), r * 1.1);
          else nuc += dot(X(x0 + w / 2), Y(cy + (sc > 2.6 ? (rnd() - 0.5) * L * 0.4 : 0)), r);
        }
        y -= L;
      }
      x0 += w;
    }
    const clipId = `ov${Math.random().toString(36).slice(2)}`;
    const clipPath = s('clipPath', { id: clipId }, [s('path', { d: outline })]);
    return [
      s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: '#fdf6ec' }),
      clipPath,
      s('g', { 'clip-path': `url(#${clipId})` }, [
        s('path', { d: outline, fill: '#f7e3ea' }),
        s('path', { d: cap, fill: '#f1e6d6', stroke: '#d6bfa2', 'stroke-width': 0.5 }),
        s('path', { d: mer, fill: '#efc0d1', stroke: '#c58aa2', 'stroke-width': 0.5 }),
        s('path', { d: elong, fill: '#f8e6ed', stroke: '#d3a3b8', 'stroke-width': 0.5 }),
        s('path', { d: nuc, fill: '#b5487a' }),
        s('path', { d: dark, fill: '#7a1244' }),
      ]),
      s('path', { d: outline, fill: 'none', stroke: '#b07890', 'stroke-width': 1.5 }),
    ];
  }

  // ---------- Предметное стекло ----------
  function updateSlide(dt) {
    if (params.slide === 1 && (sl === 'rest' || sl === 'drag')) sl = 'fly';
    if (params.slide === 0 && (sl === 'on' || sl === 'fly')) {
      sl = 'rest';
      Object.assign(slPos, SLIDE_REST);
    }
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
    const free = sl === 'rest' || sl === 'drag';
    slideNode.style.pointerEvents = free ? '' : 'none';
    slideNode.style.cursor = free ? 'grab' : '';
    slideLabel.setAttribute('opacity', sl === 'rest' ? 1 : 0);
    slideShadow.setAttribute('opacity', sl === 'rest' ? 1 : 0);
    if (!held.has(slideNode)) place(slideNode, sl === 'drag' || sl === 'fly' ? topLayer : slideHome);
    const dx = sl === 'on' ? shift : 0;
    slideNode.setAttribute('transform', `translate(${(slPos.x + dx).toFixed(1)} ${slPos.y.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  const held = new Set();
  slideNode.addEventListener('pointerdown', () => {
    moved = false;
    if (sl !== 'rest') return;
    held.add(slideNode);
    place(slideNode, topLayer);
  });
  const release = () => held.delete(slideNode);
  slideNode.addEventListener('pointerup', release);
  slideNode.addEventListener('pointercancel', release);

  draggable(scene, slideNode, {
    onDrag(x, y) {
      if (sl !== 'rest' && sl !== 'drag') return;
      if (sl === 'rest') {
        grab.dx = slPos.x - x;
        grab.dy = slPos.y - y;
        sl = 'drag';
      }
      moved = true;
      slPos.x = Math.max(20, Math.min(940, x + grab.dx));
      slPos.y = Math.max(60, Math.min(BENCH - 4, y + grab.dy));
    },
    onEnd() {
      // Простой щелчок по стеклу тоже кладёт его на столик: на телефоне тащить маленькое стекло неудобно
      if (sl === 'rest' && !moved) {
        sl = 'fly';
        set('slide', 1);
        return;
      }
      if (sl !== 'drag') return;
      // Стекло отпустили над предметным столиком — оно ложится под объектив
      if (Math.abs(slPos.x - STAGE.x) < 90 && Math.abs(slPos.y - STAGE.y) < 80) {
        sl = 'fly';
        set('slide', 1);
      } else {
        sl = 'rest';
        Object.assign(slPos, SLIDE_REST);
      }
    },
  });

  // Рамку на схеме корня ведут вдоль корня — меняется участок препарата под объективом
  draggable(scene, marker, { onDrag: (x) => set('dist', (x - ROOT.x0) / ROOT.mm) });

  scene.svg.style.userSelect = 'none';
  return scene;
}
