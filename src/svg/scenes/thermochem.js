// Сцена «Тепловой эффект растворения и нейтрализации»: химический стол. Слева — две банки
// с NaOH и NH₄NO₃, в центре — калориметр (стакан в теплоизолирующей рубашке, крышка
// с воронкой, термометром и мешалкой), справа — склянки с водой и соляной кислотой.
// Ученик сам ведёт опыт:
//   банку тащат к калориметру (или нажимают на неё) → навеска сыплется через воронку,
//   мешалка перемешивает, крупинки растворяются, термометр идёт вверх или вниз (add = 1, 2);
//   щелчок по склянке → в калориметр наливается свежая жидкость, и опыт с той же навеской
//   повторяется уже в ней (liquid = 0 / 1).
// Каждый опыт начинается со свежей жидкости при 20 °C, поэтому термометр сначала возвращается
// к 20 °C и только потом показывает тепловой эффект нового вещества.
// Горячий раствор парит над крышкой, холодный — рубашка запотевает.
// Числа на сцене не дублируются: температуру показывает сам термометр, остальное — панель показаний.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, shade, text } from '../kit.js';

const BENCH = 450;

const CAL = { x: 480, jacketTop: 196, jacketBottom: 432, innerTop: 208, innerBottom: 424 };
const PX = CAL.x - 52; // воронка в крышке — сюда высыпают вещество и наливают жидкость
const TX = CAL.x + 6; // термометр
const SX = CAL.x + 54; // мешалка
const FUNNEL_TOP = 150;
const LID = { top: 184, bottom: 200 };
const FLOOR = CAL.innerBottom - 4; // дно калориметра изнутри

const JARS = [110, 240]; // NaOH, NH₄NO₃ (add = 1, 2)
const BOTTLES = [770, 880]; // вода, соляная кислота (liquid = 0, 1)
const JAR_SCALE = 1.2; // банки рисуются в своих координатах и увеличиваются — иначе на телефоне этикетки не прочесть
const JAR_SPOUT = { x: 29 * JAR_SCALE, y: -86 * JAR_SCALE };
const BOTTLE_SPOUT = { x: -12, y: -152 };
const BOTTLE_POLY = [[-32, -4], [32, -4], [32, -100], [12, -124], [12, -150], [-12, -150], [-12, -124], [-32, -100]];
const BOTTLE_LEVEL = 74; // высота жидкости в склянке, px

// Длительности, с: склянку наливают, банку высыпают; дальше растворение и выход на температуру
const BOT_DUR = 0.9;
const JAR_DUR = 1.0;
const RISE = 1.3; // за это время после высыпания термометр выходит на новую температуру
const TAU = 0.4; // постоянная времени термометра вне опыта (например, при смене объёма без вещества)
const LIQUID_COLORS = ['#cfe8fb', '#dff1fb'];
const MAX_GRAINS = 40;

// Шкала термометра: 0…100 °C, 2,4 px на градус; деления 80 °C и ниже — под крышкой, в стакане
const yOfT = (T) => 400 - Math.max(-4, Math.min(102, T)) * 2.4;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const rot = (x, y, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};

// Генератор с фиксированным зерном: крупинки и капли лежат одинаково при каждом открытии сцены
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

// Поза сосуда при переливании: подлетает к воронке, наклоняется носиком к ней и возвращается.
// t — 0..1; в середине (0,3…0,7) сосуд держат наклонённым — в это время сыплется или льётся
function pourPose(home, spout, to, angle, t) {
  const at = (a) => {
    const r = rot(spout.x, spout.y, a);
    return { x: to.x - r.x, y: to.y - r.y, a };
  };
  const p = at(angle);
  if (t <= 0) return { ...home, a: 0 };
  if (t < 0.3) {
    const e = ease(t / 0.3);
    return { x: lerp(home.x, p.x, e), y: lerp(home.y, p.y, e) - Math.sin(e * Math.PI) * 40, a: lerp(0, angle, e) };
  }
  if (t < 0.7) return p;
  if (t < 1) {
    const e = ease((t - 0.7) / 0.3);
    return { x: lerp(p.x, home.x, e), y: lerp(p.y, home.y, e) - Math.sin(e * Math.PI) * 40, a: lerp(angle, 0, e) };
  }
  return { ...home, a: 0 };
}

export function thermochemScene(container, params, set, { temperature, SUBSTANCES, T0 }) {
  let liquidRect, liquidLine, column, stirrer, streamTop, streamLow, resetBtn, frostSheet;
  const jars = [];
  const bottles = [];
  const grains = [];
  const steam = [];
  const glows = { jars: [], acid: null };
  const drag = { jar: null, bottle: null };
  const pending = [];
  let shownT = temperature(params);
  let run = null;
  let clock = 0; // время кадра, с: опыт идёт по часам, а не по сумме dt — под нагрузкой кадры реже, но не медленнее
  const last = { add: params.add, liquid: params.liquid, m: params.m };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });

      // Мягкая подсветка того, с чем сейчас можно работать
      const glow = (cx, cy, rx, ry) => {
        const el = s('ellipse', { cx, cy, rx, ry, fill: d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
        svg.append(el);
        return el;
      };
      glows.jars = JARS.map((x) => glow(x, BENCH - 52, 54, 68));
      glows.acid = glow(BOTTLES[1], BENCH - 80, 52, 96);

      buildCalorimeter(svg, d);
      BOTTLES.forEach((x, k) => buildBottle(svg, d, x, k));
      JARS.forEach((x, k) => buildJar(svg, d, x, k + 1));

      // Струя жидкости: из горлышка склянки в воронку и из трубки воронки в калориметр
      streamTop = s('path', { fill: 'none', stroke: '#93c5fd', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
      svg.append(streamTop);

      // Кнопка нового опыта — в свободном левом верхнем углу
      resetBtn = s('g', { opacity: 0, transform: 'translate(0 -80)' }, [
        s('rect', { x: 20, y: 104, width: 170, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M49.4 117.6 A9 9 0 1 0 50.8 128.5 M49.4 110.6 V117.6 H42.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(118, 124, tr('Новый опыт'), { size: 15, weight: 600, fill: '#1e293b' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (resetBtn.getAttribute('opacity') === '0') return;
        e.stopPropagation();
        set('add', 0);
        set('liquid', 0);
      });
      svg.append(resetBtn);
    },

    frame(dt, now) {
      clock = now;
      detectChanges();
      if (run) {
        run.t = clock - run.start;
        if (run.t > run.end) run = null;
      }
      const Tf = temperature(params);
      // Пока навеска не высыпана, в калориметре свежая жидкость при 20 °C
      const dissolving = run && run.jar && run.t >= run.ds;
      if (dissolving) {
        // Выход на новую температуру — за конечное время RISE: к концу опыта табло показывает
        // ровно то значение, что и показания модели, без «хвоста» экспоненты в последнем знаке
        run.from ??= shownT;
        shownT = lerp(run.from, Tf, ease(seg(run.t, run.ds, run.ds + RISE)));
      } else {
        const target = run && run.jar ? T0 : Tf;
        shownT += (target - shownT) * Math.min(1, dt * (run ? 6 : 1 / TAU));
      }

      drawLiquid(now);
      drawThermometer();
      drawStirrer(now);
      drawGrains();
      drawVessels();
      drawSteamAndFrost(dt);

      const pulse = 0.55 + 0.3 * Math.sin(now * 4);
      glows.jars.forEach((g) => g.setAttribute('opacity', !run && !params.add && !drag.jar ? pulse : 0));
      glows.acid.setAttribute('opacity', !run && params.add === 1 && !params.liquid && !drag.bottle ? pulse : 0);
      const dirty = params.add || params.liquid;
      resetBtn.setAttribute('opacity', dirty ? 1 : 0);
      resetBtn.style.pointerEvents = dirty ? '' : 'none';
    },
  });

  // Новый опыт: сначала (если нужно) наливают свежую жидкость, затем высыпают навеску
  function startRun({ bottle = null, jar = null }) {
    const tj = bottle === null ? 0 : BOT_DUR;
    const ds = tj + JAR_DUR * 0.65;
    run = { t: 0, start: clock, bottle, jar, tj, ds, end: jar ? ds + 2.6 : BOT_DUR, hands: jar ? tj + JAR_DUR : BOT_DUR };
  }

  // Посуду не берут, пока предыдущая банка или склянка ещё в руках; пока мешалка
  // доводит раствор, можно начинать следующий опыт — иначе щелчок «пропадает» на 2–3 с
  const busy = () => run && run.t < run.hands;

  // Параметры меняют и сцена, и регуляторы, и шаги работы — опыт запускаем по факту изменения
  function detectChanges() {
    if (params.liquid !== last.liquid) startRun({ bottle: params.liquid, jar: params.add || null });
    else if (params.add !== last.add) startRun({ jar: params.add || null });
    // Другая навеска при уже высыпанном веществе — это новый опыт с новой порцией
    else if (params.add && params.m !== last.m) startRun({ jar: params.add });
    Object.assign(last, { add: params.add, liquid: params.liquid, m: params.m });
  }

  function buildCalorimeter(svg, d) {
    const { x, jacketTop, jacketBottom, innerTop, innerBottom } = CAL;
    const cid = `tc${Math.random().toString(36).slice(2)}`;
    const jacket = `M${x - 104} ${jacketTop} V${jacketBottom - 16} Q${x - 104} ${jacketBottom} ${x - 88} ${jacketBottom} H${x + 88} Q${x + 104} ${jacketBottom} ${x + 104} ${jacketBottom - 16} V${jacketTop}`;
    const inner = `M${x - 78} ${innerTop} V${innerBottom - 14} Q${x - 78} ${innerBottom} ${x - 64} ${innerBottom} H${x + 64} Q${x + 78} ${innerBottom} ${x + 78} ${innerBottom - 14} V${innerTop}`;
    liquidRect = s('rect', { x: x - 80, y: innerBottom, width: 160, height: 0, fill: LIQUID_COLORS[0], 'fill-opacity': 0.85 });
    liquidLine = s('rect', { x: x - 80, y: innerBottom, width: 160, height: 2.5, fill: '#ffffff', 'fill-opacity': 0.8 });
    const shadeRect = s('rect', { x: x - 80, y: innerTop, width: 160, height: innerBottom - innerTop, fill: d.lin([[0, '#0f172a', 0.16], [0.3, '#ffffff', 0.1], [0.7, '#ffffff', 0], [1, '#0f172a', 0.2]]) });
    const grainLayer = s('g', { 'pointer-events': 'none' });

    svg.append(
      floorShadow(x, BENCH + 3, 130, d),
      // Подставка калориметра с табличкой
      s('rect', { x: x - 118, y: jacketBottom, width: 236, height: BENCH - jacketBottom, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: x - 118, y: jacketBottom, width: 236, height: 2, fill: '#94a3b8', 'fill-opacity': 0.6 }),
      text(x, jacketBottom + 9.5, tr('калориметр'), { size: 13, weight: 600, fill: '#e2e8f0' }),
      // Теплоизолирующая рубашка: матовое стекло с воздушной прослойкой
      s('path', { d: `${jacket} Z`, fill: d.lin([[0, '#e2e8f0', 0.75], [0.25, '#f8fafc', 0.45], [0.75, '#f1f5f9', 0.4], [1, '#cbd5e1', 0.75]]) }),
      s('clipPath', { id: cid }, [s('path', { d: `${inner} Z` })]),
      s('path', { d: `${inner} Z`, fill: d.lin([[0, '#dbe4ef', 0.6], [0.5, '#f8fafc', 0.3], [1, '#cbd5e1', 0.6]]) }),
      s('g', { 'clip-path': `url(#${cid})`, 'pointer-events': 'none' }, [liquidRect, shadeRect, liquidLine]),
    );
    svg.append(grainLayer);
    for (let i = 0; i < MAX_GRAINS; i++) {
      const el = s('rect', { width: 5, height: 5, rx: 2.5, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.8, opacity: 0 });
      grainLayer.append(el);
      grains.push(el);
    }

    // Термометр: шкала на молочной пластинке, капилляр со спиртом (красный), резервуар у дна
    const scale = s('g', { 'pointer-events': 'none' }, [
      s('rect', { x: TX - 40, y: 148, width: 46, height: 262, rx: 5, fill: '#ffffff', 'fill-opacity': 0.82, stroke: '#cbd5e1', 'stroke-width': 1 }),
    ]);
    for (let T = 0; T <= 100; T += 5) {
      const y = yOfT(T);
      scale.append(s('line', { x1: TX - (T % 10 ? 9 : 14), x2: TX - 5, y1: y, y2: y, stroke: '#475569', 'stroke-width': T % 10 ? 1 : 1.6 }));
      if (T % 20 === 0) scale.append(text(TX - 17, y, String(T), { size: 13, weight: 600, fill: '#1e293b', anchor: 'end' }));
    }
    column = s('rect', { x: TX - 2, y: 300, width: 4, height: 100, fill: '#dc2626' });
    svg.append(
      scale,
      s('rect', { x: TX - 6, y: 96, width: 12, height: 312, rx: 6, fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.5 }),
      column,
      s('circle', { cx: TX, cy: 410, r: 9, fill: '#f8fafc', 'fill-opacity': 0.5, stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('circle', { cx: TX, cy: 410, r: 7, fill: '#dc2626' }),
      s('rect', { x: TX - 3.5, y: 100, width: 2, height: 300, rx: 1, fill: '#ffffff', 'fill-opacity': 0.8 }),
      text(TX - 17, 136, '°C', { size: 13, weight: 700, fill: '#334155', anchor: 'end' }),
    );

    // Мешалка: стеклянная палочка с кольцом на конце, ходит вверх-вниз при перемешивании
    stirrer = s('g', { 'pointer-events': 'none' }, [
      s('line', { x1: SX, y1: 0, x2: SX, y2: 290, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-opacity': 0.9 }),
      s('line', { x1: SX - 1, y1: 2, x2: SX - 1, y2: 288, stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-opacity': 0.9 }),
      s('ellipse', { cx: SX - 10, cy: 290, rx: 20, ry: 5, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 4 }),
      s('circle', { cx: SX, cy: 0, r: 6, fill: d.rad(['#f8fafc', '#94a3b8']), stroke: '#94a3b8' }),
    ]);
    svg.append(stirrer);

    // Передние стенки: внутренний стакан и рубашка
    svg.append(
      s('path', { d: inner, fill: 'none', stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      s('rect', { x: x - 70, y: innerTop + 18, width: 7, height: innerBottom - innerTop - 48, rx: 3.5, fill: '#ffffff', 'fill-opacity': 0.6 }),
      s('path', { d: jacket, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      s('rect', { x: x - 96, y: jacketTop + 14, width: 8, height: jacketBottom - jacketTop - 40, rx: 4, fill: '#ffffff', 'fill-opacity': 0.7 }),
    );

    // Холодная рубашка запотевает — ровная матовая плёнка, без россыпи капель
    frostSheet = s('path', { d: `${jacket} Z`, fill: '#e0f2fe', opacity: 0, 'pointer-events': 'none' });
    svg.append(frostSheet);

    // Крышка с отверстиями и воронкой для навески
    svg.append(
      s('rect', { x: x - 112, y: LID.top, width: 224, height: LID.bottom - LID.top, rx: 5, fill: d.lin([[0, '#64748b'], [0.4, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: x - 110, y: LID.top + 1.5, width: 220, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.25 }),
      s('ellipse', { cx: TX, cy: LID.top + 1, rx: 9, ry: 3, fill: '#0f172a' }),
      s('ellipse', { cx: SX, cy: LID.top + 1, rx: 7, ry: 2.5, fill: '#0f172a' }),
      s('path', { d: `M${PX - 24} ${FUNNEL_TOP} L${PX - 6} ${LID.top - 4} V${CAL.innerTop + 24} H${PX + 6} V${LID.top - 4} L${PX + 24} ${FUNNEL_TOP} Z`, fill: d.lin([[0, '#dbe4ef', 0.6], [0.5, '#f8fafc', 0.25], [1, '#cbd5e1', 0.6]]), stroke: '#94a3b8', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      s('path', { d: `M${PX - 24} ${FUNNEL_TOP} H${PX + 24}`, stroke: '#cbd5e1', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      s('path', { d: `M${PX - 16} ${FUNNEL_TOP + 5} L${PX - 5} ${LID.top - 8}`, stroke: '#ffffff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-opacity': 0.7 }),
    );
    // Струя из трубки воронки — под крышкой, в стакане
    streamLow = s('path', { fill: 'none', stroke: '#93c5fd', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
    svg.append(streamLow);

    // Пар над горячим раствором — поднимается из отверстий крышки
    for (let i = 0; i < 8; i++) {
      const el = s('ellipse', { rx: 6, ry: 8, fill: '#e2e8f0', opacity: 0, 'pointer-events': 'none' });
      svg.append(el);
      steam.push({ el, k: i / 8, x0: [PX, TX + 14, SX][i % 3] + ((i * 7) % 11) - 5 });
    }
  }

  // Банка с веществом: стекло, белое содержимое, этикетка с формулой
  function buildJar(svg, d, x, k) {
    const sub = SUBSTANCES[k];
    const r = rng(20 + k);
    const content = s('g', {}, [s('rect', { x: -27, y: -62, width: 54, height: 58, rx: 6, fill: d.lin([[0, shade(sub.color, -0.12)], [0.4, sub.color], [1, shade(sub.color, -0.2)]]) })]);
    for (let i = 0; i < 26; i++) {
      const gx = -24 + r() * 48;
      const gy = -60 + r() * 52;
      content.append(s('ellipse', { cx: gx, cy: gy, rx: k === 1 ? 3.6 : 2.4, ry: k === 1 ? 2.2 : 2.4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 0.7 }));
    }
    const g = s('g', {}, [
      s('rect', { x: -40, y: -96, width: 80, height: 100, fill: '#ffffff', 'fill-opacity': 0 }), // зона захвата
      floorShadow(0, 3, 40, d),
      s('path', { d: 'M-31 -76 V-8 Q-31 0 -23 0 H23 Q31 0 31 -8 V-76 Z', fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      content,
      s('path', { d: 'M-31 -76 V-8 Q-31 0 -23 0 H23 Q31 0 31 -8 V-76 Q31 -80 24 -80 V-86 H-24 V-80 Q-31 -80 -31 -76 Z', fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      s('rect', { x: -26, y: -88, width: 52, height: 6, rx: 3, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.2 }),
      s('rect', { x: -27, y: -50, width: 54, height: 24, rx: 3, fill: '#fffbeb', stroke: '#d6d3d1', 'stroke-width': 1 }),
      text(0, -37.5, sub.formula, { size: k === 2 ? 13 : 15, weight: 700, fill: '#1e293b' }),
      s('rect', { x: -25, y: -70, width: 5, height: 58, rx: 2.5, fill: '#ffffff', 'fill-opacity': 0.6 }),
    ]);
    jars.push({ g, x, k });
    svg.append(g);
    // Сцена ещё строится — перетаскивание подключаем после createScene
    pending.push(() => draggable(scene, g, {
      onDrag(px, py) {
        if (busy()) return;
        drag.jar = { k, x: Math.max(40, Math.min(920, px)), y: Math.max(140, Math.min(BENCH, py + 52)) };
      },
      onEnd() {
        const at = drag.jar;
        drag.jar = null;
        if (busy()) return;
        // Щелчок без перетаскивания тоже высыпает навеску — на телефоне так проще
        if (!at || (Math.abs(at.x - CAL.x) < 160 && at.y < BENCH + 5)) addSubstance(k);
      },
    }));
  }

  // Склянка с жидкостью: узкое горло, этикетка; жидкость остаётся горизонтальной при наклоне
  function buildBottle(svg, d, x, k) {
    const cid = `tb${Math.random().toString(36).slice(2)}`;
    const body = 'M-34 -100 V-10 Q-34 0 -24 0 H24 Q34 0 34 -10 V-100 Q34 -110 22 -118 L13 -126 V-152 H-13 V-126 L-22 -118 Q-34 -110 -34 -100 Z';
    const surf = s('rect', { x: -400, y: 0, width: 800, height: 800, fill: LIQUID_COLORS[k], 'fill-opacity': 0.85 });
    const line = s('rect', { x: -400, y: 0, width: 800, height: 2, fill: '#ffffff', 'fill-opacity': 0.8 });
    const counter = s('g', {}, [surf, line]);
    const stopper = s('g', {}, [
      s('rect', { x: -10, y: -164, width: 20, height: 14, rx: 3, fill: d.lin([[0, '#cbd5e1'], [0.4, '#f8fafc'], [1, '#94a3b8']]), stroke: '#94a3b8', 'stroke-width': 1 }),
      s('rect', { x: -15, y: -170, width: 30, height: 8, rx: 4, fill: d.lin([[0, '#cbd5e1'], [0.4, '#f8fafc'], [1, '#94a3b8']]), stroke: '#94a3b8', 'stroke-width': 1 }),
    ]);
    const label = k ? 'HCl 10 %' : 'H₂O';
    const g = s('g', {}, [
      s('rect', { x: -44, y: -176, width: 88, height: 180, fill: '#ffffff', 'fill-opacity': 0 }), // зона захвата
      floorShadow(0, 3, 44, d),
      s('clipPath', { id: cid }, [s('path', { d: body })]),
      s('path', { d: body, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      s('g', { 'clip-path': `url(#${cid})` }, [counter]),
      s('path', { d: body, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      s('rect', { x: -16, y: -154, width: 32, height: 6, rx: 3, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.2 }),
      s('rect', { x: -31, y: -76, width: 62, height: 30, rx: 3, fill: k ? '#fef2f2' : '#f0f9ff', stroke: k ? '#fca5a5' : '#93c5fd', 'stroke-width': 1.2 }),
      text(0, -60.5, label, { size: k ? 13 : 15, weight: 700, fill: k ? '#991b1b' : '#1e3a8a' }),
      s('rect', { x: -27, y: -96, width: 6, height: 84, rx: 3, fill: '#ffffff', 'fill-opacity': 0.6 }),
      stopper,
    ]);
    const b = { g, x, k, counter, surf, line, stopper, pose: { x, y: BENCH, a: 0 } };
    bottles.push(b);
    svg.append(g);
    pending.push(() => draggable(scene, g, {
      onDrag(px, py) {
        if (busy()) return;
        drag.bottle = { k, x: Math.max(40, Math.min(920, px)), y: Math.max(200, Math.min(BENCH, py + 80)) };
      },
      onEnd() {
        const at = drag.bottle;
        drag.bottle = null;
        if (busy()) return;
        if (!at || (Math.abs(at.x - CAL.x) < 180 && at.y < BENCH + 5)) pourLiquid(k);
      },
    }));
  }

  function addSubstance(k) {
    // Та же банка ещё раз — повторяем опыт со свежей жидкостью; другая — меняем вещество
    if (params.add === k) startRun({ jar: k });
    else set('add', k);
  }

  function pourLiquid(k) {
    if (params.liquid === k) startRun({ bottle: k, jar: params.add || null });
    else set('liquid', k);
  }

  const liquidLevel = () => 127; // высота столба 100 мл жидкости в стакане, px

  function drawLiquid(now) {
    let level = liquidLevel();
    if (run && run.bottle !== null) level *= seg(run.t / BOT_DUR, 0.32, 0.8);
    const stir = run && run.jar && run.t > run.ds - 0.2 ? Math.sin(now * 9) * 1.2 : 0;
    const y = CAL.innerBottom - level + stir;
    liquidRect.setAttribute('y', y.toFixed(1));
    liquidRect.setAttribute('height', (level + 4).toFixed(1));
    liquidRect.setAttribute('fill', LIQUID_COLORS[params.liquid]);
    liquidLine.setAttribute('y', (y - 1).toFixed(1));
    liquidLine.setAttribute('opacity', level > 2 ? 1 : 0);
  }

  function drawThermometer() {
    const y = yOfT(shownT);
    column.setAttribute('y', y.toFixed(1));
    column.setAttribute('height', (408 - y).toFixed(1));
  }

  function drawStirrer(now) {
    const active = run && run.jar && run.t > run.ds - 0.2;
    const bob = active ? (1 - Math.cos(now * 9)) * 18 : 0;
    // Кольцо мешалки у дна; палочка выходит из крышки
    stirrer.setAttribute('transform', `translate(0 ${(118 - bob).toFixed(1)})`);
  }

  // Крупинки навески: падают через воронку, тонут и растворяются. Положение считается по времени
  // опыта, поэтому сцена не хранит состояние каждой крупинки
  function drawGrains() {
    const n = run && run.jar ? Math.min(MAX_GRAINS, Math.round(params.m * 4)) : 0;
    const surface = CAL.innerBottom - liquidLevel();
    const kind = run?.jar ?? 0;
    grains.forEach((el, i) => {
      if (i >= n) {
        el.setAttribute('opacity', 0);
        return;
      }
      const h = ((i * 0.6180339887) % 1);
      const release = run.tj + JAR_DUR * (0.33 + 0.33 * (i / n));
      const tau = run.t - release;
      if (tau < 0) {
        el.setAttribute('opacity', 0);
        return;
      }
      const y0 = FUNNEL_TOP + 6;
      const g = 1500;
      const tSurf = Math.sqrt((2 * (surface - y0)) / g);
      const xf = CAL.x - 66 + h * 52 + (i % 3) * 14;
      const yf = FLOOR - 2 - ((i * 7) % 5);
      let x;
      let y;
      if (tau < tSurf) {
        y = y0 + 0.5 * g * tau * tau;
        x = PX + (h - 0.5) * 18 * clamp01(1 - (y - y0) / 30);
      } else {
        const k = clamp01(((tau - tSurf) * 160) / Math.max(1, yf - surface));
        y = lerp(surface, yf, k);
        x = lerp(PX, xf, ease(k));
      }
      // Растворение: крупинки на дне уменьшаются и исчезают
      const size = 1 - seg(run.t, run.ds + 0.25 + h * 0.3, run.ds + 1.3 + h * 0.5);
      const w = kind === 1 ? 7 : 5;
      const hh = kind === 1 ? 4 : 5;
      el.setAttribute('width', (w * size).toFixed(2));
      el.setAttribute('height', (hh * size).toFixed(2));
      el.setAttribute('rx', ((hh * size) / 2).toFixed(2));
      el.setAttribute('x', (x - (w * size) / 2).toFixed(1));
      el.setAttribute('y', (y - (hh * size) / 2).toFixed(1));
      el.setAttribute('opacity', size > 0.05 ? 1 : 0);
    });
  }

  function drawVessels() {
    let streaming = false;
    // Банки: перетаскиваемая — под пальцем, высыпающая — летит к воронке, остальные стоят
    for (const j of jars) {
      let p = { x: j.x, y: BENCH, a: 0 };
      if (drag.jar?.k === j.k) p = { x: drag.jar.x, y: drag.jar.y, a: 0 };
      else if (run?.jar === j.k) p = pourPose({ x: j.x, y: BENCH }, JAR_SPOUT, { x: PX + 4, y: FUNNEL_TOP - 4 }, 112, (run.t - run.tj) / JAR_DUR);
      j.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.a.toFixed(1)}) scale(${JAR_SCALE})`);
    }
    for (const b of bottles) {
      let p = { x: b.x, y: BENCH, a: 0 };
      let share = 1;
      if (drag.bottle?.k === b.k) p = { x: drag.bottle.x, y: drag.bottle.y, a: 0 };
      else if (run && run.bottle === b.k) {
        const t = run.t / BOT_DUR;
        p = pourPose({ x: b.x, y: BENCH }, BOTTLE_SPOUT, { x: PX + 6, y: FUNNEL_TOP - 6 }, -108, t);
        share = 1 - 0.25 * seg(t, 0.3, 0.7);
        if (t > 0.32 && t < 0.7) {
          streaming = true;
          const r = rot(BOTTLE_SPOUT.x, BOTTLE_SPOUT.y, p.a);
          const m = { x: p.x + r.x, y: p.y + r.y };
          streamTop.setAttribute('d', `M${m.x.toFixed(1)} ${m.y.toFixed(1)} Q ${(m.x - 4).toFixed(1)} ${(m.y + 14).toFixed(1)} ${PX + 2} ${FUNNEL_TOP + 14}`);
          streamTop.setAttribute('stroke', shade(LIQUID_COLORS[b.k], -0.25));
          const surface = CAL.innerBottom - liquidLevel() * seg(t, 0.32, 0.8);
          streamLow.setAttribute('d', `M${PX} ${CAL.innerTop + 26} V${surface.toFixed(1)}`);
          streamLow.setAttribute('stroke', shade(LIQUID_COLORS[b.k], -0.25));
        }
      }
      b.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.a.toFixed(1)})`);
      b.stopper.setAttribute('opacity', run && run.bottle === b.k ? 0 : 1);
      setBottleFill(b, p.a, share);
    }
    streamTop.setAttribute('opacity', streaming ? 0.85 : 0);
    streamLow.setAttribute('opacity', streaming ? 0.85 : 0);
  }

  // Уровень в наклонённой склянке ищется по площади жидкости — поверхность всегда горизонтальна
  function setBottleFill(b, a, share) {
    const area = areaBelow(BOTTLE_POLY, -BOTTLE_LEVEL) * share;
    const pts = BOTTLE_POLY.map(([x, y]) => rot(x, y, a)).map((q) => [q.x, q.y]);
    let lo = Math.min(...pts.map((q) => q[1]));
    let hi = Math.max(...pts.map((q) => q[1]));
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (areaBelow(pts, mid) > area) lo = mid;
      else hi = mid;
    }
    b.counter.setAttribute('transform', `rotate(${(-a).toFixed(2)})`);
    b.surf.setAttribute('y', hi.toFixed(1));
    b.line.setAttribute('y', (hi - 1).toFixed(1));
  }

  function drawSteamAndFrost(dt) {
    const hot = clamp01((shownT - 40) / 30);
    for (const p of steam) {
      p.k = (p.k + dt * 0.45) % 1;
      p.el.setAttribute('cx', (p.x0 + Math.sin(p.k * 7 + p.x0) * 6).toFixed(1));
      p.el.setAttribute('cy', (LID.top - 6 - p.k * 80).toFixed(1));
      p.el.setAttribute('rx', (5 + p.k * 12).toFixed(1));
      p.el.setAttribute('ry', (7 + p.k * 10).toFixed(1));
      p.el.setAttribute('opacity', (hot * 0.6 * Math.sin(Math.PI * p.k)).toFixed(2));
    }
    // Конденсат появляется, когда раствор заметно холоднее комнаты
    const cold = clamp01((17 - shownT) / 6);
    frostSheet.setAttribute('opacity', (cold * 0.45).toFixed(2));
  }

  pending.forEach((fn) => fn());
  scene.svg.style.userSelect = 'none';
  return scene;
}
