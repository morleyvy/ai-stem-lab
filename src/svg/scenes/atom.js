// Сцена «Конструктор атома»: в центре стены — доска с моделью атома: ядро из протонов и нейтронов,
// вокруг — электронные слои (вкладка «Энергетические уровни») или энергетическая диаграмма с ячейками
// орбиталей s, p, d (вкладка «Подуровни s, p, d»). На столе — три чашки с частицами:
//   щелчок по чашке — частица перелетает в ядро или на электронный слой (p, n, e + 1);
//   кнопка «−» у чашки — частица возвращается в чашку (− 1);
//   щелчок по вкладке доски — смена модели (view).
// Числа (элемент, A, заряд, формула) показывает панель показаний под сценой, поэтому на доске
// только сам атом, символ элемента и число электронов на слоях.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, reducedMotion, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 466;
// Доска рисуется в своих координатах и сдвигается в центр сцены целиком
const OFF = 249;
const BOARD = { x: 0, y: 18, w: 462, h: 394 };
const C = { x: 231, y: 242 }; // центр ядра
const SHELL_R = [72, 100, 128, 156];
const NUC_R = 6.4; // радиус нуклона
const MAX_NUC = 86;
const MAX_E = 36;
const BLOCK_FILL = { s: '#fecdd3', p: '#fde68a', d: '#bfdbfe' };
const COLORS = { p: '#ef4444', n: '#94a3b8', e: '#3b82f6' };
const TRAYS = [
  { id: 'p', x: 200, label: 'протоны p⁺' },
  { id: 'n', x: 480, label: 'нейтроны n⁰' },
  { id: 'e', x: 760, label: 'электроны e⁻' },
];

// Ячейки энергетической диаграммы: столбец по типу подуровня (s, p, d), высота — по энергии.
// 4s нарисован ниже 3d — видно, почему он заполняется раньше.
const BOX = 26;
const DIAGRAM = {
  '1s': { x: 100, y: 372 }, '2s': { x: 100, y: 322 }, '2p': { x: 186, y: 300 }, '3s': { x: 100, y: 250 },
  '3p': { x: 186, y: 228 }, '4s': { x: 100, y: 178 }, '3d': { x: 298, y: 160 }, '4p': { x: 186, y: 112 },
};

export function atomScene(container, params, set, model) {
  const { ELEMENTS, ORDER, config, levels, massNumber } = model;
  let nucleons, electrons, shells, shellTags, bohr, diagram, arrows, tabs, flights, symbol;
  let key = '';
  let spin = 0;
  const prev = { p: params.p, n: params.n, e: params.e };
  const motion = reducedMotion() ? 0.15 : 1;

  // Сфера-шарик частицы: блик слева сверху, тень справа снизу
  const ball = (d, color) => d.rad([[0, shade(color, 0.65)], [0.45, color], [1, shade(color, -0.45)]], 0.35, 0.3);

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'lab' });
      const fills = { p: ball(d, COLORS.p), n: ball(d, COLORS.n), e: ball(d, COLORS.e) };

      // ---------- Доска с моделью атома ----------
      const { x, y, w, h } = BOARD;
      const board = s('g', { transform: `translate(${OFF} 0)` });
      svg.append(board);
      board.append(
        s('rect', { x, y, width: w, height: h, rx: 6, fill: d.lin(['#9ca3af', '#e5e7eb', '#6b7280'], 'v'), filter: d.url('soft') }),
        s('rect', { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 3, fill: d.lin([[0, '#fdfdfb'], [1, '#eef0ec']], 'v') }),
        s('path', { d: `M${x + 40} ${y + 10} L${x + w - 80} ${y + 10} L${x + w - 150} ${y + h - 10} L${x + 12} ${y + h - 10} Z`, fill: '#ffffff', 'fill-opacity': 0.35 }),
        s('rect', { x: x + 50, y: y + h - 2, width: w - 100, height: 8, rx: 2, fill: d.lin(['#d1d5db', '#6b7280'], 'v') }),
      );

      // Вкладки модели — это и есть переключатель view: щелчок по вкладке меняет рисунок на доске
      tabs = [0, 1].map((i) => {
        const tx = x + 14 + i * 214;
        const bg = s('rect', { x: tx, y: y + 14, width: 206, height: 32, rx: 8 });
        const label = text(tx + 103, y + 30, tr(['Энергетические уровни', 'Подуровни s, p, d'][i]), { size: 14, weight: 600 });
        const g = s('g', {}, [bg, label]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('view', i);
        });
        touchTarget(g, 6);
        board.append(g);
        return { bg, label };
      });

      // Модель Бора: электронные слои вокруг ядра
      bohr = s('g');
      board.append(bohr);
      bohr.append(s('circle', { cx: C.x, cy: C.y, r: 62, fill: d.rad([[0, '#fde68a', 0.55], [1, '#fde68a', 0]], 0.5, 0.5) }));
      shells = SHELL_R.map((r) => {
        const c = s('circle', { cx: C.x, cy: C.y, r, fill: 'none', stroke: '#64748b', 'stroke-width': 1.6 });
        bohr.append(c);
        return c;
      });
      // Подписи слоёв — в углу доски, а не на самих орбитах: там их закрывали бы бегущие электроны
      shellTags = SHELL_R.map((_, i) => {
        const tag = text(446, 336 + i * 19, '', { size: 14, weight: 600, fill: '#475569', anchor: 'end' });
        bohr.append(tag);
        return tag;
      });
      // Ядро: внешние нуклоны в DOM раньше внутренних — центр шара «ближе» к зрителю
      const nucLayer = s('g');
      nucleons = Array.from({ length: MAX_NUC }, () => {
        const c = s('circle', { r: NUC_R, stroke: '#00000022', 'stroke-width': 0.6, opacity: 0 });
        nucLayer.append(c);
        return c;
      });
      bohr.append(nucLayer);
      const eLayer = s('g');
      electrons = Array.from({ length: MAX_E }, () => {
        const c = s('circle', { r: 5.5, fill: fills.e, stroke: '#1e3a8a', 'stroke-width': 0.8, opacity: 0 });
        eLayer.append(c);
        return c;
      });
      bohr.append(eLayer);
      // Символ элемента в углу доски: сразу видно, какой элемент получился
      symbol = text(400, 110, '', { size: 48, weight: 800, fill: '#1e293b' });
      bohr.append(symbol);

      // Энергетическая диаграмма с ячейками орбиталей
      diagram = s('g');
      board.append(diagram);
      // Ось энергии с подписью вдоль неё
      const energy = text(44, 250, tr('Энергия'), { size: 14, weight: 600, fill: '#475569' });
      energy.setAttribute('transform', 'rotate(-90 44 250)');
      diagram.append(
        s('path', { d: 'M60 398 V96', stroke: '#475569', 'stroke-width': 2 }),
        s('path', { d: 'M54 106 L60 92 L66 106 Z', fill: '#475569' }),
        energy,
      );
      arrows = {};
      for (const o of ORDER) {
        const at = DIAGRAM[o.id];
        const m = [1, 3, 5][o.l];
        diagram.append(text(at.x - 8, at.y + BOX / 2, o.id, { size: 15, weight: 700, fill: '#334155', anchor: 'end' }));
        arrows[o.id] = [];
        for (let k = 0; k < m; k++) {
          const bx = at.x + k * BOX;
          const up = s('path', { d: `M${bx + 9} ${at.y + 20} V${at.y + 6} M${bx + 5.5} ${at.y + 10} L${bx + 9} ${at.y + 5} L${bx + 12.5} ${at.y + 10}`, fill: 'none', stroke: '#1d4ed8', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
          const down = s('path', { d: `M${bx + 17} ${at.y + 6} V${at.y + 20} M${bx + 13.5} ${at.y + 16} L${bx + 17} ${at.y + 21} L${bx + 20.5} ${at.y + 16}`, fill: 'none', stroke: '#dc2626', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
          diagram.append(s('rect', { x: bx, y: at.y, width: BOX, height: BOX, fill: BLOCK_FILL[['s', 'p', 'd'][o.l]], 'fill-opacity': 0.55, stroke: '#334155', 'stroke-width': 1.4 }), up, down);
          arrows[o.id].push({ up, down });
        }
      }

      // ---------- Чашки с частицами ----------
      for (const t of TRAYS) svg.append(buildTray(d, t, fills[t.id]));

      // Частицы в полёте между чашкой и атомом
      const flyLayer = s('g', { 'pointer-events': 'none' });
      flights = Array.from({ length: 10 }, () => {
        const c = s('circle', { r: 6, opacity: 0 });
        flyLayer.append(c);
        return { c, t: 1 };
      });
      svg.append(flyLayer);
      flights.fills = fills;
    },

    frame(dt) {
      const k = `${params.p}-${params.n}-${params.e}-${params.view}`;
      if (k !== key) {
        key = k;
        launch();
        redraw();
      }
      spin += dt * motion;
      if (!params.view) placeElectrons();
      for (const f of flights) {
        if (f.t >= 1) continue;
        f.t = Math.min(1, f.t + dt / 0.45);
        const u = f.t * f.t * (3 - 2 * f.t);
        const px = f.x0 + (f.x1 - f.x0) * u;
        const py = f.y0 + (f.y1 - f.y0) * u - Math.sin(Math.PI * u) * 70;
        f.c.setAttribute('cx', px.toFixed(1));
        f.c.setAttribute('cy', py.toFixed(1));
        f.c.setAttribute('opacity', f.t >= 1 ? 0 : 1);
      }
    },
  });

  // Чашка (часовое стекло) с горкой частиц, подпись на кромке стола и кнопки «+» и «−»
  function buildTray(d, t, fill) {
    const { x } = t;
    const top = BENCH - 18;
    const r = t.id === 'e' ? 4.5 : 6.5;
    const pile = [];
    const rows = [[-30, -15, 0, 15, 30], [-22, -7, 8, 23], [-14, 1, 16], [-6, 9]];
    rows.forEach((row, j) => row.forEach((dx) => pile.push(s('circle', { cx: x + dx * (r / 6.5) * 1.1, cy: top - 1 - j * r * 1.6, r, fill, stroke: '#0000002a', 'stroke-width': 0.6 }))));
    const dish = s('g', {}, [
      // Невидимая зона попадания: между шариками горки щелчок иначе проходил бы «мимо» чашки
      s('rect', { x: x - 66, y: top - 40, width: 132, height: BENCH - top + 52, fill: 'transparent', 'pointer-events': 'all' }),
      floorShadow(x, BENCH + 2, 70, d),
      s('path', { d: `M${x - 64} ${top} Q${x} ${BENCH + 14} ${x + 64} ${top} Z`, fill: d.lin([[0, '#dbe4ef', 0.7], [1, '#94a3b8', 0.6]], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
      ...pile,
      s('ellipse', { cx: x, cy: top, rx: 64, ry: 6, fill: '#ffffff', 'fill-opacity': 0.25, stroke: '#cbd5e1', 'stroke-width': 1.5 }),
    ]);
    dish.style.cursor = 'pointer';
    dish.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set(t.id, params[t.id] + 1);
    });
    touchTarget(dish, 12);
    const btn = (bx, sign, delta) => {
      const g = s('g', {}, [
        s('circle', { cx: bx, cy: top - 14, r: 15, fill: d.lin([[0, '#ffffff'], [1, '#e2e8f0']], 'v'), stroke: '#64748b', 'stroke-width': 1.5, filter: d.url('soft') }),
        text(bx, top - 13, sign, { size: 22, weight: 700, fill: delta > 0 ? '#15803d' : '#b91c1c' }),
      ]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set(t.id, params[t.id] + delta);
      });
      touchTarget(g, 8);
      return g;
    };
    return s('g', {}, [
      dish,
      btn(x - 92, '+', 1),
      btn(x + 92, '−', -1),
      text(x, BENCH + 40, tr(t.label), { size: 15, weight: 600, fill: '#e2e8f0' }),
    ]);
  }

  // Где на рисунке окажется электрон с номером i (для полёта из чашки)
  function shellPoint(i) {
    const lv = levels({ ...params, e: i + 1 });
    const r = SHELL_R[lv.length - 1];
    const a = -Math.PI / 4 + spin * 0.6;
    return { x: OFF + C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r };
  }

  // Видимый отклик на каждую добавленную или убранную частицу: она перелетает между чашкой и атомом
  function launch() {
    for (const t of TRAYS) {
      const delta = params[t.id] - prev[t.id];
      const count = Math.min(Math.abs(delta), 3);
      for (let i = 0; i < count; i++) {
        const f = flights.find((x) => x.t >= 1);
        if (!f) break;
        const idx = delta > 0 ? params[t.id] - 1 - i : prev[t.id] - 1 - i;
        const at = t.id === 'e' && !params.view ? shellPoint(Math.min(idx, MAX_E - 1)) : { x: OFF + C.x, y: C.y };
        const tray = { x: t.x, y: BENCH - 34 };
        const [from, to] = delta > 0 ? [tray, at] : [at, tray];
        Object.assign(f, { x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: -i * 0.25 });
        f.c.setAttribute('fill', flights.fills[t.id]);
        f.c.setAttribute('r', t.id === 'e' ? 5.5 : NUC_R + 0.5);
      }
      prev[t.id] = params[t.id];
    }
  }

  function redraw() {
    const view = params.view;
    tabs.forEach((tab, i) => {
      const on = i === view;
      tab.bg.setAttribute('fill', on ? '#1d4ed8' : '#e2e8f0');
      tab.bg.setAttribute('stroke', on ? '#1e3a8a' : '#94a3b8');
      tab.label.setAttribute('fill', on ? '#ffffff' : '#334155');
    });
    bohr.setAttribute('display', view ? 'none' : 'inline');
    diagram.setAttribute('display', view ? 'inline' : 'none');

    // Ядро: нуклоны по спирали «подсолнуха» — плотный шар, растущий с массовым числом
    const A = massNumber(params);
    nucleons.forEach((c, k) => {
      if (k >= A) {
        c.setAttribute('opacity', 0);
        return;
      }
      const j = A - 1 - k;
      const rr = 6 * Math.sqrt(j + 0.5);
      const a = j * 2.39996;
      const proton = Math.floor(((j + 1) * params.p) / A) > Math.floor((j * params.p) / A);
      c.setAttribute('cx', (C.x + Math.cos(a) * rr).toFixed(1));
      c.setAttribute('cy', (C.y + Math.sin(a) * rr).toFixed(1));
      c.setAttribute('fill', proton ? flights.fills.p : flights.fills.n);
      c.setAttribute('opacity', 1);
    });
    const lv = levels(params);
    shells.forEach((c, i) => {
      const used = i < lv.length;
      c.setAttribute('stroke-opacity', used ? 0.85 : 0.25);
      c.setAttribute('stroke-dasharray', used ? 'none' : '4 6');
      shellTags[i].textContent = used ? `n = ${i + 1}:  ${lv[i]} e⁻` : '';
    });

    // Диаграмма: в каждой ячейке не больше двух электронов; сначала по одному (правило Хунда)
    const occ = config(params);
    for (const o of ORDER) {
      const boxes = arrows[o.id];
      const k = occ[o.id];
      boxes.forEach((b, i) => {
        b.up.setAttribute('opacity', i < k ? 1 : 0);
        b.down.setAttribute('opacity', i < k - boxes.length ? 1 : 0);
      });
    }

    symbol.textContent = ELEMENTS[params.p - 1].symbol;
  }

  // Электроны равномерно по своему слою; внешние слои вращаются медленнее внутренних
  function placeElectrons() {
    const lv = levels(params);
    let idx = 0;
    lv.forEach((count, i) => {
      const r = SHELL_R[i];
      const speed = 0.9 / (i + 1);
      for (let j = 0; j < count; j++) {
        const a = -Math.PI / 2 + (2 * Math.PI * j) / count + spin * speed + i * 0.4;
        const c = electrons[idx++];
        c.setAttribute('cx', (C.x + Math.cos(a) * r).toFixed(1));
        c.setAttribute('cy', (C.y + Math.sin(a) * r).toFixed(1));
        c.setAttribute('opacity', 1);
      }
    });
    for (; idx < MAX_E; idx++) electrons[idx].setAttribute('opacity', 0);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
