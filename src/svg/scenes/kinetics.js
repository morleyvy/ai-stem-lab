// Сцена «Скорость реакции тиосульфата натрия с кислотой»: химический стол. Слева — мерный цилиндр
// с 10 мл кислоты; в центре — коническая колба с термометром на листе бумаги с чёрным крестом;
// справа — водяная баня на плитке, ручкой которой задают температуру (холоднее комнатной — со льдом).
// На сцене только секундомер: концентрация и скорость показаны в панели показаний под сценой. Круглое окно «вид сверху»
// показывает крест так, как его видит ученик, глядя в колбу сверху.
// Ученик сам начинает опыт: тащит цилиндр к колбе или нажимает на него (acid = 1) — кислота
// выливается, секундомер идёт, раствор мутнеет от серы, и когда крест скрывается, секундомер встаёт.
// Если при влитой кислоте сменить объём тиосульфата или температуру, опыт повторяется в новой колбе:
// так каждое значение измерено заново. Время на сцене ускорено (опыт на 2 минуты идёт ~2 с),
// но секундомер показывает «настоящие» секунды модели.

import { tr } from '../../i18n.js';
import { bubblePool, beaker, createScene, draggable, floorShadow, hotplate, mixHex, readout, room, s, text } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 450;
const FLASK = { x: 440, y: BENCH };
const NECK_TOP = -165; // верх горлышка колбы (от дна)
const CYL = { x: 285, y: BENCH };
const HOT = { x: 770, y: BENCH - 46, w: 210 };
const KNOB = { x: HOT.x + HOT.w / 2 - 30, y: HOT.y + 26 };
const INSET = { x: 612, y: 182, r: 58 };
const THERMO_X = FLASK.x + 5;
const T_ZERO_Y = 272; // 0 °C на шкале термометра; 2 px на градус

const POUR = 1; // с — перенос цилиндра, наклон и возврат
const SNAP_X = 120; // насколько близко к колбе нужно отпустить цилиндр
const ML_PX = 11; // мерный цилиндр на 10 мл: 11 px на миллилитр

// Внутренний контур цилиндра (локальные координаты: начало — середина дна снаружи)
const CYL_POLY = [[-10, -10], [10, -10], [10, -134], [-10, -134]];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const rot = (x, y, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};

// Генератор с фиксированным зерном: частицы серы лежат одинаково при каждом открытии сцены
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

export function kineticsScene(container, params, set, { crossTime, conc, TOTAL }) {
  let cyl, cylSurf, cylLine, cylCounter, cylShadow, streamEl, cylGlow, resetBtn;
  let knob, liquid, milk, particles, column, crossCover, status, bath, plate, knobPointer, iceCubes, bubbles;
  let stopwatch;
  const drag = { cyl: null, knob: null };
  const cylPose = { x: CYL.x, y: CYL.y, a: 0 };
  let cylFrom = { ...CYL, a: 0 };
  // Текущий опыт: key — при каких условиях он идёт; time — реальное время с начала, tau — секунды модели
  let run = null;
  let bubbleAcc = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });

      cylGlow = s('ellipse', { cx: CYL.x, cy: BENCH - 70, rx: 38, ry: 92, fill: d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
      svg.append(cylGlow);

      stopwatch = readout(d, { x: 365, y: 20, w: 150, caption: tr('Секундомер, с'), color: '#fcd34d' });
      svg.append(stopwatch.g);

      buildBath(svg, d);
      buildPaper(svg, d);
      buildFlask(svg, d);
      buildInset(svg, d);
      buildCylinder(svg, d);

      // Струя кислоты при переливании
      streamEl = s('path', { fill: 'none', stroke: '#bfdbfe', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
      svg.append(streamEl);

      // Новая колба — вверху справа: низ сцены на телефоне закрывает панель регуляторов
      resetBtn = s('g', { opacity: 0 }, [
        s('rect', { x: 770, y: 32, width: 160, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M803.4 45.6 A9 9 0 1 0 804.8 56.5 M803.4 38.6 V45.6 H796.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(862, 52, tr('Новая колба'), { size: 15, weight: 600, fill: '#1e293b' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (!params.acid) return;
        e.stopPropagation();
        cylFrom = { ...CYL, a: 0 };
        set('acid', 0);
      });
      svg.append(resetBtn);
    },

    frame(dt, now) {
      const t = crossTime(params);
      const key = `${params.V}|${params.T}`;
      if (!params.acid) run = null;
      else if (!run || run.key !== key) {
        run = { key, time: 0, tau: 0, from: cylFrom };
        cylFrom = { ...CYL, a: 0 }; // повторный опыт: цилиндр с новой порцией кислоты берут с его места
      }
      // Секундомер пускают, как только кислота потекла в колбу. Реальная длительность опыта растёт с t,
      // чтобы долгий опыт и выглядел долгим, но даже самый долгий (120 с) кончается раньше, чем урок
      // покажет наблюдение (через 1,8 с после действия)
      if (run) {
        run.time += dt;
        if (run.time > POUR * 0.25) run.tau = Math.min(t * 1.6, run.tau + dt * (t / (0.3 + t / 120)));
      }

      drawCylinder();
      drawFlask(t);
      drawBath(dt);

      stopwatch.set(run ? fmt(Math.min(run.tau, t), 0) : '0');

      const pulse = 0.55 + 0.3 * Math.sin(now * 4);
      cylGlow.setAttribute('opacity', !params.acid && !drag.cyl ? pulse : 0);
      resetBtn.setAttribute('opacity', params.acid ? 1 : 0);
      resetBtn.style.pointerEvents = params.acid ? '' : 'none';
    },
  });

  // Лист бумаги с крестом: со стороны он виден узкой полоской на столе
  function buildPaper(svg) {
    const x = FLASK.x;
    svg.append(
      s('path', { d: `M${x - 92} ${BENCH - 3} H${x + 92} L${x + 104} ${BENCH + 9} H${x - 104} Z`, fill: '#ffffff', stroke: '#e2e8f0', 'stroke-width': 1 }),
      s('path', { d: `M${x - 52} ${BENCH - 1} L${x + 56} ${BENCH + 7} M${x + 52} ${BENCH - 1} L${x - 56} ${BENCH + 7}`, stroke: '#0f172a', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
    );
  }

  function buildFlask(svg, d) {
    const x = FLASK.x;
    const outline = `M-13 ${NECK_TOP} V-112 L-58 -16 Q-63 -2 -50 0 H50 Q63 -2 58 -16 L13 -112 V${NECK_TOP}`;
    const cid = `kn${Math.random().toString(36).slice(2)}`;
    liquid = s('rect', { x: -70, y: 0, width: 140, height: 0, fill: '#e0f2fe', 'fill-opacity': 0.6 });
    milk = s('rect', { x: -70, y: 0, width: 140, height: 0, fill: '#f5eec8', opacity: 0 });
    particles = s('g', { opacity: 0 });
    const r = rng(5);
    for (let i = 0; i < 70; i++) {
      const px = (r() - 0.5) * 110;
      const py = -4 - r() * 52;
      particles.append(s('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: (0.8 + r() * 1.2).toFixed(1), fill: i % 2 ? '#eab308' : '#facc15' }));
    }
    // Термометр в колбе: шкала 0–60 °C над горлышком, резервуар — в растворе
    column = s('rect', { x: THERMO_X - 1.3, y: 0, width: 2.6, height: 0, fill: '#dc2626' });
    const scale = s('g');
    for (let tc = 0; tc <= 60; tc += 5) {
      const yy = T_ZERO_Y - tc * 2;
      scale.append(s('line', { x1: THERMO_X + 4, x2: THERMO_X + (tc % 10 ? 8 : 11), y1: yy, y2: yy, stroke: '#475569', 'stroke-width': 1.2 }));
      if (tc % 20 === 0) scale.append(text(THERMO_X + 15, yy, String(tc), { size: 13, weight: 600, fill: '#334155', anchor: 'start' }));
    }
    const flask = s('g', { transform: `translate(${x} ${BENCH})` }, [
      floorShadow(0, 3, 70, d),
      s('clipPath', { id: cid }, [s('path', { d: `${outline} Z` })]),
      s('path', { d: `${outline} Z`, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      s('g', { 'clip-path': `url(#${cid})` }, [liquid, milk, particles]),
    ]);
    svg.append(flask);
    // Термометр — внутри колбы, но перед раствором
    svg.append(
      s('rect', { x: THERMO_X - 3.5, y: 138, width: 7, height: BENCH - 30 - 138, rx: 3.5, fill: '#f8fafc', 'fill-opacity': 0.85, stroke: '#94a3b8', 'stroke-width': 1.2 }),
      s('circle', { cx: THERMO_X, cy: BENCH - 24, r: 5.5, fill: '#dc2626', stroke: '#991b1b', 'stroke-width': 1 }),
      column,
      scale,
      text(THERMO_X + 15, T_ZERO_Y - 136, '°C', { size: 13, weight: 600, fill: '#334155', anchor: 'start' }),
    );
    // Стекло поверх: блики, кромка горлышка
    svg.append(s('g', { transform: `translate(${x} ${BENCH})`, 'pointer-events': 'none' }, [
      s('path', { d: outline, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      s('rect', { x: -17, y: NECK_TOP - 5, width: 34, height: 6, rx: 3, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('path', { d: 'M-42 -18 L-9 -96', stroke: '#ffffff', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-opacity': 0.6 }),
      s('path', { d: 'M-8 -150 V-118', stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-opacity': 0.6 }),
    ]));
  }

  // Окно «вид сверху»: крест на бумаге сквозь дно колбы
  function buildInset(svg, d) {
    const { x, y, r } = INSET;
    const cid = `ki${Math.random().toString(36).slice(2)}`;
    crossCover = s('circle', { cx: x, cy: y, r, fill: '#f3ecc6', opacity: 0 });
    status = text(x, y + r + 20, '', { size: 14, weight: 700, fill: '#15803d' });
    svg.append(
      text(x, y - r - 16, tr('вид сверху'), { size: 14, weight: 600, fill: '#475569' }),
      s('circle', { cx: x, cy: y, r: r + 6, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 2, filter: d.url('soft') }),
      s('clipPath', { id: cid }, [s('circle', { cx: x, cy: y, r })]),
      s('g', { 'clip-path': `url(#${cid})` }, [
        s('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, fill: '#fafaf9' }),
        s('path', { d: `M${x - r * 0.6} ${y - r * 0.6} L${x + r * 0.6} ${y + r * 0.6} M${x + r * 0.6} ${y - r * 0.6} L${x - r * 0.6} ${y + r * 0.6}`, stroke: '#0f172a', 'stroke-width': 9, 'stroke-linecap': 'round' }),
        // Горлышко и дно колбы сверху: два кольца стекла
        s('circle', { cx: x, cy: y, r: r - 4, fill: '#e0f2fe', 'fill-opacity': 0.25, stroke: '#94a3b8', 'stroke-width': 2 }),
        crossCover,
        s('circle', { cx: x, cy: y, r: 13, fill: 'none', stroke: '#94a3b8', 'stroke-width': 2.5 }),
        s('circle', { cx: x + 3, cy: y, r: 3.5, fill: '#dc2626', 'fill-opacity': 0.8 }),
      ]),
      status,
    );
  }

  function buildCylinder(svg, d) {
    const cid = `kc${Math.random().toString(36).slice(2)}`;
    cylSurf = s('rect', { x: -500, y: 0, width: 1000, height: 1000, fill: '#bfdbfe', 'fill-opacity': 0.75 });
    cylLine = s('rect', { x: -500, y: 0, width: 1000, height: 2.5, fill: '#ffffff', 'fill-opacity': 0.75 });
    cylCounter = s('g', {}, [cylSurf, cylLine]);
    cylShadow = floorShadow(0, 3, 30, d);
    const front = s('g');
    for (let v = 1; v <= 10; v++) {
      const yy = -(10 + v * ML_PX);
      front.append(s('line', { x1: -11, x2: v % 5 ? -5 : -1, y1: yy, y2: yy, stroke: '#475569', 'stroke-width': 1.3 }));
      if (v % 5 === 0) front.append(text(-16, yy, String(v), { size: 13, weight: 600, fill: '#334155', anchor: 'end' }));
    }
    front.append(
      text(-16, -143, 'мл', { size: 13, weight: 600, fill: '#334155', anchor: 'end' }),
      s('rect', { x: -7, y: -126, width: 3.5, height: 100, rx: 1.7, fill: '#ffffff', 'fill-opacity': 0.6 }),
      text(0, -162, 'H₂SO₄', { size: 13, weight: 700, fill: '#334155' }),
    );
    cyl = s('g', {}, [
      // Зона захвата пошире самого цилиндра — на телефоне он узкий
      s('rect', { x: -26, y: -150, width: 52, height: 152, fill: '#ffffff', 'fill-opacity': 0 }),
      cylShadow,
      s('path', { d: 'M-20 0 L-15 -10 H15 L20 0 Z', fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('clipPath', { id: cid }, [s('path', { d: 'M-11 -136 V-10 H11 V-136 Z' })]),
      s('path', { d: 'M-11 -136 V-10 H11 V-136 Z', fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      s('g', { 'clip-path': `url(#${cid})`, 'pointer-events': 'none' }, [cylCounter]),
      s('path', { d: 'M-12 -136 V-11 Q-12 -10 -11 -10 H11 Q12 -10 12 -11 V-136', fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.2 }),
      s('path', { d: 'M12 -136 Q 16 -140 18 -138', stroke: '#94a3b8', 'stroke-width': 2.2, fill: 'none' }),
      front,
    ]);
    svg.append(cyl);
  }

  // Водяная баня на плитке: по льду и пузырькам видно, холоднее или горячее комнаты растворы
  function buildBath(svg, d) {
    const bx = HOT.x;
    const bottom = HOT.y - 8;
    bath = beaker(d, { x: bx, bottom, w: 150, h: 130 });
    bath.setLevel(0.62);
    bath.setColor('#bfdbfe');
    iceCubes = [[-40, 0], [-6, 4], [24, -2], [46, 3]].map(([dx, dy], i) => {
      const c = s('rect', { x: bx + dx - 9, y: 0, width: 18, height: 16, rx: 4, fill: '#f0f9ff', 'fill-opacity': 0.9, stroke: '#7dd3fc', 'stroke-width': 1.5, transform: `rotate(${i * 17 - 20} ${bx + dx} ${bottom - 80 + dy})`, opacity: 0 });
      c.dataset.dy = String(dy);
      bath.content.append(c);
      return c;
    });
    bubbles = bubblePool(bath.content, 14, { color: '#ffffff' });
    plate = hotplate(d, { x: bx, y: HOT.y, w: HOT.w });
    // Своя ручка поверх ручки плитки: её указатель поворачивается вместе с температурой
    knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 9, rx: 1.5, fill: '#fff7ed' });
    knob = s('g', {}, [
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 15, fill: '#ffffff', 'fill-opacity': 0 }),
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 12, fill: d.rad(['#fdba74', '#ea580c']), stroke: '#9a3412', 'stroke-width': 1 }),
      knobPointer,
    ]);
    svg.append(plate.g, bath.g, knob);
  }

  function drawCylinder() {
    let pose;
    let share = 1;
    let streaming = false;
    if (drag.cyl) pose = { ...drag.cyl, a: 0 };
    else if (run && run.time < POUR) {
      pose = pourPose(run.from, clamp01(run.time / POUR));
      share = 1 - pose.k;
      streaming = pose.k > 0.03 && pose.k < 0.97;
    } else {
      pose = { ...CYL, a: 0 };
      share = params.acid ? 0 : 1;
    }
    Object.assign(cylPose, pose);
    cyl.setAttribute('transform', `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) rotate(${pose.a.toFixed(2)})`);
    cylCounter.setAttribute('transform', `rotate(${(-pose.a).toFixed(2)})`);
    cylShadow.setAttribute('opacity', pose.y >= BENCH - 2 && Math.abs(pose.a) < 1 ? 1 : 0);
    setCylFill(share, pose.a);
    if (streaming) {
      const lip = lipWorld(pose);
      const to = { x: FLASK.x - 6, y: BENCH - 58 };
      streamEl.setAttribute('d', `M${lip.x.toFixed(1)} ${lip.y.toFixed(1)} Q ${(lip.x + 4).toFixed(1)} ${((lip.y + to.y) / 2).toFixed(1)} ${to.x} ${to.y}`);
      streamEl.setAttribute('opacity', 0.85);
    } else streamEl.setAttribute('opacity', 0);
  }

  // Жидкость в наклонённом цилиндре остаётся горизонтальной: уровень ищется по площади сечения
  function setCylFill(share, a) {
    const area = areaBelow(CYL_POLY, -(10 + 10 * ML_PX)) * share;
    if (area < 4) {
      cylCounter.setAttribute('opacity', 0);
      return;
    }
    const pts = CYL_POLY.map(([x, y]) => rot(x, y, a)).map((p) => [p.x, p.y]);
    let lo = Math.min(...pts.map((p) => p[1]));
    let hi = Math.max(...pts.map((p) => p[1]));
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (areaBelow(pts, mid) > area) lo = mid;
      else hi = mid;
    }
    const lipY = rot(12, -137, a).y;
    const y = Math.max(hi, lipY);
    cylCounter.setAttribute('opacity', 1);
    cylSurf.setAttribute('y', y.toFixed(1));
    cylLine.setAttribute('y', (y - 1).toFixed(1));
  }

  function lipWorld(pose) {
    const r = rot(12, -137, pose.a);
    return { x: pose.x + r.x, y: pose.y + r.y };
  }

  // Цилиндр переносят к колбе, наклоняют носиком к горлышку и ставят обратно на место.
  // k — доля вылитой кислоты
  function pourPose(from, t) {
    const target = { x: FLASK.x - 8, y: BENCH + NECK_TOP - 8 };
    const at = (a) => {
      const r = rot(12, -137, a);
      return { x: target.x - r.x, y: target.y - r.y, a };
    };
    if (t < 0.25) {
      const e = ease(t / 0.25);
      const p = at(95);
      return { x: lerp(from.x, p.x, e), y: lerp(from.y, p.y, e) - Math.sin(e * Math.PI) * 30, a: lerp(from.a, 95, e), k: 0 };
    }
    if (t < 0.75) {
      const k = (t - 0.25) / 0.5;
      return { ...at(lerp(95, 130, ease(k))), k };
    }
    const e = ease((t - 0.75) / 0.25);
    const p = at(130);
    return { x: lerp(p.x, CYL.x, e), y: lerp(p.y, CYL.y, e) - Math.sin(e * Math.PI) * 30, a: lerp(130, 0, e), k: 1 };
  }

  function drawFlask(t) {
    // Уровень раствора: 50 мл тиосульфата с водой и доля влитой кислоты (≈ 1 px на миллилитр в нижней части колбы)
    const poured = run ? clamp01((run.time / POUR - 0.25) / 0.5) : 0;
    const h = 4 + 0.95 * (TOTAL + 10 * poured);
    for (const el of [liquid, milk]) {
      el.setAttribute('y', (-h).toFixed(1));
      el.setAttribute('height', (h + 2).toFixed(1));
    }
    // Муть: серы выделяется тем больше, чем дальше идёт реакция; к моменту t крест скрыт полностью.
    // В более концентрированном растворе в итоге выпадает больше серы — муть гуще
    const k = run ? run.tau / t : 0;
    const dense = 0.75 + 0.25 * (conc(params) / 0.15);
    const side = clamp01(k) ** 1.4 * 0.85 * dense + Math.max(0, Math.min(0.12, (k - 1) * 0.2));
    milk.setAttribute('opacity', side.toFixed(3));
    particles.setAttribute('opacity', (clamp01(k * 1.3) * 0.7).toFixed(3));
    liquid.setAttribute('fill', mixHex('#e0f2fe', '#fde68a', clamp01(k) * 0.6));
    crossCover.setAttribute('opacity', (clamp01(k) ** 1.6).toFixed(3));
    const gone = run && run.tau >= t;
    status.textContent = tr(gone ? 'крест исчез' : 'крест виден');
    status.setAttribute('fill', gone ? '#b91c1c' : '#15803d');

    const yT = T_ZERO_Y - params.T * 2;
    column.setAttribute('y', yT.toFixed(1));
    column.setAttribute('height', (BENCH - 26 - yT).toFixed(1));
  }

  function drawBath(dt) {
    const T = params.T;
    plate.setTemp(T);
    plate.setHeat(T > 20 ? (T - 20) / 30 : 0);
    knobPointer.setAttribute('transform', `rotate(${-135 + ((T - 10) / 40) * 270} ${KNOB.x} ${KNOB.y})`);
    // Холоднее комнатной температуры баню охлаждают льдом
    const ice = T <= 10 ? 4 : T <= 15 ? 2 : 0;
    const surf = bath.surfaceY;
    iceCubes.forEach((c, i) => {
      c.setAttribute('y', (surf - 6 + Number(c.dataset.dy)).toFixed(1));
      c.setAttribute('opacity', i < ice ? 1 : 0);
    });
    // Горячая баня: со дна поднимаются пузырьки, их тем больше, чем выше температура
    if (T >= 40) {
      bubbleAcc += dt * (T - 35) * 0.5;
      while (bubbleAcc > 1) {
        bubbleAcc -= 1;
        bubbles.spawn(HOT.x - 60 + Math.random() * 120, HOT.y - 14, 2 + Math.random() * 2);
      }
    }
    bubbles.update(dt, surf + 4, 0.4);
  }

  // Перетаскивание подключаем после createScene: draggable нужна готовая сцена
  draggable(scene, cyl, {
    onDrag(x, y) {
      if (params.acid) return;
      drag.cyl = { x: Math.max(30, Math.min(930, x)), y: Math.max(200, Math.min(BENCH, y + 70)) };
    },
    onEnd() {
      const at = drag.cyl;
      drag.cyl = null;
      if (params.acid) return;
      // Щелчок без перетаскивания тоже вливает кислоту — на телефоне так проще
      if (!at || (Math.abs(at.x - FLASK.x) < SNAP_X && at.y < BENCH + 5)) {
        cylFrom = at ? { ...at, a: 0 } : { ...CYL, a: 0 };
        set('acid', 1);
      }
    },
  });

  // Ручку крутят движением влево-вправо: 4 px — один градус
  draggable(scene, knob, {
    onDrag(x) {
      if (!drag.knob) drag.knob = { x, T: params.T };
      set('T', drag.knob.T + (x - drag.knob.x) / 4);
    },
    onEnd() {
      drag.knob = null;
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
