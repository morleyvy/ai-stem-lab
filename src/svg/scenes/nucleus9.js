// Сцена «Закон радиоактивного распада»: физический кабинет. В центре — свинцовая защита из кирпичей,
// в ней на подставке лежит образец, над ним в лапке штатива — трубка счётчика Гейгера, кабель от неё
// идёт к радиометру с табло скорости счёта и динамиком. Слева на столе — три свинцовых контейнера
// с образцами (золото-198, йод-131, фосфор-32): щелчок по контейнеру переносит его образец под счётчик.
// Щелчок по радиометру включает и выключает счётчик; каждый зарегистрированный распад — вспышка
// индикатора, след β-частицы от образца к окну трубки и «щелчок» динамика.
// На стене — экран с моделью образца (400 точек-ядер). Время, долю ядер и график показывает панель
// под сценой, поэтому на сцене только одно табло — скорость счёта радиометра.
// При смене времени ядра распадаются не мгновенно, а за ~1 с — ученик видит, как гаснут точки.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 400;
const SCREEN = { x: 40, y: 18, w: 320, h: 290 }; // экран модели образца
const GRID = { cols: 20, x: 92, y: 66, pitch: 11.4 }; // сетка точек-ядер на экране модели
const TUBE = { x: 446, top: 196, bottom: 312, w: 26 }; // трубка счётчика Гейгера
const SAMPLE = { x: 446, y: 378 }; // образец на подставке под окном трубки
const BOX = { x: 566, y: 290, w: 222, h: 110 }; // радиометр
const CONTAINERS = [82, 184, 286]; // центры свинцовых контейнеров на столе
const CONT = { w: 60, h: 46 };
const ANIM = 1.1; // с — за столько точки-ядра приходят к новому значению времени
const FLIGHT = 0.7; // с — перенос образца из контейнера под счётчик
const TRACKS = 8;

// Повторяемая перестановка: одни и те же ядра распадаются первыми при каждом открытии сцены,
// и картина не «перемешивается» при движении регулятора туда-обратно
function shuffled(n, seed = 131) {
  const a = Array.from({ length: n }, (_, i) => i);
  // mulberry32: у простого линейного генератора младшие биты периодичны, и распавшиеся ядра
  // выстраивались в заметные столбцы
  let x = seed;
  const rnd = () => {
    x = (x + 0x6d2b79f5) | 0;
    let r = Math.imul(x ^ (x >>> 15), 1 | x);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nucleus9Scene(container, params, set, { ISOTOPES, DOTS, fraction, countRate }) {
  const rank = shuffled(DOTS); // rank[i] — очередь ядра i: ядра с меньшим рангом живут дольше
  const dots = [];
  const flashes = new Float32Array(DOTS);
  const wasAlive = new Uint8Array(DOTS).fill(1);
  const tracks = [];
  let rateText, rateCaption, powerLed, clickLed, waves, lever;
  let holderDisc, flyDisc, legendDot;
  const lids = [];
  const slots = [];

  // Показанное время догоняет регулятор плавно — так виден сам процесс распада
  let tv = params.t;
  let from = tv;
  let target = tv;
  let k = 1;
  let shownIso = params.iso;
  let flight = 1;
  let flightFrom = params.iso;
  let clickGlow = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      buildModelScreen(svg, d);
      buildContainers(svg, d);
      buildShield(svg, d);
      buildRadiometer(svg, d);
    },

    frame(dt) {
      if (params.t !== target) {
        from = tv;
        target = params.t;
        k = 0;
      }
      if (k < 1) {
        k = Math.min(1, k + dt / ANIM);
        const e = 1 - (1 - k) ** 3;
        tv = from + (target - from) * e;
      }
      // Смена образца: прежний возвращается в контейнер, новый летит из своего контейнера под счётчик
      if (params.iso !== shownIso) {
        flightFrom = params.iso;
        shownIso = params.iso;
        flight = 0;
      }
      flight = Math.min(1, flight + dt / FLIGHT);
      const iso = ISOTOPES[shownIso];
      const p = { ...params, t: tv, iso: shownIso };
      const f = fraction(p);

      // Точки-ядра: живых ровно столько, сколько даёт закон; только что распавшееся вспыхивает
      const n = Math.round(DOTS * f);
      for (let i = 0; i < DOTS; i++) {
        const live = rank[i] < n ? 1 : 0;
        if (wasAlive[i] && !live && k < 1) flashes[i] = 0.5;
        wasAlive[i] = live;
        flashes[i] = Math.max(0, flashes[i] - dt);
        const dot = dots[i];
        dot.core.setAttribute('fill', live ? iso.color : '#64748b');
        dot.core.setAttribute('r', live ? 4 : 2.4);
        dot.ring.setAttribute('opacity', flashes[i] > 0 ? (flashes[i] / 0.5).toFixed(2) : 0);
      }
      legendDot.setAttribute('fill', iso.color);

      // Образец под счётчиком и в полёте
      const landed = flight >= 1;
      holderDisc.setAttribute('opacity', landed ? 1 : 0);
      holderDisc.setAttribute('fill', iso.color);
      if (!landed) {
        const x0 = CONTAINERS[flightFrom];
        const y0 = BENCH - CONT.h - 6;
        const e = flight;
        const x = x0 + (SAMPLE.x - x0) * e;
        const y = y0 + (SAMPLE.y - y0) * e - Math.sin(Math.PI * e) * 90;
        flyDisc.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        flyDisc.setAttribute('opacity', 1);
        flyDisc.firstChild.setAttribute('fill', iso.color);
      } else {
        flyDisc.setAttribute('opacity', 0);
      }
      // Открыт контейнер, образец которого сейчас под счётчиком
      lids.forEach((lid, i) => lid.setAttribute('transform', i === shownIso ? `rotate(-24 ${CONTAINERS[i] - CONT.w / 2 - 3} ${BENCH - CONT.h})` : ''));
      slots.forEach((slot, i) => slot.setAttribute('opacity', i === shownIso ? 0 : 1));

      // Счётчик: щелчки случайны (распады независимы), их средняя частота пропорциональна скорости счёта.
      // Настоящие 2000 имп/мин — это 33 щелчка в секунду; на экране частоту уменьшаем, чтобы вспышки различались.
      const on = Boolean(params.counter);
      const rate = countRate(p);
      powerLed.setAttribute('fill', on ? '#22c55e' : '#334155');
      lever.setAttribute('transform', on ? `rotate(30 ${BOX.x + BOX.w - 36} ${BOX.y + 44})` : `rotate(-30 ${BOX.x + BOX.w - 36} ${BOX.y + 44})`);
      rateText.textContent = on ? String(Math.round(rate)) : '';
      rateCaption.setAttribute('opacity', on ? 1 : 0.35);
      if (on && landed && Math.random() < Math.min(14, rate / 150) * dt) {
        clickGlow = 0.12;
        spawnTrack();
      }
      clickGlow = Math.max(0, clickGlow - dt);
      clickLed.setAttribute('fill', clickGlow > 0 ? '#f87171' : '#7f1d1d');
      waves.setAttribute('opacity', clickGlow > 0 ? 1 : 0);
      for (const tk of tracks) {
        if (tk.life <= 0) continue;
        tk.life -= dt;
        tk.el.setAttribute('opacity', Math.max(0, tk.life / 0.18).toFixed(2));
      }
    },
  });

  // След β-частицы: от образца вверх к окну трубки, с небольшим разбросом направлений
  function spawnTrack() {
    const tk = tracks.find((x) => x.life <= 0);
    if (!tk) return;
    const x0 = SAMPLE.x + (Math.random() - 0.5) * 20;
    const x1 = TUBE.x + (Math.random() - 0.5) * 18;
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 16;
    tk.el.setAttribute('d', `M${x0.toFixed(1)} ${SAMPLE.y - 6} Q ${mx.toFixed(1)} ${(SAMPLE.y + TUBE.bottom) / 2} ${x1.toFixed(1)} ${TUBE.bottom + 4}`);
    tk.life = 0.18;
  }

  // Экран с моделью образца: тёмная панель, сетка 20×20 точек-ядер и легенда
  function buildModelScreen(svg, d) {
    const { x, y, w, h } = SCREEN;
    svg.append(
      s('rect', { x: x - 6, y: y - 6, width: w + 12, height: h + 12, rx: 12, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v'), filter: d.url('soft') }),
      s('rect', { x, y, width: w, height: h, rx: 8, fill: d.lin([[0, '#1e293b'], [1, '#0f172a']], 'v') }),
      s('rect', { x, y, width: w, height: 40, rx: 8, fill: d.lin([[0, '#ffffff', 0.08], [1, '#ffffff', 0]], 'v') }),
      text(x + w / 2, y + 26, tr('Модель образца: 400 ядер'), { size: 15, weight: 700, fill: '#e2e8f0' }),
    );
    for (let i = 0; i < DOTS; i++) {
      const cx = GRID.x + (i % GRID.cols) * GRID.pitch;
      const cy = GRID.y + Math.floor(i / GRID.cols) * GRID.pitch;
      const ring = s('circle', { cx, cy, r: 6, fill: 'none', stroke: '#fde68a', 'stroke-width': 2, opacity: 0 });
      const core = s('circle', { cx, cy, r: 4, fill: '#8b5cf6' });
      dots.push({ core, ring });
      svg.append(core, ring);
    }
    const ly = y + h - 16;
    legendDot = s('circle', { cx: x + 30, cy: ly, r: 5, fill: '#8b5cf6' });
    svg.append(
      legendDot,
      text(x + 42, ly, tr('не распалось'), { size: 13, fill: '#cbd5e1', anchor: 'start' }),
      s('circle', { cx: x + 168, cy: ly, r: 3, fill: '#64748b' }),
      text(x + 178, ly, tr('распалось'), { size: 13, fill: '#cbd5e1', anchor: 'start' }),
    );
  }

  // Знак радиационной опасности: жёлтый круг с тремя чёрными лопастями
  function trefoil(cx, cy, r) {
    const blades = [];
    for (const a of [-90, 30, 150]) {
      const a1 = ((a - 30) * Math.PI) / 180;
      const a2 = ((a + 30) * Math.PI) / 180;
      const ri = r * 0.28;
      const ro = r * 0.86;
      blades.push(s('path', {
        d: `M${cx + Math.cos(a1) * ri} ${cy + Math.sin(a1) * ri} L${cx + Math.cos(a1) * ro} ${cy + Math.sin(a1) * ro} A ${ro} ${ro} 0 0 1 ${cx + Math.cos(a2) * ro} ${cy + Math.sin(a2) * ro} L${cx + Math.cos(a2) * ri} ${cy + Math.sin(a2) * ri} A ${ri} ${ri} 0 0 0 ${cx + Math.cos(a1) * ri} ${cy + Math.sin(a1) * ri} Z`,
        fill: '#111827',
      }));
    }
    return s('g', {}, [
      s('circle', { cx, cy, r, fill: '#facc15', stroke: '#111827', 'stroke-width': 1 }),
      ...blades,
      s('circle', { cx, cy, r: r * 0.18, fill: '#111827' }),
    ]);
  }

  // Свинцовые контейнеры: толстостенный цилиндр с крышкой, знаком радиации и подписью изотопа.
  // Щелчок по контейнеру — его образец переносят пинцетом под счётчик.
  function buildContainers(svg, d) {
    const lead = (c) => d.lin([[0, shade(c, -0.25)], [0.3, shade(c, 0.3)], [0.6, c], [1, shade(c, -0.45)]]);
    CONTAINERS.forEach((cx, i) => {
      const iso = ISOTOPES[i];
      const top = BENCH - CONT.h;
      const slot = s('ellipse', { cx, cy: top + 3, rx: 10, ry: 3, fill: iso.color });
      const lid = s('g', {}, [
        s('rect', { x: cx - CONT.w / 2 - 3, y: top - 12, width: CONT.w + 6, height: 14, rx: 4, fill: lead('#6b7280'), stroke: '#374151', 'stroke-width': 1 }),
        s('rect', { x: cx - 9, y: top - 20, width: 18, height: 9, rx: 3, fill: lead('#4b5563') }),
      ]);
      lids.push(lid);
      slots.push(slot);
      const g = s('g', {}, [
        floorShadow(cx, BENCH + 2, CONT.w * 0.62, d),
        s('rect', { x: cx - CONT.w / 2, y: top, width: CONT.w, height: CONT.h, rx: 5, fill: lead('#6b7280'), stroke: '#374151', 'stroke-width': 1 }),
        s('ellipse', { cx, cy: top + 2, rx: CONT.w / 2 - 6, ry: 5, fill: '#1f2937' }),
        slot,
        s('rect', { x: cx - 24, y: top + 10, width: 48, height: 28, rx: 3, fill: '#fefce8', stroke: '#a16207', 'stroke-width': 0.8 }),
        trefoil(cx - 12, top + 24, 9),
        text(cx + 11, top + 24, iso.short.split('-')[1], { size: 13, weight: 700, fill: '#1e293b' }),
        lid,
      ]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('iso', i);
      });
      touchTarget(g, 14);
      svg.append(g);
      // Подпись на торце стола — только название: период полураспада показан в панели под сценой
      svg.append(text(cx, BENCH + 46, tr(iso.name), { size: 15, weight: 700, fill: '#3b2a1a' }));
    });
  }

  // Свинцовая защита, подставка с образцом, штатив и трубка счётчика Гейгера
  function buildShield(svg, d) {
    const brick = (x, y, w, h) => s('rect', { x, y, width: w, height: h, rx: 2, fill: d.lin([[0, '#6b7280'], [1, '#4b5563']], 'v'), stroke: '#374151', 'stroke-width': 1 });
    svg.append(floorShadow(SAMPLE.x + 10, BENCH + 2, 92, d, 8));
    // Задняя стенка и боковины из свинцовых кирпичей: излучение не уходит в класс
    for (let row = 0; row < 4; row++) {
      const y = BENCH - 26 * (row + 1);
      const off = row % 2 ? 22 : 0;
      for (let x = 380 - off; x < 512; x += 44) {
        const x0 = Math.max(380, x);
        const x1 = Math.min(512, x + 44);
        svg.append(brick(x0, y, x1 - x0, 26));
      }
    }
    svg.append(
      s('rect', { x: 380, y: BENCH - 104, width: 132, height: 104, fill: '#0f172a', 'fill-opacity': 0.22 }),
      brick(368, BENCH - 104, 18, 104),
      brick(506, BENCH - 104, 18, 104),
      // подставка под образец
      s('rect', { x: SAMPLE.x - 30, y: SAMPLE.y + 4, width: 60, height: BENCH - SAMPLE.y - 4, rx: 3, fill: d.lin([[0, '#cbd5e1'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
    );
    holderDisc = s('ellipse', { cx: SAMPLE.x, cy: SAMPLE.y + 1, rx: 18, ry: 5, fill: '#8b5cf6', stroke: '#1e293b', 'stroke-width': 1 });
    svg.append(holderDisc);

    // Штатив: основание за защитой, стойка, муфта с лапкой
    const rodX = 546;
    svg.append(
      floorShadow(rodX, BENCH + 2, 40, d),
      s('rect', { x: rodX - 34, y: BENCH - 10, width: 68, height: 10, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: rodX - 4, y: 150, width: 8, height: BENCH - 160, rx: 3, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
      s('rect', { x: rodX - 9, y: 220, width: 18, height: 20, rx: 3, fill: '#334155' }),
      s('rect', { x: TUBE.x + 10, y: 226, width: rodX - TUBE.x - 16, height: 8, rx: 3, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'v') }),
    );
    // Трубка счётчика: металлический цилиндр, внизу — тонкое слюдяное окно, к которому летят частицы
    const { x, top, bottom, w } = TUBE;
    svg.append(
      s('rect', { x: x - w / 2, y: top, width: w, height: bottom - top, rx: 5, fill: d.lin([[0, '#64748b'], [0.3, '#e2e8f0'], [0.6, '#cbd5e1'], [1, '#475569']]), stroke: '#334155', 'stroke-width': 1 }),
      s('rect', { x: x - w / 2 - 3, y: 220, width: w + 6, height: 20, rx: 3, fill: '#1e293b' }),
      s('rect', { x: x - w / 2 + 2, y: bottom - 4, width: w - 4, height: 6, rx: 2, fill: '#78350f', 'fill-opacity': 0.75 }),
      s('rect', { x: x - 6, y: top - 14, width: 12, height: 16, rx: 3, fill: '#1e293b' }),
      // кабель к радиометру
      s('path', { d: `M${x + 6} ${top - 6} C ${x + 80} ${top - 6}, ${BOX.x + 40} ${top + 4}, ${BOX.x + 40} ${BOX.y}`, fill: 'none', stroke: '#1e293b', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    );
    const trackLayer = s('g');
    for (let i = 0; i < TRACKS; i++) {
      const el = s('path', { fill: 'none', stroke: '#0ea5e9', 'stroke-width': 2.6, 'stroke-linecap': 'round', opacity: 0 });
      tracks.push({ el, life: 0 });
      trackLayer.append(el);
    }
    flyDisc = s('g', { opacity: 0 }, [s('ellipse', { rx: 18, ry: 5, fill: '#8b5cf6', stroke: '#1e293b', 'stroke-width': 1 })]);
    svg.append(trackLayer, flyDisc);
  }

  // Радиометр: табло скорости счёта, тумблер питания, индикатор щелчков и динамик
  function buildRadiometer(svg, d) {
    const { x, y, w, h } = BOX;
    lever = s('rect', { x: x + w - 39, y: y + 22, width: 6, height: 24, rx: 3, fill: d.lin(['#e2e8f0', '#94a3b8']) });
    powerLed = s('circle', { cx: x + w - 18, cy: y + 18, r: 4, fill: '#334155' });
    clickLed = s('circle', { cx: x + w - 18, cy: y + 72, r: 5, fill: '#7f1d1d' });
    rateText = text(x + 72, y + 42, '', { size: 24, weight: 700, fill: '#34d399' });
    rateText.style.fontVariantNumeric = 'tabular-nums';
    rateCaption = text(x + 72, y + 74, tr('имп/мин'), { size: 13, weight: 600, fill: '#e2e8f0' });
    const slotsG = s('g');
    for (let i = 0; i < 5; i++) slotsG.append(s('rect', { x: x + 136, y: y + 62 + i * 7, width: 34, height: 3, rx: 1.5, fill: '#0f172a' }));
    waves = s('g', { opacity: 0, fill: 'none', stroke: '#f87171', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
      s('path', { d: `M${x + 176} ${y + 64} q 6 12 0 24` }),
      s('path', { d: `M${x + 182} ${y + 58} q 10 18 0 36` }),
    ]);
    const g = s('g', {}, [
      floorShadow(x + w / 2, BENCH + 2, w * 0.55, d),
      s('rect', { x, y, width: w, height: h, rx: 10, fill: d.lin([[0, '#e5e7eb'], [0.15, '#cbd5e1'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.2 }),
      s('rect', { x: x + 2, y: y + 2, width: w - 4, height: 12, rx: 8, fill: '#ffffff', 'fill-opacity': 0.5 }),
      s('rect', { x: x + 12, y: y + 16, width: 120, height: 44, rx: 6, fill: d.lin([[0, '#05080d'], [1, '#111a27']], 'v'), stroke: '#475569', 'stroke-width': 1.5 }),
      rateText,
      s('rect', { x: x + 12, y: y + 64, width: 120, height: 20, rx: 4, fill: '#334155' }),
      rateCaption,
      text(x + 72, y + 98, tr('Радиометр'), { size: 13, weight: 700, fill: '#1e293b' }),
      slotsG,
      waves,
      // тумблер питания в гнезде
      s('rect', { x: x + w - 48, y: y + 30, width: 24, height: 28, rx: 5, fill: '#1e293b' }),
      lever,
      s('circle', { cx: x + w - 36, cy: y + 44, r: 5, fill: '#475569' }),
      powerLed,
      clickLed,
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('counter', params.counter ? 0 : 1);
    });
    touchTarget(g, 10);
    svg.append(g);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
