// Сцена «Распознавание пластмасс»: вытяжной шкаф (пластмассы жгут только под тягой). Над каждым
// прибором — одно слово, какая это проба; таблицы свойств в сцене нет, числа — в панели показаний.
// Слева — электроплитка с пятью кусочками (ПЭ, ПС, ПВХ, ФФС, X):
// при нагревании термопласты оседают и растекаются, реактопласт сохраняет форму.
// В центре — штатив с пятью пробирками воды:
//   щелчок по штативу → в каждую пробирку падает кусочек своего образца (water = 1); лёгкий
//   полиэтилен остаётся на поверхности, остальные тонут тем быстрее, чем больше их плотность.
// Справа — фарфоровая пластинка с кусочками, спиртовка, тигельные щипцы и влажная синяя лакмусовая
// бумажка на лапке штатива над пламенем:
//   кусочек тащат в пламя (или щёлкают по нему) → щипцы берут его и попеременно держат в пламени
//   и над столом (burn = 1…5): видно цвет и копоть пламени, горит ли образец вне пламени,
//   капает ли он; от хлороводорода (ПВХ) бумажка краснеет. Щелчок по щипцам убирает образец (burn = 0).
// Ручку плитки можно поворачивать мышью — как регулятор температуры.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, hotplate, mixHex, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 450;

const PLATE = { x: 165, y: 404, w: 270 };
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 };
const HEAT_X = (i) => 73 + i * 46;
const HEAT_Y = PLATE.y - 8; // поверхность конфорки
const TUBE_X = (i) => 360 + i * 52;
const TUBE = { top: 298, bottom: 440, w: 26 };
const WATER_Y = 364;
const RACK = { x1: 326, x2: 604, plank: 326 };
const TILE = { x1: 604, x2: 800, y: 440 };
const TILE_X = (i) => 626 + i * 38;
const LAMP = { x: 852, wick: 388 };
// Позы щипцов: (x, y) — кончик губок с кусочком, a — направление ручки, градусы
const IN_FLAME = { x: LAMP.x, y: 362, a: 200 };
const OUT_FLAME = { x: 796, y: 330, a: 192 };
const TONGS_REST = { x: 798, y: 460, a: 180 };
const TONGS_LEN = 118;
const LITMUS = { x: 862, top: 236, bottom: 290 };
const STAND_X = 918;
// Цикл щипцов, с: в пламени → вынести → вне пламени → внести обратно
const CYCLE = { inFlame: 2.4, move: 0.5, out: 2.6 };
const CYCLE_LEN = CYCLE.inFlame + CYCLE.move + CYCLE.out + CYCLE.move;

// Цвет кусочков: полиэтилен молочный, полистирол прозрачный, ПВХ серый, фенопласт тёмно-коричневый (как карболит),
// X — бежевый: по цвету пластмассу не узнать, её распознают по свойствам
const COLORS = ['#f4f4ee', '#d9ecf7', '#8d99aa', '#4a2e1f', '#e6c58c'];
// Пламя горящего образца: от верхушки (0) к основанию (1). У ПВХ — зелёная кайма у основания (соединения хлора)
const FLAME_STOPS = [
  [[0, '#fde68a', 0.95], [0.55, '#fbbf24', 0.9], [1, '#60a5fa', 0.85]],
  [[0, '#fff7cc', 1], [0.45, '#fb923c', 0.95], [1, '#f59e0b', 0.9]],
  [[0, '#fde68a', 0.95], [0.6, '#f59e0b', 0.9], [1, '#22c55e', 0.95]],
  [[0, '#fde68a', 0.9], [0.6, '#f97316', 0.9], [1, '#ea580c', 0.85]],
];
const LITMUS_BLUE = '#2f5fd0';
const LITMUS_RED = '#d6324a';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function polymersScene(container, params, set, { SAMPLES, softness, floats }) {
  let plate, knobPointer, knob, rackG, tongs, heldPiece, heldShine, sFlame, lampFlame, lampGlow, lampCap, litmus, topLayer, ghost;
  const glows = {};
  const heat = []; // кусочки на плитке
  const wet = []; // кусочки в пробирках
  const tile = []; // кусочки на фарфоровой пластинке
  const smoke = [];
  const drips = [];
  const flameFills = [];

  // Щипцы: rest — лежат на столе, fetch — идут за кусочком, toFlame — несут его в пламя,
  // cycle — в пламени и над столом попеременно, home — возвращаются на стол
  const tg = { phase: 'rest', target: -1, carried: -1, pose: { ...TONGS_REST }, t: 0, fire: 0, litmus: 0, char: 0, smolder: 0 };
  let tilePick = null; // кусочек, который ученик тащит с пластинки
  let wetStarted = false;
  let clock = 0;
  let smokeAcc = 0;
  let dripAcc = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'hood' });
      const uid = Math.random().toString(36).slice(2);
      const defs = svg.querySelector('defs');

      for (const [key, attrs] of Object.entries({
        knob: { cx: KNOB.x, cy: KNOB.y, rx: 30, ry: 30 },
        rack: { cx: (RACK.x1 + RACK.x2) / 2, cy: 372, rx: 160, ry: 100 },
        tile: { cx: (TILE.x1 + TILE.x2) / 2, cy: 430, rx: 116, ry: 42 },
      })) {
        glows[key] = s('ellipse', { ...attrs, fill: d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
        svg.append(glows[key]);
      }

      buildCaptions(svg);
      buildHotplate(svg, d);
      buildRack(svg, d, uid, defs);
      buildTile(svg, d);
      buildLitmus(svg, d);
      buildLamp(svg, d);
      buildTongs(svg, d);

      for (const stops of FLAME_STOPS) flameFills.push(d.lin(stops, 'v'));
      sFlame = s('path', { d: 'M0 -1 C 0.36 -0.62, 0.42 -0.12, 0 0.1 C -0.42 -0.12, -0.36 -0.62, 0 -1 Z', opacity: 0, 'pointer-events': 'none' });
      svg.append(sFlame);

      // Капли горящего полиэтилена
      for (let i = 0; i < 5; i++) {
        const c = s('circle', { r: 2.6, fill: '#fbbf24', stroke: '#f97316', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
        svg.append(c);
        drips.push({ c, x: 0, y: 0, v: 0, live: false });
      }
      // Дым и хлопья сажи — общий запас частиц
      for (let i = 0; i < 34; i++) {
        const c = s('circle', { r: 4, fill: '#374151', opacity: 0, 'pointer-events': 'none' });
        svg.append(c);
        smoke.push({ c, x: 0, y: 0, vx: 0, life: 1, max: 1, r: 4, a: 0, live: false });
      }

      topLayer = s('g', { 'pointer-events': 'none' });
      ghost = s('rect', { x: -11, y: -5, width: 22, height: 10, rx: 2, opacity: 0 });
      topLayer.append(ghost);
      svg.append(topLayer);
    },

    frame(dt, now) {
      clock = now;
      drawHeating(dt);
      drawWater(dt);
      updateTongs(dt);
      drawBurning(dt);

      const pulse = 0.5 + 0.3 * Math.sin(now * 4);
      glows.rack.setAttribute('opacity', params.water ? 0 : pulse);
      glows.tile.setAttribute('opacity', params.burn || tilePick ? 0 : pulse);
      glows.knob.setAttribute('opacity', params.T === 20 ? pulse : 0);
    },
  });

  // ── Подписи проб над приборами: ученик сразу видит, где какое испытание ──
  function buildCaptions(svg) {
    const cap = (x, label) => svg.append(text(x, 250, tr(label), { size: 18, weight: 700, fill: '#475569' }));
    cap(HEAT_X(2), 'Нагревание');
    cap((RACK.x1 + RACK.x2) / 2, 'Плотность');
    cap(TILE.x1 + 110, 'Горение'); // левее спиртовки: над пламенем поднимается дым
  }

  // ── Электроплитка с кусочками пластмасс ──
  function buildHotplate(svg, d) {
    plate = hotplate(d, PLATE);
    knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
    knob = s('g', {}, [
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 18, fill: '#000', 'fill-opacity': 0 }),
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
      knobPointer,
    ]);
    svg.append(plate.g, knob);

    SAMPLES.forEach((p, i) => {
      const x = HEAT_X(i);
      const body = s('rect', { fill: COLORS[i], stroke: shade(COLORS[i], -0.35), 'stroke-width': 1.2 });
      const shine = s('rect', { height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.6 });
      svg.append(body, shine, text(x, HEAT_Y - 34, tr(p.short), { size: 15, weight: 700, fill: '#334155' }));
      heat.push({ body, shine, x, s: 0 });
    });
  }

  function drawHeating(dt) {
    const T = params.T;
    plate.setTemp(T);
    plate.setHeat(clamp01((T - 20) / 140));
    knobPointer.setAttribute('transform', `rotate(${(-135 + ((T - 20) / 140) * 270).toFixed(1)} ${KNOB.x} ${KNOB.y})`);
    SAMPLES.forEach((p, i) => {
      const h = heat[i];
      // Пластмасса прогревается не мгновенно: форма догоняет температуру плитки за ~1 с
      const goal = softness(p, T);
      h.s += Math.sign(goal - h.s) * Math.min(Math.abs(goal - h.s), dt * 1.2);
      const w = 34 + 10 * h.s;
      const hh = 16 - 9 * h.s;
      h.body.setAttribute('x', (h.x - w / 2).toFixed(1));
      h.body.setAttribute('y', (HEAT_Y - hh).toFixed(1));
      h.body.setAttribute('width', w.toFixed(1));
      h.body.setAttribute('height', hh.toFixed(1));
      h.body.setAttribute('rx', Math.min(hh / 2, 2 + 8 * h.s).toFixed(1));
      h.shine.setAttribute('x', (h.x - w / 2 + 5).toFixed(1));
      h.shine.setAttribute('y', (HEAT_Y - hh + 2).toFixed(1));
      h.shine.setAttribute('width', (w - 10).toFixed(1));
      // Расплав блестит сильнее твёрдого кусочка
      h.shine.setAttribute('fill-opacity', (0.35 + 0.45 * h.s).toFixed(2));
    });
  }

  // ── Штатив с пробирками воды ──
  function buildRack(svg, d, uid, defs) {
    const wood = d.lin([[0, '#d9bf98'], [1, '#b08a5c']], 'v');
    rackG = s('g');
    rackG.append(
      floorShadow((RACK.x1 + RACK.x2) / 2, BENCH + 2, 150, d, 9),
      s('rect', { x: RACK.x1 + 6, y: RACK.plank - 6, width: 9, height: BENCH - RACK.plank, rx: 2, fill: d.lin([[0, '#b08a5c'], [0.5, '#d9bf98'], [1, '#9c7b55']]) }),
      s('rect', { x: RACK.x2 - 15, y: RACK.plank - 6, width: 9, height: BENCH - RACK.plank, rx: 2, fill: d.lin([[0, '#b08a5c'], [0.5, '#d9bf98'], [1, '#9c7b55']]) }),
    );
    SAMPLES.forEach((p, i) => {
      const x = TUBE_X(i);
      const clip = `pt${uid}${i}`;
      defs.append(s('clipPath', { id: clip }, [s('path', { d: tubePath(x, TUBE.top, TUBE.bottom - 2, TUBE.w - 4) })]));
      const piece = s('rect', { x: -6.5, y: -4, width: 13, height: 8, rx: 1.5, fill: COLORS[i], stroke: shade(COLORS[i], -0.35), 'stroke-width': 1, opacity: 0 });
      const ring = s('ellipse', { cx: x, cy: WATER_Y, rx: 6, ry: 2, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, opacity: 0 });
      rackG.append(
        s('path', { d: tubePath(x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.35 }),
        s('rect', { x: x - 14, y: WATER_Y, width: 28, height: TUBE.bottom - WATER_Y, fill: '#cfe7f3', 'fill-opacity': 0.8, 'clip-path': `url(#${clip})` }),
        s('rect', { x: x - 14, y: WATER_Y, width: 28, height: TUBE.bottom - WATER_Y, fill: d.lin([[0, '#0f172a', 0.1], [0.35, '#ffffff', 0.25], [1, '#0f172a', 0.14]]), 'clip-path': `url(#${clip})` }),
        piece,
        s('line', { x1: x - 10, x2: x + 10, y1: WATER_Y, y2: WATER_Y, stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': 1.6 }),
        ring,
        s('path', { d: tubePath(x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.8 }),
        s('rect', { x: x - TUBE.w / 2 - 2, y: TUBE.top - 3, width: TUBE.w + 4, height: 5, rx: 2.5, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: x - 8, y: TUBE.top + 10, width: 3, height: TUBE.bottom - TUBE.top - 34, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.75 }),
      );
      wet.push({ piece, ring, x, y: 0, v: 0, state: 'off', splash: 0, rho: p.rho, floats: floats(p) });
    });
    // Верхняя планка с гнёздами — поверх пробирок, на ней подписи образцов; нижняя — подставка
    rackG.append(
      s('rect', { x: RACK.x1, y: RACK.plank, width: RACK.x2 - RACK.x1, height: 20, rx: 3, fill: wood, stroke: '#8a6a45', 'stroke-width': 1 }),
      s('rect', { x: RACK.x1 + 2, y: RACK.plank + 1, width: RACK.x2 - RACK.x1 - 4, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.3 }),
      s('rect', { x: RACK.x1 - 4, y: BENCH - 12, width: RACK.x2 - RACK.x1 + 8, height: 12, rx: 3, fill: wood, stroke: '#8a6a45', 'stroke-width': 1 }),
      ...SAMPLES.map((p, i) => text(TUBE_X(i), RACK.plank + 11, tr(p.short), { size: 14, weight: 700, fill: '#3f2a14' })),
    );
    rackG.style.cursor = 'pointer';
    rackG.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('water', params.water ? 0 : 1);
    });
    touchTarget(rackG, 12);
    svg.append(rackG);
  }

  function drawWater(dt) {
    if (!params.water) {
      wetStarted = false;
      for (const w of wet) {
        w.state = 'off';
        w.piece.setAttribute('opacity', 0);
        w.ring.setAttribute('opacity', 0);
      }
      return;
    }
    if (!wetStarted) {
      wetStarted = true;
      // Кусочки бросают по очереди, слева направо
      wet.forEach((w, i) => Object.assign(w, { state: 'drop', y: TUBE.top - 40 - i * 26, v: 0, splash: 0 }));
    }
    for (const w of wet) {
      if (w.state === 'drop') {
        w.v += 700 * dt;
        w.y += w.v * dt;
        if (w.y >= WATER_Y) {
          w.y = WATER_Y;
          w.state = 'water';
          w.splash = 1;
        }
      } else if (w.state === 'water') {
        // Лёгкий образец всплывает и держится у поверхности; тяжёлые тонут со скоростью,
        // растущей с разностью плотностей (полистирол — медленно, ПВХ — быстро)
        if (w.floats) w.y = lerp(w.y, WATER_Y - 1 + Math.sin(clock * 2.4 + w.x) * 0.8, Math.min(1, dt * 5));
        else w.y = Math.min(TUBE.bottom - 9, w.y + (24 + 300 * (w.rho - 1)) * dt);
      }
      w.splash = Math.max(0, w.splash - dt * 1.6);
      const visible = w.state !== 'off' && w.y > TUBE.top - 34;
      w.piece.setAttribute('opacity', visible ? 1 : 0);
      w.piece.setAttribute('transform', `translate(${w.x} ${w.y.toFixed(1)}) rotate(${w.state === 'drop' ? ((w.y * 3) % 360).toFixed(0) : 0})`);
      w.ring.setAttribute('rx', (6 + (1 - w.splash) * 6).toFixed(1));
      w.ring.setAttribute('opacity', (w.splash * 0.9).toFixed(2));
    }
  }

  // ── Фарфоровая пластинка с кусочками для сжигания ──
  function buildTile(svg, d) {
    const { x1, x2, y } = TILE;
    svg.append(
      floorShadow((x1 + x2) / 2, BENCH + 2, 100, d, 7),
      s('rect', { x: x1, y: y - 1, width: x2 - x1, height: 10, rx: 3, fill: d.lin([[0, '#ffffff'], [1, '#d5dbe3']], 'v'), stroke: '#b8c2ce', 'stroke-width': 1 }),
    );
    SAMPLES.forEach((p, i) => {
      const x = TILE_X(i);
      const piece = s('rect', { x: x - 10, y: y - 9, width: 20, height: 9, rx: 1.5, fill: COLORS[i], stroke: shade(COLORS[i], -0.35), 'stroke-width': 1 });
      const g = s('g', {}, [
        // Зона захвата: вся колонка над кусочком, вместе с подписью
        s('rect', { x: x - 17, y: y - 34, width: 34, height: 46, fill: '#000', 'fill-opacity': 0 }),
        piece,
        text(x, y - 21, tr(p.short), { size: 14, weight: 700, fill: '#334155' }),
      ]);
      g.style.cursor = 'grab';
      svg.append(g);
      tile.push({ g, piece });
      // Своя обработка указателя, без touchTarget: кусочки стоят тесно, и расширенные зоны попадания перекрывали бы соседей
      g.addEventListener('pointerdown', (e) => {
        if (tg.carried === i || params.burn === i + 1) return;
        e.stopPropagation();
        g.setPointerCapture(e.pointerId);
        const pt = scene.point(e);
        tilePick = { i, x: pt.x, y: pt.y, x0: pt.x, y0: pt.y, moved: false };
      });
      g.addEventListener('pointermove', (e) => {
        if (tilePick?.i !== i) return;
        const pt = scene.point(e);
        Object.assign(tilePick, { x: pt.x, y: pt.y });
        if (Math.hypot(pt.x - tilePick.x0, pt.y - tilePick.y0) > 6) tilePick.moved = true;
      });
      const release = () => {
        if (tilePick?.i !== i) return;
        const { x: px, y: py, moved } = tilePick;
        tilePick = null;
        // Щелчок или кусочек отпущен у пламени — щипцы вносят его в пламя
        if (!moved || (Math.abs(px - LAMP.x) < 80 && py > LITMUS.top && py < BENCH)) set('burn', i + 1);
      };
      g.addEventListener('pointerup', release);
      g.addEventListener('pointercancel', () => { tilePick = null; });
    });
  }

  // ── Лакмусовая бумажка на лапке штатива над пламенем ──
  function buildLitmus(svg, d) {
    svg.append(
      floorShadow(STAND_X, BENCH + 2, 30, d),
      s('rect', { x: STAND_X - 24, y: BENCH - 10, width: 48, height: 10, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
      s('rect', { x: STAND_X - 3, y: LITMUS.top - 30, width: 6, height: BENCH - LITMUS.top + 20, rx: 3, fill: d.lin([[0, '#6b7280'], [0.4, '#e5e7eb'], [1, '#4b5563']]) }),
      s('rect', { x: LITMUS.x - 4, y: LITMUS.top - 12, width: STAND_X - LITMUS.x + 4, height: 5, rx: 2.5, fill: d.lin(['#d1d5db', '#6b7280'], 'v') }),
      s('rect', { x: STAND_X - 8, y: LITMUS.top - 18, width: 16, height: 16, rx: 3, fill: d.lin([[0, '#6b7280'], [0.4, '#d1d5db'], [1, '#4b5563']]) }),
    );
    litmus = s('path', { d: `M${LITMUS.x - 6} ${LITMUS.top} H${LITMUS.x + 6} V${LITMUS.bottom - 2} L${LITMUS.x + 4} ${LITMUS.bottom} H${LITMUS.x - 5} L${LITMUS.x - 6} ${LITMUS.bottom - 3} Z`, fill: LITMUS_BLUE, stroke: shade(LITMUS_BLUE, -0.3), 'stroke-width': 0.8 });
    svg.append(
      litmus,
      // Бумажка влажная — блестит
      s('rect', { x: LITMUS.x - 4, y: LITMUS.top + 4, width: 2, height: LITMUS.bottom - LITMUS.top - 10, rx: 1, fill: '#ffffff', 'fill-opacity': 0.35 }),
      s('rect', { x: LITMUS.x - 9, y: LITMUS.top - 10, width: 18, height: 10, rx: 2, fill: d.lin([[0, '#9ca3af'], [1, '#4b5563']], 'v') }),
    );
  }

  // ── Спиртовка ──
  function buildLamp(svg, d) {
    const x = LAMP.x;
    lampGlow = s('ellipse', { cx: x, cy: LAMP.wick - 16, rx: 40, ry: 36, fill: d.rad([[0, '#fde68a', 0.7], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
    lampFlame = s('path', { d: `M${x} ${LAMP.wick - 34} C ${x + 10} ${LAMP.wick - 20}, ${x + 9} ${LAMP.wick - 2}, ${x} ${LAMP.wick} C ${x - 9} ${LAMP.wick - 2}, ${x - 10} ${LAMP.wick - 20}, ${x} ${LAMP.wick - 34} Z`, fill: d.lin([[0, '#fde68a', 0.85], [0.5, '#fb923c', 0.75], [1, '#60a5fa', 0.75]], 'v'), opacity: 0, 'pointer-events': 'none' });
    lampCap = s('path', { d: `M${x - 15} ${LAMP.wick + 18} V${LAMP.wick - 4} Q ${x - 15} ${LAMP.wick - 14} ${x} ${LAMP.wick - 14} Q ${x + 15} ${LAMP.wick - 14} ${x + 15} ${LAMP.wick - 4} V${LAMP.wick + 18} Z`, fill: d.lin([[0, '#e2e8f0', 0.85], [1, '#94a3b8', 0.85]]), stroke: '#64748b', 'stroke-width': 1.2 });
    svg.append(
      floorShadow(x, BENCH + 3, 46, d),
      lampGlow,
      s('path', { d: `M${x - 34} ${BENCH - 2} Q ${x - 40} ${BENCH - 40} ${x - 12} ${BENCH - 44} H${x + 12} Q ${x + 40} ${BENCH - 40} ${x + 34} ${BENCH - 2} Z`, fill: d.lin([[0, '#e0f2fe', 0.6], [0.5, '#f8fafc', 0.3], [1, '#bae6fd', 0.6]]), stroke: '#94a3b8', 'stroke-width': 2 }),
      s('path', { d: `M${x - 32} ${BENCH - 4} Q ${x - 35} ${BENCH - 24} ${x - 26} ${BENCH - 26} H${x + 26} Q ${x + 35} ${BENCH - 24} ${x + 32} ${BENCH - 4} Z`, fill: '#bfdbfe', 'fill-opacity': 0.55 }),
      s('rect', { x: x - 11, y: BENCH - 58, width: 22, height: 16, rx: 3, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
      s('rect', { x: x - 3, y: LAMP.wick, width: 6, height: BENCH - 58 - LAMP.wick, fill: '#f5f5f4' }),
      s('path', { d: `M${x - 24} ${BENCH - 30} Q ${x - 26} ${BENCH - 12} ${x - 20} ${BENCH - 8}`, stroke: '#ffffff', 'stroke-width': 3, fill: 'none', 'stroke-opacity': 0.7 }),
      lampCap,
      lampFlame,
    );
  }

  // ── Тигельные щипцы: кончик губок в (0, 0), ручка уходит вдоль оси x ──
  function buildTongs(svg, d) {
    const L = TONGS_LEN;
    const steel = '#4b5563';
    heldPiece = s('rect', { x: -9, y: -4.5, width: 18, height: 9, rx: 1.5, opacity: 0 });
    heldShine = s('rect', { x: -6, y: -3, width: 12, height: 1.6, rx: 0.8, fill: '#ffffff', 'fill-opacity': 0.5, opacity: 0 });
    tongs = s('g', {}, [
      s('rect', { x: -6, y: -14, width: L + 14, height: 28, fill: '#000', 'fill-opacity': 0 }), // зона захвата
      heldPiece,
      heldShine,
      s('path', { d: `M-2 -6 Q 4 -10 12 -5 L${L} -9`, fill: 'none', stroke: steel, 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
      s('path', { d: `M-2 6 Q 4 10 12 5 L${L} 9`, fill: 'none', stroke: steel, 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
      s('path', { d: `M-4 -6 Q -7 0 -4 6`, fill: 'none', stroke: steel, 'stroke-width': 2, opacity: 0.6 }),
      s('circle', { cx: 18, cy: 0, r: 3.2, fill: d.rad(['#e5e7eb', '#4b5563']) }),
      s('path', { d: `M18 0 L 26 -6 M18 0 L 26 6`, stroke: steel, 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
      s('ellipse', { cx: L + 4, cy: -10, rx: 7, ry: 4, fill: 'none', stroke: steel, 'stroke-width': 2.6 }),
      s('ellipse', { cx: L + 4, cy: 10, rx: 7, ry: 4, fill: 'none', stroke: steel, 'stroke-width': 2.6 }),
      s('path', { d: `M14 -6 L${L - 4} -9.5`, stroke: '#e5e7eb', 'stroke-width': 0.9, 'stroke-opacity': 0.7 }),
    ]);
    tongs.addEventListener('pointerdown', (e) => {
      if (!params.burn) return;
      e.stopPropagation();
      set('burn', 0);
    });
    touchTarget(tongs, 10);
    svg.append(tongs);
  }

  function setPose(p) {
    tongs.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.a.toFixed(1)})`);
  }

  function cyclePose(t) {
    const { inFlame, move, out } = CYCLE;
    const mix = (k) => ({ x: lerp(IN_FLAME.x, OUT_FLAME.x, k), y: lerp(IN_FLAME.y, OUT_FLAME.y, k) - Math.sin(k * Math.PI) * 10, a: lerp(IN_FLAME.a, OUT_FLAME.a, k) });
    if (t < inFlame) return { ...IN_FLAME, inFlame: true };
    if (t < inFlame + move) return { ...mix(ease((t - inFlame) / move)), inFlame: false };
    if (t < inFlame + move + out) return { ...OUT_FLAME, inFlame: false };
    return { ...mix(1 - ease((t - inFlame - move - out) / move)), inFlame: false };
  }

  function updateTongs(dt) {
    const want = params.burn - 1;
    if (want >= 0 && tg.carried !== want && !(tg.phase === 'fetch' && tg.target === want)) {
      // Новый образец: прежний кусочек сгорел, щипцы идут за следующим, бумажку меняют на свежую
      Object.assign(tg, { phase: 'fetch', target: want, carried: -1, fire: 0, litmus: 0, char: 0, smolder: 0 });
    }
    if (want < 0 && tg.phase !== 'rest' && tg.phase !== 'home') Object.assign(tg, { phase: 'home', carried: -1, target: -1, fire: 0, smolder: 0 });

    const goal = tg.phase === 'fetch' ? { x: TILE_X(tg.target), y: TILE.y - 5, a: 200 } : tg.phase === 'toFlame' ? IN_FLAME : tg.phase === 'home' ? TONGS_REST : null;
    if (goal) {
      const k = Math.min(1, dt * 7);
      tg.pose.x += (goal.x - tg.pose.x) * k;
      tg.pose.y += (goal.y - tg.pose.y) * k;
      tg.pose.a += (goal.a - tg.pose.a) * k;
      if (Math.hypot(goal.x - tg.pose.x, goal.y - tg.pose.y) < 2) {
        Object.assign(tg.pose, goal);
        if (tg.phase === 'fetch') Object.assign(tg, { phase: 'toFlame', carried: tg.target });
        else if (tg.phase === 'toFlame') Object.assign(tg, { phase: 'cycle', t: 0 });
        else tg.phase = 'rest';
      }
    } else if (tg.phase === 'cycle') {
      tg.t = (tg.t + dt) % CYCLE_LEN;
      Object.assign(tg.pose, cyclePose(tg.t));
    } else {
      Object.assign(tg.pose, TONGS_REST);
    }
    setPose(tg.pose);
    tongs.style.cursor = params.burn ? 'pointer' : 'default';
    tongs.style.pointerEvents = params.burn ? '' : 'none';

    tile.forEach((tp, i) => tp.piece.setAttribute('opacity', tg.carried === i || tilePick?.i === i ? 0 : 1));
    const c = tg.carried;
    heldPiece.setAttribute('opacity', c >= 0 ? 1 : 0);
    heldShine.setAttribute('opacity', c >= 0 ? 1 : 0);
    if (c >= 0) {
      // Фенопласт в пламени обугливается, остальные кусочки темнеют от копоти слегка
      const base = COLORS[c];
      const fill = mixHex(base, '#111111', SAMPLES[c].soft == null ? tg.char * 0.9 : tg.char * 0.25);
      heldPiece.setAttribute('fill', fill);
      heldPiece.setAttribute('stroke', shade(fill, -0.3));
    }

    // Кусочек, который ученик тащит к пламени
    if (tilePick?.moved) {
      ghost.setAttribute('opacity', 1);
      ghost.setAttribute('fill', COLORS[tilePick.i]);
      ghost.setAttribute('stroke', shade(COLORS[tilePick.i], -0.35));
      ghost.setAttribute('transform', `translate(${tilePick.x.toFixed(1)} ${tilePick.y.toFixed(1)})`);
    } else ghost.setAttribute('opacity', 0);
  }

  function spawnSmoke(x, y, color, size, alpha) {
    const p = smoke.find((q) => !q.live);
    if (!p) return;
    Object.assign(p, { x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 14, life: 0, max: 1.4 + Math.random() * 0.8, r: size, a: alpha, live: true });
    p.c.setAttribute('fill', color);
  }

  function drawBurning(dt) {
    const lit = params.burn > 0 || tg.phase !== 'rest';
    const flick = 1 + Math.sin(clock * 23) * 0.06 + Math.sin(clock * 37) * 0.04;
    lampFlame.setAttribute('opacity', lit ? 1 : 0);
    lampFlame.setAttribute('transform', `translate(${LAMP.x} ${LAMP.wick}) scale(1 ${flick.toFixed(3)}) translate(${-LAMP.x} ${-LAMP.wick})`);
    lampGlow.setAttribute('opacity', lit ? 0.8 : 0);
    lampCap.setAttribute('opacity', lit ? 0 : 1);

    const c = tg.carried;
    const p = SAMPLES[c];
    const burning = tg.phase === 'cycle' && p;
    const inFlame = burning && tg.pose.inFlame;
    // Пламя образца: в пламени спиртовки разгорается (фенопласт — медленно, «загорается с трудом»),
    // вне пламени у ПЭ и ПС горит дальше, у ПВХ и фенопласта гаснет за полсекунды
    let goal = 0;
    if (inFlame) goal = 1;
    else if (burning && p.burnsOn && tg.fire > 0.3) goal = 0.8;
    const rate = goal > tg.fire ? (p?.soft == null ? 0.7 : 3) : 2.2;
    tg.fire += Math.sign(goal - tg.fire) * Math.min(Math.abs(goal - tg.fire), dt * rate);
    if (!burning) tg.fire = 0;
    if (burning && !inFlame && !p.burnsOn && tg.fire < 0.05) tg.smolder = Math.max(0, tg.smolder - dt);
    if (inFlame) tg.smolder = 1.6;
    if (inFlame) tg.char = Math.min(1, tg.char + dt * 0.35);

    if (burning && tg.fire > 0.02) {
      const size = (p.soot >= 1 ? 46 : p.soft == null ? 28 : 38) * tg.fire * flick;
      const kind = c === 4 ? 2 : c; // X горит как ПВХ
      sFlame.setAttribute('fill', flameFills[kind]);
      sFlame.setAttribute('opacity', Math.min(1, tg.fire * 1.4).toFixed(2));
      sFlame.setAttribute('transform', `translate(${tg.pose.x.toFixed(1)} ${(tg.pose.y + 3).toFixed(1)}) scale(${(size * 0.55).toFixed(1)} ${size.toFixed(1)})`);
    } else sFlame.setAttribute('opacity', 0);

    // Копоть: густая у полистирола, заметная у ПВХ и фенопласта, почти нет у полиэтилена;
    // у погасших ПВХ и фенопласта ещё немного тянется белёсый дымок
    if (burning) {
      const top = tg.pose.y - (tg.fire > 0.02 ? 30 * tg.fire : 4);
      smokeAcc += dt * (tg.fire * (4 + 22 * p.soot) + (tg.smolder > 0 && tg.fire < 0.05 ? 5 : 0));
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        if (tg.fire > 0.05) spawnSmoke(tg.pose.x, top, p.soot >= 1 ? '#111827' : p.soot >= 0.5 ? '#374151' : '#94a3b8', p.soot >= 1 ? 3 + Math.random() * 4 : 3, 0.25 + 0.55 * p.soot);
        else spawnSmoke(tg.pose.x, tg.pose.y - 4, '#cbd5e1', 2.5, 0.5);
      }
      // Горящий полиэтилен плавится и капает
      if (p.short === 'ПЭ' && tg.fire > 0.3) {
        dripAcc += dt * 1.6;
        if (dripAcc >= 1) {
          dripAcc = 0;
          const dr = drips.find((q) => !q.live);
          if (dr) Object.assign(dr, { x: tg.pose.x - 2, y: tg.pose.y + 5, v: 0, live: true });
        }
      }
      // Хлороводород из горящего ПВХ окрашивает влажную лакмусовую бумажку в красный цвет
      if (p.hcl && (tg.fire > 0.2 || tg.smolder > 0)) tg.litmus = Math.min(1, tg.litmus + dt / 2.5);
    } else smokeAcc = 0;
    const lit2 = mixHex(LITMUS_BLUE, LITMUS_RED, tg.litmus);
    litmus.setAttribute('fill', lit2);
    litmus.setAttribute('stroke', shade(lit2, -0.3));

    for (const q of smoke) {
      if (!q.live) {
        q.c.setAttribute('opacity', 0);
        continue;
      }
      q.life += dt;
      if (q.life >= q.max) {
        q.live = false;
        q.c.setAttribute('opacity', 0);
        continue;
      }
      const k = q.life / q.max;
      q.y -= (55 + 20 * k) * dt;
      q.x += (q.vx + Math.sin(clock * 3 + q.y * 0.05) * 8) * dt;
      // Дым не проходит сквозь бумажку и лапку — у её высоты расползается в стороны
      if (q.y < LITMUS.top - 10) q.x += Math.sign(q.x - LITMUS.x || 1) * 30 * dt;
      q.c.setAttribute('cx', q.x.toFixed(1));
      q.c.setAttribute('cy', q.y.toFixed(1));
      q.c.setAttribute('r', (q.r * (1 + k * 2.4)).toFixed(1));
      q.c.setAttribute('opacity', (q.a * (1 - k)).toFixed(2));
    }
    for (const dr of drips) {
      if (!dr.live) {
        dr.c.setAttribute('opacity', 0);
        continue;
      }
      dr.v += 800 * dt;
      dr.y += dr.v * dt;
      if (dr.y >= BENCH - 2) dr.live = false;
      dr.c.setAttribute('cx', dr.x.toFixed(1));
      dr.c.setAttribute('cy', dr.y.toFixed(1));
      dr.c.setAttribute('opacity', dr.live ? 1 : 0);
    }
  }

  // Ручка плитки: ведём мышью влево-вправо — меняется температура
  draggable(scene, knob, {
    onDrag: (x) => set('T', 20 + clamp01((x - (KNOB.x - 90)) / 180) * 140),
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
