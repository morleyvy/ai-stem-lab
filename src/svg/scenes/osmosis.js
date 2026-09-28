// Сцена «Клетка в растворе»: световой микроскоп на столе и крупно — поле зрения окуляра
// с участком растительной ткани (клеточные стенки, цитоплазма с хлоропластами, ядро, вакуоль).
// В гипертоническом растворе протопласт сжимается и отходит от стенки (плазмолиз),
// в пресной воде — прижат к стенке, вакуоль увеличена (тургор). Значения — на табло справа.
// Сначала ученик наводит резкость винтом фокусировки: пока винт не в нужном положении,
// изображение в окуляре размыто (feGaussianBlur).

import { createScene, cylinderShade, floorShadow, readout, room, s } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const FIELD = { x: 575, y: 258, r: 200 };
const CELL = { w: 216, h: 124, gap: 12 }; // размер клетки (просвет внутри стенки) и толщина стенки
const CHLORO = 14;
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const KNOB = { x: 130, y: BENCH - 150, r: 20 }; // винт фокусировки на штативе
const FOCUS_BEST = 0.62; // положение винта, при котором препарат в фокусе
const FOCUS_TOL = 0.05; // допустимое отклонение — «резко»
const FOCUS_START = 0.12;
const DRAG_RANGE = 260; // столько пикселей вертикального хода мыши — полный ход винта

// Контур протопласта — прямоугольник со скруглёнными углами; при плазмолизе скругление растёт
function roundRect(cx, cy, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}

// Точка на «суперэллипсе» — хлоропласты лежат слоем вдоль края протопласта, как в живой клетке
function rim(cx, cy, w, h, a) {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return [cx + (w / 2) * Math.sign(c) * Math.abs(c) ** 0.5, cy + (h / 2) * Math.sign(sn) * Math.abs(sn) ** 0.5];
}

export function osmosisScene(container, params, set, { massChange }) {
  const cells = [];
  let conc, mass, blur, knobMark, cellsLayer;
  let lens = params.focus ? FOCUS_BEST : FOCUS_START; // положение винта 0..1
  let shownBlur = -1;
  let autoFocus = false; // кнопка шага выставила focus = 1 — сами докручиваем винт
  let shrink = 0; // 0 — протопласт прижат к стенке, 1 — максимальный плазмолиз
  let swell = 0; // 0..1 — насколько выражен тургор

  const target = () => {
    const dm = massChange(params.c);
    return { shrink: Math.max(0, Math.min(1, -dm / 30)), swell: Math.max(0, Math.min(1, dm / 4)) };
  };
  ({ shrink, swell } = target());

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      // Размытие изображения в окуляре: радиус меняется только при повороте винта
      const blurId = `blur${Math.random().toString(36).slice(2)}`;
      blur = s('feGaussianBlur', { stdDeviation: 0 });
      defs.append(s('filter', { id: blurId, x: '-5%', y: '-5%', width: '110%', height: '110%' }, [blur]));

      // ---------- Микроскоп ----------
      const mx = 170;
      const metalBody = d.lin([[0, '#3f4652'], [0.35, '#6b7482'], [1, '#262b33']]);
      svg.append(
        floorShadow(mx + 10, BENCH + 2, 110, d),
        // подковообразное основание
        s('path', { d: `M${mx - 80} ${BENCH} L${mx - 70} ${BENCH - 26} H${mx + 96} L${mx + 106} ${BENCH} Z`, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
        s('rect', { x: mx - 70, y: BENCH - 27, width: 166, height: 3, rx: 1.5, fill: '#9ca3af', 'fill-opacity': 0.5 }),
        // осветитель в основании
        s('ellipse', { cx: mx + 24, cy: BENCH - 30, rx: 18, ry: 5, fill: '#fef9c3', stroke: '#6b7280', 'stroke-width': 1.5 }),
        // штатив-дуга
        s('path', { d: `M${mx - 40} ${BENCH - 26} C ${mx - 80} ${BENCH - 110}, ${mx - 70} ${BENCH - 220}, ${mx - 10} ${BENCH - 262} L${mx + 8} ${BENCH - 236} C ${mx - 36} ${BENCH - 200}, ${mx - 44} ${BENCH - 110}, ${mx - 6} ${BENCH - 26} Z`, fill: metalBody }),
        // предметный столик со стеклом и каплей препарата
        s('rect', { x: mx - 40, y: BENCH - 92, width: 150, height: 12, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#111827']], 'v') }),
        s('rect', { x: mx - 6, y: BENCH - 97, width: 80, height: 5, rx: 1, fill: '#dbeafe', 'fill-opacity': 0.85, stroke: '#94a3b8', 'stroke-width': 0.8 }),
        s('ellipse', { cx: mx + 34, cy: BENCH - 97, rx: 10, ry: 2.5, fill: '#bbf7d0', 'fill-opacity': 0.9 }),
        s('rect', { x: mx - 30, y: BENCH - 100, width: 16, height: 4, rx: 1, fill: '#9ca3af' }),
        s('rect', { x: mx + 82, y: BENCH - 100, width: 16, height: 4, rx: 1, fill: '#9ca3af' }),
        // конденсор под столиком
        s('rect', { x: mx + 12, y: BENCH - 80, width: 24, height: 22, rx: 3, fill: cylinderShade(d, '#4b5563') }),
      );
      // Тубус с револьвером и наклонённым окуляром
      svg.append(s('g', { transform: `rotate(-18 ${mx + 24} ${BENCH - 250})` }, [
        s('rect', { x: mx + 6, y: BENCH - 330, width: 36, height: 100, rx: 4, fill: cylinderShade(d, '#4b5563') }),
        // окуляр
        s('rect', { x: mx + 12, y: BENCH - 370, width: 24, height: 44, rx: 3, fill: cylinderShade(d, '#374151') }),
        s('rect', { x: mx + 9, y: BENCH - 374, width: 30, height: 8, rx: 3, fill: cylinderShade(d, '#1f2937') }),
        s('rect', { x: mx + 12, y: BENCH - 344, width: 24, height: 3, fill: '#9ca3af' }),
      ]));
      svg.append(
        // револьвер и объективы
        s('path', { d: `M${mx - 14} ${BENCH - 200} Q ${mx + 24} ${BENCH - 222} ${mx + 64} ${BENCH - 200} L ${mx + 56} ${BENCH - 186} H ${mx - 6} Z`, fill: d.lin([[0, '#6b7280'], [1, '#1f2937']], 'v') }),
        s('rect', { x: mx + 14, y: BENCH - 188, width: 20, height: 44, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
        s('rect', { x: mx + 14, y: BENCH - 162, width: 20, height: 3, fill: '#b91c1c', 'fill-opacity': 0.8 }),
        s('rect', { x: mx + 18, y: BENCH - 144, width: 12, height: 22, rx: 2, fill: cylinderShade(d, '#9ca3af') }),
        s('rect', { x: mx - 10, y: BENCH - 186, width: 14, height: 28, rx: 3, fill: cylinderShade(d, '#6b7280'), transform: `rotate(18 ${mx - 3} ${BENCH - 186})` }),
        s('rect', { x: mx + 46, y: BENCH - 186, width: 14, height: 30, rx: 3, fill: cylinderShade(d, '#6b7280'), transform: `rotate(-18 ${mx + 53} ${BENCH - 186})` }),
      );

      // ---------- Поле зрения окуляра ----------
      const clip = `fov${Math.random().toString(36).slice(2)}`;
      defs.append(s('clipPath', { id: clip }, [s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r })]));
      const view = s('g', { 'clip-path': `url(#${clip})` });
      // Фон препарата — целлюлозные стенки; просветы клеток и протопласты рисуются поверх
      view.append(s('rect', { x: FIELD.x - FIELD.r, y: FIELD.y - FIELD.r, width: FIELD.r * 2, height: FIELD.r * 2, fill: '#d9dfc4' }));
      cellsLayer = s('g', { filter: `url(#${blurId})` });
      view.append(cellsLayer);

      const lumenFill = d.lin([[0, '#eef3ee'], [1, '#e2ebe6']], 'v');
      const cytoFill = d.rad([[0, '#e4efcf', 0.95], [1, '#bcd7a0', 0.95]], 0.4, 0.35);
      const vacFill = d.rad([[0, '#f6f8fb'], [1, '#e1e8f0']], 0.4, 0.35);
      const chloroFill = d.rad(['#6fae5a', '#2f6b2a'], 0.35, 0.3);
      const nucFill = d.rad(['#d8d0c0', '#9a8f7c'], 0.35, 0.3);
      // Ткань: ряды клеток «кирпичной кладкой», как в эпидермисе листа
      const stepX = CELL.w + CELL.gap;
      const stepY = CELL.h + CELL.gap;
      for (let j = -2; j <= 2; j++) {
        for (let i = -3; i <= 3; i++) {
          const cx = FIELD.x + i * stepX + (j % 2 ? stepX / 2 : 0);
          const cy = FIELD.y + j * stepY;
          if (Math.hypot(Math.max(0, Math.abs(cx - FIELD.x) - CELL.w / 2), Math.max(0, Math.abs(cy - FIELD.y) - CELL.h / 2)) > FIELD.r) continue;
          const seed = (i + 5) * 7 + (j + 5) * 13;
          const cell = {
            cx, cy, seed,
            lumen: s('path', { d: roundRect(cx, cy, CELL.w, CELL.h, 10), fill: lumenFill }),
            cyto: s('path', { fill: cytoFill, stroke: '#8fb07a', 'stroke-width': 1, 'stroke-opacity': 0.6 }),
            vac: s('ellipse', { fill: vacFill, stroke: '#c9d4de', 'stroke-width': 0.8 }),
            nuc: s('ellipse', { fill: nucFill, stroke: '#7d735f', 'stroke-width': 0.8 }),
            nucleolus: s('circle', { r: 3, fill: '#6f6553' }),
            chl: Array.from({ length: CHLORO }, () => s('ellipse', { rx: 6.5, ry: 3.8, fill: chloroFill })),
          };
          cellsLayer.append(cell.lumen, cell.cyto, cell.vac, ...cell.chl, cell.nuc, cell.nucleolus);
          cells.push(cell);
        }
      }
      // Виньетирование по краю поля зрения, как в настоящем окуляре
      view.append(s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r, fill: d.rad([[0, '#000000', 0], [0.78, '#000000', 0], [1, '#0f172a', 0.45]], 0.5, 0.5) }));

      svg.append(
        s('circle', { cx: FIELD.x, cy: FIELD.y + 8, r: FIELD.r + 14, fill: '#0f172a', 'fill-opacity': 0.12, filter: d.url('soft') }),
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 12, fill: d.lin([[0, '#4b5563'], [0.5, '#1f2937'], [1, '#111827']], 'v') }),
        view,
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 1, fill: 'none', stroke: '#0b0f14', 'stroke-width': 3 }),
        s('circle', { cx: FIELD.x, cy: FIELD.y, r: FIELD.r + 11, fill: 'none', stroke: '#9ca3af', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }),
      );

      // Табло на стене под окном: концентрация раствора и изменение массы ткани
      conc = readout(d, { x: 810, y: 284, w: 115, caption: 'NaCl, %', color: '#67e8f9' });
      mass = readout(d, { x: 810, y: 370, w: 115, caption: tr('Δm ткани, %') });
      svg.append(conc.g, mass.g);

      // Винт фокусировки (поверх штатива): накатка-риска показывает поворот
      knobMark = s('line', { x1: KNOB.x, y1: KNOB.y - 9, x2: KNOB.x, y2: KNOB.y - KNOB.r + 2, stroke: '#e5e7eb', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      const knob = s('g', { style: 'cursor: ns-resize' }, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: KNOB.r + 8, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: KNOB.r, fill: d.rad(['#9ca3af', '#1f2937']) }),
        ...Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return s('line', { x1: KNOB.x + Math.cos(a) * (KNOB.r - 3), y1: KNOB.y + Math.sin(a) * (KNOB.r - 3), x2: KNOB.x + Math.cos(a) * KNOB.r, y2: KNOB.y + Math.sin(a) * KNOB.r, stroke: '#111827', 'stroke-width': 1.5 });
        }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 9, fill: d.rad(['#d1d5db', '#4b5563']) }),
        knobMark,
      ]);
      svg.append(knob);
      bindKnob(knob);
    },

    frame(dt, now) {
      updateFocus(dt);
      const t = target();
      const k = Math.min(1, dt * 1.2);
      shrink += (t.shrink - shrink) * k;
      swell += (t.swell - swell) * k;

      for (const c of cells) {
        // Протопласт сжимается к центру клетки, у каждой клетки чуть по-своему
        const jitter = 0.85 + ((c.seed * 37) % 30) / 100;
        const sh = Math.min(1, shrink * jitter);
        const pw = CELL.w * (1 - 0.5 * sh) - 2;
        const ph = CELL.h * (1 - 0.42 * sh) - 2;
        const pr = 10 + sh * 45;
        const ox = ((c.seed % 5) - 2) * 4 * sh;
        const px = c.cx + ox;
        c.cyto.setAttribute('d', roundRect(px, c.cy, pw, ph, pr));

        // Вакуоль — главная «ёмкость» воды: растёт при тургоре, сжимается при плазмолизе
        const vk = 0.7 + 0.16 * swell - 0.22 * sh;
        c.vac.setAttribute('cx', px - pw * 0.06);
        c.vac.setAttribute('cy', c.cy);
        c.vac.setAttribute('rx', (pw / 2) * vk);
        c.vac.setAttribute('ry', (ph / 2) * (vk - 0.04));

        // Ядро прижато вакуолью к краю протопласта
        const nx = px + pw / 2 - 22 - sh * 4;
        const ny = c.cy - ph / 2 + 20 + sh * 4;
        c.nuc.setAttribute('cx', nx);
        c.nuc.setAttribute('cy', ny);
        c.nuc.setAttribute('rx', 13 - 2 * sh);
        c.nuc.setAttribute('ry', 10 - 1.5 * sh);
        c.nucleolus.setAttribute('cx', nx + 2);
        c.nucleolus.setAttribute('cy', ny - 1);

        // Хлоропласты медленно движутся по кругу вдоль мембраны (циклоз)
        c.chl.forEach((e, i) => {
          const a = (i / CHLORO) * Math.PI * 2 + now * 0.06 + c.seed;
          const [x, y] = rim(px, c.cy, pw - 16, ph - 13, a);
          e.setAttribute('cx', x);
          e.setAttribute('cy', y);
          const tangent = (Math.atan2(-Math.cos(a) * ph, Math.sin(a) * pw) * 180) / Math.PI;
          e.setAttribute('transform', `rotate(${tangent} ${x} ${y})`);
        });
      }

      const dm = massChange(params.c);
      conc.set(fmt(params.c));
      mass.set(`${dm > 0 ? '+' : ''}${fmt(dm)}`);
    },
  });

  const inFocus = () => Math.abs(lens - FOCUS_BEST) <= FOCUS_TOL;

  function turn(to) {
    lens = Math.max(0, Math.min(1, to));
    autoFocus = false;
  }

  // Результат фиксируем, когда ученик отпустил винт: проскочив фокус по пути, шаг не засчитывается
  function commit() {
    const ok = inFocus() ? 1 : 0;
    if (ok !== params.focus) set('focus', ok);
  }

  function updateFocus(dt) {
    if (params.focus === 1 && !inFocus()) autoFocus = true;
    if (autoFocus) {
      // Плавно докручиваем винт к резкому положению
      lens += (FOCUS_BEST - lens) * Math.min(1, dt * 4);
      if (Math.abs(lens - FOCUS_BEST) < 0.005) autoFocus = false;
    }
    knobMark.setAttribute('transform', `rotate(${lens * 720} ${KNOB.x} ${KNOB.y})`);
    // Вне допуска размытие растёт с расстоянием до фокуса; внутри — почти резко
    const off = Math.max(0, Math.abs(lens - FOCUS_BEST) - 0.015);
    const b = Math.round(Math.min(10, off * 45) * 10) / 10;
    if (b !== shownBlur) {
      shownBlur = b;
      blur.setAttribute('stdDeviation', b);
    }
  }

  // Винт: тянем вверх-вниз (поворот пропорционален ходу мыши) или щёлкаем по верхней/нижней половине
  function bindKnob(node) {
    node.addEventListener('pointerdown', (e) => {
      node.setPointerCapture(e.pointerId);
      const y0 = scene.point(e).y;
      const start = lens;
      let moved = false;
      const move = (ev) => {
        const dy = y0 - scene.point(ev).y;
        if (Math.abs(dy) > 3) moved = true;
        if (moved) turn(start + dy / DRAG_RANGE);
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        if (!moved) turn(start + (y0 < KNOB.y ? 0.04 : -0.04));
        commit();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });
  }

  return scene;
}
