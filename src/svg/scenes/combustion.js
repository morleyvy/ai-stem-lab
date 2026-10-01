// Сцена «Горение под колпаком»: химический стол. Слева — штатив с лапкой, которая держит стеклянный
// колпак (банку без дна с делениями на пять равных частей) над широким кристаллизатором с водой.
// На воде плавает пробковый поплавок со свечой или с фарфоровой чашечкой красного фосфора.
// Колпак — единственный прибор на столе: числа опыта показывает панель показаний под сценой.
//   щелчок по колпаку или рывок вниз → вещество загорается, колпак опускается в воду (burn = 1);
//   пламя слабеет и гаснет, вода под колпаком поднимается; фосфор наполняет колпак белым дымом,
//   который растворяется в воде;
//   смена объёма колпака или вещества при опущенном колпаке → колпак поднимается и опыт повторяется.
// Время горения идёт в 15 раз быстрее настоящего.

import { tr } from '../../i18n.js';
import { createScene, cylinderShade, draggable, floorShadow, room, s, text } from '../kit.js';

const BENCH = 450;

const TROUGH = { x: 480, half: 190, top: 330 }; // кристаллизатор
const WATER_Y = 360; // уровень воды в кристаллизаторе
const RIM_DOWN = 400; // нижний край опущенного колпака — под водой
const LIFT = 84; // насколько поднят колпак до опыта: край над поплавком
const STAND_X = 242;
const SPEED = 15; // во сколько раз быстрее настоящего идёт горение на сцене
const DUR = { lift: 0.4, lower: 0.5, cool: [0.7, 1.4] }; // с, остывание: свеча / фосфор

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => k * k * (3 - 2 * k);

// Размер колпака по объёму: высота воздушного столба над водой и ширина. Объём рисунка
// растёт не строго пропорционально, но на глаз большой колпак заметно больше маленького.
function jarGeom(V) {
  const h = 60 + 54 * V;
  const w = 80 + 24 * V;
  return { h, w, top: WATER_Y - h };
}

export function combustionScene(container, params, set, { burnTime, risePct }) {
  let smokeFog, smokePuffs, smokeGlow;
  let jar, jarBackG, floatG, jarClip, jarBack, jarGlass, jarHi, jarKnob, innerWater, innerLine, smokeRect, marks;
  let arm, armClamp, candle, cup, flame, flameGlow, pFlame, wisps;
  let resetBtn, jarGlow;

  // Что сейчас показано на сцене: колпак рисуется по своему объёму и веществу, пока не поднят
  const st = { V: params.V, fuel: params.fuel, pos: 0, key: null, el: 0, level: 0, smoke: 0, flame: 0 };
  const drag = { jar: null };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH });

      // Подсветка колпака, пока опыт не начат: сразу видно, куда нажимать
      jarGlow = s('ellipse', { cx: TROUGH.x, cy: 230, rx: 120, ry: 150, fill: d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
      svg.append(jarGlow);

      buildStand(svg, d);
      buildTroughBack(svg, d);
      buildJar(svg, d);
      buildTroughFront(svg, d);
      // Подписи делений — поверх стенки кристаллизатора: у малых колпаков 1/5 приходится на его край
      svg.append(marks);
      buildArm(svg, d);

      // Новый опыт: колпак поднимается, под ним снова воздух
      resetBtn = s('g', { opacity: 0 }, [
        s('rect', { x: 720, y: 104, width: 184, height: 40, rx: 10, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5, filter: d.url('soft') }),
        s('path', { d: 'M753.4 117.6 A9 9 0 1 0 754.8 128.5 M753.4 110.6 V117.6 H746.4', fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(826, 124, tr('Новый опыт'), { size: 15, weight: 600, fill: '#1e293b' }),
      ]);
      resetBtn.style.cursor = 'pointer';
      resetBtn.addEventListener('pointerdown', (e) => {
        if (resetBtn.getAttribute('opacity') === '0') return;
        e.stopPropagation();
        set('burn', 0);
      });
      svg.append(resetBtn);
    },

    frame(dt, now) {
      advance(dt);
      drawJar(now);

      const pulse = 0.55 + 0.3 * Math.sin(now * 4);
      jarGlow.setAttribute('opacity', !params.burn && !drag.jar ? pulse : 0);
      const resettable = Boolean(params.burn);
      resetBtn.setAttribute('opacity', resettable ? 1 : 0);
      resetBtn.style.pointerEvents = resettable ? '' : 'none';
    },
  });

  // ---------- Ход опыта ----------
  // Колпак поднят → (щелчок) вещество зажжено, колпак опускается → горит → гаснет → остывает, вода поднимается.
  // При смене объёма или вещества во время опыта колпак сначала поднимается, и опыт идёт заново.
  function advance(dt) {
    const want = params.burn ? `${params.V}|${params.fuel}` : null;
    if (st.key !== want) {
      if (st.pos > 0) {
        // Поднимаем колпак: газ под ним снова заменяется воздухом, вода опускается
        st.pos = Math.max(0, st.pos - dt / DUR.lift);
        st.level = Math.max(0, st.level - dt / DUR.lift);
        st.smoke = Math.max(0, st.smoke - dt / DUR.lift);
        st.flame = 0;
        return;
      }
      st.key = want;
      st.el = 0;
      st.V = params.V;
      st.fuel = params.fuel;
      st.level = 0;
      st.smoke = 0;
      st.flame = 0;
      if (!want) return;
    }
    if (!st.key) {
      // До опыта колпак сразу показывает выбранный объём и вещество
      st.V = params.V;
      st.fuel = params.fuel;
      return;
    }
    st.el += dt;
    const p = { V: st.V, fuel: st.fuel, burn: 1 };
    const T = burnTime(p);
    const burnReal = T / SPEED;
    const cool = DUR.cool[st.fuel];
    const tLower = clamp01(st.el / DUR.lower);
    const tBurn = clamp01((st.el - DUR.lower) / burnReal);
    const tCool = clamp01((st.el - DUR.lower - burnReal) / cool);
    st.pos = ease(tLower);
    // Свеча слабеет по мере того, как кислорода становится меньше; фосфор горит ярко до конца
    st.flame = tBurn < 1 ? (st.fuel ? 1 : 0.45 + 0.55 * (1 - tBurn)) : 0;
    // Вода поднимается в основном после того, как газ под колпаком остыл
    const final = risePct(p) / 100;
    st.level = final * (0.35 * tBurn + 0.65 * ease(tCool));
    // Белый дым оксида фосфора наполняет колпак и растворяется в воде при остывании
    st.smoke = st.fuel ? Math.min(1, tBurn * 3) * (1 - ease(tCool)) : 0;
  }

  // ---------- Штатив, кристаллизатор, поплавок ----------
  function buildStand(svg, d) {
    svg.append(
      floorShadow(STAND_X, BENCH + 3, 56, d),
      s('rect', { x: STAND_X - 46, y: BENCH - 12, width: 92, height: 12, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
      s('rect', { x: STAND_X - 4, y: 26, width: 8, height: BENCH - 38, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
    );
  }

  function buildTroughBack(svg, d) {
    const { x, half, top } = TROUGH;
    svg.append(
      floorShadow(x, BENCH + 4, half + 20, d, 12),
      // Задняя стенка стекла и толща воды за колпаком
      s('rect', { x: x - half, y: top, width: half * 2, height: BENCH - top - 2, rx: 10, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
      s('rect', { x: x - half + 3, y: WATER_Y, width: half * 2 - 6, height: BENCH - WATER_Y - 5, rx: 8, fill: d.lin([[0, '#bae6fd', 0.75], [1, '#7dd3fc', 0.8]], 'v') }),
      s('ellipse', { cx: x, cy: WATER_Y, rx: half - 4, ry: 6, fill: '#e0f2fe', 'fill-opacity': 0.9, stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 1.5 }),
    );
  }

  // Пробковый поплавок: на нём свеча или фарфоровая чашечка с красным фосфором
  function buildFloat(svg, d) {
    const x = TROUGH.x;
    const y = WATER_Y;
    candle = s('g', {}, [
      s('rect', { x: x - 10, y: y - 30, width: 20, height: 26, rx: 3, fill: d.lin([[0, '#e7e5e4'], [0.35, '#ffffff'], [1, '#d6d3d1']]) }),
      s('ellipse', { cx: x, cy: y - 30, rx: 10, ry: 3, fill: '#fafaf9', stroke: '#e7e5e4', 'stroke-width': 1 }),
      s('path', { d: `M${x} ${y - 31} q 1.5 -5 -0.5 -8`, stroke: '#1f2937', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
    ]);
    cup = s('g', {}, [
      s('path', { d: `M${x - 18} ${y - 22} Q ${x - 16} ${y - 4} ${x} ${y - 4} Q ${x + 16} ${y - 4} ${x + 18} ${y - 22} Z`, fill: d.lin([[0, '#ffffff'], [0.6, '#f1f5f9'], [1, '#cbd5e1']], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('ellipse', { cx: x, cy: y - 22, rx: 18, ry: 3.5, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1 }),
      s('ellipse', { cx: x, cy: y - 22, rx: 11, ry: 2.6, fill: '#b91c1c' }),
    ]);
    floatG = s('g', { 'pointer-events': 'none' });
    svg.append(floatG);
    floatG.append(
      s('ellipse', { cx: x, cy: y, rx: 30, ry: 7, fill: d.lin([[0, '#d6a46b'], [1, '#a16207']], 'v'), stroke: '#92400e', 'stroke-width': 1 }),
      s('rect', { x: x - 30, y: y - 4, width: 60, height: 6, rx: 3, fill: '#c08a4e' }),
      candle,
      cup,
    );
    // Пламя: свеча — язычок с ореолом, фосфор — ослепительное бело-жёлтое пламя
    flameGlow = s('ellipse', { cx: x, cy: y - 48, rx: 46, ry: 40, fill: d.rad([[0, '#fde68a', 0.75], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
    flame = s('path', { d: `M${x} ${y - 66} C ${x + 8} ${y - 54}, ${x + 7} ${y - 42}, ${x} ${y - 38} C ${x - 7} ${y - 42}, ${x - 8} ${y - 54}, ${x} ${y - 66} Z`, fill: d.rad([[0, '#fef9c3'], [0.55, '#fbbf24'], [1, '#f97316', 0.2]], 0.5, 0.7), opacity: 0, 'pointer-events': 'none' });
    pFlame = s('path', { d: `M${x} ${y - 78} C ${x + 18} ${y - 58}, ${x + 18} ${y - 32}, ${x} ${y - 24} C ${x - 18} ${y - 32}, ${x - 18} ${y - 58}, ${x} ${y - 78} Z`, fill: d.rad([[0, '#ffffff'], [0.5, '#fef9c3'], [1, '#fde047', 0.3]], 0.5, 0.65), opacity: 0, 'pointer-events': 'none' });
    // Струйка дыма от погасшего фитиля
    wisps = Array.from({ length: 4 }, () => {
      const c = s('circle', { r: 4, fill: '#94a3b8', opacity: 0, 'pointer-events': 'none' });
      return c;
    });
    floatG.append(flameGlow, flame, pFlame, ...wisps);
  }

  // Колпак: стеклянная банка без дна с горлышком сверху. Контуры пересчитываются при смене объёма.
  // Задняя стенка с водой внутри и стекло с делениями — разные слои: между ними плавает поплавок
  function buildJar(svg, d) {
    jarClip = s('path');
    const cid = `cb${Math.random().toString(36).slice(2)}`;
    jarBack = s('path', { fill: d.lin([[0, '#dbe4ef', 0.45], [0.5, '#f1f5f9', 0.15], [1, '#cbd5e1', 0.5]]) });
    innerWater = s('rect', { fill: d.lin([[0, '#bae6fd', 0.95], [1, '#7dd3fc', 0.95]], 'v') });
    innerLine = s('rect', { height: 2.5, fill: '#ffffff', 'fill-opacity': 0.8 });
    // Белый дым оксида фосфора: ровная пелена и клубы поверх неё, иначе на светлом фоне его не видно
    smokeRect = s('g', { opacity: 0 });
    smokeFog = s('rect', { fill: '#e2e8f0', 'fill-opacity': 0.85 });
    smokePuffs = Array.from({ length: 9 }, () => s('circle', { fill: d.rad([[0, '#ffffff', 0.95], [0.6, '#f1f5f9', 0.6], [1, '#e2e8f0', 0]], 0.5, 0.5) }));
    smokeRect.append(smokeFog, ...smokePuffs);
    // Пламя фосфора ослепительно яркое и просвечивает сквозь дым — иначе пелена прячет его целиком
    smokeGlow = s('ellipse', { cx: TROUGH.x, rx: 34, ry: 42, fill: d.rad([[0, '#ffffff', 1], [0.35, '#fef9c3', 0.9], [1, '#fde047', 0]], 0.5, 0.5), opacity: 0 });
    jarGlass = s('path', { fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    jarHi = s('rect', { width: 7, rx: 3.5, fill: '#ffffff', 'fill-opacity': 0.7 });
    jarKnob = s('g');
    marks = s('g', { 'pointer-events': 'none' });
    jarBackG = s('g', { 'pointer-events': 'none' }, [
      s('clipPath', { id: cid }, [jarClip]),
      jarBack,
      s('g', { 'clip-path': `url(#${cid})` }, [innerWater, innerLine]),
    ]);
    jar = s('g', {}, [
      s('g', { 'clip-path': `url(#${cid})`, 'pointer-events': 'none' }, [smokeRect, smokeGlow]),
      jarGlass,
      jarHi,
      jarKnob,
    ]);
    jar.dataset.v = '';
    svg.append(jarBackG);
    buildFloat(svg, d);
    svg.append(jar);
  }

  function shapeJar(V) {
    const key = String(V);
    if (jar.dataset.v === key) return;
    jar.dataset.v = key;
    const { h, w, top } = jarGeom(V);
    const x = TROUGH.x;
    const L = x - w / 2;
    const R = x + w / 2;
    const neck = 15;
    // Плечики сверху сходятся к горлышку, в горлышке — пробка
    const outline = `M${L} ${RIM_DOWN} V${top + 18} Q ${L} ${top} ${L + 22} ${top} H${x - neck} V${top - 14} H${x + neck} V${top} H${R - 22} Q ${R} ${top} ${R} ${top + 18} V${RIM_DOWN}`;
    jarClip.setAttribute('d', `M${L + 2} ${RIM_DOWN} V${top + 18} Q ${L + 2} ${top + 2} ${L + 22} ${top + 2} H${R - 22} Q ${R - 2} ${top + 2} ${R - 2} ${top + 18} V${RIM_DOWN} Z`);
    jarBack.setAttribute('d', `${outline} Z`);
    jarGlass.setAttribute('d', outline);
    jarHi.setAttribute('x', L + 9);
    jarHi.setAttribute('y', top + 20);
    jarHi.setAttribute('height', h - 30);
    smokeFog.setAttribute('x', L);
    smokeFog.setAttribute('y', top);
    smokeFog.setAttribute('width', w);
    smokeFog.setAttribute('height', RIM_DOWN - top);
    // Клубы раскиданы по всему воздушному столбу — одинаково при каждом открытии
    smokePuffs.forEach((c, i) => {
      c.setAttribute('cx', (L + w * (0.18 + ((i * 0.37) % 1) * 0.64)).toFixed(1));
      c.setAttribute('cy', (top + 12 + (h - 10) * ((i + 0.5) / smokePuffs.length)).toFixed(1));
      c.setAttribute('r', (w * (0.28 + (i % 3) * 0.06)).toFixed(1));
    });
    innerWater.setAttribute('x', L);
    innerWater.setAttribute('width', w);
    innerLine.setAttribute('x', L);
    innerLine.setAttribute('width', w);
    jarKnob.replaceChildren(
      s('rect', { x: x - neck - 2, y: top - 26, width: (neck + 2) * 2, height: 14, rx: 4, fill: '#a16207', stroke: '#78350f', 'stroke-width': 1 }),
      s('rect', { x: x - neck - 2, y: top - 26, width: (neck + 2) * 2, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.25 }),
    );
    // Деления на пять равных частей воздушного столба — от уровня воды вверх. Подписи — снаружи:
    // внутри узкого колпака они наезжали бы на пламя свечи
    const list = [];
    for (let i = 1; i <= 4; i++) {
      const y = WATER_Y - (h * i) / 5;
      const label = text(R + 8, y, `${i}/5`, { size: 13, weight: 600, fill: '#334155', anchor: 'start' });
      // Светлая обводка: подпись читается и там, где её пересекает край кристаллизатора
      label.setAttribute('stroke', '#f8fafc');
      label.setAttribute('stroke-width', 3);
      label.setAttribute('paint-order', 'stroke');
      list.push(s('line', { x1: R - 16, x2: R + 4, y1: y, y2: y, stroke: '#475569', 'stroke-width': 1.6 }), label);
    }
    marks.replaceChildren(...list);
  }

  function buildTroughFront(svg, d) {
    const { x, half, top } = TROUGH;
    svg.append(
      // Вода перед колпаком и поплавком: всё, что под водой, видно сквозь лёгкую голубизну
      s('rect', { x: x - half + 3, y: WATER_Y + 4, width: half * 2 - 6, height: BENCH - WATER_Y - 9, rx: 8, fill: '#7dd3fc', 'fill-opacity': 0.28, 'pointer-events': 'none' }),
      s('rect', { x: x - half, y: top, width: half * 2, height: BENCH - top - 2, rx: 10, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'pointer-events': 'none' }),
      s('path', { d: `M${x - half} ${top} H${x + half}`, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round', 'pointer-events': 'none' }),
      s('rect', { x: x - half + 12, y: top + 12, width: 8, height: BENCH - top - 30, rx: 4, fill: '#ffffff', 'fill-opacity': 0.6, 'pointer-events': 'none' }),
    );
  }

  // Лапка штатива держит колпак за горлышко и ездит вместе с ним
  function buildArm(svg, d) {
    arm = s('rect', { x: STAND_X, height: 7, rx: 3, fill: d.lin(['#d1d5db', '#6b7280'], 'v') });
    armClamp = s('g');
    svg.append(arm, armClamp);
    armClamp.append(
      s('rect', { x: STAND_X - 10, y: -12, width: 20, height: 24, rx: 4, fill: d.lin([[0, '#6b7280'], [0.4, '#d1d5db'], [1, '#4b5563']]) }),
      s('rect', { x: TROUGH.x - 24, y: -9, width: 48, height: 18, rx: 5, fill: 'none', stroke: '#4b5563', 'stroke-width': 4 }),
    );
  }

  function drawJar(now) {
    shapeJar(st.V);
    const { h, top } = jarGeom(st.V);
    const lift = LIFT * (1 - st.pos) - (drag.jar ?? 0);
    jar.setAttribute('transform', `translate(0 ${(-lift).toFixed(1)})`);
    marks.setAttribute('transform', `translate(0 ${(-lift).toFixed(1)})`);
    jarBackG.setAttribute('transform', `translate(0 ${(-lift).toFixed(1)})`);
    // Поплавок держится на воде: под опущенным колпаком поднимается вместе с ней
    floatG.setAttribute('transform', `translate(0 ${(-h * st.level).toFixed(1)})`);
    const knobY = top - 19 - lift;
    arm.setAttribute('y', (knobY - 3.5).toFixed(1));
    arm.setAttribute('width', TROUGH.x - 24 - STAND_X);
    armClamp.setAttribute('transform', `translate(0 ${knobY.toFixed(1)})`);

    // Вода внутри колпака: пока он над водой — её нет, опущен — уровень снаружи плюс подъём
    const inside = st.pos >= 0.999 || st.level > 0;
    const surf = WATER_Y - h * st.level + lift;
    innerWater.setAttribute('y', surf.toFixed(1));
    innerWater.setAttribute('height', Math.max(0, RIM_DOWN - surf).toFixed(1));
    innerWater.setAttribute('opacity', inside ? 1 : 0);
    innerLine.setAttribute('y', (surf - 1).toFixed(1));
    innerLine.setAttribute('opacity', inside ? 1 : 0);
    smokeRect.setAttribute('opacity', st.smoke.toFixed(2));

    const fuel = st.fuel;
    candle.setAttribute('opacity', fuel ? 0 : 1);
    cup.setAttribute('opacity', fuel ? 1 : 0);
    const flick = 1 + Math.sin(now * 23) * 0.06 + Math.sin(now * 37) * 0.04;
    const fx = TROUGH.x;
    const base = WATER_Y - 38;
    const k = st.flame;
    flame.setAttribute('opacity', !fuel && k > 0 ? 1 : 0);
    flame.setAttribute('transform', `translate(${fx} ${base}) scale(${(0.6 + 0.4 * k).toFixed(3)} ${(k * flick).toFixed(3)}) translate(${-fx} ${-base})`);
    const pBase = WATER_Y - 24;
    pFlame.setAttribute('opacity', fuel && k > 0 ? 1 : 0);
    pFlame.setAttribute('transform', `translate(${fx} ${pBase}) scale(${(1 + (flick - 1) * 2).toFixed(3)} ${(flick * 1.05).toFixed(3)}) translate(${-fx} ${-pBase})`);
    flameGlow.setAttribute('opacity', k > 0 ? (fuel ? 1 : 0.4 + 0.5 * k).toFixed(2) : 0);
    flameGlow.setAttribute('ry', fuel ? 62 : 40);
    // Колпак и поплавок сдвинуты по-разному: переводим центр пламени в координаты колпака
    smokeGlow.setAttribute('cy', (WATER_Y - 48 - h * st.level + lift).toFixed(1));
    smokeGlow.setAttribute('opacity', fuel && k > 0 ? (st.smoke * flick).toFixed(2) : 0);

    // Дымок над погасшим фитилём — около секунды после того, как свеча погасла
    const out = st.key && !fuel && k === 0 && st.el > DUR.lower ? st.el - DUR.lower - burnTime({ V: st.V, fuel: 0 }) / SPEED : -1;
    wisps.forEach((c, i) => {
      const kk = ((now * 0.6 + i / wisps.length) % 1);
      const on = out >= 0 && out < 1.4;
      c.setAttribute('cx', (fx + Math.sin(now * 2 + i) * 3 + kk * 5).toFixed(1));
      c.setAttribute('cy', (base - 4 - kk * 40).toFixed(1));
      c.setAttribute('r', (2.5 + kk * 4).toFixed(1));
      c.setAttribute('opacity', on ? (0.4 * (1 - kk) * (1 - out / 1.4)).toFixed(2) : 0);
    });
  }

  // ---------- Действия ученика ----------
  // Колпак: щелчок или рывок вниз — вещество зажигают, колпак опускают в воду
  let jarStart = null;
  draggable(scene, jar, {
    onDrag(x, y) {
      if (params.burn) return;
      if (jarStart === null) jarStart = y;
      drag.jar = Math.max(0, Math.min(LIFT, y - jarStart));
    },
    onEnd() {
      const pulled = drag.jar;
      drag.jar = null;
      jarStart = null;
      if (params.burn) return;
      // Без перетаскивания (щелчок) тоже опускаем — на телефоне так проще
      if (pulled === null || pulled > 20 || pulled < 4) set('burn', 1);
    },
  });


  scene.svg.style.userSelect = 'none';
  return scene;
}
