// Сцена «Электрическая цепь»: физический стенд с гнёздами под детали и стол, на котором лежат
// источник, ключ, амперметр, реостат и лампа. Ученик переносит детали мышью в гнёзда — когда все
// на месте, провода «защёлкиваются» (assembled = 1). Щелчок по ключу замыкает цепь (switch = 1),
// при замыкании у контактов проскакивает искра. Ток и заряды — только в собранной замкнутой цепи.
// Надписи есть только на самих приборах (табло, шкалы) — поверх сцены текста нет.

import { createScene, cylinderShade, dial, draggable, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH_Y = 470;
const CHARGES = 22;
const MAX_POWER = 20; // Вт — при такой мощности лампа светится в полную силу
const SNAP = 80; // px — насколько близко к гнезду нужно поднести деталь, чтобы она встала на место
const RHEO_HALF = 100; // полудлина обмотки реостата
const SPARKS = 10;
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');

// Гнёзда на стенде (slot) и места на столе (rest), где детали лежат до сборки.
// box — габарит детали в её собственных координатах: по нему рисуется контур гнезда.
const PARTS = {
  rheostat: { slot: { x: 540, y: 320 }, rest: { x: 590, y: BENCH_Y - 26 }, box: [-126, -32, 252, 60] },
  source: { slot: { x: 130, y: 200 }, rest: { x: 100, y: BENCH_Y - 50 }, box: [-68, -51, 136, 102] },
  ammeter: { slot: { x: 560, y: 80 }, rest: { x: 372, y: BENCH_Y - 46 }, box: [-47, -47, 94, 94] },
  key: { slot: { x: 340, y: 80 }, rest: { x: 250, y: BENCH_Y - 12 }, box: [-49, -14, 98, 28] },
  bulb: { slot: { x: 840, y: 195 }, rest: { x: 835, y: BENCH_Y - 57 }, box: [-37, -62, 74, 120] },
};

// Проводка стенда: разрывы в местах гнёзд, концы проводов подходят к клеммам деталей
const WIRES = 'M195 178 H230 V80 H291 M389 80 H513 M607 80 H890 V243 H862 M818 243 H800 V320 H662 M418 320 H230 V222 H195';
const TRACK = 'M195 178 H230 V80 H890 V243 H800 V320 H230 V222 H195';
const CLAMPS = [[195, 178], [291, 80], [389, 80], [513, 80], [607, 80], [862, 243], [818, 243], [662, 320], [418, 320], [195, 222]];

export function ohmScene(container, params, set) {
  let track, charges, amm, volt, psuScreen, wires, wireFlash, clamps, blade, glowEl, bulbGlass, filament, slider, contact, flash;
  let phase = 0;
  let length = 1;
  let prevSwitch = params.switch;
  let prevAssembled = params.assembled;
  let flashT = 0;
  const sparks = [];
  // Состояние деталей: где лежит, стоит ли в гнезде, тащит ли её ученик
  const state = Object.fromEntries(Object.entries(PARTS).map(([id, p]) => {
    const placed = Boolean(params.assembled);
    const at = placed ? p.slot : p.rest;
    return [id, { g: null, x: at.x, y: at.y, placed, dragging: false, dx: 0, dy: 0 }];
  }));

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH_Y, theme: 'stand' });

      // Гнёзда на стенде: утопленные площадки под каждую деталь — тень по верхней кромке,
      // блик по нижней. Видно, куда ставить деталь, без пунктирных «заглушек».
      const inset = d.lin([[0, '#0f172a', 0.14], [0.18, '#0f172a', 0.05], [1, '#ffffff', 0.35]], 'v');
      for (const p of Object.values(PARTS)) {
        const [x, y, w, h] = p.box;
        svg.append(
          s('rect', { x: p.slot.x + x - 4, y: p.slot.y + y - 4, width: w + 8, height: h + 8, rx: 10, fill: '#d3d9e1' }),
          s('rect', { x: p.slot.x + x - 4, y: p.slot.y + y - 4, width: w + 8, height: h + 8, rx: 10, fill: inset, stroke: '#b4bdc9', 'stroke-width': 1 }),
        );
      }

      // Провода стенда: до сборки висят бледно, после — «защёлкиваются» и вспыхивают
      wires = s('g', {}, [
        s('path', { d: WIRES, fill: 'none', stroke: '#1e293b', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
        s('path', { d: WIRES, fill: 'none', stroke: '#64748b', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', transform: 'translate(-1 -1)' }),
      ]);
      wireFlash = s('path', { d: WIRES, fill: 'none', stroke: '#fde68a', 'stroke-width': 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0 });
      clamps = CLAMPS.map(([cx, cy]) => s('circle', { cx, cy, r: 4.5, stroke: '#1e293b', 'stroke-width': 1.2 }));
      svg.append(wires, wireFlash, ...clamps);

      track = s('path', { d: TRACK, fill: 'none', stroke: 'none' });
      svg.append(track);
      length = track.getTotalLength();
      charges = Array.from({ length: CHARGES }, () => {
        const c = s('circle', { r: 3, fill: '#fcd34d', 'fill-opacity': 0.85 });
        svg.append(c);
        return c;
      });

      // Вольтметр закреплён на стенде и подключён параллельно гнезду источника
      svg.append(
        s('path', { d: 'M298 186 C 270 180, 250 150, 230 142', fill: 'none', stroke: '#dc2626', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        s('path', { d: 'M298 222 C 270 232, 250 256, 230 262', fill: 'none', stroke: '#0f172a', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        s('circle', { cx: 230, cy: 142, r: 4, fill: '#1e293b' }),
        s('circle', { cx: 230, cy: 262, r: 4, fill: '#1e293b' }),
      );
      volt = dial(d, { x: 334, y: 200, r: 34, letter: 'V', color: '#0284c7' });
      svg.append(volt.g);

      // Детали. Порядок = порядок наложения: лёгкие мелкие детали поверх крупных
      state.rheostat.g = buildRheostat(d);
      state.source.g = buildSource(d);
      state.ammeter.g = buildAmmeter(d);
      state.key.g = buildKey(d);
      state.bulb.g = buildBulb(d);
      svg.append(state.rheostat.g, state.source.g, state.ammeter.g, state.key.g, state.bulb.g);

      // Искра у контактов ключа: пул коротких штрихов и вспышка, живут доли секунды
      flash = s('circle', { r: 16, fill: d.rad([[0, '#ffffff', 0.95], [0.4, '#fde68a', 0.7], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
      svg.append(flash);
      for (let i = 0; i < SPARKS; i++) {
        const el = s('line', { stroke: i % 2 ? '#fef3c7' : '#fbbf24', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
        svg.append(el);
        sparks.push({ el, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
      }
    },

    frame(dt) {
      const assembled = Boolean(params.assembled);
      const on = assembled && Boolean(params.switch);
      const I = on ? params.U / params.R : 0;

      // Кнопка «Собрать цепь» в работе ставит все детали на места сама
      if (assembled) for (const p of Object.values(state)) if (!p.placed && !p.dragging) p.placed = true;

      for (const [id, p] of Object.entries(state)) {
        if (!p.dragging) {
          const to = p.placed ? PARTS[id].slot : PARTS[id].rest;
          const k = Math.min(1, dt * 10);
          p.x += (to.x - p.x) * k;
          p.y += (to.y - p.y) * k;
        }
        p.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      }

      // «Щелчок» проводов в момент сборки
      if (assembled && !prevAssembled) flashT = 0.6;
      prevAssembled = assembled;
      flashT = Math.max(0, flashT - dt);
      wireFlash.setAttribute('opacity', (flashT / 0.6) * 0.9);
      wires.setAttribute('opacity', assembled ? 1 : 0.35);
      clamps.forEach((c) => c.setAttribute('fill', assembled ? '#d4a017' : '#94a3b8'));

      // Ключ: нож поднят или лежит в губках; искра — в момент замыкания собранной цепи
      blade.setAttribute('transform', `rotate(${params.switch ? 0 : -38} -32 -5)`);
      if (params.switch && !prevSwitch && assembled && params.U > 0) spark(state.key.x + 32, state.key.y - 5);
      prevSwitch = params.switch;
      updateSparks(dt);

      phase = (phase + I * dt * 0.25) % 1;
      charges.forEach((c, k) => {
        const pt = track.getPointAtLength(((k / CHARGES + phase) % 1) * length);
        c.setAttribute('cx', pt.x);
        c.setAttribute('cy', pt.y);
        c.setAttribute('opacity', I > 0.001 ? 1 : 0);
      });

      amm.set(I / 6, `${fmt(I)} А`);
      // Вольтметр подключён к гнезду источника: без источника ему нечего показывать
      const Uv = state.source.placed && !state.source.dragging ? params.U : 0;
      volt.set(Uv / 12, `${fmt(Uv, 1)} В`);
      psuScreen.textContent = fmt(params.U, 1);

      const brightness = Math.min(1, (params.U * I) / MAX_POWER);
      glowEl.setAttribute('opacity', brightness);
      bulbGlass.setAttribute('fill', brightness > 0.02 ? shade('#fef08a', 0.5 - brightness * 0.3) : '#f1f5f9');
      filament.setAttribute('stroke', brightness > 0.02 ? '#f97316' : '#64748b');

      const sx = -RHEO_HALF + ((params.R - 2) / 18) * RHEO_HALF * 2;
      slider.setAttribute('transform', `translate(${sx} -26)`);
      contact.setAttribute('x', sx - 3);
    },
  });

  function buildSource(d) {
    psuScreen = text(-14, -17, '', { size: 18, weight: 700, fill: '#fbbf24' });
    return s('g', {}, [
      floorShadow(0, 50, 70, d),
      s('rect', { x: -65, y: -48, width: 130, height: 96, rx: 10, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.5 }),
      s('rect', { x: -57, y: -40, width: 114, height: 80, rx: 8, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v') }),
      s('rect', { x: -48, y: -32, width: 80, height: 30, rx: 5, fill: '#0f172a', stroke: '#475569' }),
      psuScreen,
      text(24, -17, 'V', { size: 12, weight: 700, fill: '#f59e0b' }),
      s('circle', { cx: -28, cy: 20, r: 12, fill: d.rad(['#e2e8f0', '#64748b']) }),
      s('rect', { x: -29.5, y: 9, width: 3, height: 9, rx: 1.5, fill: '#1e293b' }),
      s('circle', { cx: 12, cy: 20, r: 5, fill: '#22c55e', 'fill-opacity': 0.8 }),
      // клеммы справа: «+» красная, «−» чёрная — к ним подходят провода стенда
      s('rect', { x: 58, y: -29, width: 14, height: 14, rx: 3, fill: d.lin(['#b91c1c', '#f87171', '#b91c1c']) }),
      s('rect', { x: 58, y: 15, width: 14, height: 14, rx: 3, fill: d.lin(['#0f172a', '#475569', '#0f172a']) }),
    ]);
  }

  function buildAmmeter(d) {
    amm = dial(d, { x: 0, y: 0, r: 38, letter: 'A' });
    return s('g', {}, [floorShadow(0, 46, 50, d), amm.g,
      s('rect', { x: -48, y: -5, width: 6, height: 10, rx: 2, fill: '#b91c1c' }),
      s('rect', { x: 42, y: -5, width: 6, height: 10, rx: 2, fill: '#0f172a' }),
    ]);
  }

  // Рубильник-ключ: эбонитовое основание, шарнир слева, губки справа, медный нож с ручкой
  function buildKey(d) {
    blade = s('g', {}, [
      s('rect', { x: -32, y: -8, width: 66, height: 6, rx: 2, fill: d.lin([[0, '#fcd9a8'], [0.5, '#d97706'], [1, '#92400e']], 'v') }),
      s('rect', { x: 26, y: -22, width: 8, height: 16, rx: 3, fill: '#1f2937' }),
    ]);
    // Невидимая зона на весь ключ с основанием, не поворачивается вместе с ножом. Раньше она была только
    // над основанием — на телефоне это 34×18 px, и палец попадал в основание, а не в нож
    const toggle = s('rect', { x: -50, y: -56, width: 104, height: 70, fill: '#ffffff', 'fill-opacity': 0 });
    toggle.style.cursor = 'pointer';
    // Щелчок по ножу установленного ключа переключает его; на столе нож просто тянет весь ключ
    toggle.addEventListener('pointerdown', (e) => {
      if (!state.key.placed || state.key.dragging) return;
      e.stopPropagation();
      set('switch', params.switch ? 0 : 1);
    });
    return s('g', {}, [
      floorShadow(0, 12, 50, d),
      s('rect', { x: -45, y: -2, width: 90, height: 12, rx: 3, fill: d.lin([[0, '#374151'], [1, '#111827']], 'v') }),
      s('rect', { x: -37, y: -10, width: 10, height: 10, rx: 2, fill: '#b45309' }),
      s('rect', { x: 27, y: -12, width: 3, height: 12, fill: '#b45309' }),
      s('rect', { x: 35, y: -12, width: 3, height: 12, fill: '#b45309' }),
      s('circle', { cx: -42, cy: 0, r: 3, fill: '#94a3b8' }),
      s('circle', { cx: 42, cy: 0, r: 3, fill: '#94a3b8' }),
      blade,
      s('circle', { cx: -32, cy: -5, r: 3, fill: '#78350f' }),
      toggle,
    ]);
  }

  // Лампа накаливания в патроне; клеммы патрона внизу по бокам
  function buildBulb(d) {
    glowEl = s('circle', { cx: 0, cy: -24, r: 110, fill: d.rad([[0, '#fde68a', 0.6], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
    bulbGlass = s('path', { d: 'M0 -58 C -38 -58, -42 -10, -17 8 L -14 20 H 14 L 17 8 C 42 -10, 38 -58, 0 -58 Z', stroke: '#94a3b8', 'stroke-width': 1.8, 'fill-opacity': 0.9 });
    filament = s('path', { d: 'M-8 14 L-6 -10 L-2 -18 L1 -10 L4 -18 L7 -10 L8 14', fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round' });
    const threads = [0, 1, 2, 3].map((i) => s('rect', { x: -14, y: 21 + i * 5, width: 28, height: 3, rx: 1.5, fill: '#94a3b8' }));
    return s('g', {}, [
      glowEl,
      floorShadow(0, 58, 40, d),
      s('rect', { x: -14, y: 19, width: 28, height: 22, rx: 2, fill: cylinderShade(d, '#cbd5e1') }),
      ...threads,
      s('rect', { x: -24, y: 40, width: 48, height: 16, rx: 5, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('circle', { cx: -22, cy: 48, r: 3.5, fill: '#b45309' }),
      s('circle', { cx: 22, cy: 48, r: 3.5, fill: '#b45309' }),
      bulbGlass,
      filament,
      s('path', { d: 'M-24 -24 Q -21 -40 -8 -46', fill: 'none', stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-opacity': 0.8 }),
    ]);
  }

  // Реостат: керамический цилиндр с обмоткой, стойки-клеммы по краям, штанга и движок
  function buildRheostat(d) {
    const coil = s('g');
    for (let x = -RHEO_HALF + 8; x < RHEO_HALF - 6; x += 6) {
      coil.append(s('line', { x1: x, y1: -14, x2: x + 4, y2: 14, stroke: '#b45309', 'stroke-width': 2.2 }));
    }
    contact = s('rect', { x: -3, y: -22, width: 6, height: 10, fill: '#94a3b8' });
    slider = s('g', {}, [
      s('rect', { x: -14, y: -11, width: 28, height: 22, rx: 5, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v'), stroke: '#111827' }),
      s('rect', { x: -9, y: -6, width: 18, height: 3, rx: 1.5, fill: '#9ca3af' }),
      s('rect', { x: -9, y: -1, width: 18, height: 3, rx: 1.5, fill: '#9ca3af' }),
    ]);
    // Движок тянется сам по себе и не утаскивает весь реостат
    slider.addEventListener('pointerdown', (e) => e.stopPropagation());
    const post = (x) => s('rect', { x, y: -22, width: 16, height: 46, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') });
    return s('g', {}, [
      floorShadow(0, 26, 130, d),
      post(-122),
      post(106),
      s('rect', { x: -RHEO_HALF, y: -16, width: RHEO_HALF * 2, height: 32, rx: 16, fill: d.lin([[0, '#fffbeb'], [0.4, '#fef3c7'], [1, '#d6c7a1']], 'v') }),
      coil,
      s('rect', { x: -RHEO_HALF, y: -16, width: RHEO_HALF * 2, height: 32, rx: 16, fill: d.lin([[0, '#ffffff', 0.35], [0.5, '#ffffff', 0], [1, '#000000', 0.15]], 'v') }),
      s('rect', { x: -122, y: -30, width: 244, height: 7, rx: 3.5, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b'], 'v') }),
      contact,
      slider,
    ]);
  }

  function spark(x, y) {
    flash.setAttribute('cx', x);
    flash.setAttribute('cy', y);
    flash.dataset.t = '0.18';
    for (const sp of sparks) {
      const a = -Math.PI * (0.1 + Math.random() * 0.8);
      const v = 90 + Math.random() * 120;
      Object.assign(sp, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.22 + Math.random() * 0.2 });
    }
  }

  function updateSparks(dt) {
    const ft = Math.max(0, Number(flash.dataset.t ?? 0) - dt);
    flash.dataset.t = String(ft);
    flash.setAttribute('opacity', ft / 0.18);
    for (const sp of sparks) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.vy += 420 * dt; // искры падают
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.el.setAttribute('x1', sp.x);
      sp.el.setAttribute('y1', sp.y);
      sp.el.setAttribute('x2', sp.x - sp.vx * 0.03);
      sp.el.setAttribute('y2', sp.y - sp.vy * 0.03);
      sp.el.setAttribute('opacity', sp.life > 0 ? Math.min(1, sp.life * 5) : 0);
    }
  }

  // Перенос деталей: деталь, поднесённая к своему гнезду, встаёт в него; иначе возвращается на стол
  for (const [id, p] of Object.entries(state)) {
    draggable(scene, p.g, {
      onDrag(x, y) {
        if (!p.dragging) {
          p.dragging = true;
          p.dx = p.x - x;
          p.dy = p.y - y;
          // Деталь вынули из собранной цепи — цепь снова не собрана
          if (p.placed && params.assembled) set('assembled', 0);
          p.placed = false;
        }
        p.x = Math.max(40, Math.min(920, x + p.dx));
        p.y = Math.max(40, Math.min(BENCH_Y - 10, y + p.dy));
      },
      onEnd() {
        if (!p.dragging) return;
        p.dragging = false;
        const slot = PARTS[id].slot;
        p.placed = Math.hypot(p.x - slot.x, p.y - slot.y) < SNAP;
        if (Object.values(state).every((q) => q.placed)) set('assembled', 1);
      },
    });
  }

  // При перетаскивании не должны выделяться надписи на приборах
  scene.svg.style.userSelect = 'none';
  draggable(scene, slider, {
    onDrag: (x) => set('R', 2 + ((x - state.rheostat.x + RHEO_HALF) / (RHEO_HALF * 2)) * 18),
  });
  return scene;
}
