// График измерений: каждая точка — одно показание прибора при изменении регулятора.
// Серии разделяют опыты с разным вторым параметром (например, R = 10 Ом и R = 20 Ом).

import { label } from './canvas.js';

const PALETTE = ['#1a5cff', '#f97316', '#10b981', '#a855f7', '#db2777', '#0891b2'];
const PAD = { left: 64, right: 16, top: 24, bottom: 40 };

export function createChart(box, { xMin, xMax, xLabel, yLabel }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'chart-canvas';
  canvas.setAttribute('role', 'img');
  box.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const series = new Map(); // название → Map(x → y)

  function add(name, x, y) {
    if (!series.has(name)) series.set(name, new Map());
    series.get(name).set(x, y);
    draw();
  }

  function clear() {
    series.clear();
    draw();
  }

  function draw() {
    const rect = box.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = rect.width;
    const h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const all = [...series.values()].flatMap((m) => [...m.values()]);
    const yMax = Math.max(1e-9, ...all) * 1.15;
    const yMin = Math.min(0, ...all) * 1.15;
    const px = (x) => PAD.left + ((x - xMin) / (xMax - xMin)) * (w - PAD.left - PAD.right);
    const py = (y) => h - PAD.bottom - ((y - yMin) / (yMax - yMin)) * (h - PAD.top - PAD.bottom);

    // Сетка и оси
    ctx.strokeStyle = '#e4e9f2';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * (h - PAD.top - PAD.bottom);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();
      const value = yMax - (yMax - yMin) * (i / 4);
      label(ctx, formatTick(value), PAD.left - 8, y, { size: 11, align: 'right', color: '#64748b', weight: 400 });
    }
    for (let i = 0; i <= 4; i++) {
      const xv = xMin + (i / 4) * (xMax - xMin);
      label(ctx, formatTick(xv), px(xv), h - PAD.bottom + 14, { size: 11, color: '#64748b', weight: 400 });
    }
    label(ctx, xLabel, (w + PAD.left) / 2, h - 8, { size: 12, color: '#475569' });
    ctx.save();
    ctx.translate(14, (h - PAD.bottom + PAD.top) / 2);
    ctx.rotate(-Math.PI / 2);
    label(ctx, yLabel, 0, 0, { size: 12, color: '#475569' });
    ctx.restore();

    if (!all.length) {
      label(ctx, 'Меняйте регуляторы — здесь появятся точки измерений', (w + PAD.left) / 2, (h - PAD.bottom) / 2, { size: 12, color: '#94a3b8', weight: 400 });
      canvas.setAttribute('aria-label', 'График измерений пока пуст');
      return;
    }

    // Линии и точки серий + легенда
    let legendX = PAD.left + 6;
    [...series.entries()].forEach(([name, points], i) => {
      const color = PALETTE[i % PALETTE.length];
      const sorted = [...points.entries()].sort((a, b) => a[0] - b[0]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      sorted.forEach(([x, y], k) => (k ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
      ctx.stroke();
      ctx.fillStyle = color;
      for (const [x, y] of sorted) {
        ctx.beginPath();
        ctx.arc(px(x), py(y), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(legendX, 4, 10, 10);
      label(ctx, name, legendX + 16, 9, { size: 11, align: 'left', color: '#334155', weight: 400 });
      legendX += 24 + ctx.measureText(name).width;
    });
    canvas.setAttribute('aria-label', `График: ${yLabel} от ${xLabel}, точек: ${all.length}`);
  }

  const observer = new ResizeObserver(draw);
  observer.observe(box);

  return {
    add,
    clear,
    destroy() {
      observer.disconnect();
      box.replaceChildren();
    },
  };
}

function formatTick(v) {
  const digits = Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 1 ? 1 : 2;
  return v.toFixed(digits).replace('.', ',');
}
