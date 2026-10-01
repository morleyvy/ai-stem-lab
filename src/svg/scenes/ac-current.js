// Сцена «Трансформатор»: на столе — лабораторный источник переменного напряжения 50 Гц, разборный
// трансформатор на О-образном сердечнике с двумя катушками, ключ и реостат во вторичной цепи.
// Измерительных приборов на сцене нет намеренно: все числа — в панели показаний под сценой,
// чтобы взгляд был на трансформаторе. У каждой катушки на лицевой панели — гнёзда отводов:
// в гнезде «0» всегда чёрный штекер, красный штекер ученик переставляет щелчком по гнезду (N1, N2).
// Тумблер источника — power, ручка — U1, нож ключа — load, движок реостата — R.
// Пока источник включён, в сердечнике «бежит» переменный магнитный поток (пунктирная петля),
// а заряды в проводах качаются туда-обратно — замедленно, иначе 50 колебаний в секунду не видно.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';

const BENCH_Y = 470;
const C1 = 320; // ось первичной катушки (левый стержень сердечника)
const C2 = 540; // ось вторичной катушки (правый стержень)
const COIL_W = 150;
const COIL_TOP = 294;
const COIL_BOT = 438;
const SOCK_Y = 422;
const P_TAPS = [0, 100, 200, 400]; // гнёзда первичной катушки: «0» — общий вывод
const S_TAPS = [0, 50, 100, 200, 400];
const pSock = (i) => C1 - 54 + i * 36;
const sSock = (i) => C2 - 64 + i * 32;
const SRC = { x: 40, y: 330, w: 170, h: 140 };
const SRC_PLUS = { x: 168, y: 362 };
const SRC_MINUS = { x: 194, y: 362 };
const KNOB = { x: 160, y: 432 };
const TOGGLE = { x: 72, y: 434 };
const KEY = { x: 680, y: 458 };
const RHEO = { x: 845, y: 440, half: 70 };
const VIS_HZ = 0.8; // Гц — замедленное «качание» зарядов и потока вместо настоящих 50 Гц
const DOTS = 5;

export function acCurrentScene(container, params, set, { state, N1S, N2S }) {
  let srcLed, lever, knobPointer, knob, blade, slider, contact, flux, pPlug, sPlug;
  const wires = {};
  const dots = [];
  // Красные штекеры переезжают к новому гнезду плавно, а не прыгают
  let pPlugX = pSock(params.N1 + 1);
  let sPlugX = sSock(params.N2 + 1);
  let t = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH_Y, theme: 'stand' });

      // Табличка с главной формулой работы — единственная надпись на стенде
      svg.append(
        s('rect', { x: 330, y: 70, width: 300, height: 56, rx: 12, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 }),
        text(480, 98, 'k = N₁ / N₂ = U₁ / U₂', { size: 22, weight: 700, fill: '#1e293b' }),
      );
      buildSource(svg, d);
      buildTransformer(svg, d);
      svg.append(buildKey(d), buildRheostat(d));

      // Таблички на торце стола
      const tag = (x, label) => text(x, 512, label, { size: 14, weight: 600, fill: '#fef3c7' });
      svg.append(
        tag(SRC.x + SRC.w / 2, tr('Источник')),
        tag(C1, tr('Первичная обмотка')),
        tag(C2, tr('Вторичная обмотка')),
        tag(KEY.x, tr('Ключ')),
        tag(RHEO.x, tr('Реостат')),
      );

      // Провода поверх приборов: у каждого — тёмная оболочка и светлый блик
      const wire = (id, color, width = 3.2) => {
        const base = s('path', { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' });
        const hi = s('path', { fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.25, 'stroke-width': 1, 'stroke-linecap': 'round', transform: 'translate(-0.6 -0.6)' });
        wires[id] = { base, hi };
        svg.append(base, hi);
      };
      // Первичная цепь: источник → отвод, общий вывод → источник
      wire('w1', '#dc2626');
      wire('w3', '#1e293b');
      // Вторичная цепь: отвод → реостат → ключ → общий вывод
      wire('s1', '#dc2626');
      wire('s3', '#1e293b');
      wire('s4', '#1e293b');

      for (const id of ['w1', 'w3', 's1', 's3', 's4']) {
        for (let k = 0; k < DOTS; k++) {
          const c = s('circle', { r: 2.6, fill: '#fde047', opacity: 0, 'pointer-events': 'none' });
          svg.append(c);
          dots.push({ id, k, c, primary: id.startsWith('w') });
        }
      }

      // Штекеры поверх проводов: чёрные — в гнёздах «0», красные — на выбранных отводах
      svg.append(plug(d, pSock(0), '#1e293b'), plug(d, sSock(0), '#1e293b'));
      pPlug = plug(d, 0, '#dc2626');
      sPlug = plug(d, 0, '#dc2626');
      svg.append(pPlug, sPlug);
    },

    frame(dt) {
      t += dt;
      const st = state(params);
      const on = Boolean(params.power);

      // Штекеры едут к выбранным гнёздам
      const k = Math.min(1, dt * 12);
      pPlugX += (pSock(params.N1 + 1) - pPlugX) * k;
      sPlugX += (sSock(params.N2 + 1) - sPlugX) * k;
      pPlug.setAttribute('transform', `translate(${pPlugX.toFixed(1)} ${SOCK_Y})`);
      sPlug.setAttribute('transform', `translate(${sPlugX.toFixed(1)} ${SOCK_Y})`);
      layoutWires();

      srcLed.setAttribute('fill', on ? '#22c55e' : '#475569');
      lever.setAttribute('transform', `rotate(${on ? 25 : -25} ${TOGGLE.x} ${TOGGLE.y})`);
      knobPointer.setAttribute('transform', `rotate(${-135 + ((params.U1 - 1) / 11) * 270} ${KNOB.x} ${KNOB.y})`);
      blade.setAttribute('transform', `rotate(${params.load ? 0 : -38} -32 -5)`);
      const sx = -RHEO.half + ((params.R - 10) / 40) * RHEO.half * 2;
      slider.setAttribute('transform', `translate(${sx.toFixed(1)} -26)`);
      contact.setAttribute('x', sx - 3);

      // Магнитный поток в сердечнике ∝ U₁/N₁; показываем «бегущим» пунктиром, меняющим направление
      const phase = Math.sin(2 * Math.PI * VIS_HZ * t);
      const fluxAmp = on ? Math.min(1, (st.U1 / st.N1) / 0.06) : 0;
      flux.setAttribute('opacity', (fluxAmp * (0.35 + 0.65 * Math.abs(phase))).toFixed(2));
      flux.setAttribute('stroke-dashoffset', (phase * 40).toFixed(1));

      // Заряды качаются около своих мест с размахом, пропорциональным силе тока
      for (const dot of dots) {
        const path = wires[dot.id].base;
        const I = dot.primary ? st.I1 : st.I2;
        if (I < 1e-3) {
          dot.c.setAttribute('opacity', 0);
          continue;
        }
        const len = path.getTotalLength();
        const swing = Math.min(18, 6 + I * 10) * phase * (dot.primary ? 1 : -1);
        const at = ((dot.k + 0.5) / DOTS) * len + swing;
        const pt = path.getPointAtLength(Math.max(0, Math.min(len, at)));
        dot.c.setAttribute('cx', pt.x.toFixed(1));
        dot.c.setAttribute('cy', pt.y.toFixed(1));
        dot.c.setAttribute('opacity', 0.9);
      }
    },
  });

  // Штекер: чёрный стоит в общем гнезде «0», красный ученик переставляет по отводам
  function plug(d, x, color) {
    return s('g', { transform: `translate(${x} ${SOCK_Y})`, 'pointer-events': 'none' }, [
      s('circle', { r: 8, fill: d.rad([[0, '#ffffff', 0.5], [0.35, color], [1, color]], 0.35, 0.3), stroke: '#0f172a', 'stroke-width': 1 }),
      s('circle', { r: 3, fill: '#0f172a', 'fill-opacity': 0.5 }),
    ]);
  }

  // Лабораторный источник переменного напряжения: клеммы, тумблер и ручка напряжения без табло — U₁ видно в панели показаний
  function buildSource(svg, d) {
    const { x, y, w, h } = SRC;
    srcLed = s('circle', { cx: TOGGLE.x, cy: TOGGLE.y - 30, r: 4, fill: '#475569' });
    lever = s('g', {}, [
      s('rect', { x: TOGGLE.x - 3, y: TOGGLE.y - 22, width: 6, height: 22, rx: 3, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
      s('circle', { cx: TOGGLE.x, cy: TOGGLE.y - 22, r: 5, fill: '#1e293b' }),
    ]);
    const toggle = s('g', {}, [
      s('rect', { x: TOGGLE.x - 22, y: TOGGLE.y - 42, width: 44, height: 62, fill: '#ffffff', 'fill-opacity': 0 }),
      s('rect', { x: TOGGLE.x - 12, y: TOGGLE.y - 6, width: 24, height: 16, rx: 4, fill: d.lin([[0, '#475569'], [1, '#0f172a']], 'v') }),
      lever,
    ]);
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('power', params.power ? 0 : 1);
    });
    touchTarget(toggle, 10);

    knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 17, width: 3, height: 10, rx: 1.5, fill: '#f8fafc' });
    const scale = s('g');
    for (let i = 0; i <= 11; i++) {
      const a = ((-135 + (i / 11) * 270 - 90) * Math.PI) / 180;
      scale.append(s('line', { x1: KNOB.x + Math.cos(a) * 24, y1: KNOB.y + Math.sin(a) * 24, x2: KNOB.x + Math.cos(a) * (i % 5 === 0 ? 30 : 28), y2: KNOB.y + Math.sin(a) * (i % 5 === 0 ? 30 : 28), stroke: '#cbd5e1', 'stroke-width': 1.2 }));
    }
    knob = s('g', {}, [
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 20, fill: d.rad([[0, '#94a3b8'], [0.7, '#334155'], [1, '#0f172a']], 0.4, 0.35), stroke: '#0f172a' }),
      knobPointer,
    ]);

    svg.append(
      floorShadow(x + w / 2, BENCH_Y + 2, w * 0.6, d),
      s('rect', { x, y, width: w, height: h, rx: 10, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.5 }),
      s('rect', { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 8, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v') }),
      text(x + 56, y + 34, '~ 50 Гц', { size: 18, weight: 700, fill: '#e2e8f0' }),
      // клеммы выхода: красная и чёрная
      s('rect', { x: SRC_PLUS.x - 8, y: SRC_PLUS.y - 8, width: 16, height: 16, rx: 3, fill: d.lin(['#991b1b', '#f87171', '#991b1b']) }),
      s('rect', { x: SRC_MINUS.x - 8, y: SRC_MINUS.y - 8, width: 16, height: 16, rx: 3, fill: d.lin(['#0f172a', '#475569', '#0f172a']) }),
      text((SRC_PLUS.x + SRC_MINUS.x) / 2, SRC_PLUS.y - 20, '~', { size: 16, weight: 800, fill: '#e2e8f0' }),
      srcLed,
      scale,
      toggle,
      knob,
    );
  }

  // Трансформатор: шихтованный О-образный сердечник и две катушки с панелями отводов
  function buildTransformer(svg, d) {
    const legW = 56;
    const top = 236;
    const yokeH = 46;
    const left = C1 - legW / 2;
    const right = C2 + legW / 2;
    const steel = d.lin([[0, '#64748b'], [0.5, '#475569'], [1, '#334155']], 'v');
    const lam = s('g', { stroke: '#1e293b', 'stroke-opacity': 0.35, 'stroke-width': 1 });
    for (let yy = top + 5; yy < top + yokeH; yy += 5) lam.append(s('line', { x1: left, y1: yy, x2: right, y2: yy }));
    for (let yy = COIL_BOT + 14; yy < BENCH_Y; yy += 5) lam.append(s('line', { x1: left, y1: yy, x2: right, y2: yy }));
    // Петля магнитного потока по средней линии сердечника
    const mid = top + yokeH / 2;
    const bot = (COIL_BOT + 10 + BENCH_Y) / 2;
    flux = s('path', { d: `M${C1} ${mid} H${C2} V${bot} H${C1} Z`, fill: 'none', stroke: '#60a5fa', 'stroke-width': 4, 'stroke-dasharray': '14 10', 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
    svg.append(
      floorShadow((C1 + C2) / 2, BENCH_Y + 2, 210, d, 7),
      // стержни и ярма; за катушками стержней не видно
      s('rect', { x: left, y: top, width: right - left, height: yokeH, rx: 3, fill: steel, stroke: '#1e293b' }),
      s('rect', { x: left, y: COIL_BOT + 10, width: right - left, height: BENCH_Y - COIL_BOT - 10, rx: 2, fill: steel, stroke: '#1e293b' }),
      s('rect', { x: left, y: top + yokeH, width: legW, height: COIL_BOT - top - yokeH + 10, fill: d.lin(['#334155', '#64748b', '#334155']) }),
      s('rect', { x: right - legW, y: top + yokeH, width: legW, height: COIL_BOT - top - yokeH + 10, fill: d.lin(['#334155', '#64748b', '#334155']) }),
      lam,
      // винты, стягивающие пластины сердечника
      ...[left + 12, right - 12].flatMap((cx) => [top + 23, BENCH_Y - 11].map((cy) => s('circle', { cx, cy, r: 4, fill: d.rad(['#e2e8f0', '#64748b']), stroke: '#1e293b', 'stroke-width': 0.8 }))),
      flux,
    );
    svg.append(coil(d, C1, 'N₁'), coil(d, C2, 'N₂'));
    const pSockets = P_TAPS.slice(1).map((n, i) => socket(d, pSock(i + 1), n, () => set('N1', i)));
    const sSockets = S_TAPS.slice(1).map((n, i) => socket(d, sSock(i + 1), n, () => set('N2', i)));
    svg.append(socket(d, pSock(0), 0, null), socket(d, sSock(0), 0, null), ...pSockets, ...sSockets);
    // Проверка: подписи отводов совпадают с моделью
    if (P_TAPS.slice(1).join() !== N1S.join() || S_TAPS.slice(1).join() !== N2S.join()) console.warn('ac-current: отводы сцены не совпадают с моделью');
  }

  // Катушка: медная обмотка на пластмассовом каркасе, на лицевой стороне — панель отводов
  function coil(d, cx, label) {
    const x = cx - COIL_W / 2;
    const turnsG = s('g', { stroke: '#7c2d12', 'stroke-opacity': 0.45, 'stroke-width': 1 });
    for (let yy = COIL_TOP + 3; yy < COIL_BOT; yy += 3.5) turnsG.append(s('line', { x1: x + 2, y1: yy, x2: x + COIL_W - 2, y2: yy }));
    return s('g', {}, [
      s('rect', { x, y: COIL_TOP, width: COIL_W, height: COIL_BOT - COIL_TOP, fill: d.lin([[0, '#7c2d12'], [0.25, '#d97706'], [0.45, '#fbbf24'], [0.7, '#b45309'], [1, '#78350f']]) }),
      turnsG,
      s('rect', { x: x - 6, y: COIL_TOP - 10, width: COIL_W + 12, height: 11, rx: 3, fill: d.lin([[0, '#1f2937'], [0.5, '#4b5563'], [1, '#111827']]) }),
      s('rect', { x: x - 6, y: COIL_BOT, width: COIL_W + 12, height: 11, rx: 3, fill: d.lin([[0, '#1f2937'], [0.5, '#4b5563'], [1, '#111827']]) }),
      // панель отводов
      s('rect', { x: cx - 80, y: 382, width: 160, height: 52, rx: 6, fill: d.lin([[0, '#f8fafc'], [1, '#e2e8f0']], 'v'), stroke: '#64748b', 'stroke-width': 1.2 }),
      s('rect', { x: cx - 24, y: 312, width: 48, height: 26, rx: 5, fill: '#f8fafc', 'fill-opacity': 0.92, stroke: '#64748b' }),
      text(cx, 326, label, { size: 17, weight: 800, fill: '#1e293b' }),
    ]);
  }

  // Гнездо отвода с подписью числа витков; щелчок переставляет туда красный штекер
  function socket(d, x, n, onPick) {
    const g = s('g', {}, [
      s('rect', { x: x - 15, y: 384, width: 30, height: 48, fill: '#ffffff', 'fill-opacity': 0 }),
      text(x, 398, String(n), { size: 13, weight: 700, fill: '#334155' }),
      s('circle', { cx: x, cy: SOCK_Y, r: 7, fill: d.rad([[0, '#0f172a'], [0.7, '#334155'], [1, '#94a3b8']], 0.5, 0.5), stroke: '#475569' }),
    ]);
    if (onPick) {
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onPick();
      });
      touchTarget(g, 2);
    }
    return g;
  }

  // Рубильник-ключ вторичной цепи (как в работе «Электрическая цепь»)
  function buildKey(d) {
    blade = s('g', {}, [
      s('rect', { x: -32, y: -8, width: 66, height: 6, rx: 2, fill: d.lin([[0, '#fcd9a8'], [0.5, '#d97706'], [1, '#92400e']], 'v') }),
      s('rect', { x: 26, y: -22, width: 8, height: 16, rx: 3, fill: '#1f2937' }),
    ]);
    const hit = s('rect', { x: -50, y: -56, width: 104, height: 70, fill: '#ffffff', 'fill-opacity': 0 });
    const g = s('g', { transform: `translate(${KEY.x} ${KEY.y})` }, [
      floorShadow(0, 12, 50, d),
      s('rect', { x: -45, y: -2, width: 90, height: 12, rx: 3, fill: d.lin([[0, '#374151'], [1, '#111827']], 'v') }),
      s('rect', { x: -37, y: -10, width: 10, height: 10, rx: 2, fill: '#b45309' }),
      s('rect', { x: 27, y: -12, width: 3, height: 12, fill: '#b45309' }),
      s('rect', { x: 35, y: -12, width: 3, height: 12, fill: '#b45309' }),
      s('circle', { cx: -42, cy: 0, r: 3, fill: '#94a3b8' }),
      s('circle', { cx: 42, cy: 0, r: 3, fill: '#94a3b8' }),
      blade,
      s('circle', { cx: -32, cy: -5, r: 3, fill: '#78350f' }),
      hit,
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('load', params.load ? 0 : 1);
    });
    touchTarget(g, 10);
    return g;
  }

  // Реостат: керамический цилиндр с обмоткой, стойки по краям, штанга с движком
  function buildRheostat(d) {
    const H = RHEO.half;
    const turnsG = s('g');
    for (let x = -H + 8; x < H - 6; x += 6) turnsG.append(s('line', { x1: x, y1: -14, x2: x + 4, y2: 14, stroke: '#b45309', 'stroke-width': 2.2 }));
    contact = s('rect', { x: -3, y: -22, width: 6, height: 10, fill: '#94a3b8' });
    slider = s('g', {}, [
      s('rect', { x: -14, y: -11, width: 28, height: 22, rx: 5, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v'), stroke: '#111827' }),
      s('rect', { x: -9, y: -6, width: 18, height: 3, rx: 1.5, fill: '#9ca3af' }),
      s('rect', { x: -9, y: -1, width: 18, height: 3, rx: 1.5, fill: '#9ca3af' }),
    ]);
    const post = (x) => s('rect', { x, y: -22, width: 16, height: 52, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') });
    const g = s('g', { transform: `translate(${RHEO.x} ${RHEO.y})` }, [
      floorShadow(0, 31, H + 30, d),
      post(-H - 22),
      post(H + 6),
      s('rect', { x: -H, y: -16, width: H * 2, height: 32, rx: 16, fill: d.lin([[0, '#fffbeb'], [0.4, '#fef3c7'], [1, '#d6c7a1']], 'v') }),
      turnsG,
      s('rect', { x: -H, y: -16, width: H * 2, height: 32, rx: 16, fill: d.lin([[0, '#ffffff', 0.35], [0.5, '#ffffff', 0], [1, '#000000', 0.15]], 'v') }),
      s('rect', { x: -H - 22, y: -30, width: H * 2 + 44, height: 7, rx: 3.5, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b'], 'v') }),
      s('circle', { cx: -H - 14, cy: -12, r: 3.5, fill: '#b45309' }),
      s('circle', { cx: H + 14, cy: -26.5, r: 3.5, fill: '#b45309' }),
      contact,
      slider,
    ]);
    return g;
  }

  // Пути проводов зависят от положения красных штекеров — пересчитываем каждый кадр
  function layoutWires() {
    const pp = { x: pPlugX, y: SOCK_Y };
    const sp = { x: sPlugX, y: SOCK_Y };
    const p0 = { x: pSock(0), y: SOCK_Y };
    const s0 = { x: sSock(0), y: SOCK_Y };
    const rheoL = { x: RHEO.x - RHEO.half - 14, y: RHEO.y - 12 };
    const rheoBar = { x: RHEO.x + RHEO.half + 14, y: RHEO.y - 26.5 };
    const keyL = { x: KEY.x - 42, y: KEY.y };
    const keyR = { x: KEY.x + 42, y: KEY.y };
    const P = (a) => `${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
    const curve = (a, c1, c2, b) => `M${P(a)} C ${P(c1)}, ${P(c2)}, ${P(b)}`;
    const put = (id, dd) => {
      wires[id].base.setAttribute('d', dd);
      wires[id].hi.setAttribute('d', dd);
    };
    put('w1', curve(SRC_PLUS, { x: SRC_PLUS.x + 10, y: 300 }, { x: pp.x - 30, y: 330 }, pp));
    put('w3', curve(SRC_MINUS, { x: SRC_MINUS.x + 30, y: 400 }, { x: p0.x - 30, y: 470 }, p0));
    put('s1', curve(sp, { x: sp.x + 60, y: 320 }, { x: rheoBar.x + 30, y: 320 }, rheoBar));
    put('s3', curve(rheoL, { x: rheoL.x - 10, y: 470 }, { x: keyR.x + 20, y: 480 }, keyR));
    put('s4', curve(keyL, { x: keyL.x - 20, y: 490 }, { x: s0.x + 10, y: 490 }, s0));
  }

  scene.svg.style.userSelect = 'none';
  // Движок реостата: тянем вдоль штанги — меняется сопротивление нагрузки
  draggable(scene, slider, {
    onDrag: (x) => set('R', 10 + ((x - RHEO.x + RHEO.half) / (RHEO.half * 2)) * 40),
  });
  // Ручка источника: ведём мышью по кругу — угол ручки задаёт напряжение
  draggable(scene, knob, {
    onDrag(x, y) {
      const a = Math.max(-135, Math.min(135, (Math.atan2(x - KNOB.x, KNOB.y - y) * 180) / Math.PI));
      set('U1', 1 + ((a + 135) / 270) * 11);
    },
  });
  return scene;
}
