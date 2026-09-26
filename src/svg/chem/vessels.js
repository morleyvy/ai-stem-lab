// Сосуды химических установок. У всех одинаковый интерфейс (как у стакана из kit.js):
// g, content (слой под стеклом для пузырей/осадка/кусочков), x, top, bottom, w, surfaceY,
// setLevel, setColor — плюс геометрия, которая нужна сцене, чтобы не знать, какой это сосуд:
//   pourAt(L)  — где держать склянку длиной L, чтобы струя попала в горлышко
//   floorAt(x) — где на дне осядет частица осадка
//   solid      — масштаб и раскладка кусочков металла/мела на дне
//   inner      — полуширина области, где появляется осадок

import { beaker, s } from '../kit.js';

// clipPath-ы должны быть уникальны во всём документе: превью создают несколько сцен сразу.
let uid = 0;
const nextId = () => `chemclip${++uid}`;

// Мерный стакан из kit.js с добавленной геометрией для сцены.
export function labBeaker(d, { x, bottom, w, h }) {
  const b = beaker(d, { x, bottom, w, h });
  return Object.assign(b, {
    kind: 'beaker',
    x,
    inner: (w - 30) / 2,
    pile: 14,
    solid: { scale: 1, y: bottom - 14, offset: -40, spread: 40 },
    mouth: { x, y: bottom - h },
    floorAt: () => bottom - 6,
    // Склянку держим справа над стаканом: горлышко после наклона оказывается над краем
    pourAt: () => ({ x: x + 175, y: bottom - h - 10 }),
  });
}

// Пробирка с круглым дном. sideArm — боковой отвод у горлышка (пробирка для получения газа).
export function testTube(d, { x, bottom, w = 46, h = 200, sideArm = false }) {
  const r = w / 2;
  const top = bottom - h;
  const outline = `M${x - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
  const clip = nextId();
  const g = s('g');
  g.append(
    s('clipPath', { id: clip }, [s('path', { d: `${outline} Z` })]),
    s('path', { d: outline, fill: d.lin([[0, '#dbe4ef', 0.45], [0.5, '#f1f5f9', 0.15], [1, '#cbd5e1', 0.5]]) }),
  );
  const liquid = s('rect', { x: x - r, y: bottom, width: w, height: 0, fill: '#bae6fd', 'fill-opacity': 0.82, 'clip-path': `url(#${clip})` });
  const volume = s('rect', { x: x - r, y: bottom, width: w, height: 0, fill: d.lin([[0, '#0f172a', 0.22], [0.3, '#ffffff', 0.14], [0.7, '#ffffff', 0], [1, '#0f172a', 0.26]]), 'clip-path': `url(#${clip})` });
  const surface = s('ellipse', { cx: x, cy: bottom, rx: r - 2, ry: 3.5, fill: '#ffffff', 'fill-opacity': 0.45, stroke: '#ffffff', 'stroke-opacity': 0.7, 'stroke-width': 1.2, opacity: 0 });
  const content = s('g', { 'clip-path': `url(#${clip})` });
  g.append(liquid, volume, content, surface);

  let armEnd = null;
  if (sideArm) {
    // Отвод припаян к стенке чуть ниже горлышка и уходит вправо-вверх
    const ax = x + r;
    const ay = top + 30;
    armEnd = { x: ax + 42, y: ay - 12 };
    g.append(
      s('path', { d: `M${ax - 2} ${ay} L${armEnd.x} ${armEnd.y}`, stroke: '#94a3b8', 'stroke-width': 9, 'stroke-linecap': 'round' }),
      s('path', { d: `M${ax - 2} ${ay} L${armEnd.x} ${armEnd.y}`, stroke: '#f1f5f9', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    );
  }
  g.append(
    s('path', { d: outline, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    // отогнутый край горлышка
    s('ellipse', { cx: x, cy: top, rx: r + 3, ry: 3.5, fill: 'none', stroke: '#94a3b8', 'stroke-width': 2.5 }),
    s('rect', { x: x - r + 6, y: top + 12, width: 5, height: h - r - 24, rx: 2.5, fill: '#ffffff', 'fill-opacity': 0.7 }),
  );

  let level = 0;
  return {
    g,
    content,
    kind: 'tube',
    x,
    top,
    bottom,
    w,
    armEnd,
    inner: r - 6,
    pile: 5,
    solid: { scale: 0.5, y: bottom - 11, offset: -5, spread: 10 },
    mouth: { x, y: top },
    get surfaceY() {
      return bottom - h * level;
    },
    setLevel(v) {
      level = Math.max(0, Math.min(0.9, v));
      const y = bottom - h * level;
      for (const el of [liquid, volume]) {
        el.setAttribute('y', y);
        el.setAttribute('height', h * level + 4);
      }
      surface.setAttribute('cy', y);
      surface.setAttribute('opacity', level > 0.01 ? 1 : 0);
    },
    setColor(c) {
      liquid.setAttribute('fill', c);
    },
    // Дно круглое: частица у стенки ложится выше, чем в центре
    floorAt(px) {
      const dx = Math.min(Math.abs(px - x), r - 2);
      return bottom - r + Math.sqrt(r * r - dx * dx) - 3;
    },
    // Струя должна попасть в узкое горлышко: склянку держим так, чтобы её горлышко было над пробиркой
    pourAt(L) {
      return { x: x + 0.966 * L + 12, y: top - 0.259 * L - 14 };
    },
  };
}
