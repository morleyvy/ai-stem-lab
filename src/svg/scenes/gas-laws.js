// Сцена «Газовые законы»: на плитке — стеклянная водяная баня, в ней вертикальный мерный цилиндр
// с воздухом под поршнем; справа манометр. Шток поршня поднимается через гайку на лапке
// штатива; ручку штока можно тянуть вверх-вниз (это винт, меняющий объём), пока гайка зажата.
// Щелчок по гайке разжимает её (free = 1): поршень становится свободным и сам встаёт туда, где давление
// газа равно атмосферному; повторный щелчок снова зажимает шток.
// В сцене только два прибора — табло плитки (температура бани) и манометр: числа показывает панель под сценой, график p–V —
// страница (sim.chart). Газ «догоняет» регуляторы плавно (баня прогревается, поршень едет), но в покое
// стрелка манометра стоит ровно на значении из readings() модели.

import { createScene, draggable, floorShadow, hotplate, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const DX = 200; // сдвиг установки к середине сцены — правая часть больше не занята регистратором
const PLATE = { x: 200 + DX, y: 426, w: 260 }; // плитка под баней
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 }; // ручка плитки
const TANK = { x1: 70 + DX, x2: 330 + DX, top: 222, bottom: 416 };
const WATER_Y = 244;
const CYL = { x: 192 + DX, r: 26, wall: 5 }; // цилиндр: ось и внутренний радиус
const GAS_BOTTOM = 400; // дно цилиндра изнутри — отметка 0 мл
const K = 1.5; // px на 1 мл: 100 мл — 150 px столба газа
const RIM = GAS_BOTTOM - 100 * K - 22; // верхний край цилиндра
const PISTON_H = 14;
const ROD_L = 210; // от нижней грани поршня до ручки штока
const CLAMP = { x: CYL.x, y: 200 }; // гайка на лапке штатива
const STAND_X = 350 + DX;
const GAUGE = { x: 470 + DX, y: 230, r: 80 };
const P_MAX = 400; // кПа — предел шкалы манометра
const MOLECULES = 30;

const gasTop = (V) => GAS_BOTTOM - V * K;

export function gasLawsScene(container, params, set, { pressure, volume, freeVolume, kelvin, C, P_ATM }) {
  let plate, knob, knobPointer, iceGroup, plunger, nutJaw, lever, needle, gasRect;
  const molecules = [];
  // Показанное состояние газа: догоняет модель плавно, чтобы был виден сам процесс
  let shownT = kelvin(params);
  let shownV = volume(params);

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ── Штатив: основание за плиткой, стойка между баней и манометром, лапка с гайкой ──
      svg.append(
        floorShadow(STAND_X, BENCH + 1, 50, d, 6),
        s('rect', { x: STAND_X - 46, y: BENCH - 10, width: 92, height: 10, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: STAND_X - 4, y: 150, width: 8, height: BENCH - 160, rx: 3, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
        s('rect', { x: CLAMP.x + 10, y: CLAMP.y - 4, width: STAND_X - CLAMP.x - 14, height: 8, rx: 3, fill: d.lin([[0, '#e2e8f0'], [0.5, '#94a3b8'], [1, '#475569']], 'v') }),
        // муфта на стойке
        s('rect', { x: STAND_X - 11, y: CLAMP.y - 12, width: 22, height: 24, rx: 4, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#334155']]) }),
        s('circle', { cx: STAND_X + 14, cy: CLAMP.y, r: 5, fill: d.rad(['#e2e8f0', '#475569']), stroke: '#334155', 'stroke-width': 1 }),
      );

      // ── Плитка; ручку можно поворачивать мышью ──
      plate = hotplate(d, PLATE);
      const { x: kx, y: ky } = KNOB;
      knobPointer = s('rect', { x: kx - 1.5, y: ky - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
      knob = s('g', {}, [
        s('circle', { cx: kx, cy: ky, r: 17, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: kx, cy: ky, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
        knobPointer,
      ]);
      svg.append(plate.g, knob);

      // ── Бачок бани: задняя стенка, вода ──
      const tankW = TANK.x2 - TANK.x1;
      const tankH = TANK.bottom - TANK.top;
      const tankClip = `tank${uid}`;
      defs.append(s('clipPath', { id: tankClip }, [s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 6 })]));
      svg.append(
        s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 6, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: TANK.x1, y: WATER_Y, width: tankW, height: TANK.bottom - WATER_Y, fill: '#cfe7f3', 'fill-opacity': 0.7, 'clip-path': `url(#${tankClip})` }),
      );

      // ── Цилиндр с газом, поршень со штоком ──
      const inner = CYL.r * 2;
      const cylClip = `cyl${uid}`;
      defs.append(s('clipPath', { id: cylClip }, [s('rect', { x: CYL.x - CYL.r, y: RIM, width: inner, height: GAS_BOTTOM - RIM })]));
      gasRect = s('rect', { x: CYL.x - CYL.r, width: inner, fill: '#e0f2fe', 'fill-opacity': 0.9 });
      const gas = s('g', { 'clip-path': `url(#${cylClip})` }, [gasRect]);
      for (let i = 0; i < MOLECULES; i++) {
        const c = s('circle', { r: 2.4, fill: '#2563eb', 'fill-opacity': 0.85 });
        gas.append(c);
        const a = Math.random() * Math.PI * 2;
        molecules.push({ c, x: CYL.x - CYL.r + 3 + Math.random() * (inner - 6), h: Math.random(), vx: Math.cos(a), vy: Math.sin(a) });
      }
      svg.append(
        // задняя стенка цилиндра и толстое стеклянное дно с отводом к манометру
        s('rect', { x: CYL.x - CYL.r - CYL.wall, y: RIM, width: inner + CYL.wall * 2, height: GAS_BOTTOM - RIM + 10, rx: 4, fill: '#eef3f7', 'fill-opacity': 0.35 }),
        gas,
        s('rect', { x: CYL.x - CYL.r - CYL.wall, y: GAS_BOTTOM, width: inner + CYL.wall * 2, height: 10, rx: 3, fill: d.lin([[0, '#cbd5e1'], [1, '#94a3b8']], 'v') }),
      );

      // Поршень и шток — одна подвижная деталь; нижняя грань поршня в (0, 0)
      const handle = s('g', {}, [
        s('rect', { x: CYL.x - 34, y: -ROD_L - 7, width: 68, height: 14, rx: 7, fill: d.lin([[0, '#1e293b'], [0.4, '#475569'], [1, '#0f172a']], 'v') }),
        s('rect', { x: CYL.x - 30, y: -ROD_L - 5, width: 60, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.25 }),
        s('circle', { cx: CYL.x, cy: -ROD_L, r: 5, fill: d.rad(['#e2e8f0', '#64748b']) }),
      ]);
      plunger = s('g', {}, [
        // невидимая полоса вдоль штока — за неё удобно ухватить мышью
        s('rect', { x: CYL.x - 14, y: -ROD_L, width: 28, height: ROD_L, fill: '#000', 'fill-opacity': 0 }),
        s('rect', { x: CYL.x - 4, y: -ROD_L, width: 8, height: ROD_L - PISTON_H, fill: d.lin(['#64748b', '#f1f5f9', '#475569']) }),
        // резьба винта на штоке
        ...Array.from({ length: 13 }, (_, i) => s('line', { x1: CYL.x - 4, x2: CYL.x + 4, y1: -ROD_L + 24 + i * 9, y2: -ROD_L + 21 + i * 9, stroke: '#64748b', 'stroke-width': 1 })),
        s('rect', { x: CYL.x - CYL.r + 1, y: -PISTON_H, width: inner - 2, height: PISTON_H, rx: 2, fill: d.lin([[0, '#64748b'], [0.3, '#cbd5e1'], [0.6, '#94a3b8'], [1, '#475569']]) }),
        // резиновые уплотнительные кольца
        s('rect', { x: CYL.x - CYL.r + 1, y: -PISTON_H + 3, width: inner - 2, height: 2.5, fill: '#1f2937' }),
        s('rect', { x: CYL.x - CYL.r + 1, y: -4.5, width: inner - 2, height: 2.5, fill: '#1f2937' }),
        handle,
      ]);
      svg.append(plunger);

      // Стеклянная стенка цилиндра поверх газа: блики и мерная шкала 0…100 мл
      const scale = s('g');
      for (let v = 10; v <= 100; v += 5) {
        const y = gasTop(v);
        const major = v % 10 === 0;
        scale.append(s('line', { x1: CYL.x + CYL.r - (major ? 12 : 7), x2: CYL.x + CYL.r, y1: y, y2: y, stroke: '#334155', 'stroke-opacity': 0.75, 'stroke-width': major ? 1.4 : 0.9 }));
      }
      svg.append(
        s('rect', { x: CYL.x - CYL.r - CYL.wall, y: RIM, width: inner + CYL.wall * 2, height: GAS_BOTTOM - RIM + 10, rx: 4, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: CYL.x - CYL.r - CYL.wall - 3, y: RIM - 3, width: inner + CYL.wall * 2 + 6, height: 6, rx: 3, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: CYL.x - CYL.r + 4, y: RIM + 12, width: 4, height: GAS_BOTTOM - RIM - 24, rx: 2, fill: '#ffffff', 'fill-opacity': 0.7 }),
        scale,
      );

      // Погружённые части видны сквозь воду — слегка тонированы
      svg.append(
        s('rect', { x: CYL.x - CYL.r - CYL.wall - 1, y: WATER_Y, width: inner + CYL.wall * 2 + 2, height: GAS_BOTTOM - WATER_Y + 12, fill: '#bcd8e6', 'fill-opacity': 0.22 }),
      );

      // Лёд у поверхности ледяной воды
      iceGroup = s('g', { 'clip-path': `url(#${tankClip})` }, [
        [6, -3, 24, 18, -10], [60, 2, 26, 19, 14], [168, -2, 28, 20, 10], [206, 3, 22, 16, -20],
      ].map(([dx, dy, w, h, a, x = TANK.x1 + dx]) => s('rect', {
        x, y: WATER_Y + dy - h / 2, width: w, height: h, rx: 5,
        fill: d.lin([[0, '#ffffff', 0.92], [1, '#cfe3ee', 0.8]], 'v'), stroke: '#b6cfdd', 'stroke-width': 1,
        transform: `rotate(${a} ${x + w / 2} ${WATER_Y + dy})`,
      })));
      svg.append(iceGroup);

      // Трубка от отвода в дне цилиндра к манометру: по дну бачка и через уплотнение в стенке
      const tube = `M${CYL.x} ${GAS_BOTTOM + 10} V${TANK.bottom - 8} H${TANK.x2 + 6} C ${TANK.x2 + 60} ${TANK.bottom - 8}, ${GAUGE.x - 30} ${TANK.bottom - 10}, ${GAUGE.x - 30} ${GAUGE.y + GAUGE.r + 70} H${GAUGE.x - 6}`;
      svg.append(
        s('path', { d: tube, fill: 'none', stroke: '#7f1d1d', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('path', { d: tube, fill: 'none', stroke: '#b91c1c', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      );

      // Поверхность воды и стенки бачка поверх содержимого
      svg.append(
        s('line', { x1: TANK.x1 + 3, x2: TANK.x2 - 3, y1: WATER_Y, y2: WATER_Y, stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': 2 }),
        s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 6, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5 }),
        s('rect', { x: TANK.x1 + 8, y: TANK.top + 14, width: 7, height: tankH - 34, rx: 3.5, fill: '#ffffff', 'fill-opacity': 0.6 }),
        s('rect', { x: TANK.x2 - 4, y: TANK.bottom - 15, width: 12, height: 14, rx: 3, fill: '#334155' }),
      );
      // Цифры шкал — поверх воды и стекла, чтобы читались
      for (let v = 20; v <= 100; v += 20) svg.append(text(CYL.x + CYL.r + 10, gasTop(v), String(v), { size: 13, weight: 600, fill: '#1e293b', anchor: 'start' }));
      svg.append(text(CYL.x + CYL.r + 10, gasTop(100) - 16, tr('мл'), { size: 13, weight: 600, fill: '#1e293b', anchor: 'start' }));

      // ── Гайка на лапке: зажата — шток держит винт; разжата — поршень свободен ──
      nutJaw = s('rect', { x: CLAMP.x - 22, y: CLAMP.y - 13, width: 44, height: 26, rx: 5 });
      lever = s('g', {}, [
        s('rect', { x: CLAMP.x + 18, y: CLAMP.y - 3.5, width: 34, height: 7, rx: 3.5, fill: d.lin([[0, '#fb923c'], [1, '#c2410c']], 'v'), stroke: '#7c2d12', 'stroke-width': 1 }),
        s('circle', { cx: CLAMP.x + 52, cy: CLAMP.y, r: 6, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
      ]);
      const nut = s('g', {}, [
        s('circle', { cx: CLAMP.x + 10, cy: CLAMP.y, r: 46, fill: '#000', 'fill-opacity': 0 }),
        nutJaw,
        s('rect', { x: CLAMP.x - 20, y: CLAMP.y - 11, width: 40, height: 6, rx: 3, fill: '#ffffff', 'fill-opacity': 0.25 }),
        s('rect', { x: CLAMP.x - 6, y: CLAMP.y - 13, width: 12, height: 26, fill: '#0f172a', 'fill-opacity': 0.35 }),
        lever,
        s('circle', { cx: CLAMP.x + 18, cy: CLAMP.y, r: 4, fill: '#1e293b' }),
      ]);
      nut.style.cursor = 'pointer';
      nut.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('free', params.free ? 0 : 1);
      });
      touchTarget(nut);
      svg.append(nut);

      // ── Манометр на стойке ──
      buildGauge(svg, d);

    },

    frame(dt) {
      // Свободный поршень: объём задаёт сам газ — регулятор объёма показывает его, а не держит поршень
      if (params.free) {
        const vf = freeVolume(params);
        if (params.V !== vf) set('V', vf);
      }

      // Баня прогревается (остывает) за ~1 с; поршень догоняет своё положение быстрее
      const T = kelvin(params);
      shownT = approach(shownT, T, dt, 0.4, 20);
      const targetV = params.free ? (C * shownT) / P_ATM : volume(params);
      shownV = approach(shownV, targetV, dt, 0.22, 15);
      // В покое — точно как в модели, без погрешности сглаживания
      const settled = shownT === T && shownV === volume(params);
      const P = settled ? pressure(params) : (C * shownT) / shownV;
      const t = shownT - 273;

      // Баня
      plate.setTemp(t);
      plate.setHeat(Math.max(0, (t - 30) / 70));
      knobPointer.setAttribute('transform', `rotate(${-135 + (params.t / 100) * 270} ${KNOB.x} ${KNOB.y})`);
      iceGroup.setAttribute('opacity', Math.max(0, Math.min(1, (6 - t) / 4)));

      // Поршень и газ
      const top = gasTop(shownV);
      plunger.setAttribute('transform', `translate(0 ${top.toFixed(2)})`);
      gasRect.setAttribute('y', top);
      gasRect.setAttribute('height', GAS_BOTTOM - top);
      // Нагретый газ чуть теплее по цвету — подсказка, а не измерение
      gasRect.setAttribute('fill', t > 50 ? '#fef3c7' : t < 10 ? '#dbeafe' : '#e0f2fe');
      moveMolecules(dt, top, shownT);

      // Гайка: разжата — светлее, рычажок откинут
      const free = Boolean(params.free);
      nutJaw.setAttribute('fill', free ? '#94a3b8' : '#475569');
      nutJaw.setAttribute('stroke', free ? '#64748b' : '#1e293b');
      lever.setAttribute('transform', free ? `rotate(-70 ${CLAMP.x + 18} ${CLAMP.y})` : '');
      plunger.style.cursor = free ? 'default' : 'ns-resize';

      // Приборы
      needle.setAttribute('transform', `rotate(${(-135 + (Math.min(P, P_MAX) / P_MAX) * 270).toFixed(2)} ${GAUGE.x} ${GAUGE.y})`);
    },
  });

  // Плавное приближение к цели: экспонента в начале и не медленнее minRate в конце — иначе хвост
  // экспоненты тянулся бы секундами, и табло долго показывало бы 239,9 вместо 240,0
  function approach(from, to, dt, tau, minRate) {
    const diff = to - from;
    const step = Math.max(Math.abs(diff) * (1 - Math.exp(-dt / tau)), minRate * dt);
    return Math.abs(diff) <= step ? to : from + Math.sign(diff) * step;
  }

  // Молекулы летают тем быстрее, чем выше T (v ~ √T), и всегда заполняют весь объём под поршнем
  function moveMolecules(dt, top, T) {
    const height = GAS_BOTTOM - top;
    const speed = 70 * Math.sqrt(T / 300);
    const x1 = CYL.x - CYL.r + 3;
    const x2 = CYL.x + CYL.r - 3;
    for (const m of molecules) {
      m.x += m.vx * speed * dt;
      m.h += (-m.vy * speed * dt) / Math.max(10, height);
      if (m.x < x1) { m.x = x1; m.vx = Math.abs(m.vx); }
      if (m.x > x2) { m.x = x2; m.vx = -Math.abs(m.vx); }
      if (m.h < 0.02) { m.h = 0.02; m.vy = -Math.abs(m.vy); }
      if (m.h > 0.97) { m.h = 0.97; m.vy = Math.abs(m.vy); }
      m.c.setAttribute('cx', m.x.toFixed(1));
      m.c.setAttribute('cy', (GAS_BOTTOM - m.h * height).toFixed(1));
    }
  }

  function buildGauge(svg, d) {
    const { x, y, r } = GAUGE;
    svg.append(
      floorShadow(x, BENCH + 1, 44, d, 6),
      s('rect', { x: x - 34, y: BENCH - 10, width: 68, height: 10, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: x - 5, y: y + r - 4, width: 10, height: BENCH - 10 - (y + r - 4), fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      // штуцер, к которому подходит трубка
      s('rect', { x: x - 9, y: y + r + 62, width: 18, height: 16, rx: 3, fill: d.lin(['#a16207', '#fde68a', '#854d0e']) }),
    );
    const face = s('g', { filter: d.url('soft') }, [
      s('circle', { cx: x, cy: y, r: r + 8, fill: d.lin([[0, '#e2e8f0'], [0.5, '#94a3b8'], [1, '#475569']], 'v'), stroke: '#334155', 'stroke-width': 1.5 }),
      s('circle', { cx: x, cy: y, r, fill: d.rad([[0, '#ffffff'], [1, '#e2e8f0']], 0.4, 0.35) }),
    ]);
    svg.append(face);
    // Шкала 0…400 кПа на 270°; красная риска — атмосферное давление
    const ang = (p) => ((-135 + (p / P_MAX) * 270 - 90) * Math.PI) / 180;
    for (let p = 0; p <= P_MAX; p += 20) {
      const a = ang(p);
      const major = p % 100 === 0;
      const r1 = r - 6;
      const r2 = r - (major ? 16 : 11);
      svg.append(s('line', { x1: x + Math.cos(a) * r1, y1: y + Math.sin(a) * r1, x2: x + Math.cos(a) * r2, y2: y + Math.sin(a) * r2, stroke: '#1e293b', 'stroke-width': major ? 2 : 1 }));
      if (major) svg.append(text(x + Math.cos(a) * (r - 30), y + Math.sin(a) * (r - 30), String(p), { size: 13, weight: 700, fill: '#1e293b' }));
    }
    const a0 = ang(P_ATM);
    svg.append(
      s('line', { x1: x + Math.cos(a0) * (r - 2), y1: y + Math.sin(a0) * (r - 2), x2: x + Math.cos(a0) * (r - 8), y2: y + Math.sin(a0) * (r - 8), stroke: '#dc2626', 'stroke-width': 3 }),
      text(x, y + 47, tr('кПа'), { size: 13, weight: 700, fill: '#475569' }),
    );
    needle = s('path', { d: `M${x - 2.5} ${y + 10} L${x} ${y - r + 12} L${x + 2.5} ${y + 10} Z`, fill: '#dc2626' });
    svg.append(
      needle,
      s('circle', { cx: x, cy: y, r: 5, fill: '#1e293b' }),
      s('path', { d: `M${x - r + 8} ${y - 10} A ${r - 8} ${r - 8} 0 0 1 ${x + 10} ${y - r + 8}`, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.6, 'stroke-width': 4, 'stroke-linecap': 'round' }),
    );
  }

  // Ручка плитки: ведём мышью влево-вправо — меняется температура бани
  draggable(scene, knob, {
    onDrag: (x) => set('t', Math.round(Math.max(0, Math.min(100, ((x - (KNOB.x - 100)) / 200) * 100)))),
  });

  // Ручка винта (или сам шток): тянем вверх — объём растёт, вниз — уменьшается. Свободный поршень
  // рукой не двигаем: его положение задаёт равновесие давлений.
  // Запоминаем, за какую точку штока взялись: иначе поршень прыгнул бы так, чтобы под курсором
  // оказалась ручка
  let grab = 0;
  plunger.addEventListener('pointerdown', (e) => {
    grab = scene.point(e).y - gasTop(shownV);
  });
  draggable(scene, plunger, {
    onDrag: (x, y) => {
      if (params.free) return;
      set('V', (GAS_BOTTOM - (y - grab)) / K);
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
