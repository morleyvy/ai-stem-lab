// Сцена «Колебательный контур»: на физическом стенде — осциллограф и табло энергии контура (столбики
// без чисел: сами числа — в панели показаний под сценой); на панели закреплены перекидной ключ и реостат, на столе стоят источник
// 20 В, магазин конденсаторов и катушка с выдвижным железным сердечником. Провода — гибкие, с клемм на клеммы.
// Щелчок по ключу перебрасывает его с «зарядки» на «контур» (sw = 1): конденсатор разряжается через катушку,
// луч осциллографа рисует затухающие колебания, по проводам бегут заряды, вокруг катушки появляется
// магнитное поле, а столбики показывают, как энергия электрического поля переходит в энергию магнитного
// и в тепло. Ручка магазина меняет C, сердечник — L, движок реостата — R. Если параметр меняют
// во время колебаний, ключ на мгновение возвращают на зарядку и замыкают снова — каждое значение
// измерено с полностью заряженного конденсатора.
// Всё движение замедлено в SLOW раз: настоящие колебания длятся десятки миллисекунд. Шкала времени
// осциллографа (5 мс/дел) при этом настоящая — по ней ученик видит истинный период.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 452;
const SLOW = 100;
const PAUSE = 0.6; // с — сколько ключ стоит на зарядке при перезапуске опыта
const CHARGES = 26;

// Осциллограф: экран 10 × 8 делений; 5 мс/дел по горизонтали, 10 В/дел по вертикали
const SCOPE = { x: 28, y: 24, w: 370, h: 232 };
const SCR = { x: 48, y: 44, div: 24 };
const SCR_W = SCR.div * 10;
const SCR_H = SCR.div * 8;
const SCR_MID = SCR.y + SCR_H / 2;
const SCOPE_PX = SCR.x + SCR_W + 52; // ось правой панели осциллографа (ручки, вход Y)
const MS_PER_DIV = 5;
const V_PER_DIV = 10;
const WINDOW = (MS_PER_DIV * 10) / 1000; // с — вся развёртка экрана
const TRACE_N = 420;

// Энергетическое табло: справа от осциллографа, над реостатом
const EN = { x: 452, y: 24, w: 330, h: 206 };
const BAR = { x: EN.x + 20, w: EN.w - 40, h: 16 };

// Перекидной ключ на панели: губки «зарядка» (A) и «контур» (B) сверху, шарнир ножа снизу.
// Так провод от источника подходит к губке A сверху и не пересекает провод от шарнира к конденсатору.
const SW = { x: 324, y: 296, w: 140, h: 80 };
const PIVOT = { x: 394, y: 352 };
const JAW_A = { x: 362, y: 318 };
const JAW_B = { x: 426, y: 318 };
const BLADE_LEN = Math.hypot(JAW_A.x - PIVOT.x, JAW_A.y - PIVOT.y);
// Нож нарисован вертикально вверх; поворот на −угол — к губке A, на +угол — к губке B
const BLADE_ANGLE = (Math.atan2(PIVOT.x - JAW_A.x, PIVOT.y - JAW_A.y) * 180) / Math.PI;

// Магазин конденсаторов, источник, катушка с сердечником, реостат
const PSU = { x: 30, y: 362, w: 126 };
const CAP = { x: 176, y: 352, w: 146 };
const KNOB = { x: 220, y: 410, r: 22 };
const COIL = { x1: 470, x2: 610, axis: 400 };
const CORE_LEN = 150;
const CORE_OUT = 618; // левый край сердечника, вынутого из катушки (L минимальна)
const CORE_TRAVEL = 140;
const RHEO = { x1: 552, x2: 748, tubeY: 284 };
const R_X0 = 574; // положение движка при R = 5 Ом
const R_X1 = 726; // … и при R = 100 Ом

// Клеммы (верх контакта)
const T = {
  psuPlus: { x: 62, y: 354 },
  psuMinus: { x: 118, y: 354 },
  capMinus: { x: 196, y: 344 },
  capPlus: { x: 302, y: 344 },
  pivot: { x: PIVOT.x, y: 368 },
  jawA: { x: JAW_A.x, y: 304 },
  jawB: { x: JAW_B.x, y: 304 },
  coil1: { x: COIL.x1 + 5, y: 352 },
  coil2: { x: COIL.x2 - 5, y: 352 },
  rheoWind: { x: RHEO.x1 + 4, y: 322 },
  rheoRod: { x: RHEO.x2 - 4, y: 262 },
};

// Гибкий провод: кривая Безье с подъёмом над клеммами (отрицательный подъём — провод сначала идёт вниз);
// rev — тот же провод в обратную сторону (для дорожки зарядов, бегущих по контуру в одном направлении)
function curve(a, b, liftA, liftB = liftA, rev = false) {
  const [p, q, la, lb] = rev ? [b, a, liftB, liftA] : [a, b, liftA, liftB];
  return `M${p.x} ${p.y} C ${p.x} ${p.y - la}, ${q.x} ${q.y - lb}, ${q.x} ${q.y}`;
}

const CABLES = [
  { a: T.psuPlus, b: T.jawA, lift: 90, liftB: 6, color: '#dc2626' },
  { a: T.psuMinus, b: T.capMinus, lift: 26, color: '#1f2937' },
  { a: T.pivot, b: T.capPlus, lift: -34, liftB: 26, color: '#2563eb' },
  { a: T.jawB, b: T.rheoWind, lift: 0, liftB: 30, color: '#ca8a04' },
  { a: T.rheoRod, b: T.coil2, lift: -40, liftB: 50, color: '#ca8a04' },
];
// Провод от катушки к «−» конденсатора лежит на столе и уходит за магазин конденсаторов: так он не
// пересекает провода ключа. Видимая часть — до правого края магазина, остальное скрыто корпусом.
const RETURN_SEEN = `M${T.coil1.x} ${T.coil1.y} C ${T.coil1.x} 420, 420 446, ${CAP.x + CAP.w} 446`;
const RETURN = `${RETURN_SEEN} C 250 446, ${T.capMinus.x} 410, ${T.capMinus.x} ${T.capMinus.y}`;

// Дорожка зарядов вдоль контура в направлении тока разряда (с «+» конденсатора через ключ,
// реостат и катушку на «−»). Внутри приборов заряды не рисуются — переходы через M.
const LOOP = [
  curve(T.pivot, T.capPlus, -34, 26, true),
  curve(T.jawB, T.rheoWind, 0, 30),
  curve(T.rheoRod, T.coil2, -40, 50),
  RETURN_SEEN,
].join(' ');

export function emOscillationsScene(container, params, set, { state, energy, U0 }) {
  let trace, beamDot, flatLine, blade, bars, capSigns, capField, fieldLines, fieldArrow;
  let knobPointer, core, slider, sliderContact, loopPath, loopLen, charges;
  // Ход опыта: charged — конденсатор заряжен (ключ на зарядке), run — колебания, pause — перезапуск
  let phase = params.sw ? 'run' : 'charged';
  let t = 0; // с — «настоящее» время от замыкания ключа на катушку
  let wait = 0;
  let angle = params.sw ? BLADE_ANGLE : -BLADE_ANGLE;
  let flow = 0;
  let points = [];
  let prevKey = '';
  // Перетаскивание подключаем после createScene: в build() объекта сцены ещё нет
  const drags = [];

  const yOf = (u) => SCR_MID - (u / V_PER_DIV) * SCR.div;
  const xOf = (sec) => SCR.x + (sec / WINDOW) * SCR_W;

  // Осциллограмма всей развёртки для текущих C, L, R — луч потом «прорисовывает» её постепенно
  function computeTrace() {
    points = Array.from({ length: TRACE_N + 1 }, (_, k) => {
      const sec = (k / TRACE_N) * WINDOW;
      return [xOf(sec).toFixed(1), yOf(state(params, sec).u).toFixed(1)];
    });
  }

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      buildScope(svg, d);

      buildEnergy(svg, d);
      buildRheostat(svg, d);
      svg.append(
        s('path', { d: RETURN, fill: 'none', stroke: '#0b0f15', 'stroke-width': 5.5, 'stroke-linecap': 'round' }),
        s('path', { d: RETURN, fill: 'none', stroke: '#1f2937', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
        s('path', { d: RETURN, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.3, 'stroke-width': 1, transform: 'translate(-0.8 -0.8)' }),
      );
      buildSwitch(svg, d);

      // Поле катушки: линии выходят из одного торца и входят в другой; видны, только пока идёт ток
      fieldLines = s('g', { fill: 'none', stroke: '#7c3aed', 'stroke-width': 2, 'stroke-dasharray': '6 5', opacity: 0, 'pointer-events': 'none' });
      for (const h of [44, 70, 96]) {
        fieldLines.append(s('path', { d: `M${COIL.x1 - 4} ${COIL.axis - 8} C ${COIL.x1 - 30} ${COIL.axis - h}, ${COIL.x2 + 30} ${COIL.axis - h}, ${COIL.x2 + 4} ${COIL.axis - 8}` }));
      }
      fieldArrow = s('path', { d: 'M-7 -6 L5 0 L-7 6 Z', fill: '#7c3aed', stroke: 'none' });
      fieldLines.append(s('g', { transform: `translate(${(COIL.x1 + COIL.x2) / 2} ${COIL.axis - 8 - 0.75 * 96})` }, [fieldArrow]));
      svg.append(fieldLines);

      buildPsu(svg, d);
      buildCapacitor(svg, d);
      buildCoil(svg, d);

      // Провода поверх приборов, клеммы — поверх проводов
      for (const c of CABLES) {
        const path = curve(c.a, c.b, c.lift, c.liftB ?? c.lift);
        svg.append(
          s('path', { d: path, fill: 'none', stroke: shade(c.color, -0.35), 'stroke-width': 5.5, 'stroke-linecap': 'round' }),
          s('path', { d: path, fill: 'none', stroke: c.color, 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
          s('path', { d: path, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.3, 'stroke-width': 1, transform: 'translate(-0.8 -0.8)' }),
        );
      }
      buildProbe(svg);
      for (const [key, p] of Object.entries(T)) {
        if (key === 'pivot' || key === 'jawA' || key === 'jawB') continue;
        svg.append(post(d, p.x, p.y, key === 'psuPlus' || key === 'capPlus' ? '#dc2626' : '#1f2937'));
      }

      loopPath = s('path', { d: LOOP, fill: 'none', stroke: 'none' });
      svg.append(loopPath);
      loopLen = loopPath.getTotalLength();
      charges = Array.from({ length: CHARGES }, () => {
        const c = s('circle', { r: 2.6, fill: '#fde047', stroke: '#a16207', 'stroke-width': 0.6, opacity: 0, 'pointer-events': 'none' });
        svg.append(c);
        return c;
      });
    },

    frame(dt) {
      const key = `${params.C}|${params.L}|${params.R}`;
      if (key !== prevKey) {
        prevKey = key;
        computeTrace();
        // Новые C, L или R во время колебаний: перезаряжаем конденсатор и замыкаем ключ снова
        if (params.sw && phase === 'run') {
          phase = 'pause';
          wait = PAUSE;
        }
      }

      if (!params.sw) {
        phase = 'charged';
        t = 0;
      } else if (phase === 'charged') {
        phase = 'run';
        t = 0;
      } else if (phase === 'pause') {
        wait -= dt;
        t = 0;
        if (wait <= 0) phase = 'run';
      } else if (phase === 'run') {
        // Через 2 с колебания давно затухли — дальше время не считаем
        t = Math.min(2, t + dt / SLOW);
      }

      const running = phase === 'run';
      const { u, i } = running ? state(params, t) : { u: U0, i: 0 };
      const W0 = energy(params);
      const Cf = params.C * 1e-6;
      const wc = (Cf * u * u) / 2;
      const wl = (params.L * i * i) / 2;
      const q = running ? Math.max(0, W0 - wc - wl) : 0;
      const Im = U0 * Math.sqrt(Cf / params.L); // амплитуда тока без потерь — масштаб для поля и зарядов

      // Ключ: нож плавно переходит к нужной губке
      const target = running ? BLADE_ANGLE : -BLADE_ANGLE;
      angle += (target - angle) * Math.min(1, dt * 14);
      blade.setAttribute('transform', `rotate(${angle.toFixed(1)} ${PIVOT.x} ${PIVOT.y})`);

      // Осциллограф: пока ключ на зарядке — ровная линия на уровне 20 В; при колебаниях луч рисует кривую
      flatLine.setAttribute('opacity', running ? 0 : 1);
      flatLine.setAttribute('y1', yOf(U0));
      flatLine.setAttribute('y2', yOf(U0));
      if (running) {
        const n = Math.min(TRACE_N, Math.floor((t / WINDOW) * TRACE_N));
        trace.setAttribute('d', n > 0 ? `M${points.slice(0, n + 1).map((p) => p.join(' ')).join(' L')}` : '');
        const inWindow = t < WINDOW;
        beamDot.setAttribute('opacity', inWindow ? 1 : 0);
        if (inWindow) {
          beamDot.setAttribute('cx', xOf(t).toFixed(1));
          beamDot.setAttribute('cy', yOf(u).toFixed(1));
        }
      } else {
        trace.setAttribute('d', '');
        beamDot.setAttribute('opacity', 0);
      }

      // Энергия: доли от начальной W = CU²/2
      const parts = [wc, wl, q];
      bars.forEach((fill, k) => {
        const frac = W0 > 0 ? Math.max(0, Math.min(1, parts[k] / W0)) : 0;
        fill.setAttribute('width', (BAR.w * frac).toFixed(1));
      });

      // Заряд на пластинах: знаки меняются при перезарядке, поле между пластинами — по |u|
      const ku = Math.min(1, Math.abs(u) / U0);
      capSigns[0].textContent = u >= 0 ? '+' : '−';
      capSigns[1].textContent = u >= 0 ? '−' : '+';
      capSigns.forEach((el) => el.setAttribute('opacity', (0.25 + 0.75 * ku).toFixed(2)));
      capField.setAttribute('opacity', ku.toFixed(2));

      // Магнитное поле катушки и бегущие заряды — по силе и направлению тока
      const ki = Im > 0 ? Math.min(1, Math.abs(i) / Im) : 0;
      fieldLines.setAttribute('opacity', (ki * 0.9).toFixed(2));
      fieldArrow.setAttribute('transform', i >= 0 ? '' : 'rotate(180)');
      flow = (flow + (i / (Im || 1)) * dt * 0.35 + 1) % 1;
      charges.forEach((c, k) => {
        const pt = loopPath.getPointAtLength(((k / CHARGES + flow) % 1) * loopLen);
        c.setAttribute('cx', pt.x.toFixed(1));
        c.setAttribute('cy', pt.y.toFixed(1));
        c.setAttribute('opacity', (ki > 0.03 ? 0.35 + 0.65 * ki : 0).toFixed(2));
      });

      // Приборы-регуляторы: ручка магазина, сердечник, движок реостата
      knobPointer.setAttribute('transform', `rotate(${-135 + ((params.C - 1) / 15) * 270} ${KNOB.x} ${KNOB.y})`);
      const kL = (params.L - 0.05) / 0.95;
      core.setAttribute('transform', `translate(${(-kL * CORE_TRAVEL).toFixed(1)} 0)`);
      const sx = R_X0 + ((params.R - 5) / 95) * (R_X1 - R_X0);
      slider.setAttribute('transform', `translate(${sx.toFixed(1)} 0)`);
      sliderContact.setAttribute('x', (sx - 1.5).toFixed(1));
    },
  });

  // ---------- Осциллограф ----------
  function buildScope(svg, d) {
    const { x, y, w, h } = SCOPE;
    svg.append(
      // полка-кронштейн на стенде
      s('rect', { x: x - 8, y: y + h, width: w + 16, height: 8, rx: 2, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'v') }),
      s('rect', { x: x - 8, y: y + h + 8, width: w + 16, height: 8, fill: d.lin([[0, '#0f172a', 0.18], [1, '#0f172a', 0]], 'v') }),
      s('g', { filter: d.url('soft') }, [
        s('rect', { x, y, width: w, height: h, rx: 14, fill: d.lin([[0, '#5b6b80'], [0.5, '#3f4b5c'], [1, '#2a3340']], 'v'), stroke: '#111827', 'stroke-width': 1.2 }),
        s('rect', { x: x + 2, y: y + 2, width: w - 4, height: 18, rx: 12, fill: d.lin([[0, '#ffffff', 0.18], [1, '#ffffff', 0]], 'v') }),
        // утопленная рамка экрана
        s('rect', { x: SCR.x - 10, y: SCR.y - 10, width: SCR_W + 20, height: SCR_H + 20, rx: 10, fill: d.lin([[0, '#0b0f15'], [1, '#4b5a6e']], 'v') }),
        s('rect', { x: SCR.x, y: SCR.y, width: SCR_W, height: SCR_H, rx: 4, fill: d.rad([[0, '#0f2e22'], [1, '#04140d']], 0.5, 0.5) }),
      ]),
    );
    // Сетка делений и центральные оси с мелкими рисками
    const grid = s('g', { stroke: '#4ade80', 'stroke-opacity': 0.2, 'stroke-width': 1 });
    for (let k = 1; k < 10; k++) grid.append(s('line', { x1: SCR.x + k * SCR.div, y1: SCR.y, x2: SCR.x + k * SCR.div, y2: SCR.y + SCR_H }));
    for (let k = 1; k < 8; k++) grid.append(s('line', { x1: SCR.x, y1: SCR.y + k * SCR.div, x2: SCR.x + SCR_W, y2: SCR.y + k * SCR.div }));
    const axes = s('g', { stroke: '#4ade80', 'stroke-opacity': 0.45, 'stroke-width': 1 });
    for (let k = 1; k < 50; k++) {
      const xx = SCR.x + (k * SCR.div) / 5;
      axes.append(s('line', { x1: xx, y1: SCR_MID - 3, x2: xx, y2: SCR_MID + 3 }));
    }
    for (let k = 1; k < 40; k++) {
      const yy = SCR.y + (k * SCR.div) / 5;
      axes.append(s('line', { x1: SCR.x + SCR_W / 2 - 3, y1: yy, x2: SCR.x + SCR_W / 2 + 3, y2: yy }));
    }
    flatLine = s('line', { x1: SCR.x, x2: SCR.x + SCR_W, y1: 0, y2: 0, stroke: '#86efac', 'stroke-width': 2.2 });
    trace = s('path', { fill: 'none', stroke: '#86efac', 'stroke-width': 2.2, 'stroke-linejoin': 'round' });
    beamDot = s('circle', { r: 4, fill: '#ecfccb', stroke: '#86efac', 'stroke-width': 2, opacity: 0 });
    svg.append(
      grid,
      axes,
      // Без фильтра-тени: у горизонтальной линии нулевая высота, и фильтр по её габариту не рисует ничего
      flatLine,
      trace,
      beamDot,
      text(SCR.x + 6, SCR.y + 12, '0', { size: 13, weight: 600, fill: '#4ade80', anchor: 'start' }),
      s('rect', { x: SCR.x, y: SCR.y, width: SCR_W, height: 26, rx: 4, fill: d.lin([[0, '#ffffff', 0.08], [1, '#ffffff', 0]], 'v'), 'pointer-events': 'none' }),
    );
    // Правая панель: переключатели развёртки и чувствительности, вход Y
    const px = SCOPE_PX;
    const knob = (cy, label) => [
      s('circle', { cx: px, cy, r: 17, fill: d.rad(['#e2e8f0', '#64748b']), stroke: '#1f2937', 'stroke-width': 1 }),
      s('rect', { x: px - 1.5, y: cy - 15, width: 3, height: 10, rx: 1.5, fill: '#1f2937' }),
      text(px, cy + 30, label, { size: 13, weight: 600, fill: '#e2e8f0' }),
    ];
    svg.append(
      ...knob(SCR.y + 24, tr('5 мс/дел')),
      ...knob(SCR.y + 94, tr('10 В/дел')),
      s('circle', { cx: px, cy: SCR.y + 170, r: 10, fill: d.rad(['#f1f5f9', '#94a3b8']), stroke: '#334155', 'stroke-width': 1.2 }),
      s('circle', { cx: px, cy: SCR.y + 170, r: 4, fill: '#1f2937' }),
      text(px - 22, SCR.y + 170, 'Y', { size: 14, weight: 700, fill: '#e2e8f0' }),
      s('circle', { cx: SCOPE.x + 22, cy: SCOPE.y + SCOPE.h - 14, r: 4, fill: '#22c55e' }),
    );
  }

  // Щуп осциллографа: коаксиальный кабель от входа Y к клеммам конденсатора
  function buildProbe(svg) {
    const from = { x: SCOPE_PX, y: SCR.y + 180 };
    const split = { x: 250, y: 318 };
    const coax = `M${from.x} ${from.y} C ${from.x} ${from.y + 40}, ${split.x + 60} ${split.y - 30}, ${split.x} ${split.y}`;
    const lead = (to) => `M${split.x} ${split.y} C ${split.x} ${split.y + 6}, ${to.x} ${to.y - 22}, ${to.x} ${to.y - 6}`;
    svg.append(
      s('path', { d: coax, fill: 'none', stroke: '#111827', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('path', { d: coax, fill: 'none', stroke: '#64748b', 'stroke-width': 1.2, 'stroke-linecap': 'round', transform: 'translate(-1 -1)' }),
      s('path', { d: lead(T.capPlus), fill: 'none', stroke: '#b91c1c', 'stroke-width': 2.5 }),
      s('path', { d: lead(T.capMinus), fill: 'none', stroke: '#111827', 'stroke-width': 2.5 }),
      s('rect', { x: split.x - 5, y: split.y - 6, width: 10, height: 12, rx: 3, fill: '#334155' }),
    );
    // крокодилы на клеммах
    for (const [to, color] of [[T.capPlus, '#ef4444'], [T.capMinus, '#374151']]) {
      svg.append(s('path', { d: `M${to.x - 5} ${to.y - 14} L${to.x + 5} ${to.y - 14} L${to.x + 3} ${to.y - 3} L${to.x - 3} ${to.y - 3} Z`, fill: color, stroke: shade(color, -0.4), 'stroke-width': 0.8 }));
    }
  }

  // ---------- Табло энергии ----------
  function buildEnergy(svg, d) {
    svg.append(
      s('rect', { x: EN.x, y: EN.y, width: EN.w, height: EN.h, rx: 12, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 3, filter: d.url('soft') }),
      text(EN.x + EN.w / 2, EN.y + 26, tr('Энергия в контуре'), { size: 16, weight: 700, fill: '#f8fafc' }),
      // Настоящие колебания длятся миллисекунды — без этой пометки ученик примет медленный луч за истинный
      text(EN.x + EN.w / 2, EN.y + EN.h - 14, tr('Движение замедлено в 100 раз'), { size: 13, weight: 500, fill: '#94a3b8' }),
    );
    const rows = [
      [tr('Электрическое поле конденсатора'), '#60a5fa'],
      [tr('Магнитное поле катушки'), '#c084fc'],
      [tr('Тепло'), '#f87171'],
    ];
    bars = rows.map(([label, color], k) => {
      const y = EN.y + 58 + k * 46;
      const fill = s('rect', { x: BAR.x, y: y + 10, width: 0, height: BAR.h, rx: 4, fill: d.lin([[0, shade(color, 0.25)], [1, shade(color, -0.2)]], 'v') });
      svg.append(
        text(BAR.x, y, label, { size: 14, weight: 600, fill: color, anchor: 'start' }),
        s('rect', { x: BAR.x, y: y + 10, width: BAR.w, height: BAR.h, rx: 4, fill: '#0f172a', stroke: '#475569', 'stroke-width': 1 }),
        fill,
      );
      return fill;
    });
  }

  // ---------- Перекидной ключ ----------
  function buildSwitch(svg, d) {
    blade = s('g', {}, [
      s('rect', { x: PIVOT.x - 3.5, y: PIVOT.y - BLADE_LEN - 4, width: 7, height: BLADE_LEN + 4, rx: 2, fill: d.lin([[0, '#fcd9a8'], [0.5, '#d97706'], [1, '#92400e']]) }),
      // изолированная ручка у свободного конца ножа
      s('rect', { x: PIVOT.x - 6, y: PIVOT.y - BLADE_LEN * 0.55 - 16, width: 12, height: 16, rx: 4, fill: d.lin([[0, '#475569'], [0.4, '#1f2937'], [1, '#0b0f15']]) }),
    ]);
    // Губка: две латунные пластины, между которыми входит нож, и винт-клемма над ними
    const jaw = (p) => s('g', {}, [
      s('rect', { x: p.x - 8, y: p.y - 8, width: 3, height: 14, fill: '#b45309' }),
      s('rect', { x: p.x + 5, y: p.y - 8, width: 3, height: 14, fill: '#b45309' }),
      s('circle', { cx: p.x, cy: p.y - 13, r: 3.5, fill: '#94a3b8', stroke: '#475569', 'stroke-width': 0.8 }),
    ]);
    const g = s('g', {}, [
      floorShadow(SW.x + SW.w / 2, SW.y + SW.h + 2, 70, d, 5),
      s('rect', { x: SW.x, y: SW.y, width: SW.w, height: SW.h, rx: 6, fill: d.lin([[0, '#374151'], [1, '#111827']], 'v'), stroke: '#0b0f15', 'stroke-width': 1 }),
      s('rect', { x: SW.x + 3, y: SW.y + 3, width: SW.w - 6, height: 6, rx: 3, fill: '#ffffff', 'fill-opacity': 0.12 }),
      jaw(JAW_A),
      jaw(JAW_B),
      s('circle', { cx: PIVOT.x, cy: T.pivot.y, r: 3.5, fill: '#94a3b8', stroke: '#475569', 'stroke-width': 0.8 }),
      blade,
      s('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 5, fill: '#78350f', stroke: '#451a03', 'stroke-width': 1 }),
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('sw', params.sw ? 0 : 1);
    });
    touchTarget(g);
    // Подписи положений — над губками, на панели стенда
    svg.append(
      g,
      text(JAW_A.x - 6, SW.y - 12, tr('зарядка'), { size: 13, weight: 600, fill: '#475569' }),
      text(JAW_B.x + 6, SW.y - 12, tr('контур'), { size: 13, weight: 600, fill: '#475569' }),
    );
  }

  // ---------- Источник ----------
  function buildPsu(svg, d) {
    const { x, y, w } = PSU;
    const h = BENCH - y;
    svg.append(
      floorShadow(x + w / 2, BENCH + 2, w * 0.6, d),
      s('rect', { x, y, width: w, height: h, rx: 9, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.5 }),
      s('rect', { x: x + 8, y: y + 8, width: w - 16, height: h - 16, rx: 7, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v') }),
      s('rect', { x: x + 16, y: y + 14, width: 76, height: 26, rx: 5, fill: '#0f172a', stroke: '#475569' }),
      // Напряжение источника постоянно — это надпись на корпусе, а не измерение
      text(x + 54, y + 27, '20 В', { size: 16, weight: 700, fill: '#fbbf24' }),
      s('circle', { cx: x + 34, cy: y + 62, r: 11, fill: d.rad(['#e2e8f0', '#64748b']) }),
      s('rect', { x: x + 32.5, y: y + 52, width: 3, height: 9, rx: 1.5, fill: '#1e293b' }),
      s('circle', { cx: x + 74, cy: y + 62, r: 4.5, fill: '#22c55e', 'fill-opacity': 0.85 }),
    );
  }

  // ---------- Магазин конденсаторов ----------
  function buildCapacitor(svg, d) {
    const { x, y, w } = CAP;
    const h = BENCH - y;
    knobPointer = s('rect', { x: KNOB.x - 1.8, y: KNOB.y - KNOB.r + 3, width: 3.6, height: 12, rx: 1.8, fill: '#f8fafc' });
    const knob = s('g', {}, [
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: KNOB.r + 8, fill: '#000', 'fill-opacity': 0 }),
      s('circle', { cx: KNOB.x, cy: KNOB.y + 2, r: KNOB.r, fill: '#0f172a', 'fill-opacity': 0.35 }),
      s('circle', { cx: KNOB.x, cy: KNOB.y, r: KNOB.r, fill: d.rad(['#64748b', '#111827']), stroke: '#0b0f15', 'stroke-width': 1 }),
      knobPointer,
    ]);
    const ticks = s('g', { stroke: '#e2e8f0', 'stroke-width': 1.4 });
    for (let c = 1; c <= 16; c++) {
      const a = ((-135 + ((c - 1) / 15) * 270 - 90) * Math.PI) / 180;
      const r1 = KNOB.r + 4;
      const r2 = KNOB.r + (c % 5 === 1 ? 10 : 7);
      ticks.append(s('line', { x1: KNOB.x + Math.cos(a) * r1, y1: KNOB.y + Math.sin(a) * r1, x2: KNOB.x + Math.cos(a) * r2, y2: KNOB.y + Math.sin(a) * r2 }));
    }
    // Окошко со схемой конденсатора: знаки заряда на пластинах и поле между ними
    const wx = x + 110;
    const wy = y + 72;
    capSigns = [text(wx - 15, wy, '+', { size: 15, weight: 800, fill: '#f87171' }), text(wx + 15, wy, '−', { size: 15, weight: 800, fill: '#93c5fd' })];
    capField = s('g', { stroke: '#fde68a', 'stroke-width': 1.4, opacity: 1 }, [-7, 0, 7].map((dy) => s('line', { x1: wx - 3, y1: wy + dy, x2: wx + 3, y2: wy + dy })));
    svg.append(
      floorShadow(x + w / 2, BENCH + 2, w * 0.6, d),
      s('rect', { x, y, width: w, height: h, rx: 8, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v'), stroke: '#0f172a', 'stroke-width': 1.2 }),
      s('rect', { x: x + 3, y: y + 3, width: w - 6, height: 6, rx: 3, fill: '#ffffff', 'fill-opacity': 0.15 }),
      ticks,
      s('rect', { x: x + 82, y: y + 19, width: 56, height: 26, rx: 5, fill: '#0b1220', stroke: '#334155' }),
      // Только буква: значение ёмкости видно на регуляторе под сценой
      text(x + 110, y + 32, 'C', { size: 16, weight: 700, fill: '#7dd3fc' }),
      s('rect', { x: x + 86, y: y + 56, width: 48, height: 32, rx: 5, fill: '#0b1220', stroke: '#334155' }),
      s('rect', { x: wx - 7, y: wy - 12, width: 3, height: 24, fill: '#e2e8f0' }),
      s('rect', { x: wx + 4, y: wy - 12, width: 3, height: 24, fill: '#e2e8f0' }),
      capField,
      ...capSigns,
      knob,
    );
    // Ручку ведут мышью влево-вправо, как ручку плитки: так удобнее, чем крутить по кругу
    drags.push([knob, {
      onDrag: (px) => set('C', 1 + ((px - (KNOB.x - 90)) / 180) * 15),
    }]);
  }

  // ---------- Катушка с сердечником ----------
  function buildCoil(svg, d) {
    const { x1, x2, axis } = COIL;
    // Сердечник рисуется до катушки: вдвинутая часть скрыта обмоткой
    const plates = s('g', { stroke: '#334155', 'stroke-opacity': 0.5, 'stroke-width': 0.8 });
    for (let k = 1; k < 6; k++) plates.append(s('line', { x1: CORE_OUT, y1: axis - 13 + k * (26 / 6), x2: CORE_OUT + CORE_LEN, y2: axis - 13 + k * (26 / 6) }));
    core = s('g', {}, [
      floorShadow(CORE_OUT + CORE_LEN - 40, BENCH - 37, 50, d, 3),
      s('rect', { x: CORE_OUT, y: axis - 13, width: CORE_LEN, height: 26, rx: 2, fill: d.lin([[0, '#cbd5e1'], [0.35, '#94a3b8'], [1, '#475569']], 'v'), stroke: '#334155', 'stroke-width': 1 }),
      plates,
      // ручка сердечника
      s('rect', { x: CORE_OUT + CORE_LEN, y: axis - 5, width: 14, height: 10, rx: 2, fill: '#475569' }),
      s('circle', { cx: CORE_OUT + CORE_LEN + 20, cy: axis, r: 10, fill: d.rad(['#f87171', '#991b1b']), stroke: '#7f1d1d', 'stroke-width': 1 }),
    ]);
    // Деревянная подставка, на которой лежит выдвинутый сердечник
    svg.append(
      floorShadow(752, BENCH + 2, 46, d),
      s('rect', { x: 716, y: axis + 13, width: 72, height: BENCH - axis - 13, rx: 3, fill: d.lin([[0, '#c49a68'], [1, '#8a6a43']], 'v'), stroke: '#6b4f33', 'stroke-width': 1 }),
      core,
    );
    const winding = s('g', { stroke: '#7c2d12', 'stroke-opacity': 0.55, 'stroke-width': 1 });
    for (let x = x1 + 13; x < x2 - 10; x += 4.5) winding.append(s('line', { x1: x, y1: axis - 30, x2: x + 2, y2: axis + 30 }));
    svg.append(
      floorShadow((x1 + x2) / 2, BENCH + 2, 90, d),
      s('rect', { x: x1 - 8, y: BENCH - 12, width: x2 - x1 + 16, height: 12, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: x1 + 10, y: axis - 30, width: x2 - x1 - 20, height: 60, fill: d.lin([[0, '#9a3412'], [0.3, '#fdba74'], [0.55, '#ea580c'], [1, '#7c2d12']], 'v') }),
      winding,
      // каркас катушки: щёчки по краям
      ...[x1, x2 - 10].map((fx) => s('rect', { x: fx, y: axis - 44, width: 10, height: BENCH - 12 - (axis - 44), rx: 2, fill: d.lin([[0, '#475569'], [0.5, '#64748b'], [1, '#1f2937']]), stroke: '#111827', 'stroke-width': 0.8 })),
      s('rect', { x: (x1 + x2) / 2 - 16, y: axis - 13, width: 32, height: 26, rx: 5, fill: '#f8fafc', 'fill-opacity': 0.92, stroke: '#cbd5e1' }),
      text((x1 + x2) / 2, axis, 'L', { size: 16, weight: 700, fill: '#1e293b' }),
    );
    core.style.cursor = 'grab';
    // Сердечник тянут за любое место: запоминаем, где его схватили, чтобы он не прыгал под курсор
    let grab = 0;
    core.addEventListener('pointerdown', (e) => {
      const kL = (params.L - 0.05) / 0.95;
      grab = scene.point(e).x - (CORE_OUT - kL * CORE_TRAVEL);
    });
    drags.push([core, {
      onDrag: (px) => set('L', 0.05 + 0.95 * ((CORE_OUT - (px - grab)) / CORE_TRAVEL)),
    }]);
  }

  // ---------- Реостат на панели ----------
  function buildRheostat(svg, d) {
    const { x1, x2, tubeY } = RHEO;
    const coil = s('g', { stroke: '#b45309', 'stroke-width': 1.6 });
    for (let x = x1 + 18; x < x2 - 16; x += 4) coil.append(s('line', { x1: x, y1: tubeY + 1, x2: x + 2, y2: tubeY + 27 }));
    sliderContact = s('rect', { x: 0, y: 270, width: 3, height: 15, fill: '#94a3b8' });
    slider = s('g', {}, [
      s('rect', { x: -15, y: 254, width: 30, height: 18, rx: 4, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v'), stroke: '#111827' }),
      s('rect', { x: -9, y: 259, width: 18, height: 3, rx: 1.5, fill: '#9ca3af' }),
    ]);
    const handle = s('g', {}, [s('rect', { x: x1, y: 246, width: x2 - x1, height: 34, fill: '#000', 'fill-opacity': 0 }), slider]);
    svg.append(
      // кронштейны
      ...[x1, x2 - 12].map((bx) => s('rect', { x: bx - 2, y: 256, width: 16, height: 68, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') })),
      s('rect', { x: x1 + 12, y: tubeY, width: x2 - x1 - 24, height: 28, rx: 6, fill: d.lin([[0, '#f8fafc'], [0.5, '#e7e5e4'], [1, '#a8a29e']], 'v'), stroke: '#78716c', 'stroke-width': 1 }),
      coil,
      s('rect', { x: x1 + 4, y: 261, width: x2 - x1 - 8, height: 5, rx: 2.5, fill: d.lin(['#64748b', '#e2e8f0', '#64748b'], 'v') }),
      sliderContact,
      handle,
    );
    svg.append(text(x2 + 14, 296, 'R', { size: 16, weight: 700, fill: '#334155', anchor: 'start' }));
    drags.push([handle, {
      onDrag: (px) => set('R', 5 + ((px - R_X0) / (R_X1 - R_X0)) * 95),
    }]);
  }

  // Клемма: металлический стержень с цветным колпачком
  function post(d, x, y, color) {
    return s('g', { 'pointer-events': 'none' }, [
      s('rect', { x: x - 3, y: y + 2, width: 6, height: 8, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
      s('rect', { x: x - 6, y: y - 4, width: 12, height: 7, rx: 2.5, fill: d.lin([[0, shade(color, 0.3)], [1, shade(color, -0.3)]], 'v') }),
    ]);
  }

  for (const [node, opts] of drags) draggable(scene, node, opts);
  scene.svg.style.userSelect = 'none';
  return scene;
}
