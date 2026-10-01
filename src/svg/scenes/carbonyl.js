// Сцена «Качественные реакции альдегидов»: химический стол. Слева — три склянки с притёртыми пробками
// (метаналь, этаналь, пропанон); в центре — водяная баня (стакан с водой на плитке) с двумя пробирками
// и термометром; справа — склянка тёмного стекла с аммиачным раствором оксида серебра и капельницей
// и стаканчик со свежеосаждённым голубым Cu(OH)₂ и пипеткой. Ученик сам ведёт опыт:
//   щелчок по склянке — обе пробирки заполняются этим веществом (substance);
//   капельницу переносят к пробирке 1 — капает аммиачный раствор Ag₂O (tollens = 1);
//   пипетку переносят к пробирке 2 — добавляется голубая взвесь Cu(OH)₂ (cuoh = 1);
//   ручка плитки или регулятор — температура бани (T).
// Видимый результат догоняет модель за ~2 с: раствор темнеет и на стенках нарастает серебряное зеркало,
// голубой осадок желтеет и становится кирпично-красным (или чернеет у кетона). Цвета и пороги — те же,
// что в подписях модели (silverLook/copperLook), чтобы рисунок и показания не расходились.

import { bubblePool, createScene, draggable, floorShadow, hotplate, mixHex, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 450;

const BOTTLES = [58, 144, 230]; // склянки с веществами
// Ацетон — сокращённой формулой (CH₃)₂CO: развёрнутая CH₃COCH₃ не помещается на этикетке склянки
const FORMULAS = ['HCHO', 'CH₃CHO', '(CH₃)₂CO'];
const NAMES = ['метаналь', 'этаналь', 'пропанон'];
const PLATE = { x: 470, y: BENCH - 46, w: 250 };
const BATH = { x: 470, bottom: BENCH - 46, w: 236, h: 164 };
const WATER_Y = BATH.bottom - 92;
const TUBES = [{ x: 424, n: 1 }, { x: 508, n: 2 }];
const TUBE = { top: 168, bottom: 392, w: 30 };
const LEVEL = { base: 356, full: 334 }; // уровень раствора: только вещество / вещество + реактив
const THERMO = { x: 560, top: 150, bulb: 384 };
const thermoY = (T) => 372 - T * 1.9;
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 };
const AG_BOTTLE = { x: 692, bottom: BENCH };
const CUP = { x: 842, bottom: BENCH, w: 74, h: 84 };
const DROPPER_REST = { x: AG_BOTTLE.x, y: BENCH - 14 }; // муфта капельницы сидит на горлышке склянки
const PIPETTE_REST = { x: CUP.x + 6, y: BENCH - 12 };
const MOUTH = TUBES.map((t) => ({ x: t.x, y: TUBE.top + 16 })); // кончик инструмента в горлышке пробирки

// Цвет взвеси в пробирке 2 по доле восстановленного Cu(OH)₂: голубой → жёлтый CuOH → кирпично-красный Cu₂O.
// Пороги 0,15 и 0,6 совпадают с copperLook() в модели
const CU_STOPS = [[0, '#4f9fe0'], [0.12, '#68acd6'], [0.2, '#dcb033'], [0.42, '#e0892c'], [0.62, '#b4461d'], [1, '#98321a']];
function stopColor(stops, x) {
  for (let i = 1; i < stops.length; i++) {
    const [x0, c0] = stops[i - 1];
    const [x1, c1] = stops[i];
    if (x <= x1) return mixHex(c0, c1, Math.max(0, (x - x0) / (x1 - x0)));
  }
  return stops.at(-1)[1];
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Последние доли процента не тянем: иначе цвет в пробирке долго «доползает» до значения модели
const approach = (v, to, dt, rate = 3) => (Math.abs(to - v) < 0.003 ? to : v + (to - v) * Math.min(1, dt * rate));

// Пробирка: прямые стенки и полукруглое дно
function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function carbonylScene(container, params, set, { silverShare, copperShare, blackShare }) {
  let plate, knob, knobPointer, column, boil, resetBtn, topLayer;
  const liquids = [];
  const steam = [];
  const drops = [];
  const bottleGlow = [];
  const bottleName = [];
  let mirror, sediment, haze;
  // Что сейчас видно в пробирках: догоняет модель, чтобы реакция шла на глазах, а не мгновенно
  const shown = { ag: 0, cu: 0, black: 0 };
  let shownSubstance = params.substance;
  let clock = 0;
  let acc = 0;

  // Инструменты: rest — в своей посуде, drag — в руке, fly — летит к пробирке, drip — капает,
  // back — возвращается, used — реактив уже в пробирке
  const tools = {
    tollens: { state: params.tollens ? 'used' : 'rest', pos: { ...DROPPER_REST }, rest: DROPPER_REST, mouth: MOUTH[0], t: 0, color: '#eef2f7' },
    cuoh: { state: params.cuoh ? 'used' : 'rest', pos: { ...PIPETTE_REST }, rest: PIPETTE_REST, mouth: MOUTH[1], t: 0, color: '#5aa6e0' },
  };
  const grab = { dx: 0, dy: 0 };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // Массы продуктов — только в панели показаний под сценой: в сцене видно лишь, как меняется цвет

      // Подсветка того, с чем сейчас можно работать
      const glowFill = d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5);
      tools.tollens.glow = s('ellipse', { cx: AG_BOTTLE.x, cy: BENCH - 80, rx: 50, ry: 84, fill: glowFill, opacity: 0, 'pointer-events': 'none' });
      tools.cuoh.glow = s('ellipse', { cx: CUP.x, cy: BENCH - 80, rx: 54, ry: 84, fill: glowFill, opacity: 0, 'pointer-events': 'none' });
      svg.append(tools.tollens.glow, tools.cuoh.glow);

      buildBottles(svg, d);
      buildBath(svg, d, defs, uid);
      buildReagents(svg, d, defs, uid);

      // Кнопка новых пробирок — вверху: низ сцены на странице закрывает панель регуляторов
      resetBtn = s('g', { opacity: 0 }, [
        s('rect', { x: 376, y: 32, width: 208, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M401.4 45.6 A9 9 0 1 0 402.8 56.5 M401.4 38.6 V45.6 H394.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(493, 52, tr('Новые пробирки'), { size: 15, weight: 600, fill: '#1e293b' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (resetBtn.getAttribute('opacity') === '0') return;
        e.stopPropagation();
        set('tollens', 0);
        set('cuoh', 0);
      });
      svg.append(resetBtn);

      topLayer = s('g');
      svg.append(topLayer);
      // Инструменты в руке и в полёте — поверх всей сцены
      for (const tool of Object.values(tools)) topLayer.append(tool.node);
    },

    frame(dt, now) {
      clock = now;
      const T = params.T;
      plate.setTemp(T);
      plate.setHeat(clamp01((T - 30) / 70));
      knobPointer.setAttribute('transform', `rotate(${-135 + ((T - 20) / 80) * 270} ${KNOB.x} ${KNOB.y})`);
      const top = thermoY(T);
      column.setAttribute('y', top.toFixed(1));
      column.setAttribute('height', (THERMO.bulb - top).toFixed(1));

      // Кипение бани у 100 °C, пар — над горячей водой
      if (T >= 90) {
        acc += dt * (T - 85) * 2.5;
        while (acc >= 1) {
          acc -= 1;
          boil.spawn(BATH.x - BATH.w / 2 + 14 + Math.random() * (BATH.w - 28), BATH.bottom - 8, 2 + Math.random() * 3);
        }
      }
      boil.update(dt, WATER_Y + 2, 0.4);
      const steamOn = clamp01((T - 55) / 35);
      for (const p of steam) {
        const k = (now * 0.35 + p.phase) % 1;
        p.e.setAttribute('cx', (p.x + Math.sin(now + p.phase * 9) * 6).toFixed(1));
        p.e.setAttribute('cy', (BATH.bottom - BATH.h - 14 - k * 60).toFixed(1));
        p.e.setAttribute('opacity', (steamOn * 0.5 * (1 - k)).toFixed(2));
      }

      // Другое вещество — это новые пробирки с теми же реактивами: реакция идёт заново
      if (params.substance !== shownSubstance) {
        shownSubstance = params.substance;
        shown.ag = 0;
        shown.cu = 0;
        shown.black = 0;
      }
      for (const [id, tool] of Object.entries(tools)) updateTool(id, tool, dt);
      const inAg = params.tollens && (tools.tollens.state === 'back' || tools.tollens.state === 'used');
      const inCu = params.cuoh && (tools.cuoh.state === 'back' || tools.cuoh.state === 'used');
      shown.ag = inAg ? approach(shown.ag, silverShare(params), dt) : 0;
      shown.cu = inCu ? approach(shown.cu, copperShare(params), dt, 3) : 0;
      shown.black = inCu ? approach(shown.black, blackShare(params), dt, 3) : 0;
      drawTubes(inAg, inCu);
      updateDrops(dt);

      // Выбранная склянка подсвечена, её название — жирным
      bottleGlow.forEach((g, i) => g.setAttribute('opacity', i === params.substance ? 1 : 0));
      bottleName.forEach((t, i) => {
        t.setAttribute('font-weight', i === params.substance ? 800 : 500);
        t.setAttribute('fill', i === params.substance ? '#0f172a' : '#64748b');
      });

      const pulse = 0.55 + 0.3 * Math.sin(now * 4);
      for (const [id, tool] of Object.entries(tools)) tool.glow.setAttribute('opacity', !params[id] && tool.state === 'rest' ? pulse : 0);
      const any = params.tollens || params.cuoh;
      resetBtn.setAttribute('opacity', any ? 1 : 0);
      resetBtn.style.pointerEvents = any ? '' : 'none';
    },
  });

  // ── Склянки с веществами: прозрачное стекло, притёртая пробка, этикетка с формулой ──
  function buildBottles(svg, d) {
    BOTTLES.forEach((x, i) => {
      const b = BENCH;
      const w = 76;
      const body = `M${x - w / 2} ${b - 6} V${b - 66} Q${x - w / 2} ${b - 80} ${x - 14} ${b - 84} V${b - 96} H${x + 14} V${b - 84} Q${x + w / 2} ${b - 80} ${x + w / 2} ${b - 66} V${b - 6} Q${x + w / 2} ${b} ${x + w / 2 - 6} ${b} H${x - w / 2 + 6} Q${x - w / 2} ${b} ${x - w / 2} ${b - 6} Z`;
      const glow = s('ellipse', { cx: x, cy: b - 56, rx: 46, ry: 70, fill: d.rad([[0, '#fde68a', 0.8], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
      bottleGlow.push(glow);
      const name = text(x, b - 128, tr(NAMES[i]), { size: 14, weight: 500, fill: '#64748b' });
      bottleName.push(name);
      const g = s('g', {}, [
        // Зона захвата — вся склянка вместе с пробкой
        s('rect', { x: x - w / 2 - 4, y: b - 114, width: w + 8, height: 116, fill: '#ffffff', 'fill-opacity': 0 }),
        floorShadow(x, b + 3, w * 0.58, d),
        s('path', { d: body, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: x - w / 2 + 2, y: b - 50, width: w - 4, height: 48, rx: 5, fill: '#e0f2fe', 'fill-opacity': 0.6 }),
        s('ellipse', { cx: x, cy: b - 50, rx: w / 2 - 3, ry: 3, fill: '#ffffff', 'fill-opacity': 0.7 }),
        s('path', { d: body, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        // Притёртая стеклянная пробка
        s('rect', { x: x - 11, y: b - 104, width: 22, height: 12, rx: 3, fill: d.lin([[0, '#cbd5e1'], [0.4, '#f8fafc'], [1, '#94a3b8']]), stroke: '#94a3b8', 'stroke-width': 1 }),
        s('path', { d: `M${x - 16} ${b - 104} Q${x} ${b - 118} ${x + 16} ${b - 104} Z`, fill: d.lin([[0, '#cbd5e1'], [0.4, '#f8fafc'], [1, '#94a3b8']]), stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: x - w / 2 + 3, y: b - 46, width: w - 6, height: 24, rx: 3, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
        text(x, b - 33.5, FORMULAS[i], { size: 14, weight: 700, fill: '#1e3a8a' }),
        s('rect', { x: x - w / 2 + 7, y: b - 74, width: 5, height: 60, rx: 2.5, fill: '#ffffff', 'fill-opacity': 0.7 }),
      ]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('substance', i);
      });
      touchTarget(g, 8);
      svg.append(glow, g, name);
    });
  }

  // ── Водяная баня: плитка, стакан с водой, две пробирки в держателе, термометр ──
  function buildBath(svg, d, defs, uid) {
    plate = hotplate(d, PLATE);
    knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
    knob = s('g', {}, [
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 17, fill: '#000', 'fill-opacity': 0 }),
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
      knobPointer,
    ]);
    svg.append(plate.g, knob);

    const { x, bottom, w, h } = BATH;
    const top = bottom - h;
    const r = 16;
    const outline = `M${x - w / 2} ${top} V${bottom - r} Q${x - w / 2} ${bottom} ${x - w / 2 + r} ${bottom} H${x + w / 2 - r} Q${x + w / 2} ${bottom} ${x + w / 2} ${bottom - r} V${top}`;
    const clip = `bath${uid}`;
    defs.append(s('clipPath', { id: clip }, [s('path', { d: `${outline} Z` })]));
    svg.append(
      s('path', { d: outline, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      s('rect', { x: x - w / 2, y: WATER_Y, width: w, height: bottom - WATER_Y, fill: '#cfe7f3', 'fill-opacity': 0.7, 'clip-path': `url(#${clip})` }),
      s('rect', { x: x - w / 2, y: WATER_Y, width: w, height: bottom - WATER_Y, fill: d.lin([[0, '#ffffff', 0.2], [1, '#0f172a', 0.1]], 'v'), 'clip-path': `url(#${clip})` }),
    );
    const content = s('g', { 'clip-path': `url(#${clip})` });
    svg.append(content);
    boil = bubblePool(content, 28, { color: '#f8fafc' });

    // Термометр: стеклянная трубка, красный спиртовой столбик, шкала 0…100 °C
    column = s('rect', { x: THERMO.x - 1.8, width: 3.6, rx: 1.8, fill: '#dc2626' });
    svg.append(
      s('rect', { x: THERMO.x - 7, y: THERMO.top, width: 14, height: THERMO.bulb - THERMO.top, rx: 7, fill: d.lin([[0, '#ffffff', 0.6], [0.5, '#f8fafc', 0.25], [1, '#cbd5e1', 0.55]]), stroke: '#94a3b8', 'stroke-width': 1.2 }),
      ...Array.from({ length: 11 }, (_, i) => s('line', { x1: THERMO.x + 2.5, x2: THERMO.x + (i % 5 ? 5.5 : 7), y1: thermoY(i * 10), y2: thermoY(i * 10), stroke: '#64748b', 'stroke-width': 1 })),
      column,
      s('circle', { cx: THERMO.x, cy: THERMO.bulb, r: 7.5, fill: d.rad(['#f87171', '#991b1b']) }),
    );

    // Пробирки: раствор, взвесь, серебряное зеркало на стенках
    TUBES.forEach((t, i) => {
      const tclip = `tube${uid}${i}`;
      defs.append(s('clipPath', { id: tclip }, [s('path', { d: tubePath(t.x, TUBE.top, TUBE.bottom - 2.5, TUBE.w - 5) })]));
      const inner = s('g', { 'clip-path': `url(#${tclip})` });
      const liquid = s('rect', { x: t.x - 20, y: LEVEL.base, width: 40, height: TUBE.bottom - LEVEL.base, fill: '#e8f1f6', 'fill-opacity': 0.75 });
      const surface = s('rect', { x: t.x - 20, y: LEVEL.base, width: 40, height: 2, fill: '#ffffff', 'fill-opacity': 0.8 });
      inner.append(
        liquid,
        s('rect', { x: t.x - 20, y: TUBE.top, width: 40, height: TUBE.bottom - TUBE.top, fill: d.lin([[0, '#0f172a', 0.14], [0.35, '#ffffff', 0.22], [1, '#0f172a', 0.18]]), 'pointer-events': 'none' }),
      );
      if (i === 0) {
        // Серебро оседает на стенках там, где их смачивает раствор: металлический градиент с бликами
        mirror = s('rect', { x: t.x - 20, y: LEVEL.full - 8, width: 40, height: TUBE.bottom - LEVEL.full + 8, fill: d.lin([[0, '#2f3640'], [0.12, '#9aa3ad'], [0.22, '#ffffff'], [0.34, '#7b8490'], [0.6, '#c9d0d8'], [0.8, '#4b5563'], [1, '#1f2937']]), opacity: 0 });
        inner.append(mirror);
      } else {
        // Осадок оседает на дно; мутность взвеси — поверх раствора
        sediment = s('ellipse', { cx: t.x, cy: TUBE.bottom - 6, rx: 14, ry: 10, fill: '#4f9fe0', opacity: 0 });
        haze = s('rect', { x: t.x - 20, y: LEVEL.full, width: 40, height: TUBE.bottom - LEVEL.full, fill: '#4f9fe0', opacity: 0 });
        inner.append(haze, sediment);
      }
      inner.append(surface);
      liquids.push({ liquid, surface });
      svg.append(
        s('path', { d: tubePath(t.x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.3 }),
        inner,
        s('path', { d: tubePath(t.x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: t.x - TUBE.w / 2 - 3, y: TUBE.top - 3, width: TUBE.w + 6, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: t.x - TUBE.w / 2 + 5, y: TUBE.top + 10, width: 3.5, height: TUBE.bottom - TUBE.top - 34, rx: 1.75, fill: '#ffffff', 'fill-opacity': 0.7 }),
        // Номер пробирки
        s('circle', { cx: t.x, cy: TUBE.top - 20, r: 12, fill: '#1e293b' }),
        text(t.x, TUBE.top - 19.5, String(t.n), { size: 14, weight: 700, fill: '#ffffff' }),
      );
    });
    for (let i = 0; i < 6; i++) {
      const c = s('ellipse', { rx: 2.6, ry: 3.4, fill: '#eef6fb', stroke: '#94a3b8', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
      drops.push({ c, x: 0, y: 0, v: 0, stop: 0, live: false });
      svg.append(c);
    }

    // Погружённые части пробирок видны сквозь воду — слегка тонированы
    for (const t of TUBES) svg.append(s('rect', { x: t.x - TUBE.w / 2 - 2, y: WATER_Y, width: TUBE.w + 4, height: TUBE.bottom - WATER_Y + 2, rx: 6, fill: '#bcd8e6', 'fill-opacity': 0.25, 'pointer-events': 'none' }));
    svg.append(s('rect', { x: THERMO.x - 9, y: WATER_Y, width: 18, height: THERMO.bulb - WATER_Y + 9, rx: 8, fill: '#bcd8e6', 'fill-opacity': 0.25 }));

    // Поверхность воды, стекло стакана поверх содержимого, держатель пробирок на краю стакана
    svg.append(
      s('line', { x1: x - w / 2 + 3, x2: x + w / 2 - 3, y1: WATER_Y, y2: WATER_Y, stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': 2 }),
      s('path', { d: outline, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      s('path', { d: `M${x - w / 2} ${top} H${x + w / 2}`, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('rect', { x: x - w / 2 + 10, y: top + 16, width: 8, height: h - 44, rx: 4, fill: '#ffffff', 'fill-opacity': 0.7 }),
      s('rect', { x: x - w / 2 - 12, y: top - 12, width: w + 24, height: 12, rx: 4, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
      ...TUBES.map((t) => s('rect', { x: t.x - TUBE.w / 2 - 4, y: top - 14, width: TUBE.w + 8, height: 16, rx: 4, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']]) })),
      s('rect', { x: THERMO.x - 11, y: top - 14, width: 22, height: 16, rx: 4, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']]) }),
    );

    for (let i = 0; i < 6; i++) {
      const e = s('ellipse', { rx: 15, ry: 8, fill: '#e2e8f0', opacity: 0, 'pointer-events': 'none' });
      svg.append(e);
      steam.push({ e, x: x - w / 2 + 24 + i * 38, phase: i / 6 });
    }
  }

  // ── Реактивы: склянка тёмного стекла с капельницей и стаканчик со взвесью Cu(OH)₂ и пипеткой ──
  function buildReagents(svg, d, defs, uid) {
    // Капельница: кончик в (0, 0), стеклянная трубка с бесцветным раствором, чёрная груша
    tools.tollens.fill = s('rect', { x: -1.8, y: -34, width: 3.6, height: 30, fill: '#eef2f7', 'fill-opacity': 0.9 });
    tools.tollens.node = s('g', {}, [
      s('rect', { x: -16, y: -112, width: 32, height: 118, fill: '#000', 'fill-opacity': 0 }), // зона захвата
      s('path', { d: 'M-1.1 0 L-3 -14 V-74 H3 V-14 L1.1 0 Z', fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.1 }),
      tools.tollens.fill,
      s('rect', { x: -12, y: -80, width: 24, height: 8, rx: 2, fill: '#1f2937' }),
      s('path', { d: 'M-8 -80 V-94 Q-10 -106 0 -110 Q10 -106 8 -94 V-80 Z', fill: d.lin([[0, '#111827'], [0.45, '#4b5563'], [1, '#111827']]) }),
    ]);
    // Пипетка: кончик в (0, 0), трубка с голубой взвесью, красная груша
    tools.cuoh.fill = s('rect', { x: -2, y: -46, width: 4, height: 42, fill: '#5aa6e0', 'fill-opacity': 0.95 });
    tools.cuoh.node = s('g', {}, [
      s('rect', { x: -16, y: -150, width: 32, height: 156, fill: '#000', 'fill-opacity': 0 }), // зона захвата
      s('path', { d: 'M-1.2 0 L-3.5 -18 V-112 H3.5 V-18 L1.2 0 Z', fill: '#f1f5f9', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.2 }),
      tools.cuoh.fill,
      s('rect', { x: -1.5, y: -104, width: 1.6, height: 80, rx: 0.8, fill: '#ffffff', 'fill-opacity': 0.8 }),
      s('path', { d: 'M-5.5 -110 V-128 Q-9 -134 -8 -142 Q-6 -152 0 -152 Q6 -152 8 -142 Q9 -134 5.5 -128 V-110 Z', fill: d.lin([[0, '#9f1239'], [0.4, '#f43f5e'], [1, '#881337']]), stroke: '#881337', 'stroke-width': 1 }),
    ]);
    tools.tollens.home = s('g');
    tools.cuoh.home = s('g');

    // Склянка тёмного стекла: аммиачный раствор оксида серебра разлагается на свету
    const bx = AG_BOTTLE.x;
    const bb = AG_BOTTLE.bottom;
    const agBottle = s('g', {}, [
      floorShadow(bx, bb + 3, 36, d),
      s('path', { d: `M${bx - 28} ${bb - 4} V${bb - 62} Q${bx - 28} ${bb - 72} ${bx - 11} ${bb - 76} V${bb - 86} H${bx + 11} V${bb - 76} Q${bx + 28} ${bb - 72} ${bx + 28} ${bb - 62} V${bb - 4} Q${bx + 28} ${bb} ${bx + 24} ${bb} H${bx - 24} Q${bx - 28} ${bb} ${bx - 28} ${bb - 4} Z`, fill: d.lin([[0, '#451a03'], [0.3, '#92400e'], [0.6, '#78350f'], [1, '#2a1002']]), stroke: '#1c0a00', 'stroke-width': 1 }),
      s('rect', { x: bx - 21, y: bb - 64, width: 4, height: 50, rx: 2, fill: '#ffffff', 'fill-opacity': 0.3 }),
      s('rect', { x: bx - 25, y: bb - 56, width: 50, height: 38, rx: 3, fill: '#ffffff', stroke: '#d6d3d1', 'stroke-width': 1 }),
      text(bx, bb - 46, 'Ag₂O', { size: 13, weight: 700, fill: '#475569' }),
      text(bx, bb - 28.5, 'NH₃', { size: 13, weight: 700, fill: '#475569' }),
    ]);
    svg.append(tools.tollens.home, agBottle);
    useByClick(agBottle, 'tollens');
    caption(svg, bx, 1, tr('аммиачный раствор Ag₂O'));

    // Стаканчик со свежеосаждённой голубой взвесью Cu(OH)₂
    const top = CUP.bottom - CUP.h;
    const cupPath = `M${CUP.x - CUP.w / 2} ${top} V${CUP.bottom - 10} Q${CUP.x - CUP.w / 2} ${CUP.bottom} ${CUP.x - CUP.w / 2 + 10} ${CUP.bottom} H${CUP.x + CUP.w / 2 - 10} Q${CUP.x + CUP.w / 2} ${CUP.bottom} ${CUP.x + CUP.w / 2} ${CUP.bottom - 10} V${top}`;
    const clip = `cup${uid}`;
    defs.append(s('clipPath', { id: clip }, [s('path', { d: cupPath })]));
    const cup = s('g', {}, [
      floorShadow(CUP.x, CUP.bottom + 3, CUP.w * 0.62, d),
      s('path', { d: cupPath, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      s('rect', { x: CUP.x - CUP.w / 2, y: CUP.bottom - 40, width: CUP.w, height: 40, fill: '#7db9e8', 'fill-opacity': 0.85, 'clip-path': `url(#${clip})` }),
      s('rect', { x: CUP.x - CUP.w / 2, y: CUP.bottom - 14, width: CUP.w, height: 14, fill: '#3b82c4', 'fill-opacity': 0.8, 'clip-path': `url(#${clip})` }),
      s('ellipse', { cx: CUP.x, cy: CUP.bottom - 40, rx: CUP.w / 2 - 2, ry: 4, fill: '#ffffff', 'fill-opacity': 0.5, 'clip-path': `url(#${clip})` }),
      tools.cuoh.home,
      s('rect', { x: CUP.x - 32, y: CUP.bottom - 70, width: 64, height: 22, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
      text(CUP.x, CUP.bottom - 58.5, 'Cu(OH)₂', { size: 13, weight: 700, fill: '#1d4ed8' }),
      s('path', { d: cupPath, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.2 }),
      s('path', { d: `M${CUP.x - CUP.w / 2} ${top} H${CUP.x + CUP.w / 2}`, stroke: '#cbd5e1', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    ]);
    svg.append(cup);
    useByClick(cup, 'cuoh');
    caption(svg, CUP.x, 2, tr('свежий Cu(OH)₂'));
  }

  // Капельница сидит в склянке, а пипетка — в стаканчике, и стекло посуды их закрывает: щелчок по самой
  // посуде тоже переносит инструмент к пробирке, иначе ученик промахивается мимо узкой трубки
  function useByClick(node, id) {
    node.style.cursor = 'pointer';
    node.addEventListener('pointerdown', (e) => {
      if (params[id] || tools[id].state !== 'rest') return;
      e.stopPropagation();
      tools[id].state = 'fly';
      set(id, 1);
    });
    touchTarget(node, 6);
  }

  // Подпись реактива с номером пробирки, в которую его добавляют
  function caption(svg, x, n, label) {
    svg.append(
      s('circle', { cx: x, cy: BENCH - 224, r: 12, fill: '#1e293b' }),
      text(x, BENCH - 223.5, String(n), { size: 14, weight: 700, fill: '#ffffff' }),
      text(x, BENCH - 199, label, { size: 13, weight: 600, fill: '#475569' }),
    );
  }

  function drawTubes(inAg, inCu) {
    // Пробирка 1: раствор темнеет от коллоидного серебра, затем на стенках нарастает зеркало
    const ag = shown.ag;
    const l1 = liquids[0];
    const y1 = inAg ? LEVEL.full : LEVEL.base;
    l1.liquid.setAttribute('y', y1);
    l1.liquid.setAttribute('height', TUBE.bottom - y1);
    l1.surface.setAttribute('y', y1);
    l1.liquid.setAttribute('fill', stopColor([[0, '#e8f1f6'], [0.1, '#d6d3d1'], [0.4, '#6b625c'], [1, '#57534e']], ag));
    mirror.setAttribute('opacity', clamp01((ag - 0.3) / 0.35).toFixed(3));

    // Пробирка 2: голубая взвесь меняет цвет, осадок собирается на дне
    const l2 = liquids[1];
    const y2 = inCu ? LEVEL.full : LEVEL.base;
    l2.liquid.setAttribute('y', y2);
    l2.liquid.setAttribute('height', TUBE.bottom - y2);
    l2.surface.setAttribute('y', y2);
    const color = mixHex(stopColor(CU_STOPS, shown.cu), '#1c1917', clamp01(shown.black * 1.6));
    const fresh = inCu ? 1 : 0;
    haze.setAttribute('fill', color);
    haze.setAttribute('opacity', (fresh * 0.85).toFixed(2));
    sediment.setAttribute('fill', shadeDark(color));
    sediment.setAttribute('opacity', fresh);
  }

  const shadeDark = (c) => mixHex(c, '#000000', 0.18);

  // ── Капельница и пипетка ──
  function updateTool(id, tool, dt) {
    if (!params[id] && tool.state !== 'rest' && tool.state !== 'drag') {
      // Реактив убран кнопкой «Новые пробирки» — инструмент снова полон и стоит в своей посуде
      tool.state = 'rest';
      Object.assign(tool.pos, tool.rest);
    }
    if (params[id] && (tool.state === 'rest' || tool.state === 'drag')) tool.state = 'fly';
    const p = tool.pos;
    if (tool.state === 'fly') {
      const k = Math.min(1, dt * 6);
      p.x += (tool.mouth.x - p.x) * k;
      p.y += (tool.mouth.y - p.y) * k;
      if (Math.hypot(p.x - tool.mouth.x, p.y - tool.mouth.y) < 2) {
        Object.assign(p, tool.mouth);
        tool.state = 'drip';
        tool.t = 0;
      }
    } else if (tool.state === 'drip') {
      // Три капли с интервалом падают на раствор в пробирке
      const before = Math.floor(tool.t / 0.22);
      tool.t += dt;
      const after = Math.floor(tool.t / 0.22);
      if (after > before && before < 3) {
        const free = drops.find((q) => !q.live);
        if (free) Object.assign(free, { x: tool.mouth.x, y: tool.mouth.y + 4, v: 0, stop: LEVEL.base, live: true, color: tool.color });
      }
      if (tool.t > 0.8) tool.state = 'back';
    } else if (tool.state === 'back') {
      const k = Math.min(1, dt * 5);
      p.x += (tool.rest.x - p.x) * k;
      p.y += (tool.rest.y - p.y) * k;
      if (Math.hypot(p.x - tool.rest.x, p.y - tool.rest.y) < 1) tool.state = 'used';
    } else if (tool.state === 'used' || tool.state === 'rest') {
      Object.assign(p, tool.rest);
    }
    // Использованный инструмент пустой
    const left = tool.state === 'drip' ? 1 - tool.t / 0.8 : tool.state === 'back' || tool.state === 'used' ? 0 : 1;
    const full = id === 'tollens' ? 30 : 42;
    tool.fill.setAttribute('height', (full * clamp01(left)).toFixed(1));
    tool.fill.setAttribute('y', (-4 - full * clamp01(left)).toFixed(1));
    tool.node.style.pointerEvents = tool.state === 'rest' || tool.state === 'drag' ? '' : 'none';
    if (!held.has(tool.node)) place(tool.node, tool.state === 'rest' || tool.state === 'used' ? tool.home : topLayer);
    tool.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  }

  function updateDrops(dt) {
    for (const q of drops) {
      if (!q.live) {
        q.c.setAttribute('opacity', 0);
        continue;
      }
      q.v += 900 * dt;
      q.y += q.v * dt;
      if (q.y >= q.stop - 2) q.live = false;
      q.c.setAttribute('cx', q.x);
      q.c.setAttribute('cy', q.y.toFixed(1));
      q.c.setAttribute('fill', q.color);
      q.c.setAttribute('opacity', q.live ? 1 : 0);
    }
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  // Взятый инструмент поднимаем наверх до того, как draggable() захватит указатель
  const held = new Set();
  for (const tool of Object.values(tools)) {
    tool.node.addEventListener('pointerdown', (e) => {
      if (tool.state !== 'rest') return;
      // Инструмент держат за ту точку, за которую взяли: смещение — от места нажатия, а не от первого движения
      const at = scene.point(e);
      grab.dx = tool.pos.x - at.x;
      grab.dy = tool.pos.y - at.y;
      held.add(tool.node);
      place(tool.node, topLayer);
    });
    const release = () => held.delete(tool.node);
    tool.node.addEventListener('pointerup', release);
    tool.node.addEventListener('pointercancel', release);
  }

  for (const [id, tool] of Object.entries(tools)) {
    let moved = false;
    draggable(scene, tool.node, {
      onDrag(x, y) {
        if (tool.state !== 'rest' && tool.state !== 'drag') return;
        if (tool.state === 'rest') {
          tool.state = 'drag';
          moved = false;
        }
        moved = moved || Math.hypot(x + grab.dx - tool.rest.x, y + grab.dy - tool.rest.y) > 6;
        tool.pos.x = Math.max(20, Math.min(940, x + grab.dx));
        tool.pos.y = Math.max(60, Math.min(BENCH - 4, y + grab.dy));
      },
      onEnd() {
        const wasMoved = moved;
        moved = false;
        if (tool.state !== 'drag' && tool.state !== 'rest') return;
        // Кончик поднесён к своей пробирке (над горлышком или уже в ней) — реактив капает в неё.
        // Щелчок без перетаскивания делает то же: на телефоне инструмент пальцем не перенести
        const near = Math.abs(tool.pos.x - tool.mouth.x) < 40 && tool.pos.y > TUBE.top - 90 && tool.pos.y < TUBE.bottom - 20;
        if (near || !wasMoved) {
          tool.state = 'fly';
          set(id, 1);
        } else {
          tool.state = 'rest';
          Object.assign(tool.pos, tool.rest);
        }
      },
    });
  }

  // Ручка плитки: ведём мышью влево-вправо — меняется температура бани (шаг 5 °C, как у регулятора)
  draggable(scene, knob, {
    onDrag: (x) => set('T', 20 + Math.round(Math.max(0, Math.min(1, (x - (KNOB.x - 100)) / 200)) * 16) * 5),
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
