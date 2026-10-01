// Сцена «Разделение смеси»: химический стол. Слева — подковообразный магнит и часовое стекло,
// мерный цилиндр с водой и стакан со смесью песка, соли и железных опилок; в центре — штатив
// с кольцом, воронкой и фильтром над колбой-приёмником; справа — фарфоровая чашка на треножнике
// над спиртовкой. Ученик сам ведёт разделение:
//   магнит тащат в стакан → опилки прилипают к полюсам и ссыпаются на часовое стекло (magnet = 1);
//   цилиндр тащат к стакану → вода выливается, соль растворяется, сколько позволяет объём (water = 1);
//   щелчок по стакану → смесь переливается в воронку, песок остаётся на фильтре (filter = 1);
//   щелчок по спиртовке → фильтрат выливается в чашку и выпаривается, остаются кристаллы (evaporate = 1).
// Сосуды при переливании наклоняются, а жидкость в них остаётся горизонтальной: её уровень
// ищется по площади сечения в наклонённом контуре, так что вода «уходит» через край, а не висит.
// Массы выделенных веществ сцена не дублирует: они в панели показаний под сценой.

import { tr } from '../../i18n.js';
import { createScene, cylinderShade, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';

const BENCH = 450;

const MAGNET_REST = { x: 52, y: BENCH };
const WATCH = { x: 125, y: BENCH - 6 };
const CYL = { x: 205, y: BENCH };
const GLASS = { x: 320, y: BENCH }; // стакан со смесью
const FLASK = { x: 560, y: BENCH }; // колба-приёмник под воронкой
const ROD_X = 450;
const FUNNEL = { x: 560, rim: 242, tip: 304, stemEnd: 352 };
const DISH = { x: 800, rim: 338, bottom: 372, r: 64 };
const LAMP = { x: 800, wick: 388 };

// Длительности операций, с — короткие, чтобы на уроке не ждать, но процесс было видно
const DUR = { magnet: 2.6, water: 2.4, filter: 4, evaporate: 3.8 };
const GLASS_FROM = { ...GLASS, a: 0 };
const FUNNEL_TO = { x: FUNNEL.x - 30, y: FUNNEL.rim - 12 }; // куда смотрит носик стакана при фильтровании
const DISH_TO = { x: DISH.x - 34, y: DISH.rim - 14 }; // куда смотрит горлышко колбы при выпаривании
const SNAP_X = 110; // насколько близко к стакану нужно отпустить магнит или цилиндр

// Внутренние контуры сосудов (локальные координаты: начало — середина дна снаружи)
const CYL_POLY = [[-15, -12], [15, -12], [15, -182], [-15, -182]];
const GLASS_POLY = [[-58, -2], [58, -2], [58, -150], [-58, -150]];
const FLASK_POLY = [[-58, -2], [58, -2], [13, -72], [13, -126], [-13, -126], [-13, -72]];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const rot = (x, y, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};

// Генератор с фиксированным зерном: крупинки лежат одинаково при каждом открытии сцены
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Площадь части многоугольника ниже горизонтали y = c (ось y направлена вниз)
function areaBelow(poly, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const in1 = y1 >= c;
    const in2 = y2 >= c;
    if (in1) out.push([x1, y1]);
    if (in1 !== in2) out.push([x1 + ((c - y1) / (y2 - y1)) * (x2 - x1), c]);
  }
  let a = 0;
  for (let i = 0; i < out.length; i++) {
    const [x1, y1] = out[i];
    const [x2, y2] = out[(i + 1) % out.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// Стеклянный сосуд, который можно наклонять. Жидкость — полуплоскость под горизонтальной
// поверхностью, обрезанная контуром сосуда; поверхность подбирается так, чтобы площадь жидкости
// равнялась её количеству, и не поднимается выше носика — лишнее «переливается».
function vessel(d, { outline, inner, poly, lip, fill, opacity = 0.7, shadowRx }) {
  const cid = `mx${Math.random().toString(36).slice(2)}`;
  const surf = s('rect', { x: -500, y: 0, width: 1000, height: 1000, fill, 'fill-opacity': opacity });
  const line = s('rect', { x: -500, y: 0, width: 1000, height: 2.5, fill: '#ffffff', 'fill-opacity': 0.75 });
  const counter = s('g', {}, [surf, line]);
  const contents = s('g', { 'pointer-events': 'none' });
  const front = s('g');
  // Тень видна, только пока сосуд стоит на столе, а не висит в воздухе при переливании
  const shadow = floorShadow(0, 3, shadowRx, d);
  const g = s('g', {}, [
    shadow,
    s('clipPath', { id: cid }, [s('path', { d: inner })]),
    s('path', { d: inner, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
    contents,
    s('g', { 'clip-path': `url(#${cid})`, 'pointer-events': 'none' }, [counter]),
    s('path', { d: outline, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    front,
  ]);
  const pose = { x: 0, y: 0, a: 0 };
  return {
    g,
    contents,
    front,
    pose,
    lip,
    setPose(x, y, a = 0) {
      Object.assign(pose, { x, y, a });
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(2)})`);
      counter.setAttribute('transform', `rotate(${(-a).toFixed(2)})`);
      shadow.setAttribute('opacity', y >= BENCH - 2 && Math.abs(a) < 1 ? 1 : 0);
    },
    // level — высота жидкости в стоящем сосуде, share — какая её доля ещё не вылита
    setFill(level, share = 1) {
      const area = areaBelow(poly, -level) * share;
      if (area < 4) {
        counter.setAttribute('opacity', 0);
        return;
      }
      const pts = poly.map(([x, y]) => rot(x, y, pose.a)).map((p) => [p.x, p.y]);
      let lo = Math.min(...pts.map((p) => p[1]));
      let hi = Math.max(...pts.map((p) => p[1]));
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (areaBelow(pts, mid) > area) lo = mid;
        else hi = mid;
      }
      const lipY = rot(lip.x, lip.y, pose.a).y;
      const y = Math.max(hi, lipY);
      counter.setAttribute('opacity', 1);
      surf.setAttribute('y', y.toFixed(1));
      line.setAttribute('y', (y - 1).toFixed(1));
    },
  };
}

// Переливание: сосуд переносится к приёмнику, наклоняется носиком к точке to и возвращается домой.
// t — 0..1; k — доля вылитого (0 до начала наклона, 1 после него)
function pourPose(v, from, home, to, a1, a2, t) {
  const at = (a) => {
    const r = rot(v.lip.x, v.lip.y, a);
    return { x: to.x - r.x, y: to.y - r.y, a };
  };
  if (t < 0.25) {
    const e = ease(t / 0.25);
    const p = at(a1);
    return { x: lerp(from.x, p.x, e), y: lerp(from.y, p.y, e) - Math.sin(e * Math.PI) * 30, a: lerp(from.a, a1, e), k: 0 };
  }
  if (t < 0.75) {
    const k = (t - 0.25) / 0.5;
    return { ...at(lerp(a1, a2, ease(k))), k };
  }
  const e = ease((t - 0.75) / 0.25);
  const p = at(a2);
  return { x: lerp(p.x, home.x, e), y: lerp(p.y, home.y, e) - Math.sin(e * Math.PI) * 30, a: lerp(a2, 0, e), k: 1 };
}

export function mixturesScene(container, params, set, { dissolved, residue }) {
  let cyl, glass, flask, magnet, ironLayer, funnelLiquid, residueBand, residueGrains, drops, dishLiquid, crystals;
  let crust, flame, flameGlow, lampCap, streamEl, steam, glows, resetBtn, rod;
  const sandGrains = [];
  const saltGrains = [];
  const irons = [];
  const T = { magnet: 0, water: 0, filter: 0, evaporate: 0 };
  // Откуда стартует операция: магнит и цилиндр могут быть отпущены учеником в любом месте
  let magnetFrom = { ...MAGNET_REST };
  let cylFrom = { ...CYL, a: 0 };
  const drag = { magnet: null, cyl: null };
  let clock = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });

      // Мягкая подсветка того, с чем сейчас можно работать
      glows = {
        magnet: s('ellipse', { cx: MAGNET_REST.x, cy: BENCH - 30, rx: 44, ry: 46 }),
        cyl: s('ellipse', { cx: CYL.x, cy: BENCH - 92, rx: 40, ry: 108 }),
        glass: s('ellipse', { cx: GLASS.x, cy: BENCH - 76, rx: 84, ry: 96 }),
        lamp: s('ellipse', { cx: LAMP.x, cy: BENCH - 40, rx: 58, ry: 50 }),
      };
      for (const el of Object.values(glows)) {
        el.setAttribute('fill', d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5));
        el.setAttribute('opacity', 0);
        el.setAttribute('pointer-events', 'none');
        svg.append(el);
      }

      buildStand(svg, d);
      buildBurner(svg, d);

      flask = vessel(d, {
        outline: 'M-13 -126 V-72 L-56 -12 Q-62 -2 -50 0 H50 Q62 -2 56 -12 L13 -72 V-126',
        inner: 'M-13 -126 V-72 L-56 -12 Q-62 -2 -50 0 H50 Q62 -2 56 -12 L13 -72 V-126 Z',
        poly: FLASK_POLY,
        lip: { x: 14, y: -127 },
        fill: '#dbeafe',
        opacity: 0.8,
        shadowRx: 70,
      });
      flask.front.append(
        s('rect', { x: -17, y: -131, width: 34, height: 6, rx: 3, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('path', { d: 'M-40 -16 L-8 -62', stroke: '#ffffff', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-opacity': 0.6 }),
      );
      svg.append(flask.g);

      buildFunnel(svg, d);

      // Капли фильтрата из носика воронки
      drops = [0, 1, 2].map(() => {
        const c = s('ellipse', { rx: 2.4, ry: 3.2, fill: '#bfdbfe', stroke: '#60a5fa', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
        svg.append(c);
        return { c, y: 0, on: false };
      });

      // Часовое стекло для железных опилок
      svg.append(
        floorShadow(WATCH.x, BENCH + 2, 38, d),
        s('path', { d: `M${WATCH.x - 34} ${WATCH.y - 4} Q ${WATCH.x} ${WATCH.y + 12} ${WATCH.x + 34} ${WATCH.y - 4}`, fill: d.lin([[0, '#e2e8f0', 0.7], [1, '#cbd5e1', 0.5]], 'v'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('path', { d: `M${WATCH.x - 22} ${WATCH.y} Q ${WATCH.x - 8} ${WATCH.y + 5} ${WATCH.x + 4} ${WATCH.y + 4}`, stroke: '#ffffff', 'stroke-width': 2, fill: 'none', 'stroke-opacity': 0.8 }),
      );

      // Мерный цилиндр на 100 мл: 1,5 px на миллилитр
      cyl = vessel(d, {
        outline: 'M-17 -184 V-14 Q-17 -12 -15 -12 H15 Q17 -12 17 -14 V-184',
        inner: 'M-17 -184 V-12 H17 V-184 Z',
        poly: CYL_POLY,
        lip: { x: 18, y: -185 },
        fill: '#bfdbfe',
        shadowRx: 34,
      });
      cyl.contents.before(s('path', { d: 'M-28 0 L-22 -12 H22 L28 0 Z', fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }));
      for (let v = 10; v <= 100; v += 10) {
        const y = -(12 + v * 1.5);
        cyl.front.append(s('line', { x1: -17, x2: v % 20 ? -9 : -4, y1: y, y2: y, stroke: '#475569', 'stroke-width': 1.4 }));
        if (v % 20 === 0) cyl.front.append(text(-22, y, String(v), { size: 13, weight: 600, fill: '#334155', anchor: 'end' }));
      }
      cyl.front.append(
        text(-22, -197, 'мл', { size: 13, weight: 600, fill: '#334155', anchor: 'end' }),
        s('path', { d: 'M17 -184 Q 22 -188 24 -186', stroke: '#94a3b8', 'stroke-width': 2.5, fill: 'none' }),
        s('rect', { x: -12, y: -170, width: 4, height: 140, rx: 2, fill: '#ffffff', 'fill-opacity': 0.6 }),
      );
      svg.append(cyl.g);

      // Стакан со смесью: в нём лежит горка песка, кристаллов соли и опилок
      glass = vessel(d, {
        outline: 'M-60 -150 V-14 Q-60 0 -46 0 H46 Q60 0 60 -14 V-150',
        inner: 'M-60 -150 V-14 Q-60 0 -46 0 H46 Q60 0 60 -14 V-150 Z',
        poly: GLASS_POLY,
        lip: { x: 61, y: -151 },
        fill: '#bfdbfe',
        opacity: 0.6,
        shadowRx: 80,
      });
      buildPile(d);
      rod = s('g', { opacity: 0 }, [
        s('line', { x1: -28, y1: -8, x2: 44, y2: -186, stroke: '#cbd5e1', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-opacity': 0.85 }),
        s('line', { x1: -29, y1: -10, x2: 43, y2: -188, stroke: '#ffffff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-opacity': 0.8 }),
      ]);
      glass.front.append(
        rod,
        s('path', { d: 'M-60 -150 H60', stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }),
        s('rect', { x: -48, y: -132, width: 8, height: 108, rx: 4, fill: '#ffffff', 'fill-opacity': 0.7 }),
        ...[50, 100].map((v) => s('line', { x1: 32, x2: 52, y1: -v * 1.2 - 14, y2: -v * 1.2 - 14, stroke: '#64748b', 'stroke-opacity': 0.7, 'stroke-width': 2 })),
      );
      svg.append(glass.g);

      // Струя при переливании — одна на все операции
      streamEl = s('path', { fill: 'none', stroke: '#93c5fd', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
      svg.append(streamEl);

      // Железные опилки — поверх всего: при работе магнитом они вылетают из стакана
      ironLayer = s('g', { 'pointer-events': 'none' });
      svg.append(ironLayer);
      const r = rng(7);
      for (let i = 0; i < 30; i++) {
        const x = (r() - 0.5) * 90;
        const el = s('rect', { x: -2.4, y: -0.8, width: 4.8, height: 1.6, rx: 0.8, fill: i % 2 ? '#3f3f46' : '#71717a' });
        ironLayer.append(el);
        irons.push({
          el,
          rot: r() * 180,
          pile: { x, y: -3 - r() * moundH(x, 0.9) },
          pole: { x: (i % 2 ? -16 : 16) + (r() - 0.5) * 14, y: 2 + r() * 9 },
          dish: { x: WATCH.x + (r() - 0.5) * 34, y: WATCH.y + 1 - r() * 4 },
          delay: r() * 0.4,
        });
      }

      magnet = buildMagnet(d);
      svg.append(magnet);

      // Пар над чашкой
      steam = Array.from({ length: 7 }, (_, i) => {
        const c = s('circle', { r: 6, fill: '#e2e8f0', opacity: 0, 'pointer-events': 'none' });
        svg.append(c);
        return { c, k: i / 7, ph: i * 1.7 };
      });

      // Кнопка новой смеси — вверху по центру: низ сцены на странице закрывает панель регуляторов
      resetBtn = s('g', { opacity: 0 }, [
        s('rect', { x: 400, y: 32, width: 160, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M433.4 45.6 A9 9 0 1 0 434.8 56.5 M433.4 38.6 V45.6 H426.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(492, 52, tr('Новая смесь'), { size: 15, weight: 600, fill: '#1e293b' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (resetBtn.getAttribute('opacity') === '0') return;
        e.stopPropagation();
        for (const id of ['evaporate', 'filter', 'water', 'magnet']) set(id, 0);
        magnetFrom = { ...MAGNET_REST };
        cylFrom = { ...CYL, a: 0 };
      });
      svg.append(resetBtn);
    },

    frame(dt, now) {
      clock = now;
      advance(dt);
      const dis = dissolved({ ...params, water: 1 });
      const share = params.salt ? dis / params.salt : 1;

      drawMagnet();
      drawCylinderAndGlass(dis, share);
      drawFunnel(dis);
      drawDish(dis, dt);

      const pulse = 0.55 + 0.3 * Math.sin(now * 4);
      glows.magnet.setAttribute('opacity', canMagnet() && !drag.magnet ? pulse : 0);
      glows.cyl.setAttribute('opacity', canWater() && !drag.cyl ? pulse : 0);
      glows.glass.setAttribute('opacity', canFilter() ? pulse : 0);
      glows.lamp.setAttribute('opacity', canEvaporate() ? pulse : 0);
      resetBtn.setAttribute('opacity', params.magnet || params.water ? 1 : 0);
      resetBtn.style.pointerEvents = params.magnet || params.water ? '' : 'none';
    },
  });

  const canMagnet = () => !params.magnet && !params.filter;
  const canWater = () => !params.water;
  const canFilter = () => params.water && !params.filter && T.water >= 1;
  const canEvaporate = () => params.filter && !params.evaporate && T.filter >= 1;

  // Операции идут по очереди: фильтровать можно только налитое, выпаривать — отфильтрованное
  function advance(dt) {
    const step = (id, on, gate = true) => {
      if (!on) T[id] = 0;
      else if (gate) T[id] = Math.min(1, T[id] + dt / DUR[id]);
    };
    step('magnet', params.magnet && !drag.magnet);
    step('water', params.water && !drag.cyl);
    step('filter', params.filter && params.water, T.water >= 1);
    step('evaporate', params.evaporate && params.filter && params.water, T.filter >= 1);
  }

  function moundH(x, k) {
    return (10 + 18 * k) * Math.max(0, 1 - (x / 54) ** 2) + 2;
  }

  // Горка смеси в стакане: песок, кристаллы соли (их число зависит от массы соли)
  function buildPile(d) {
    const r = rng(3);
    glass.contents.append(s('path', { d: 'M-56 -2 Q -40 -16 0 -26 Q 40 -16 56 -2 Z', fill: d.lin([[0, '#e7cf9f'], [1, '#c9a46a']], 'v') }));
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 104;
      const el = s('circle', { cx: x.toFixed(1), cy: (-2 - r() * moundH(x, 0.75)).toFixed(1), r: (1.6 + r()).toFixed(1), fill: ['#d6b37a', '#b98d52', '#e5c995'][i % 3] });
      sandGrains.push(el);
      glass.contents.append(el);
    }
    for (let i = 0; i < 60; i++) {
      const x = (r() - 0.5) * 96;
      const y = -3 - r() * moundH(x, 0.8);
      const el = s('rect', { x: (x - 1.8).toFixed(1), y: (y - 1.8).toFixed(1), width: 3.6, height: 3.6, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.6, transform: `rotate(${Math.round(r() * 90)} ${x.toFixed(1)} ${y.toFixed(1)})` });
      saltGrains.push(el);
      glass.contents.append(el);
    }
  }

  function buildMagnet(d) {
    const red = d.lin([[0, '#991b1b'], [0.35, '#ef4444'], [1, '#7f1d1d']]);
    const g = s('g', {}, [
      // Зона захвата на весь магнит: иначе щелчок между ножками подковы проходит мимо
      s('rect', { x: -32, y: -72, width: 64, height: 74, fill: '#ffffff', 'fill-opacity': 0 }),
      s('path', { d: 'M-28 -2 V-40 A28 28 0 0 1 28 -40 V-2 H14 V-40 A14 14 0 0 0 -14 -40 V-2 Z', fill: red, stroke: '#7f1d1d', 'stroke-width': 1.2 }),
      s('rect', { x: -28, y: -14, width: 14, height: 14, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']), stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: 14, y: -14, width: 14, height: 14, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']), stroke: '#475569', 'stroke-width': 1 }),
      text(-21, -26, 'N', { size: 13, weight: 800, fill: '#ffffff' }),
      text(21, -26, 'S', { size: 13, weight: 800, fill: '#ffffff' }),
      s('path', { d: 'M-22 -44 A22 22 0 0 1 -6 -64', stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }),
    ]);
    return g;
  }

  // Путь магнита: вверх → над стаканом → опускается к смеси → к часовому стеклу → на место
  function magnetPose(t) {
    const up = 250;
    const keys = [
      [0, magnetFrom], [0.12, { x: magnetFrom.x, y: up }], [0.28, { x: GLASS.x, y: up }], [0.4, { x: GLASS.x, y: GLASS.y - 32 }],
      [0.55, { x: GLASS.x, y: GLASS.y - 32 }], [0.64, { x: GLASS.x, y: up }], [0.78, { x: WATCH.x, y: up }],
      [0.86, { x: WATCH.x, y: WATCH.y - 22 }], [0.93, { x: WATCH.x, y: WATCH.y - 22 }], [1, MAGNET_REST],
    ];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const e = ease(seg(t, keys[i - 1][0], keys[i][0]));
        return { x: lerp(keys[i - 1][1].x, keys[i][1].x, e), y: lerp(keys[i - 1][1].y, keys[i][1].y, e) };
      }
    }
    return MAGNET_REST;
  }

  function drawMagnet() {
    const t = T.magnet;
    const m = drag.magnet ?? (params.magnet ? magnetPose(t) : MAGNET_REST);
    magnet.setAttribute('transform', `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})`);
    // Положение опилок в мире: пока они в стакане — вместе со стаканом (он наклоняется при фильтровании)
    const gp = glass.pose;
    for (const f of irons) {
      let p;
      let op = 1;
      const inGlass = () => {
        const q = rot(f.pile.x, f.pile.y, gp.a);
        return { x: gp.x + q.x, y: gp.y + q.y };
      };
      if (!params.magnet || t < 0.42) {
        p = inGlass();
        if (!params.magnet && T.filter > 0) op = 1 - seg(pourPose(glass, GLASS_FROM, GLASS, FUNNEL_TO, 50, 100, T.filter / 0.8).k, 0, 0.6);
      } else if (t < 0.6) {
        const k = ease(seg(t, 0.42 + f.delay * 0.3, 0.5 + f.delay * 0.3));
        const a = inGlass();
        p = { x: lerp(a.x, m.x + f.pole.x, k), y: lerp(a.y, m.y + f.pole.y, k) };
      } else if (t < 0.88) {
        p = { x: m.x + f.pole.x, y: m.y + f.pole.y };
      } else {
        const k = ease(seg(t, 0.88, 0.93));
        p = { x: lerp(WATCH.x + f.pole.x, f.dish.x, k), y: lerp(WATCH.y - 22 + f.pole.y, f.dish.y, k) };
      }
      f.el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${f.rot.toFixed(0)})`);
      f.el.setAttribute('opacity', op.toFixed(2));
    }
  }

  function stream(from, to, on, color) {
    if (!on) {
      streamEl.setAttribute('opacity', 0);
      return;
    }
    streamEl.setAttribute('d', `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${(from.x + 6).toFixed(1)} ${((from.y + to.y) / 2).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`);
    streamEl.setAttribute('stroke', color);
    streamEl.setAttribute('opacity', 0.85);
  }

  function lipWorld(v) {
    const r = rot(v.lip.x, v.lip.y, v.pose.a);
    return { x: v.pose.x + r.x, y: v.pose.y + r.y };
  }

  function drawCylinderAndGlass(dis, share) {
    const cylLevel = 12 + params.V * 1.5;
    // Уровень в стакане — по его же делениям (1,2 px на мл от высоты 14) плюс ~8 мл,
    // вытесненных песком: 20 г песка при плотности около 2,6 г/см³
    const glassLevel = 14 + (params.V + 8) * 1.2;
    let poured = params.water ? 1 : 0;
    let streaming = false;

    if (drag.cyl) {
      cyl.setPose(drag.cyl.x, drag.cyl.y, 0);
      cyl.setFill(cylLevel, 1);
    } else if (params.water && T.water < 1) {
      const p = pourPose(cyl, cylFrom, { ...CYL, a: 0 }, { x: GLASS.x - 34, y: GLASS.y - 162 }, 55, 112, T.water);
      cyl.setPose(p.x, p.y, p.a);
      cyl.setFill(cylLevel, 1 - p.k);
      poured = p.k;
      streaming = p.k > 0.03 && p.k < 0.97;
      if (streaming) stream(lipWorld(cyl), { x: GLASS.x - 30, y: GLASS.y - Math.max(30, glassLevel * p.k) }, true, '#93c5fd');
    } else {
      cyl.setPose(CYL.x, CYL.y, 0);
      cyl.setFill(cylLevel, params.water ? 0 : 1);
    }

    // Стакан: при фильтровании переносится к воронке и наклоняется
    let left = 1;
    if (params.filter && T.filter > 0 && T.filter < 0.8) {
      const p = pourPose(glass, GLASS_FROM, GLASS_FROM, FUNNEL_TO, 50, 100, T.filter / 0.8);
      glass.setPose(p.x, p.y, p.a);
      left = 1 - p.k;
      if (p.k > 0.03 && p.k < 0.97) {
        streaming = true;
        stream(lipWorld(glass), { x: FUNNEL.x - 16, y: FUNNEL.rim + 18 }, true, '#bfdbfe');
      }
    } else {
      glass.setPose(GLASS.x, GLASS.y, 0);
      if (params.filter && T.filter >= 0.8) left = 0;
    }
    if (!streaming) stream(null, null, false);

    glass.setFill(glassLevel * poured, left);
    rod.setAttribute('opacity', T.water >= 1 && left > 0 ? 1 : 0);

    // Смесь уходит из стакана вместе с жидкостью; соль растворяется по мере того, как наливают воду
    const grainOp = clamp01((left - 0.35) * 2.5).toFixed(2);
    const saltShown = Math.round(params.salt * 3 * (1 - share * poured));
    saltGrains.forEach((el, i) => el.setAttribute('opacity', i < saltShown ? grainOp : 0));
    sandGrains.forEach((el) => el.setAttribute('opacity', grainOp));
    glass.contents.firstChild.setAttribute('opacity', grainOp);
  }

  function buildStand(svg, d) {
    svg.append(
      floorShadow(ROD_X, BENCH + 3, 56, d),
      s('rect', { x: ROD_X - 46, y: BENCH - 12, width: 92, height: 12, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
      s('rect', { x: ROD_X - 4, y: 132, width: 8, height: BENCH - 144, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
      s('rect', { x: ROD_X, y: FUNNEL.rim - 1, width: FUNNEL.x - 62 - ROD_X, height: 6, rx: 3, fill: d.lin(['#d1d5db', '#6b7280'], 'v') }),
      s('rect', { x: ROD_X - 10, y: FUNNEL.rim - 10, width: 20, height: 24, rx: 4, fill: d.lin([[0, '#6b7280'], [0.4, '#d1d5db'], [1, '#4b5563']]) }),
      s('path', { d: `M${FUNNEL.x - 62} ${FUNNEL.rim + 2} A62 8 0 0 1 ${FUNNEL.x + 62} ${FUNNEL.rim + 2}`, stroke: '#6b7280', 'stroke-width': 4, fill: 'none' }),
    );
  }

  // Воронка с бумажным фильтром: внутри — жидкость при фильтровании и осадок на фильтре
  function buildFunnel(svg, d) {
    const { x, rim, tip, stemEnd } = FUNNEL;
    const cid = `fn${Math.random().toString(36).slice(2)}`;
    const innerD = `M${x - 54} ${rim + 1} L${x - 3} ${tip} H${x + 3} L${x + 54} ${rim + 1} Z`;
    funnelLiquid = s('rect', { x: x - 60, y: tip, width: 120, height: 0, fill: '#bfdbfe', 'fill-opacity': 0.75 });
    residueBand = s('rect', { x: x - 60, y: tip, width: 120, height: 0, fill: d.lin([[0, '#e5c995'], [1, '#b98d52']], 'v') });
    residueGrains = s('g');
    const r = rng(11);
    for (let i = 0; i < 70; i++) {
      const y = tip - 2 - r() * 34;
      const half = ((tip - y) / (tip - rim)) * 51;
      const gx = x + (r() - 0.5) * 2 * half * 0.9;
      // Первые — песок, дальше — нерастворившаяся соль и опилки (видны, если они попали на фильтр)
      const kind = i < 40 ? 'sand' : i < 55 ? 'salt' : 'iron';
      const el = kind === 'salt'
        ? s('rect', { x: (gx - 1.6).toFixed(1), y: (y - 1.6).toFixed(1), width: 3.2, height: 3.2, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.5 })
        : kind === 'iron'
          ? s('rect', { x: (gx - 2.2).toFixed(1), y: (y - 0.8).toFixed(1), width: 4.4, height: 1.6, fill: '#3f3f46' })
          : s('circle', { cx: gx.toFixed(1), cy: y.toFixed(1), r: 1.7, fill: ['#b98d52', '#d6b37a'][i % 2] });
      el.dataset.kind = kind;
      el.dataset.y = String(y);
      residueGrains.append(el);
    }
    svg.append(
      s('clipPath', { id: cid }, [s('path', { d: innerD })]),
      // Стекло воронки: конус и трубка со скошенным концом
      s('path', { d: `M${x - 58} ${rim} L${x - 5} ${tip + 2} V${stemEnd - 4} L${x + 5} ${stemEnd} V${tip + 2} L${x + 58} ${rim} Z`, fill: d.lin([[0, '#dbe4ef', 0.55], [0.5, '#f8fafc', 0.2], [1, '#cbd5e1', 0.55]]), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      // Бумажный фильтр, сложенный конусом
      s('path', { d: innerD, fill: '#f8fafc', 'fill-opacity': 0.95, stroke: '#e2e8f0', 'stroke-width': 1 }),
      s('g', { 'clip-path': `url(#${cid})`, 'pointer-events': 'none' }, [funnelLiquid, residueBand, residueGrains]),
      s('path', { d: `M${x - 20} ${rim + 2} L${x} ${tip - 2}`, stroke: '#cbd5e1', 'stroke-width': 1, fill: 'none' }),
      s('path', { d: `M${x - 58} ${rim} H${x + 58}`, stroke: '#cbd5e1', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      s('path', { d: `M${x - 44} ${rim + 6} L${x - 12} ${tip - 14}`, stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-opacity': 0.6 }),
    );
  }

  function drawFunnel(dis) {
    const t = params.filter && params.water ? T.filter : 0;
    const { x, rim, tip, stemEnd } = FUNNEL;
    // Жидкость в воронке набирается, пока стакан наклонён, и уходит через фильтр после
    const inflow = seg(t, 0.25 * 0.8, 0.6 * 0.8);
    const outflow = seg(t, 0.55, 1);
    const fill = Math.max(0, Math.min(inflow * 1.2, 1) - outflow);
    const surfY = tip - (tip - rim - 10) * fill;
    funnelLiquid.setAttribute('y', surfY.toFixed(1));
    funnelLiquid.setAttribute('height', (tip - surfY).toFixed(1));
    const h = (12 + residue({ ...params, water: 1 }) * 0.6) * seg(t, 0.25 * 0.8, 0.75 * 0.8);
    residueBand.setAttribute('y', (tip - h).toFixed(1));
    residueBand.setAttribute('height', h.toFixed(1));
    const undissolved = params.salt - dis > 0.05;
    for (const el of residueGrains.children) {
      const kind = el.dataset.kind;
      const visible = Number(el.dataset.y) > tip - h + 1 && (kind === 'sand' || (kind === 'salt' && undissolved) || (kind === 'iron' && !params.magnet));
      el.setAttribute('opacity', visible ? 1 : 0);
    }

    // Фильтрат: капли из носика воронки, колба наполняется
    const flaskLevel = 4 + params.V * 0.55;
    const gathered = params.filter && params.water ? seg(t, 0.3, 1) : 0;
    let share = 1;
    if (params.evaporate && T.evaporate > 0 && T.evaporate < 0.4) {
      const p = pourPose(flask, { ...FLASK, a: 0 }, { ...FLASK, a: 0 }, DISH_TO, 60, 128, T.evaporate / 0.4);
      flask.setPose(p.x, p.y, p.a);
      share = 1 - p.k;
      if (p.k > 0.03 && p.k < 0.97) stream(lipWorld(flask), { x: DISH.x - 30, y: DISH.bottom - 12 }, true, '#bfdbfe');
    } else {
      flask.setPose(FLASK.x, FLASK.y, 0);
      if (params.evaporate && T.evaporate >= 0.4) share = 0;
    }
    flask.setFill(flaskLevel * gathered, share);

    const dripping = t > 0.3 && t < 1 && flask.pose.a === 0;
    const surface = FLASK.y - flaskLevel * gathered;
    drops.forEach((dr, i) => {
      if (!dripping) {
        dr.c.setAttribute('opacity', 0);
        return;
      }
      const k = (clock * 1.6 + i / 3) % 1;
      dr.c.setAttribute('cx', x + 3);
      dr.c.setAttribute('cy', (stemEnd + 3 + k * (surface - stemEnd - 6)).toFixed(1));
      dr.c.setAttribute('opacity', 0.95);
    });
  }

  // Треножник, спиртовка с колпачком и фарфоровая чашка
  function buildBurner(svg, d) {
    const { x, rim, bottom, r } = DISH;
    svg.append(
      // задняя нога треножника
      s('line', { x1: x, y1: bottom + 4, x2: x + 4, y2: BENCH - 2, stroke: '#4b5563', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      floorShadow(LAMP.x, BENCH + 3, 46, d),
    );
    // Спиртовка: стеклянный резервуар со спиртом, горловина, фитиль
    flameGlow = s('ellipse', { cx: x, cy: LAMP.wick - 14, rx: 34, ry: 30, fill: d.rad([[0, '#fde68a', 0.7], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
    flame = s('path', { d: `M${x} ${LAMP.wick - 28} C ${x + 9} ${LAMP.wick - 16}, ${x + 8} ${LAMP.wick - 2}, ${x} ${LAMP.wick} C ${x - 8} ${LAMP.wick - 2}, ${x - 9} ${LAMP.wick - 16}, ${x} ${LAMP.wick - 28} Z`, fill: d.lin([[0, '#fde68a', 0.9], [0.5, '#fb923c', 0.85], [1, '#60a5fa', 0.8]], 'v'), opacity: 0, 'pointer-events': 'none' });
    lampCap = s('path', { d: `M${x - 15} ${LAMP.wick + 18} V${LAMP.wick - 4} Q ${x - 15} ${LAMP.wick - 14} ${x} ${LAMP.wick - 14} Q ${x + 15} ${LAMP.wick - 14} ${x + 15} ${LAMP.wick - 4} V${LAMP.wick + 18} Z`, fill: d.lin([[0, '#e2e8f0', 0.85], [1, '#94a3b8', 0.85]]), stroke: '#64748b', 'stroke-width': 1.2 });
    const lamp = s('g', {}, [
      s('path', { d: `M${x - 34} ${BENCH - 2} Q ${x - 40} ${BENCH - 40} ${x - 12} ${BENCH - 44} H${x + 12} Q ${x + 40} ${BENCH - 40} ${x + 34} ${BENCH - 2} Z`, fill: d.lin([[0, '#e0f2fe', 0.6], [0.5, '#f8fafc', 0.3], [1, '#bae6fd', 0.6]]), stroke: '#94a3b8', 'stroke-width': 2 }),
      s('path', { d: `M${x - 32} ${BENCH - 4} Q ${x - 35} ${BENCH - 24} ${x - 26} ${BENCH - 26} H${x + 26} Q ${x + 35} ${BENCH - 24} ${x + 32} ${BENCH - 4} Z`, fill: '#bfdbfe', 'fill-opacity': 0.55 }),
      s('rect', { x: x - 11, y: BENCH - 58, width: 22, height: 16, rx: 3, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
      s('rect', { x: x - 3, y: LAMP.wick, width: 6, height: BENCH - 58 - LAMP.wick, fill: '#f5f5f4' }),
      s('path', { d: `M${x - 24} ${BENCH - 30} Q ${x - 26} ${BENCH - 12} ${x - 20} ${BENCH - 8}`, stroke: '#ffffff', 'stroke-width': 3, fill: 'none', 'stroke-opacity': 0.7 }),
      lampCap,
    ]);
    lamp.style.cursor = 'pointer';
    lamp.addEventListener('pointerdown', (e) => {
      if (!canEvaporate()) return;
      e.stopPropagation();
      set('evaporate', 1);
    });
    touchTarget(lamp);
    svg.append(flameGlow, lamp, flame);

    // Треножник: кольцо и две передние ноги
    svg.append(
      s('line', { x1: x - r + 6, y1: bottom + 3, x2: x - r - 6, y2: BENCH - 2, stroke: '#374151', 'stroke-width': 6, 'stroke-linecap': 'round' }),
      s('line', { x1: x + r - 6, y1: bottom + 3, x2: x + r + 6, y2: BENCH - 2, stroke: '#374151', 'stroke-width': 6, 'stroke-linecap': 'round' }),
      s('rect', { x: x - r - 2, y: bottom, width: 2 * r + 4, height: 7, rx: 3, fill: d.lin([[0, '#6b7280'], [1, '#1f2937']], 'v') }),
    );

    // Фарфоровая чашка: белая глазурь, внутри — раствор, после выпаривания — кристаллы соли
    const cid = `ds${Math.random().toString(36).slice(2)}`;
    const bowl = `M${x - r} ${rim} Q ${x - r + 6} ${bottom + 2} ${x} ${bottom + 2} Q ${x + r - 6} ${bottom + 2} ${x + r} ${rim} Z`;
    dishLiquid = s('rect', { x: x - r, y: bottom, width: 2 * r, height: 0, fill: '#bfdbfe', 'fill-opacity': 0.85 });
    crystals = s('g');
    const rr = rng(19);
    // Кристаллы ложатся коркой на дно чашки и чуть поднимаются по стенкам
    crust = s('ellipse', { cx: x, cy: bottom - 1, rx: 40, ry: 5, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 1, opacity: 0 });
    crystals.append(crust);
    for (let i = 0; i < 60; i++) {
      const cx = x + (rr() - 0.5) * 84;
      const u = (cx - x) / (r - 4);
      const cy = bottom - 1 - u * u * (bottom - rim) * 0.7 - rr() * 5;
      const size = 3.5 + rr() * 2.5;
      crystals.append(s('rect', { x: (cx - size / 2).toFixed(1), y: (cy - size / 2).toFixed(1), width: size.toFixed(1), height: size.toFixed(1), fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.7, transform: `rotate(${Math.round(rr() * 90)} ${cx.toFixed(1)} ${cy.toFixed(1)})`, opacity: 0 }));
    }
    const dish = s('g', {}, [
      s('path', { d: `M${x - r - 4} ${rim - 2} Q ${x - r + 4} ${bottom + 6} ${x} ${bottom + 6} Q ${x + r - 4} ${bottom + 6} ${x + r + 4} ${rim - 2} Z`, fill: d.lin([[0, '#ffffff'], [0.6, '#f1f5f9'], [1, '#cbd5e1']], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('clipPath', { id: cid }, [s('path', { d: bowl })]),
      s('path', { d: bowl, fill: d.lin([[0, '#e2e8f0'], [1, '#f8fafc']], 'v') }),
      s('g', { 'clip-path': `url(#${cid})` }, [dishLiquid, crystals]),
      s('ellipse', { cx: x, cy: rim - 1, rx: r + 3, ry: 4, fill: 'none', stroke: '#e2e8f0', 'stroke-width': 3 }),
      s('path', { d: `M${x + r + 2} ${rim - 3} l 9 -4`, stroke: '#cbd5e1', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    ]);
    dish.style.cursor = 'pointer';
    dish.addEventListener('pointerdown', (e) => {
      if (!canEvaporate()) return;
      e.stopPropagation();
      set('evaporate', 1);
    });
    svg.append(dish);
  }

  function drawDish(dis, dt) {
    const t = params.evaporate && params.filter && params.water ? T.evaporate : 0;
    const { x, rim, bottom } = DISH;
    const depth = Math.min(28, 8 + params.V * 0.2);
    const inflow = seg(t, 0.25 * 0.4, 0.75 * 0.4);
    const dry = seg(t, 0.4, 0.92);
    const level = depth * inflow * (1 - dry);
    dishLiquid.setAttribute('y', (bottom + 2 - level).toFixed(1));
    dishLiquid.setAttribute('height', level.toFixed(1));
    // Соль выпадает в кристаллы, когда раствор становится насыщенным — ближе к концу выпаривания
    const shown = Math.round(Math.min(60, dis * 3) * seg(t, 0.55, 0.95));
    [...crystals.children].slice(1).forEach((c, i) => c.setAttribute('opacity', i < shown ? 1 : 0));
    crust.setAttribute('opacity', (seg(t, 0.55, 0.95) * Math.min(1, dis / 5)).toFixed(2));

    const burning = t > 0.3 && t < 0.95;
    const flick = 1 + Math.sin(clock * 23) * 0.06 + Math.sin(clock * 37) * 0.04;
    flame.setAttribute('opacity', burning ? 1 : 0);
    flame.setAttribute('transform', `translate(${x} ${LAMP.wick}) scale(1 ${flick.toFixed(3)}) translate(${-x} ${-LAMP.wick})`);
    flameGlow.setAttribute('opacity', burning ? 0.9 : 0);
    // Колпачок снят и лежит на столе, пока спиртовка горит
    lampCap.setAttribute('transform', burning ? `translate(-100 ${BENCH - LAMP.wick - 18}) rotate(-90 ${x} ${LAMP.wick + 18})` : '');

    const boiling = burning && level > 0.5;
    for (const w of steam) {
      w.k = (w.k + dt * 0.5) % 1;
      w.c.setAttribute('cx', (x + Math.sin(w.k * 8 + w.ph) * 10 + (w.ph % 3 - 1) * 16).toFixed(1));
      w.c.setAttribute('cy', (rim - 8 - w.k * 90).toFixed(1));
      w.c.setAttribute('r', (4 + w.k * 12).toFixed(1));
      w.c.setAttribute('opacity', boiling ? (0.55 * (1 - w.k)).toFixed(2) : 0);
    }
  }

  // Магнит: перетащить в стакан — опилки притянутся; щелчок по магниту делает то же
  draggable(scene, magnet, {
    onDrag(x, y) {
      if (!canMagnet()) return;
      drag.magnet = { x: Math.max(30, Math.min(930, x)), y: Math.max(80, Math.min(BENCH, y + 30)) };
    },
    onEnd() {
      const at = drag.magnet;
      drag.magnet = null;
      if (!canMagnet()) return;
      // Щелчок без перетаскивания тоже запускает операцию — на телефоне так проще
      if (!at || (Math.abs(at.x - GLASS.x) < SNAP_X && at.y < BENCH + 5)) {
        magnetFrom = at ?? { ...MAGNET_REST };
        set('magnet', 1);
      }
    },
  });

  // Цилиндр: перетащить к стакану — вода выльется; щелчок тоже наливает воду
  draggable(scene, cyl.g, {
    onDrag(x, y) {
      if (!canWater()) return;
      drag.cyl = { x: Math.max(30, Math.min(930, x)), y: Math.max(200, Math.min(BENCH, y + 90)) };
    },
    onEnd() {
      const at = drag.cyl;
      drag.cyl = null;
      if (!canWater()) return;
      if (!at || (Math.abs(at.x - GLASS.x) < SNAP_X && at.y < BENCH + 5)) {
        cylFrom = at ? { ...at, a: 0 } : { ...CYL, a: 0 };
        set('water', 1);
      }
    },
  });

  // Стакан: щелчок — перелить смесь на фильтр
  glass.g.style.cursor = 'pointer';
  glass.g.addEventListener('pointerdown', (e) => {
    if (!canFilter()) return;
    e.stopPropagation();
    set('filter', 1);
  });
  touchTarget(glass.g);

  scene.svg.style.userSelect = 'none';
  return scene;
}
