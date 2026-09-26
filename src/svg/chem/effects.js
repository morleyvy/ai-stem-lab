// Кратковременные эффекты химической сцены: пар, дымок, вспышка, ударная волна, пена, лучинка.
// Элементы создаются только в момент события и удаляются по окончании,
// а пена — постоянный небольшой набор кругов, у которого в кадре меняются атрибуты.

import { s } from '../kit.js';

const MAX_WISPS = 60;

export function createFx(layer, d) {
  const list = []; // { node, t, life, step(p, t) }

  function push(node, life, step) {
    layer.append(node);
    list.push({ node, t: 0, life, step });
  }

  return {
    // Клуб пара/дыма: растёт, поднимается и тает. drift — снос вбок (тяга вытяжки, сквозняк)
    wisp(x, y, { r0 = 10, r1 = 32, rise = 40, life = 2.2, color = '#cbd5e1', opacity = 0.5, drift = 0 } = {}) {
      if (layer.childElementCount >= MAX_WISPS) return;
      // Мягкий край радиальным градиентом (кэшируется по цвету) — без дорогого фильтра размытия
      const c = s('circle', { cx: x, cy: y, r: r0, fill: d.rad([[0, color, 1], [0.55, color, 0.65], [1, color, 0]], 0.5, 0.5), opacity: 0 });
      const wobble = Math.random() * 6;
      push(c, life, (p, t) => {
        c.setAttribute('cy', y - rise * t);
        c.setAttribute('cx', x + drift * t + Math.sin(t * 2 + wobble) * 4);
        c.setAttribute('r', r0 + (r1 - r0) * p);
        // Быстро проявляется и медленно тает
        c.setAttribute('opacity', opacity * Math.min(1, p * 6) * (1 - p));
      });
    },
    // Вспышка сгорающего водорода
    flash(x, y) {
      const c = s('circle', { cx: x, cy: y, r: 12, fill: d.url('glow') });
      push(c, 0.5, (p) => {
        c.setAttribute('r', 16 + 80 * Math.sqrt(p));
        c.setAttribute('opacity', 1 - p);
      });
      const core = s('path', { d: 'M0 -34 L7 -8 L30 -14 L10 2 L22 26 L0 10 L-22 26 L-10 2 L-30 -14 L-7 -8 Z', fill: '#fde047', stroke: '#f97316', 'stroke-width': 2, transform: `translate(${x} ${y})` });
      push(core, 0.28, (p) => {
        core.setAttribute('transform', `translate(${x} ${y}) scale(${0.6 + 0.8 * p})`);
        core.setAttribute('opacity', 1 - p);
      });
    },
    // Ударная волна хлопка — расходящееся кольцо
    shock(x, y) {
      // Тёплый оттенок, чтобы кольцо читалось и на светлой стене
      for (const [delay, width] of [[0, 3.5], [0.08, 2]]) {
        const c = s('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke: '#f59e0b', 'stroke-width': width, opacity: 0 });
        push(c, 0.6 + delay, (p, t) => {
          const q = Math.max(0, (t - delay) / 0.6);
          c.setAttribute('r', 10 + 120 * q);
          c.setAttribute('opacity', q > 0 ? 0.85 * (1 - q) : 0);
        });
      }
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.t += dt;
        const p = Math.min(1, e.t / e.life);
        e.step(p, e.t);
        if (p >= 1) {
          e.node.remove();
          list.splice(i, 1);
        }
      }
    },
    clear() {
      for (const e of list) e.node.remove();
      list.length = 0;
    },
  };
}

// Пена у поверхности при бурной реакции: белые пузырьки, которые «кипят» на месте
export function foamLayer(vessel, count) {
  const g = s('g', { opacity: 0 });
  const dots = Array.from({ length: count }, (_, i) => {
    const c = s('circle', { r: 3, fill: '#ffffff', 'fill-opacity': 0.85, stroke: '#cbd5e1', 'stroke-width': 0.8 });
    g.append(c);
    // Два ряда: крупные пузырьки внизу и мелкие сверху — получается шапка пены
    const row = i % 2;
    return { c, row, k: ((i * 0.618) % 1), phase: (i * 2.39) % 6.28, size: (row ? 1.8 : 2.6) + ((i * 37) % 5) * 0.4 };
  });
  vessel.content.append(g);
  let shown = 0;
  return {
    update(amount, now) {
      if (amount < 0.02 && shown < 0.02) return;
      shown = amount;
      g.setAttribute('opacity', Math.min(0.95, amount * 1.2));
      const y = vessel.surfaceY;
      const span = vessel.inner * 2 + 8;
      for (const dt of dots) {
        const bob = Math.sin(now * 7 + dt.phase);
        dt.c.setAttribute('cx', vessel.x + (dt.k - 0.5) * span + Math.sin(now * 3 + dt.phase) * 2);
        dt.c.setAttribute('cy', y - 1 - dt.row * (3 + amount * 4) - amount * 3 * Math.abs(bob));
        dt.c.setAttribute('r', dt.size * (0.7 + amount * 0.6) + bob * 0.4);
      }
    },
  };
}

// Лучинка: деревянная палочка с обугленным кончиком. Кончик — в начале координат,
// рукоять уходит вправо; пламя рисуется отдельно, чтобы всегда тянулось вверх.
export function splintNodes(d) {
  const stick = s('g', { class: 'splint' }, [
    s('rect', { x: -4, y: -9, width: 132, height: 18, fill: 'transparent' }), // увеличенная зона захвата
    s('rect', { x: 0, y: -2.5, width: 124, height: 5, rx: 2, fill: d.lin([[0, '#f1dcb4'], [1, '#c9a36a']], 'v') }),
    s('rect', { x: 0, y: -2.5, width: 11, height: 5, rx: 2, fill: '#3b2a1c' }),
  ]);
  const ember = s('circle', { r: 3, fill: '#f97316', opacity: 0 });
  const flame = s('g', { opacity: 0 }, [
    s('path', { d: 'M0 0 C -8 -4, -7 -17, 0 -28 C 7 -17, 8 -4, 0 0 Z', fill: d.rad([[0, '#fef3c7', 0.95], [0.55, '#fbbf24', 0.85], [1, '#f97316', 0.2]], 0.5, 0.75) }),
    s('path', { d: 'M0 -1 C -3 -3, -3 -9, 0 -13 C 3 -9, 3 -3, 0 -1 Z', fill: '#fff7ed' }),
  ]);
  return { stick, ember, flame };
}
