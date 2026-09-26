// Детали кабинета биологии поверх room(..., { theme: 'bio' }): комнатные растения в горшках
// на подоконнике. Общий помощник для биологических сцен, чтобы не дублировать рисунок в каждой.
// Координаты подоконника совпадают с окном из kit.js (подоконник x 596–924, верх y 250).

import { s } from './kit.js';

export const SILL_Y = 250;

// Терракотовый горшок с поддоном; bottom — y донышка, возвращает y верхнего края земли
function pot(g, d, x, bottom, w, h) {
  const top = bottom - h;
  g.append(
    s('ellipse', { cx: x, cy: bottom, rx: w * 0.62, ry: 3, fill: '#0f172a', 'fill-opacity': 0.12 }),
    s('path', { d: `M${x - w / 2} ${top + 5} L${x - w * 0.36} ${bottom} H${x + w * 0.36} L${x + w / 2} ${top + 5} Z`, fill: d.lin([[0, '#9a5236'], [0.35, '#c7764f'], [1, '#8a4630']]) }),
    s('rect', { x: x - w / 2 - 3, y: top, width: w + 6, height: 7, rx: 2, fill: d.lin([[0, '#b8653f'], [0.35, '#d98a60'], [1, '#9a5236']]) }),
    s('ellipse', { cx: x, cy: top + 1.5, rx: w / 2, ry: 2.5, fill: '#4a3426' }),
  );
  return top + 1;
}

// Лиственное растение (традесканция/хлорофитум): веер вытянутых листьев
function leafy(g, d, x, soil, sc) {
  const leaf = d.lin([[0, '#3f7d3a'], [0.5, '#6aa85a'], [1, '#2f6a2c']], 'v');
  for (let i = 0; i < 9; i++) {
    // угол от вертикали: крайние листья поникают, центральные стоят прямо
    const a = -72 + i * 18 + ((i * 37) % 7) - 3;
    const len = (30 + ((i * 53) % 17) - Math.abs(a) * 0.08) * sc;
    g.append(s('path', {
      d: `M0 0 Q ${len * 0.35} ${-len * 0.2} ${len} ${Math.sign(a) * len * 0.12} Q ${len * 0.35} ${len * 0.12} 0 0 Z`,
      fill: leaf, transform: `translate(${x} ${soil}) rotate(${a - 90})`,
    }));
  }
}

// Пеларгония: округлые листья и соцветие
function geranium(g, d, x, soil, sc) {
  const leaf = d.rad(['#7fb069', '#3d6e34'], 0.4, 0.35);
  g.append(s('path', { d: `M${x} ${soil} C ${x - 3} ${soil - 20 * sc}, ${x + 4} ${soil - 34 * sc}, ${x + 2} ${soil - 46 * sc}`, stroke: '#4d7c3a', 'stroke-width': 2.2, fill: 'none' }));
  for (const [dx, dy, r] of [[-16, -12, 11], [14, -14, 12], [-6, -26, 10], [10, -30, 9], [-18, -30, 8]]) {
    g.append(s('circle', { cx: x + dx * sc, cy: soil + dy * sc, r: r * sc, fill: leaf, stroke: '#35602d', 'stroke-width': 0.8 }));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.append(s('circle', { cx: x + 2 + Math.cos(a) * 6 * sc, cy: soil - 48 * sc + Math.sin(a) * 4 * sc, r: 4 * sc, fill: i % 2 ? '#d9485f' : '#c23a50' }));
  }
}

// Горох на подпорке: тонкий стебель, парные листочки, стручки — отсылка к опытам Менделя
function pea(g, d, x, soil, sc) {
  const leaf = d.lin([[0, '#8dbb62'], [1, '#4f7f35']], 'v');
  const h = 70 * sc;
  g.append(
    s('line', { x1: x + 8, y1: soil + 2, x2: x + 8, y2: soil - h - 6, stroke: '#b08a5a', 'stroke-width': 2 }),
    s('path', { d: `M${x} ${soil} C ${x + 6} ${soil - h * 0.3}, ${x - 4} ${soil - h * 0.6}, ${x + 6} ${soil - h}`, stroke: '#5e8c3a', 'stroke-width': 2, fill: 'none' }),
  );
  for (let i = 0; i < 4; i++) {
    const y = soil - h * (0.2 + i * 0.22);
    const cx = x + (i % 2 ? 3 : 0);
    g.append(
      s('ellipse', { cx: cx - 9 * sc, cy: y, rx: 8 * sc, ry: 4.5 * sc, fill: leaf, transform: `rotate(-20 ${cx - 9 * sc} ${y})` }),
      s('ellipse', { cx: cx + 9 * sc, cy: y - 2, rx: 8 * sc, ry: 4.5 * sc, fill: leaf, transform: `rotate(20 ${cx + 9 * sc} ${y - 2})` }),
    );
  }
  for (const [dx, dy] of [[-12, 0.45], [12, 0.62]]) {
    const y = soil - h * dy;
    g.append(s('path', { d: `M${x + dx * sc - 4} ${y} q 4 14 2 22 q -6 -8 -2 -22 z`, fill: '#9cc56b', stroke: '#5e8c3a', 'stroke-width': 0.8 }));
  }
}

const KINDS = { leafy, geranium, pea };

// items: [{ x, kind: 'leafy' | 'geranium' | 'pea', scale }]
export function sillPlants(svg, d, items) {
  const g = s('g');
  for (const { x, kind = 'leafy', scale = 1 } of items) {
    const soil = pot(g, d, x, SILL_Y, 34 * scale, 30 * scale);
    KINDS[kind](g, d, x, soil, scale);
  }
  svg.append(g);
  return g;
}
