// Набор SVG-иллюстраций лабораторного оборудования в едином стиле.
// Сцена имеет фиксированную систему координат 960×540 (16:9) и масштабируется целиком,
// поэтому композиция одинакова на любом экране. Оборудование рисуется один раз;
// в каждом кадре меняются только атрибуты (уровень жидкости, стрелка прибора, пузыри).

const NS = 'http://www.w3.org/2000/svg';
export const W = 960;
export const H = 540;

export const INK = '#1e293b';
export const PALETTE = {
  bench: '#f1f5f9',
  benchEdge: '#cbd5e1',
  wall: '#f8fafc',
  metal: '#94a3b8',
  metalDark: '#475569',
  glassEdge: '#94a3b8',
  label: '#334155',
};

// Создание SVG-элемента: s('rect', { x: 0, ... }, [children])
export function s(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const c of [children].flat()) if (c) node.append(c);
  return node;
}

export function text(x, y, value, { size = 16, weight = 500, fill = PALETTE.label, anchor = 'middle' } = {}) {
  const t = s('text', { x, y, 'font-size': size, 'font-weight': weight, fill, 'text-anchor': anchor, 'dominant-baseline': 'middle', 'font-family': 'Geologica, system-ui, sans-serif' });
  t.textContent = value;
  return t;
}

let uid = 0;
const id = (p) => `${p}${++uid}`;

// Пользователь просит меньше движения: декоративные колыхания (пламя, марево, дрожание)
// гасим до еле заметных, а сами опыты — пузыри, стрелки, уровни — идут как обычно.
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Сцена ----------

// Создаёт SVG-сцену в контейнере и цикл анимации. build(svg, defs) рисует оборудование,
// frame(dt, now) обновляет его в каждом кадре.
export function createScene(container, { build, frame }) {
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sim-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  const defs = s('defs');
  svg.append(defs);
  container.replaceChildren(svg);
  const shared = sharedDefs(defs);
  build(svg, shared);

  let raf = 0;
  let last = performance.now();
  // Первый кадр — сразу, не дожидаясь requestAnimationFrame: без него подвижные части стоят
  // в (0, 0), и превью-снимок сцены (фоновая вкладка, медленная машина) выходит сломанным.
  // Микрозадача, а не прямой вызов: frame() может ссылаться на то, что сцена объявляет
  // уже после createScene().
  let alive = true;
  queueMicrotask(() => { if (alive) frame?.(0, last / 1000); });
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame?.(dt, now / 1000);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    svg,
    // Координаты указателя в системе сцены (960×540)
    point(e) {
      const p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      svg.remove();
    },
  };
}

// Общие градиенты и фильтры: стекло, металл, мягкая тень, свечение
function sharedDefs(defs) {
  const ids = { glass: id('glass'), metal: id('metal'), shadow: id('shadow'), glow: id('glow'), soft: id('soft'), wall: id('wall'), vignette: id('vignette') };
  defs.append(
    // Стекло: свет падает слева-сверху — яркая кромка слева, узкий контровой блик справа,
    // середина почти прозрачная (толщина стенки видна только по краям, как у настоящей посуды)
    s('linearGradient', { id: ids.glass, x1: 0, x2: 1 }, [
      s('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 0.7 }),
      s('stop', { offset: 0.06, 'stop-color': '#ffffff', 'stop-opacity': 0.28 }),
      s('stop', { offset: 0.2, 'stop-color': '#ffffff', 'stop-opacity': 0.06 }),
      s('stop', { offset: 0.78, 'stop-color': '#e2e8f0', 'stop-opacity': 0.04 }),
      s('stop', { offset: 0.9, 'stop-color': '#94a3b8', 'stop-opacity': 0.14 }),
      s('stop', { offset: 0.96, 'stop-color': '#ffffff', 'stop-opacity': 0.55 }),
      s('stop', { offset: 1, 'stop-color': '#cbd5e1', 'stop-opacity': 0.4 }),
    ]),
    s('linearGradient', { id: ids.metal, x1: 0, x2: 1 }, [
      s('stop', { offset: 0, 'stop-color': '#64748b' }),
      s('stop', { offset: 0.35, 'stop-color': '#e2e8f0' }),
      s('stop', { offset: 1, 'stop-color': '#64748b' }),
    ]),
    // Тень предмета на столе: плотное ядро у точки касания и мягкий широкий ореол
    s('radialGradient', { id: ids.shadow }, [
      s('stop', { offset: 0, 'stop-color': '#0f172a', 'stop-opacity': 0.42 }),
      s('stop', { offset: 0.35, 'stop-color': '#0f172a', 'stop-opacity': 0.24 }),
      s('stop', { offset: 0.7, 'stop-color': '#0f172a', 'stop-opacity': 0.07 }),
      s('stop', { offset: 1, 'stop-color': '#0f172a', 'stop-opacity': 0 }),
    ]),
    s('radialGradient', { id: ids.glow }, [
      s('stop', { offset: 0, 'stop-color': '#fde68a', 'stop-opacity': 0.95 }),
      s('stop', { offset: 1, 'stop-color': '#fde68a', 'stop-opacity': 0 }),
    ]),
    s('linearGradient', { id: ids.wall, x1: 0, y1: 0, x2: 0, y2: 1 }, [
      s('stop', { offset: 0, 'stop-color': '#ffffff' }),
      s('stop', { offset: 1, 'stop-color': '#eef2f8' }),
    ]),
    // Виньетка комнаты: края кадра чуть темнее — взгляд собирается к установке в центре
    s('radialGradient', { id: ids.vignette, cx: 0.5, cy: 0.42, r: 0.75 }, [
      s('stop', { offset: 0.55, 'stop-color': '#0f172a', 'stop-opacity': 0 }),
      s('stop', { offset: 1, 'stop-color': '#0f172a', 'stop-opacity': 0.14 }),
    ]),
    s('filter', { id: ids.soft, x: '-20%', y: '-20%', width: '140%', height: '140%' }, [
      s('feDropShadow', { dx: 0, dy: 6, stdDeviation: 6, 'flood-color': '#0f172a', 'flood-opacity': 0.12 }),
    ]),
  );
  // Градиенты «на месте»: d.lin(['#fff', '#000'], 'h') → url(#…). Кэшируются по набору цветов.
  const cache = new Map();
  const gradient = (tag, stops, attrs) => {
    const key = tag + JSON.stringify(stops) + JSON.stringify(attrs);
    if (!cache.has(key)) {
      const gid = id('g');
      const list = stops.map((st, i) => (Array.isArray(st) ? st : [i / (stops.length - 1), st]));
      defs.append(s(tag, { id: gid, ...attrs }, list.map(([offset, color, opacity = 1]) => s('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }))));
      cache.set(key, `url(#${gid})`);
    }
    return cache.get(key);
  };
  return {
    ...ids,
    url: (k) => `url(#${ids[k]})`,
    // dir: 'h' — слева направо (объём цилиндров), 'v' — сверху вниз
    lin: (stops, dir = 'h') => gradient('linearGradient', stops, dir === 'h' ? { x1: 0, y1: 0, x2: 1, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: 1 }),
    rad: (stops, fx = 0.35, fy = 0.3) => gradient('radialGradient', stops, { fx, fy }),
  };
}

// Цилиндрическое тело: светлее слева-по-центру, темнее к краям
export const cylinderShade = (d, color) => d.lin([[0, shade(color, -0.3)], [0.3, shade(color, 0.25)], [0.55, color], [1, shade(color, -0.4)]]);

// ---------- Обстановка ----------

// Стена лаборатории (светлая, с мягким светом сверху) и лабораторный стол
// с тёмной химически стойкой столешницей, как в настоящих школьных и вузовских лабораториях.
// Возвращает высоту столешницы.
// Обстановки (theme): каждая область знаний — в своём помещении, чтобы опыты не выглядели одинаково.
//   lab   — химическая лаборатория: светлая плитка, тёмная столешница (по умолчанию)
//   hood  — вытяжной шкаф: металлический короб, стекло-створка сверху, подсветка
//   dark  — затемнённая оптическая комната: тёмные стены, матовый чёрный стол
//   stand — физический кабинет: перфорированная панель-стенд, светлый деревянный стол
//   bio   — кабинет биологии: тёплая стена, окно со светом, светлый ламинированный стол
const THEMES = {
  lab: { wall: ['#f3f5f8', '#dde3ea'], apron: ['#cfd6df', '#b8c1cc'], top: ['#4a5563', '#374151'], front: ['#1f2937', '#111827'], edge: '#9ca3af', light: 0.7 },
  hood: { wall: ['#e5e9ee', '#c9d1da'], apron: ['#aab4bf', '#94a0ad'], top: ['#6b7280', '#4b5563'], front: ['#374151', '#1f2937'], edge: '#d1d5db', light: 0.9 },
  dark: { wall: ['#1e2430', '#12161d'], apron: ['#232a36', '#1a1f28'], top: ['#2b313b', '#1f242c'], front: ['#0d1015', '#07090c'], edge: '#3b4250', light: 0 },
  stand: { wall: ['#eef1f4', '#dfe4ea'], apron: ['#c7b299', '#b59c80'], top: ['#d9bf98', '#c4a47a'], front: ['#9c7b55', '#7d5f3f'], edge: '#ead7b8', light: 0.5 },
  bio: { wall: ['#f6f3ee', '#e7e0d6'], apron: ['#d8cfc2', '#c9bfb0'], top: ['#e8e4dc', '#d6d0c5'], front: ['#b8b0a2', '#9d9486'], edge: '#f7f4ee', light: 0.6 },
};

export function room(svg, d, { benchY = 430, theme = 'lab' } = {}) {
  const t = THEMES[theme] ?? THEMES.lab;
  svg.append(s('rect', { x: 0, y: 0, width: W, height: benchY, fill: d.lin([[0, t.wall[0]], [1, t.wall[1]]], 'v') }));

  if (theme === 'stand') {
    // Перфорированная панель физического стенда
    const holes = s('g', { fill: '#c5ccd5' });
    for (let y = 40; y < benchY - 30; y += 28) for (let x = 40; x < W - 20; x += 28) holes.append(s('circle', { cx: x, cy: y, r: 2.2 }));
    svg.append(s('rect', { x: 20, y: 20, width: W - 40, height: benchY - 40, rx: 6, fill: '#e4e8ed', stroke: '#cbd2da' }), holes);
  } else if (theme === 'bio') {
    // Окно с дневным светом и подоконником
    svg.append(
      s('rect', { x: 610, y: 40, width: 300, height: 210, rx: 6, fill: d.lin([[0, '#dbeafe'], [1, '#eff6ff']], 'v'), stroke: '#cbbfae', 'stroke-width': 10 }),
      s('path', { d: 'M760 40 V250 M610 145 H910', stroke: '#cbbfae', 'stroke-width': 6 }),
      s('rect', { x: 596, y: 250, width: 328, height: 12, rx: 3, fill: '#d6ccbd' }),
      s('path', { d: 'M620 60 L 900 60 L 760 250 Z', fill: '#ffffff', 'fill-opacity': 0.25 }),
    );
  } else if (theme === 'hood') {
    // Вытяжной шкаф: короб, приподнятая стеклянная створка, лампа
    svg.append(
      s('rect', { x: 0, y: 0, width: W, height: 70, fill: d.lin([[0, '#9aa5b1'], [1, '#7b8794']], 'v') }),
      s('rect', { x: 0, y: 62, width: W, height: 8, fill: '#5b6673' }),
      s('rect', { x: 40, y: 18, width: W - 80, height: 10, rx: 5, fill: '#fefce8', opacity: 0.9 }),
      s('rect', { x: 0, y: 70, width: W, height: 70, fill: '#dbeafe', 'fill-opacity': 0.25, stroke: '#94a3b8', 'stroke-width': 3 }),
      s('rect', { x: 0, y: 70, width: 22, height: benchY - 70, fill: d.lin([[0, '#6b7280'], [1, '#9ca3af']]) }),
      s('rect', { x: W - 22, y: 70, width: 22, height: benchY - 70, fill: d.lin([[0, '#9ca3af'], [1, '#6b7280']]) }),
      s('rect', { x: 60, y: 150, width: 90, height: 8, rx: 4, fill: '#64748b' }),
      s('rect', { x: W - 150, y: 150, width: 90, height: 8, rx: 4, fill: '#64748b' }),
    );
  }

  if (t.light) svg.append(s('ellipse', { cx: W * 0.45, cy: 0, rx: W * 0.6, ry: benchY * 0.9, fill: d.rad([[0, '#ffffff', t.light], [1, '#ffffff', 0]], 0.5, 0.2) }));
  svg.append(
    s('rect', { x: 0, y: benchY - 10, width: W, height: 10, fill: d.lin([[0, t.apron[0]], [1, t.apron[1]]], 'v') }),
    s('rect', { x: 0, y: benchY, width: W, height: 16, fill: d.lin([[0, t.top[0]], [1, t.top[1]]], 'v') }),
    s('rect', { x: 0, y: benchY, width: W, height: 1.5, fill: t.edge, 'fill-opacity': 0.8 }),
    s('rect', { x: 0, y: benchY + 16, width: W, height: H - benchY - 16, fill: d.lin([[0, t.front[0]], [1, t.front[1]]], 'v') }),
  );
  return benchY;
}

export function floorShadow(cx, cy, rx, d, ry = rx * 0.18) {
  return s('ellipse', { cx, cy, rx, ry, fill: d.url('shadow') });
}

// ---------- Оборудование ----------

// Химический стакан с делениями. Возвращает группу и функции управления жидкостью.
export function beaker(d, { x, bottom, w = 150, h = 190 }) {
  const top = bottom - h;
  const clip = id('clip');
  const g = s('g');
  g.append(
    floorShadow(x, bottom + 4, w * 0.7, d),
    s('clipPath', { id: clip }, [s('path', { d: vesselPath(x, top, w, h) })]),
    // задняя стенка: стекло слегка затемняет фон
    s('path', { d: vesselPath(x, top, w, h), fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
  );
  const liquid = s('rect', { x: x - w / 2, y: bottom, width: w, height: 0, fill: '#bae6fd', 'fill-opacity': 0.8, 'clip-path': `url(#${clip})` });
  // Объём жидкости: светлее у поверхности и по центру, темнее у стенок и дна
  const volume = s('rect', { x: x - w / 2, y: bottom, width: w, height: 0, fill: d.lin([[0, '#0f172a', 0.18], [0.3, '#ffffff', 0.12], [0.7, '#ffffff', 0], [1, '#0f172a', 0.22]]), 'clip-path': `url(#${clip})` });
  const depth = s('rect', { x: x - w / 2, y: bottom, width: w, height: 0, fill: d.lin([[0, '#ffffff', 0.15], [1, '#0f172a', 0.12]], 'v'), 'clip-path': `url(#${clip})` });
  const surface = s('ellipse', { cx: x, cy: bottom, rx: w / 2 - 3, ry: 7, fill: '#ffffff', 'fill-opacity': 0.45, stroke: '#ffffff', 'stroke-opacity': 0.7, 'stroke-width': 1.5, 'clip-path': `url(#${clip})` });
  const content = s('g', { 'clip-path': `url(#${clip})` }); // пузыри, осадок, кусочки
  g.append(liquid, volume, depth, content, surface);
  // мерные деления с цифрами, как на настоящем стакане
  for (let i = 1; i <= 4; i++) {
    const yy = bottom - (h * i) / 5;
    g.append(
      s('line', { x1: x + w / 2 - 30, x2: x + w / 2 - 10, y1: yy, y2: yy, stroke: '#64748b', 'stroke-opacity': 0.7, 'stroke-width': 2 }),
      text(x + w / 2 - 36, yy, String(i * 50), { size: 11, weight: 500, fill: '#64748b', anchor: 'end' }),
    );
  }
  // стекло поверх: блики, толщина стенок, носик
  g.append(
    s('path', { d: vesselPath(x, top, w, h), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    s('path', { d: `M${x - w / 2 - 10} ${top - 2} Q ${x - w / 2} ${top - 2} ${x - w / 2} ${top + 6}`, stroke: '#94a3b8', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }),
    s('path', { d: `M${x - w / 2} ${top} H${x + w / 2}`, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    s('rect', { x: x - w / 2 + 12, y: top + 16, width: 9, height: h - 44, rx: 4.5, fill: '#ffffff', 'fill-opacity': 0.75 }),
    s('rect', { x: x - w / 2 + 26, y: top + 24, width: 4, height: h * 0.45, rx: 2, fill: '#ffffff', 'fill-opacity': 0.5 }),
  );

  let level = 0;
  return {
    g,
    content,
    top,
    bottom,
    w,
    get surfaceY() {
      return bottom - h * level;
    },
    setLevel(v) {
      level = Math.max(0, Math.min(0.9, v));
      const y = bottom - h * level;
      for (const r of [liquid, volume, depth]) {
        r.setAttribute('y', y);
        r.setAttribute('height', h * level + 10);
      }
      surface.setAttribute('cy', y);
      surface.setAttribute('opacity', level > 0.01 ? 1 : 0);
    },
    setColor(c) {
      liquid.setAttribute('fill', c);
    },
  };
}

function vesselPath(x, top, w, h) {
  const r = 18;
  return `M${x - w / 2} ${top} V${top + h - r} Q${x - w / 2} ${top + h} ${x - w / 2 + r} ${top + h} H${x + w / 2 - r} Q${x + w / 2} ${top + h} ${x + w / 2} ${top + h - r} V${top}`;
}

// Нагревательная плитка: металлическая конфорка, корпус с табло температуры и ручкой.
// setHeat(0..1) раскаляет конфорку, setTemp(t) показывает температуру на табло.
export function hotplate(d, { x, y, w = 230 }) {
  const glowEl = s('ellipse', { cx: x, cy: y - 2, rx: w * 0.46, ry: 22, fill: d.rad([[0, '#fb923c', 0.9], [1, '#fb923c', 0]], 0.5, 0.5), opacity: 0 });
  const cold = d.lin(['#475569', '#94a3b8', '#475569']);
  const plateTop = s('rect', { x: x - w * 0.42, y: y - 8, width: w * 0.84, height: 10, rx: 5, fill: cold });
  const screen = text(x - w / 2 + 52, y + 26, '20°C', { size: 13, weight: 700, fill: '#22d3ee' });
  const g = s('g', {}, [
    floorShadow(x, y + 46, w * 0.62, d),
    glowEl,
    s('rect', { x: x - w / 2, y, width: w, height: 44, rx: 12, fill: d.lin([[0, '#475569'], [0.2, '#334155'], [1, '#1e293b']], 'v') }),
    s('rect', { x: x - w / 2 + 4, y: y + 2, width: w - 8, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.15 }),
    plateTop,
    s('rect', { x: x - w / 2 + 16, y: y + 14, width: 72, height: 24, rx: 6, fill: '#0f172a' }),
    screen,
    s('circle', { cx: x + w / 2 - 30, cy: y + 26, r: 12, fill: d.rad(['#fdba74', '#ea580c']) }),
    s('rect', { x: x + w / 2 - 31.5, y: y + 16, width: 3, height: 9, rx: 1.5, fill: '#fff7ed' }),
  ]);
  // Цвет раскалённой конфорки меняется ступенями — чтобы не плодить градиенты на каждый кадр
  const hot = [0.25, 0.5, 0.75, 1].map((k) => d.lin([[0, '#7c2d12'], [0.5, mixHex('#94a3b8', '#f97316', k)], [1, '#7c2d12']]));
  return {
    g,
    setHeat(v) {
      glowEl.setAttribute('opacity', Math.min(1, v * 1.1));
      plateTop.setAttribute('fill', v > 0.05 ? hot[Math.min(3, Math.floor(v * 4))] : cold);
    },
    setTemp(t) {
      screen.textContent = `${Math.round(t)}°C`;
      screen.setAttribute('fill', t > 60 ? '#fb7185' : '#22d3ee');
    },
  };
}

// Стрелочный прибор (амперметр / вольтметр): корпус, шкала, стрелка и цифровое окно внизу
export function dial(d, { x, y, r = 44, letter, color = '#dc2626' }) {
  const cy = y + r * 0.2;
  const needle = s('line', { x1: x, y1: cy, x2: x, y2: cy - r * 0.72, stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
  const value = text(x, y + r * 0.72, '', { size: Math.round(r * 0.3), weight: 700, fill: '#0f172a' });
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const a = (-150 + (i * 120) / 10) * (Math.PI / 180);
    const r1 = r * 0.78;
    const r2 = r * (i % 5 === 0 ? 0.6 : 0.68);
    ticks.push(s('line', { x1: x + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1, x2: x + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2, stroke: '#334155', 'stroke-width': i % 5 === 0 ? 2 : 1 }));
  }
  const g = s('g', { filter: d.url('soft') }, [
    s('rect', { x: x - r - 6, y: y - r - 6, width: r * 2 + 12, height: r * 2 + 12, rx: 18, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
    s('rect', { x: x - r, y: y - r, width: r * 2, height: r * 2, rx: 12, fill: d.lin([[0, '#ffffff'], [1, '#e2e8f0']], 'v') }),
    ...ticks,
    text(x - r * 0.62, y - r * 0.68, letter, { size: Math.round(r * 0.3), weight: 800, fill: '#334155' }),
    needle,
    s('circle', { cx: x, cy, r: 4.5, fill: '#1e293b' }),
    s('rect', { x: x - r * 0.62, y: y + r * 0.5, width: r * 1.24, height: r * 0.42, rx: 5, fill: '#ecfeff', stroke: '#a5f3fc' }),
    value,
    s('path', { d: `M${x - r} ${y - r + 12} Q ${x - r} ${y - r} ${x - r + 12} ${y - r} H ${x + r * 0.2} L ${x - r} ${y + r * 0.1} Z`, fill: '#ffffff', 'fill-opacity': 0.35 }),
  ]);
  return {
    g,
    set(fraction, label) {
      const angle = -60 + 120 * Math.max(0, Math.min(1, fraction));
      needle.setAttribute('transform', `rotate(${angle} ${x} ${cy})`);
      value.textContent = label;
    },
  };
}

// Цифровой прибор: подпись и значение — на его собственном табло, а не поверх сцены
export function readout(d, { x, y, w = 150, caption, color = '#34d399' }) {
  const value = text(x + w / 2, y + 44, '', { size: 22, weight: 700, fill: color });
  const g = s('g', { filter: d.url('soft') }, [
    s('rect', { x, y, width: w, height: 70, rx: 14, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
    s('rect', { x: x + 8, y: y + 24, width: w - 16, height: 38, rx: 7, fill: '#0f172a' }),
    caption ? text(x + w / 2, y + 13, caption, { size: 11, weight: 600, fill: '#cbd5e1' }) : null,
    value,
  ]);
  return { g, set: (v) => { value.textContent = v; } };
}

// Пузырёк газа (переиспользуемый пул)
export function bubblePool(parent, count, { color = '#ffffff' } = {}) {
  const items = Array.from({ length: count }, () => {
    const c = s('circle', { r: 4, fill: color, 'fill-opacity': 0.9, stroke: '#93c5fd', 'stroke-width': 1, opacity: 0 });
    parent.append(c);
    return { c, x: 0, y: 0, v: 0, alive: false };
  });
  return {
    spawn(x, y, r = 3 + Math.random() * 3) {
      const b = items.find((i) => !i.alive);
      if (!b) return;
      Object.assign(b, { x, y, v: 50 + Math.random() * 50, alive: true });
      b.c.setAttribute('r', r);
      b.c.setAttribute('opacity', 1);
    },
    update(dt, topY, wobble = 0) {
      for (const b of items) {
        if (!b.alive) continue;
        b.y -= b.v * dt;
        b.x += Math.sin(b.y * 0.08) * wobble;
        if (b.y < topY) {
          b.alive = false;
          b.c.setAttribute('opacity', 0);
          continue;
        }
        b.c.setAttribute('cx', b.x);
        b.c.setAttribute('cy', b.y);
      }
    },
    clear() {
      for (const b of items) {
        b.alive = false;
        b.c.setAttribute('opacity', 0);
      }
    },
  };
}

// Перетаскивание элемента сцены: onDrag получает координаты в системе 960×540
export function draggable(scene, node, { onDrag, onEnd }) {
  node.style.cursor = 'grab';
  node.addEventListener('pointerdown', (e) => {
    node.setPointerCapture(e.pointerId);
    node.style.cursor = 'grabbing';
    const move = (ev) => {
      const p = scene.point(ev);
      onDrag(p.x, p.y);
    };
    const up = () => {
      node.style.cursor = 'grab';
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      onEnd?.();
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  });
}

// ---------- Цвета ----------

export function mixHex(a, b, t) {
  const pa = hex(a);
  const pb = hex(b);
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function hex(h) {
  const v = h.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(color, amount) {
  return amount >= 0 ? mixHex(color, '#ffffff', amount) : mixHex(color, '#000000', -amount);
}
