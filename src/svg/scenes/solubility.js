// Сцена «Кривые растворимости»: на столе две банки с солями и шпатель, рядом водяная баня на плитке,
// в ней стакан со 100 г воды и термометр. Больше на столе ничего нет — всё внимание на стакане:
//   шпатель тащат из банки в стакан (или щёлкают по нему) → насыпается порция 10 г соли (m += 10);
//   щелчок по другой банке → опыт повторяется с другой солью (salt);
//   ручку плитки двигают влево-вправо → баня охлаждается или нагревается (T).
// Температура бани и масса нерастворённой соли меняются плавно, поэтому видно, как при нагревании
// осадок растворяется, а при охлаждении насыщенного раствора KNO₃ выпадают кристаллы.
// Числа показывает только панель показаний под сценой; на сцене — термометр и экран плитки.

import { bubblePool, createScene, draggable, floorShadow, hotplate, room, s, text, touchTarget } from '../kit.js';

const BENCH = 450;
// Установка рисуется в своих координатах и увеличивается в 1,45 раза: после того как со стола убрали
// лишнюю посуду, в натуральную величину стакан терялся бы на пустой сцене
const K = 1.45;
const OX = -13;
const OY = BENCH - BENCH * K; // линия стола остаётся на месте

const JARS = [{ x: 150 }, { x: 236 }]; // банки KNO₃ и NaCl (порядок как у регулятора salt)
const JAR = { w: 68, h: 92 };
const PLATE = { x: 446, y: BENCH - 44, w: 236 };
const BATH = { x1: 340, x2: 560, top: 304, bottom: PLATE.y - 2, water: 334 };
const BEAKER = { x: 474, y: BATH.bottom - 3 }; // стакан стоит на дне бани
const THERMO = { x: 372, top: 168, bulb: 388, t0: 366, k: 1.8 }; // 1,8 px на градус от 0 °C
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 };
const PORTION = 10; // г соли на шпателе
const SCOOP_TIME = 1.5; // с — полёт шпателя к стакану и обратно
const SNAP = 100; // насколько близко к стакану нужно отпустить шпатель
const ML = 0.72; // px на миллилитр в стакане (деления 50…200 мл)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp01((t - a) / (b - a));

// Генератор с фиксированным зерном: кристаллы лежат одинаково при каждом открытии сцены
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function solubilityScene(container, params, set, { solubility, SALTS }) {
  let stage, knob, knobPointer, knobGlow, column, iceGroup, boil, plate, solution, surface, mound, spatula, spatulaLoad, spatulaGlow, topLayer;
  const jarFronts = []; // порошок и передняя стенка банок — поверх шпателя, чтобы лопатка была «в соли»
  const crystals = []; // кристаллы в стакане: лежат горкой на дне, при выпадении опускаются сквозь раствор
  const grains = []; // крупинки, падающие со шпателя
  const steam = [];
  // Шпатель: rest — в банке, drag — в руке, scoop — летит к стакану и высыпает порцию
  let spat = 'rest';
  let spatT = 0;
  let spatFrom = null;
  let dragAt = null;
  let shownT = params.T; // температура бани догоняет заданную — нагрев и охлаждение идут не мгновенно
  let shownEx = Math.max(0, params.m - solubility(params.salt, params.T));
  let shownSalt = params.salt;
  let swap = 1; // 0..1 — смена соли: старое содержимое гаснет, новое проявляется
  let last = { ...params };
  let boilAcc = 0;
  let touched = false; // ручку уже двигали — подсветку снимаем

  // Указатель переводим в координаты увеличенной установки
  const pointer = {
    point(e) {
      const p = scene.point(e);
      return { x: (p.x - OX) / K, y: (p.y - OY) / K };
    },
  };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });
      stage = s('g', { transform: `translate(${OX} ${OY.toFixed(1)}) scale(${K})` });
      svg.append(stage);

      spatulaGlow = glow(d, JARS[0].x, BENCH - 100, 50, 70);
      knobGlow = glow(d, KNOB.x, KNOB.y, 30, 30);
      stage.append(spatulaGlow, knobGlow);

      buildBath(stage, d);
      buildJars(stage, d);

      // Верхний слой: шпатель в руке и сыплющиеся с него крупинки — поверх всей посуды
      topLayer = s('g');
      stage.append(topLayer);
      for (let i = 0; i < 16; i++) {
        const el = s('rect', { x: -1.8, y: -1.8, width: 3.6, height: 3.6, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.6, opacity: 0, 'pointer-events': 'none' });
        topLayer.append(el);
        grains.push({ el, x: 0, y: 0, vx: 0, vy: 0, live: false });
      }
      buildSpatula(d);
    },

    frame(dt, now) {
      watchParams();
      shownT += Math.sign(params.T - shownT) * Math.min(Math.abs(params.T - shownT), 25 * dt);
      const S = solubility(params.salt, shownT);
      // Нерастворённая соль догоняет равновесие: растворение медленнее, кристаллизация быстрее
      const target = Math.max(0, params.m - S);
      const rate = target > shownEx ? 30 : 16;
      shownEx += Math.sign(target - shownEx) * Math.min(Math.abs(target - shownEx), rate * dt);
      if (swap < 1) swap = Math.min(1, swap + dt * 2.5);
      if (swap >= 0.5) shownSalt = params.salt;

      drawBath(dt, now);
      drawBeaker(dt, now);
      drawSpatula(dt);

      // Подсказки на сцене: сначала — шпатель, потом — ручка плитки
      const pulse = 0.55 + 0.3 * Math.sin(now * 4);
      spatulaGlow.setAttribute('cx', JARS[params.salt].x);
      spatulaGlow.setAttribute('opacity', params.m === 0 && spat === 'rest' ? pulse : 0);
      knobGlow.setAttribute('opacity', params.m > 0 && !touched && spat === 'rest' ? pulse : 0);
    },
  });

  function glow(d, cx, cy, rx, ry) {
    return s('ellipse', { cx, cy, rx, ry, fill: d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
  }

  function watchParams() {
    if (params.salt !== last.salt) {
      swap = 0;
      shownEx = Math.max(0, params.m - solubility(params.salt, shownT));
    } else if (params.m > last.m) {
      // Новая порция соли сначала ложится на дно и только потом растворяется
      shownEx = Math.min(params.m, shownEx + (params.m - last.m));
    }
    if (params.T !== last.T) touched = true;
    last = { ...params };
  }

  // ---------- Банки с солями и шпатель ----------

  function buildJars(parent, d) {
    const { w, h } = JAR;
    const r = rng(5);
    JARS.forEach((jar, i) => {
      const x = jar.x;
      const top = BENCH - h;
      const body = `M${x - w / 2} ${top + 10} Q${x - w / 2} ${top + 4} ${x - w / 2 + 8} ${top + 2} H${x + w / 2 - 8} Q${x + w / 2} ${top + 4} ${x + w / 2} ${top + 10} V${BENCH - 8} Q${x + w / 2} ${BENCH} ${x + w / 2 - 8} ${BENCH} H${x - w / 2 + 8} Q${x - w / 2} ${BENCH} ${x - w / 2} ${BENCH - 8} Z`;
      // Порошок соли в банке: у KNO₃ — игольчатые кристаллы, у NaCl — кубики
      const powder = s('g', {}, [s('path', { d: `M${x - w / 2 + 3} ${BENCH - 4} V${BENCH - 46} Q${x} ${BENCH - 58} ${x + w / 2 - 3} ${BENCH - 46} V${BENCH - 4} Z`, fill: d.lin([[0, '#ffffff'], [1, '#e2e8f0']], 'v') })]);
      for (let k = 0; k < 26; k++) {
        const gx = x + (r() - 0.5) * (w - 12);
        const gy = BENCH - 8 - r() * 40;
        powder.append(i === 0
          ? s('rect', { x: gx - 3.5, y: gy - 0.8, width: 7, height: 1.6, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 0.5, transform: `rotate(${Math.round(r() * 180)} ${gx.toFixed(1)} ${gy.toFixed(1)})` })
          : s('rect', { x: gx - 1.8, y: gy - 1.8, width: 3.6, height: 3.6, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 0.5 }));
      }
      const g = s('g', {}, [
        floorShadow(x, BENCH + 3, w * 0.62, d),
        s('path', { d: body, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      ]);
      // Порошок, передняя стенка и этикетка рисуются в верхнем слое поверх шпателя и не ловят указатель:
      // шпатель берут сквозь стенку, а щелчок мимо шпателя попадает в задний контур банки.
      // Шпатель нельзя переносить между слоями во время перетаскивания — браузер теряет захват указателя
      jarFronts.push(s('g', { 'pointer-events': 'none' }, [
        powder,
        s('path', { d: body, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: x - w / 2 - 2, y: top - 4, width: w + 4, height: 10, rx: 4, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: x - 26, y: BENCH - 40, width: 52, height: 24, rx: 4, fill: '#ffffff', stroke: i === 0 ? '#fdba74' : '#93c5fd', 'stroke-width': 1.5 }),
        text(x, BENCH - 27.5, SALTS[i], { size: 15, weight: 800, fill: i === 0 ? '#c2410c' : '#1d4ed8' }),
      ]));
      g.style.cursor = 'pointer';
      // Щелчок по другой банке — опыт повторяется с другой солью (шпатель переходит в неё)
      g.addEventListener('pointerdown', (e) => {
        if (spatula.contains(e.target) || params.salt === i || spat !== 'rest') return;
        e.stopPropagation();
        set('salt', i);
      });
      touchTarget(g, 12);
      parent.append(g);
    });
  }

  // Шпатель: начало координат — середина лопатки, ручка уходит вверх
  function buildSpatula(d) {
    spatulaLoad = s('path', { d: 'M-11 -2 Q0 -9 11 -2 Z', fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 0.8, opacity: 0 });
    spatula = s('g', {}, [
      s('rect', { x: -16, y: -126, width: 34, height: 136, fill: '#000', 'fill-opacity': 0 }), // зона захвата
      s('rect', { x: -2.5, y: -118, width: 5, height: 108, rx: 2.5, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
      s('rect', { x: -4, y: -124, width: 8, height: 34, rx: 4, fill: d.lin(['#1e3a8a', '#3b82f6', '#1e3a8a']) }),
      s('path', { d: 'M-12 -2 Q-12 -12 -3 -12 H3 Q12 -12 12 -2 Q12 6 0 7 Q-12 6 -12 -2 Z', fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']), stroke: '#64748b', 'stroke-width': 1 }),
      spatulaLoad,
    ]);
    topLayer.append(spatula, ...jarFronts);

    draggable(pointer, spatula, {
      onDrag(x, y) {
        if (spat !== 'rest' && spat !== 'drag') return;
        spat = 'drag';
        dragAt = { x: Math.max(20, Math.min(700, x)), y: Math.max(140, Math.min(BENCH - 20, y + 40)) };
      },
      onEnd() {
        const at = dragAt;
        dragAt = null;
        if (spat !== 'rest' && spat !== 'drag') return;
        // Щелчок без перетаскивания тоже насыпает порцию — на телефоне так проще
        if (params.m + PORTION <= 200 && (!at || (Math.abs(at.x - BEAKER.x) < SNAP && at.y < BENCH))) {
          spatFrom = at ?? restPose();
          spat = 'scoop';
          spatT = 0;
        } else {
          spat = 'rest';
        }
      },
    });
  }

  const restPose = () => ({ x: JARS[params.salt].x - 6, y: BENCH - 30, a: 12 });
  const DUMP = { x: BEAKER.x - 18, y: BEAKER.y - 182 }; // над стаканом, чуть левее середины

  function drawSpatula(dt) {
    let p;
    if (spat === 'drag' && dragAt) {
      p = { ...dragAt, a: 12 };
      spatulaLoad.setAttribute('opacity', 1);
    } else if (spat === 'scoop') {
      spatT = Math.min(1, spatT + dt / SCOOP_TIME);
      const t = spatT;
      if (t < 0.3) {
        const e = ease(t / 0.3);
        p = { x: lerp(spatFrom.x, DUMP.x, e), y: lerp(spatFrom.y, DUMP.y, e) - Math.sin(e * Math.PI) * 40, a: 12 };
      } else if (t < 0.6) {
        p = { ...DUMP, a: 12 + 60 * ease(seg(t, 0.3, 0.42)) };
      } else {
        const e = ease(seg(t, 0.6, 1));
        const r = restPose();
        p = { x: lerp(DUMP.x, r.x, e), y: lerp(DUMP.y, r.y, e) - Math.sin(e * Math.PI) * 40, a: lerp(72, r.a, e) };
      }
      // Соль ссыпается, когда лопатка наклонилась
      if (t >= 0.36 && spatulaLoad.getAttribute('opacity') !== '0') {
        spatulaLoad.setAttribute('opacity', 0);
        for (const gr of grains) Object.assign(gr, { x: DUMP.x + (Math.random() - 0.5) * 14, y: DUMP.y + Math.random() * 6, vx: (Math.random() - 0.3) * 30, vy: 20 + Math.random() * 60, live: true });
        set('m', params.m + PORTION);
      }
      if (t < 0.36) spatulaLoad.setAttribute('opacity', 1);
      if (t >= 1) spat = 'rest';
    }
    if (spat === 'rest') {
      p = restPose();
      spatulaLoad.setAttribute('opacity', 0);
    }
    spatula.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.a.toFixed(1)})`);

    // Крупинки падают в стакан и исчезают на поверхности раствора
    const floor = BEAKER.y - waterLevel();
    for (const gr of grains) {
      if (!gr.live) continue;
      gr.vy += 900 * dt;
      gr.x += gr.vx * dt;
      gr.y += gr.vy * dt;
      if (gr.y > floor) gr.live = false;
      gr.el.setAttribute('x', (gr.x - 1.8).toFixed(1));
      gr.el.setAttribute('y', (gr.y - 1.8).toFixed(1));
      gr.el.setAttribute('opacity', gr.live ? 1 : 0);
    }
  }

  // ---------- Водяная баня, плитка, термометр, стакан ----------

  function buildBath(parent, d) {
    plate = hotplate(d, PLATE);
    knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
    knob = s('g', {}, [
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 18, fill: '#000', 'fill-opacity': 0 }),
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
      knobPointer,
    ]);
    parent.append(plate.g, knob);
    // Ручку плитки ведут мышью влево-вправо. Сдвиг считается от точки, где ручку взяли
    // (2 px на градус), иначе при первом же движении температура прыгала бы к 50 °C
    let knobFrom = null;
    draggable(pointer, knob, {
      onDrag(x) {
        knobFrom ??= { x, T: params.T };
        set('T', Math.round(Math.max(0, Math.min(100, knobFrom.T + (x - knobFrom.x) / 2))));
      },
      onEnd() {
        knobFrom = null;
      },
    });

    const { x1, x2, top, bottom, water } = BATH;
    const bw = x2 - x1;
    const bh = bottom - top;
    const clip = `bath${Math.random().toString(36).slice(2)}`;
    const bathWater = () => s('rect', { x: x1, y: water, width: bw, height: bottom - water, fill: '#cfe7f3', 'fill-opacity': 0.55, 'clip-path': `url(#${clip})`, 'pointer-events': 'none' });
    const content = s('g', { 'clip-path': `url(#${clip})`, 'pointer-events': 'none' });
    parent.append(
      s('clipPath', { id: clip }, [s('rect', { x: x1, y: top, width: bw, height: bh, rx: 8 })]),
      s('rect', { x: x1, y: top, width: bw, height: bh, rx: 8, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      bathWater(),
      content,
    );
    boil = bubblePool(content, 24, { color: '#f8fafc' });

    // Термометр в бане: красный спиртовой столбик, шкала 0…100 °C
    column = s('rect', { x: THERMO.x - 1.8, width: 3.6, rx: 1.8, fill: '#dc2626' });
    const scale = [];
    for (let t = 0; t <= 100; t += 10) {
      const y = THERMO.t0 - t * THERMO.k;
      scale.push(s('line', { x1: THERMO.x + 2.5, x2: THERMO.x + (t % 50 ? 6 : 8), y1: y, y2: y, stroke: '#475569', 'stroke-width': 1 }));
      if (t % 50 === 0) scale.push(text(THERMO.x + 11, y, String(t), { size: 13, weight: 600, fill: '#475569', anchor: 'start' }));
    }
    parent.append(
      s('rect', { x: THERMO.x - 7, y: THERMO.top, width: 14, height: THERMO.bulb - THERMO.top, rx: 7, fill: d.lin([[0, '#ffffff', 0.6], [0.5, '#f8fafc', 0.25], [1, '#cbd5e1', 0.55]]), stroke: '#94a3b8', 'stroke-width': 1.2 }),
      ...scale,
      column,
      s('circle', { cx: THERMO.x, cy: THERMO.bulb, r: 7.5, fill: d.rad(['#f87171', '#991b1b']) }),
    );

    buildBeaker(parent, d);

    // Лёд в холодной бане
    iceGroup = s('g', { 'clip-path': `url(#${clip})`, 'pointer-events': 'none' }, [
      [12, -3, 26, 18, -10], [172, -2, 28, 20, 12], [44, 4, 20, 15, 22], [184, 6, 18, 14, -16],
    ].map(([dx, dy, w, h, a]) => s('rect', {
      x: x1 + dx, y: water + dy - h / 2, width: w, height: h, rx: 5,
      fill: d.lin([[0, '#ffffff', 0.92], [1, '#cfe3ee', 0.8]], 'v'), stroke: '#b6cfdd', 'stroke-width': 1,
      transform: `rotate(${a} ${x1 + dx + w / 2} ${water + dy})`,
    })));
    // Передний слой воды бани и стенки — поверх погружённой части стакана и термометра
    const front = bathWater();
    front.setAttribute('fill-opacity', 0.22);
    parent.append(
      iceGroup,
      front,
      s('line', { x1: x1 + 3, x2: x2 - 3, y1: water, y2: water, stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': 2, 'pointer-events': 'none' }),
      s('rect', { x: x1, y: top, width: bw, height: bh, rx: 8, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'pointer-events': 'none' }),
    );
    for (let i = 0; i < 6; i++) {
      const e = s('ellipse', { rx: 15, ry: 8, fill: '#e2e8f0', opacity: 0, 'pointer-events': 'none' });
      parent.append(e);
      steam.push({ e, x: x1 + 20 + i * 34, phase: i / 6 });
    }
  }

  // Стакан: раствор, горка соли на дне и кристаллы — в локальных координатах (начало — середина дна)
  function buildBeaker(parent, d) {
    const inner = 'M-54 -168 V-14 Q-54 0 -40 0 H40 Q54 0 54 -14 V-168 Z';
    const cid = `sb${Math.random().toString(36).slice(2)}`;
    solution = s('rect', { x: -60, width: 120, height: 200, fill: '#b3d6f2', 'fill-opacity': 0.8 });
    surface = s('rect', { x: -60, width: 120, height: 2.5, fill: '#ffffff', 'fill-opacity': 0.75 });
    mound = s('path', { fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.2 });
    const contents = s('g', { 'clip-path': `url(#${cid})`, 'pointer-events': 'none' }, [solution, surface, mound]);
    const r = rng(9);
    for (let i = 0; i < 90; i++) {
      // Чем дальше по списку, тем выше в горке: горка растёт снизу вверх
      const h = 3 + (i / 90) * 26 * r();
      const x = (r() - 0.5) * 2 * Math.min(48, 52 - h * 0.6);
      const y = -3 - Math.min(h, 30 * Math.max(0, 1 - (x / 54) ** 2));
      const needle = s('rect', { x: -5, y: -1.1, width: 10, height: 2.2, rx: 0.6, fill: '#ffffff', stroke: '#64748b', 'stroke-width': 0.6 });
      const cube = s('rect', { x: -2.4, y: -2.4, width: 4.8, height: 4.8, fill: '#ffffff', stroke: '#64748b', 'stroke-width': 0.6 });
      const el = s('g', { opacity: 0 }, [needle, cube]);
      contents.append(el);
      crystals.push({ el, needle, cube, x, y, a: Math.round(r() * 180), fall: 1, y0: 0, on: false, op: 0 });
    }
    const marks = [50, 100, 150, 200].flatMap((v) => {
      const y = -(4 + v * ML);
      return [
        s('line', { x1: 26, x2: 46, y1: y, y2: y, stroke: '#64748b', 'stroke-opacity': 0.7, 'stroke-width': 2 }),
        text(22, y, String(v), { size: 13, weight: 500, fill: '#64748b', anchor: 'end' }),
      ];
    });
    parent.append(s('g', { transform: `translate(${BEAKER.x} ${BEAKER.y})`, 'pointer-events': 'none' }, [
      s('clipPath', { id: cid }, [s('path', { d: inner })]),
      s('path', { d: inner, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      contents,
      s('path', { d: 'M-54 -168 V-14 Q-54 0 -40 0 H40 Q54 0 54 -14 V-168', fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      ...marks,
      s('path', { d: 'M-54 -168 H54', stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('rect', { x: -44, y: -150, width: 7, height: 120, rx: 3.5, fill: '#ffffff', 'fill-opacity': 0.7 }),
    ]));
  }

  function drawBath(dt, now) {
    const t = shownT;
    plate.setTemp(t);
    plate.setHeat(Math.max(0, (t - 25) / 75));
    knobPointer.setAttribute('transform', `rotate(${-135 + (params.T / 100) * 270} ${KNOB.x} ${KNOB.y})`);
    const colTop = THERMO.t0 - t * THERMO.k;
    column.setAttribute('y', colTop.toFixed(1));
    column.setAttribute('height', (THERMO.bulb - colTop).toFixed(1));
    iceGroup.setAttribute('opacity', clamp01((15 - t) / 10).toFixed(2));
    if (t >= 92) {
      boilAcc += dt * (t - 90) * 3;
      while (boilAcc >= 1) {
        boilAcc -= 1;
        boil.spawn(BATH.x1 + 12 + Math.random() * (BATH.x2 - BATH.x1 - 24), BATH.bottom - 6, 2 + Math.random() * 3);
      }
    }
    boil.update(dt, BATH.water + 2, 0.4);
    const steamOn = clamp01((t - 60) / 30);
    for (const p of steam) {
      const k = (now * 0.35 + p.phase) % 1;
      p.e.setAttribute('cx', (p.x + Math.sin(now + p.phase * 9) * 6).toFixed(1));
      p.e.setAttribute('cy', (BATH.top - 16 - k * 70).toFixed(1));
      p.e.setAttribute('opacity', (steamOn * 0.5 * (1 - k)).toFixed(2));
    }
  }

  // Уровень раствора в стакане: 100 мл воды плюс объём растворённой соли (около 0,4 мл на грамм)
  const waterLevel = () => 4 + (100 + Math.max(0, params.m - shownEx) * 0.4) * ML;

  // Горка соли на дне: высота растёт как корень из массы, чтобы и 4 г, и 150 г были видны и помещались
  const moundK = (ex) => Math.sqrt(Math.min(1, ex / 180));

  function drawBeaker(dt, now) {
    const y = -waterLevel();
    solution.setAttribute('y', y.toFixed(1));
    surface.setAttribute('y', (y - 1).toFixed(1));

    // Кристаллы: видимых тем больше, чем больше нерастворённой соли; новые выпадают сквозь раствор
    const k = moundK(shownEx);
    const count = Math.round(crystals.length * k);
    const fade = swap < 0.5 ? 1 - swap * 2 : (swap - 0.5) * 2;
    crystals.forEach((c, i) => {
      const want = i < count;
      if (want && !c.on) {
        c.on = true;
        // Досыпанная соль сразу на дне; при охлаждении — кристаллы растут в растворе и оседают
        const fromSolution = spat !== 'scoop' && swap >= 1;
        c.fall = fromSolution ? 0 : 1;
        c.y0 = fromSolution ? lerp(y + 8, c.y, Math.random() * 0.7) : c.y;
      }
      if (!want) c.on = false;
      c.op += ((c.on ? 1 : 0) - c.op) * Math.min(1, dt * (c.on ? 8 : 3));
      if (c.fall < 1) c.fall = Math.min(1, c.fall + dt * (0.8 + (i % 5) * 0.15));
      const cy = lerp(c.y0, c.y, ease(c.fall));
      const a = c.a + (1 - c.fall) * 90 * Math.sin(now * 2 + i);
      c.el.setAttribute('transform', `translate(${c.x.toFixed(1)} ${cy.toFixed(1)}) rotate(${a.toFixed(0)})`);
      c.el.setAttribute('opacity', (c.op * fade).toFixed(2));
      c.needle.setAttribute('opacity', shownSalt === 0 ? 1 : 0);
      c.cube.setAttribute('opacity', shownSalt === 0 ? 0 : 1);
    });
    const h = 34 * k;
    mound.setAttribute('d', h < 0.5 ? '' : `M-50 -2 Q -30 ${(-2 - h * 0.6).toFixed(1)} 0 ${(-2 - h).toFixed(1)} Q 30 ${(-2 - h * 0.6).toFixed(1)} 50 -2 Z`);
    mound.setAttribute('opacity', fade.toFixed(2));
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
