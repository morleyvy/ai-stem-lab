// Сцена «Тело в жидкости»: штатив с лапкой, на ней пружинный динамометр, к крючку на нити
// подвешено тело; на столе — стеклянный сосуд с жидкостью. Ученик тянет динамометр мышью вниз
// и опускает тело в жидкость: пружина сокращается на величину выталкивающей силы и слегка
// покачивается. Плавающее тело всплывает, нить провисает, динамометр показывает ноль.

import { createScene, draggable, floorShadow, room, s, text } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH_Y = 460;
const VX = 600; // ось подвеса и сосуда
const TANK = { left: 490, right: 710, top: 300, bottom: 456 };
const TANK_W = TANK.right - TANK.left;
const SURF0 = 342; // уровень жидкости без тела
const STAND_X = 330;
const ARM_AIR = 26; // высота лапки, когда тело в воздухе
// Геометрия динамометра относительно лапки (px вниз от armY)
const TUBE_TOP = 12;
const TUBE_H = 100;
const SPRING_TOP = 25;
const ZERO = 30; // положение указателя при нулевой нагрузке
const EXT = 70; // ход указателя на всю шкалу
const ROD = 90; // тяга от указателя до крючка
const THREAD = 22;
const HOOK = 8; // крючок под тягой
const HANG = ZERO + ROD + HOOK + THREAD; // от лапки до верхней грани тела при нулевом растяжении
const RANGES = [1, 2, 5, 10, 20, 50]; // Н — набор динамометров; берётся ближайший подходящий
// Пружина: жёсткость и затухание подобраны так, чтобы после рывка было 2–3 заметных качания
const K = 90;
const C = 6;

const fmtN = (v) => String(Math.round(v * 100) / 100).replace('.', ',');

export function archimedesScene(container, params, set, { liquidOf, weight, G }) {
  let arm, dyno, spring, pointer, rod, hook, thread, body, liquidBack, liquidFront, surface, nameLabel;
  let armY = params.dip ? 200 : ARM_AIR;
  let held = false;
  let grab = 0;
  let ext = 0;
  let extV = 0;
  let rise = 0;
  let bodyShine, bodyEye, materials;
  let bodyTop = 0;
  let fmax = 0;
  let t = 0;
  const labels = [];

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH_Y, theme: 'stand' });

      // Штатив: основание, стойка
      svg.append(
        floorShadow(STAND_X + 10, BENCH_Y + 6, 100, d),
        s('rect', { x: STAND_X - 70, y: BENCH_Y - 14, width: 170, height: 14, rx: 4, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
        s('rect', { x: STAND_X - 6, y: 16, width: 12, height: BENCH_Y - 30, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
      );
      // Лапка с муфтой — ездит по стойке вместе с динамометром
      arm = s('g', {}, [
        s('rect', { x: STAND_X, y: -5, width: VX - STAND_X + 12, height: 10, rx: 4, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b'], 'v') }),
        s('rect', { x: STAND_X - 15, y: -13, width: 30, height: 26, rx: 5, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('circle', { cx: STAND_X + 22, cy: 0, r: 5, fill: '#1e293b' }),
        s('circle', { cx: VX, cy: 8, r: 5, fill: 'none', stroke: '#475569', 'stroke-width': 2.5 }),
      ]);
      svg.append(arm);

      // Сосуд: задняя стенка и слой жидкости за телом
      svg.append(
        floorShadow(VX, BENCH_Y + 6, TANK_W * 0.6, d),
        s('rect', { x: TANK.left, y: TANK.top, width: TANK_W, height: TANK.bottom - TANK.top, rx: 10, fill: d.lin([[0, '#dbe4ef', 0.55], [0.5, '#f1f5f9', 0.25], [1, '#cbd5e1', 0.55]]) }),
      );
      liquidBack = s('rect', { x: TANK.left + 3, width: TANK_W - 6, rx: 8, 'fill-opacity': 0.18 });
      svg.append(liquidBack);

      // Тело и нить
      thread = s('path', { fill: 'none', stroke: '#334155', 'stroke-width': 1.5 });
      // Тело: заливка по материалу (дерево с волокнами, алюминий, сталь), поверх — объём
      // (свет сверху-слева) и ушко для нити. Градиенты в долях тела, поэтому годятся для любого размера.
      materials = {
        wood: d.lin([[0, '#b98a52'], [0.18, '#d6ad74'], [0.24, '#c49660'], [0.45, '#dcb57e'], [0.52, '#c7995f'], [0.78, '#d8b078'], [0.85, '#be8f57'], [1, '#a97a45']]),
        alu: d.lin([[0, '#aab4c1'], [0.3, '#eef2f6'], [0.55, '#c9d1db'], [1, '#8e99a8']]),
        steel: d.lin([[0, '#56606d'], [0.3, '#a3adb9'], [0.55, '#78828f'], [1, '#434b56']]),
      };
      body = s('rect', { rx: 3, stroke: '#0f172a', 'stroke-opacity': 0.35 });
      bodyShine = s('rect', { rx: 3, fill: d.lin([[0, '#ffffff', 0.4], [0.12, '#ffffff', 0.08], [0.8, '#000000', 0], [1, '#000000', 0.18]], 'v'), 'pointer-events': 'none' });
      bodyEye = s('circle', { r: 3.5, fill: 'none', stroke: '#475569', 'stroke-width': 2, 'pointer-events': 'none' });
      svg.append(thread, bodyEye, body, bodyShine);

      // Динамометр: прозрачный корпус-планка со шкалой, пружина, красный указатель, тяга с крючком
      spring = s('path', { fill: 'none', stroke: '#64748b', 'stroke-width': 1.8, 'stroke-linejoin': 'round' });
      pointer = s('rect', { x: -26, width: 52, height: 3, rx: 1.5, fill: '#dc2626' });
      rod = s('rect', { x: -1.5, width: 3, fill: '#94a3b8' });
      hook = s('path', { fill: 'none', stroke: '#475569', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
      const scale = s('g');
      for (let i = 0; i <= 10; i++) {
        const y = ZERO + (i / 10) * EXT;
        scale.append(s('line', { x1: i % 2 ? 15 : 10, x2: 23, y1: y, y2: y, stroke: '#334155', 'stroke-width': i % 2 ? 0.8 : 1.3 }));
      }
      for (let i = 0; i <= 5; i++) {
        const lb = text(-11, ZERO + (i / 5) * EXT, '', { size: 10, weight: 600, fill: '#334155', anchor: 'end' });
        labels.push(lb);
        scale.append(lb);
      }
      dyno = s('g', {}, [
        s('path', { d: `M0 12 V${TUBE_TOP}`, stroke: '#475569', 'stroke-width': 2 }),
        s('rect', { x: -28, y: TUBE_TOP, width: 56, height: TUBE_H, rx: 6, fill: '#f8fafc', 'fill-opacity': 0.92, stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('rect', { x: -28, y: TUBE_TOP, width: 56, height: 13, rx: 6, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
        text(0, TUBE_TOP + 7, 'Н', { size: 9, weight: 700, fill: '#e2e8f0' }),
        scale,
        rod,
        spring,
        pointer,
        s('rect', { x: -28, y: TUBE_TOP + TUBE_H - 8, width: 56, height: 8, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        hook,
        // блик на прозрачном корпусе
        s('rect', { x: 23, y: TUBE_TOP + 16, width: 3, height: TUBE_H - 30, rx: 2, fill: '#ffffff', 'fill-opacity': 0.6 }),
      ]);
      svg.append(dyno);

      // Жидкость перед телом: погружённая часть тела видна сквозь неё, окрашенной
      liquidFront = s('rect', { x: TANK.left + 3, width: TANK_W - 6, rx: 8, 'fill-opacity': 0.3, 'pointer-events': 'none' });
      surface = s('ellipse', { cx: VX, rx: TANK_W / 2 - 5, ry: 5, fill: '#ffffff', 'fill-opacity': 0.35, stroke: '#ffffff', 'stroke-opacity': 0.6, 'pointer-events': 'none' });
      svg.append(liquidFront, surface);

      // Стекло поверх: окантовка, блики, мерные деления; этикетка с названием жидкости
      const marks = s('g', { 'pointer-events': 'none' });
      for (let i = 1; i <= 5; i++) {
        const yy = TANK.bottom - i * 26;
        marks.append(s('line', { x1: TANK.right - 18, x2: TANK.right - 4, y1: yy, y2: yy, stroke: '#64748b', 'stroke-opacity': 0.6, 'stroke-width': 1.5 }));
      }
      nameLabel = text(TANK.left + 18, TANK.bottom - 20, '', { size: 11, weight: 600, fill: '#e2e8f0', anchor: 'start' });
      svg.append(
        s('rect', { x: TANK.left, y: TANK.top, width: TANK_W, height: TANK.bottom - TANK.top, rx: 10, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'pointer-events': 'none' }),
        s('ellipse', { cx: VX, cy: TANK.top, rx: TANK_W / 2, ry: 6, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 3, 'pointer-events': 'none' }),
        s('rect', { x: TANK.left + 10, y: TANK.top + 10, width: 10, height: TANK.bottom - TANK.top - 40, rx: 5, fill: '#ffffff', 'fill-opacity': 0.4, 'pointer-events': 'none' }),
        marks,
        s('rect', { x: TANK.left + 10, y: TANK.bottom - 31, width: 150, height: 22, rx: 5, fill: '#1e293b', 'fill-opacity': 0.85, 'pointer-events': 'none' }),
        nameLabel,
      );
    },

    frame(dt) {
      t += dt;
      const liq = liquidOf(params);
      const size = 20 + Math.cbrt(params.V) * 5.2;
      const W = weight(params);
      const Vm3 = params.V * 1e-6;
      const f = params.rho / liq.density; // доля погружения плавающего тела

      // Динамометр подбирается под вес тела, как в кабинете: шкала — ближайший больший предел
      const range = RANGES.find((r) => r >= W * 1.05) ?? RANGES.at(-1);
      if (range !== fmax) {
        fmax = range;
        labels.forEach((lb, i) => { lb.textContent = fmtN((fmax * i) / 5); });
      }

      const surf = SURF0 - rise;
      const floatTop = SURF0 - size * (1 - f);
      const armDip = dipLimit();

      if (!held) {
        const target = params.dip ? armDip : ARM_AIR;
        armY += (target - armY) * Math.min(1, dt * 4);
      } else {
        armY = Math.min(armY, armDip);
      }

      // Где было бы тело, вися на нити, и какая часть его при этом в жидкости
      const hangTop = armY + HANG + ext;
      const sub = Math.min(1, Math.max(0, (hangTop + size - surf) / size));
      const tension = W - liq.density * G * Vm3 * sub;
      const slack = tension <= 0;
      const extTarget = slack ? 0 : (tension / fmax) * EXT;
      // Пружина — затухающий осциллятор: после каждого рывка слегка покачивается
      extV += (K * (extTarget - ext) - C * extV) * dt;
      ext = Math.max(-4, Math.min(EXT + 4, ext + extV * dt));

      const top = slack ? floatTop + Math.sin(t * 2.2) * 0.8 - rise : hangTop;
      bodyTop = top;
      // Вытесненная жидкость поднимает уровень в сосуде
      const subNow = Math.min(1, Math.max(0, (bodyTop + size - surf) / size));
      rise += ((subNow * size * size * 0.8) / TANK_W - rise) * Math.min(1, dt * 6);

      // Динамометр рисуется в координатах лапки: y = 0 — уровень лапки
      arm.setAttribute('transform', `translate(0 ${armY.toFixed(2)})`);
      dyno.setAttribute('transform', `translate(${VX} ${armY.toFixed(2)})`);
      const pY = ZERO + ext;
      pointer.setAttribute('y', pY - 1.5);
      spring.setAttribute('d', springPath(SPRING_TOP, pY));
      rod.setAttribute('y', pY);
      rod.setAttribute('height', ROD);
      const hy = pY + ROD;
      hook.setAttribute('d', `M0 ${hy} V${hy + HOOK} Q0 ${hy + HOOK + 6} -5 ${hy + HOOK + 4}`);

      // Нить: натянута — прямая; провисла — дуга в сторону
      const hookAbs = armY + hy + HOOK;
      const gap = bodyTop - hookAbs;
      if (gap < THREAD - 0.5) {
        const bow = Math.sqrt(Math.max(0, THREAD * THREAD - gap * gap)) * 0.8;
        thread.setAttribute('d', `M${VX} ${hookAbs} Q${VX + bow} ${(hookAbs + bodyTop) / 2} ${VX} ${bodyTop}`);
      } else {
        thread.setAttribute('d', `M${VX} ${hookAbs} L${VX} ${bodyTop}`);
      }

      // Цвет тела: от лёгкого дерева к тяжёлому металлу
      const heavy = Math.min(1, params.rho / 8000);
      body.setAttribute('fill', heavy < 0.12 ? materials.wood : heavy < 0.5 ? materials.alu : materials.steel);
      for (const r of [body, bodyShine]) {
        r.setAttribute('x', VX - size / 2);
        r.setAttribute('y', bodyTop);
        r.setAttribute('width', size);
        r.setAttribute('height', size);
      }
      bodyEye.setAttribute('cx', VX);
      bodyEye.setAttribute('cy', bodyTop - 2);

      for (const r of [liquidBack, liquidFront]) {
        r.setAttribute('y', surf);
        r.setAttribute('height', TANK.bottom - 3 - surf);
        r.setAttribute('fill', liq.color);
      }
      surface.setAttribute('cy', surf);
      nameLabel.textContent = `${tr(liq.name)}, ${liq.density} кг/м³`;
    },
  });

  // Зигзаг пружины между верхним креплением и указателем
  function springPath(y1, y2) {
    const n = 10;
    let dd = `M0 ${y1}`;
    for (let i = 1; i < n; i++) dd += ` L${i % 2 ? -6 : 6} ${y1 + ((y2 - y1) * i) / n}`;
    return `${dd} L0 ${y2}`;
  }

  // Динамометр (и само тело) можно тянуть вверх-вниз; отпущенный ниже середины хода — «опущен»
  const drag = {
    onDrag(_, y) {
      if (!held) {
        held = true;
        grab = armY - y;
      }
      armY = Math.max(ARM_AIR, y + grab);
    },
    onEnd() {
      if (!held) return;
      held = false;
      const mid = ARM_AIR + (dipLimit() - ARM_AIR) / 2;
      set('dip', armY > mid ? 1 : 0);
    },
  };
  // Нижний предел нужен и при отпускании: считаем его так же, как в кадре
  // Нижнее положение лапки: тонущее тело целиком под жидкостью (корпус динамометра — над ней),
  // у плавающего тела крючок остаётся чуть выше всплывшего тела, и нить провисает
  function dipLimit() {
    const liq = liquidOf(params);
    const size = 20 + Math.cbrt(params.V) * 5.2;
    const f = params.rho / liq.density;
    if (f < 1) return Math.max(ARM_AIR, SURF0 - size * (1 - f) - 10 - ZERO - ROD - HOOK);
    const extWater = (Math.max(0, weight(params) - liq.density * G * params.V * 1e-6) / (fmax || 1)) * EXT;
    return Math.max(ARM_AIR, Math.min(SURF0 + 30 - HANG - extWater, SURF0 - TUBE_TOP - TUBE_H - 12));
  }
  draggable(scene, dyno, drag);
  draggable(scene, body, drag);

  scene.svg.style.userSelect = 'none';
  return scene;
}
