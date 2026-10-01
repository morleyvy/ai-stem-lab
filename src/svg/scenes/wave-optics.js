// Сцена «Дифракционная решётка»: затемнённая оптическая комната, оптическая скамья с рейтерами —
// лазерный модуль, держатель с решёткой и белый экран с линейкой. Штрихи решётки горизонтальны,
// поэтому максимумы ложатся на экран столбиком по вертикали — веер лучей виден сбоку целиком,
// и угол φ на рисунке настоящий (масштаб по обеим осям одинаковый, 6 px на сантиметр).
// Лазер включают кнопкой на корпусе; другой лазер берут из подставки слева, другую решётку —
// из коробки справа (щелчок по модулю или по рамке); экран двигают вдоль скамьи мышью.
// Лучи, которые не попадают на экран (большие порядки), уходят мимо него — так видно, что
// максимумы существуют, пока sin φ ≤ 1, даже если на экране их нет.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';

const benchY = 455;
const AXIS_Y = 240; // высота оптической оси
const SCALE = 6; // px на сантиметр — и вдоль скамьи, и по линейке экрана
const GR_X = 330; // решётка; L отсчитывается от неё
const RAIL = { left: 135, right: 822, y: 410 };
const LASER = { back: 178, front: 292, r: 15 }; // корпус лазерного модуля
const BEAMS = 60; // пул лучей: у решётки 100 штр./мм с фиолетовым лазером до 49 порядков
const DIM_Y = 440; // размерная линия L под рельсом
const RACK_X = [50, 76, 102]; // гнёзда подставки с лазерами
const TRAY_X = [865, 898, 931]; // гнёзда коробки с решётками
let filterUid = 0;

export function waveOpticsScene(container, params, set, { LASERS, GRATINGS, SCREEN_HALF, kMax }) {
  const HALF = SCREEN_HALF * SCALE;
  let screenRider, rays, spots, beamIn, beamGlow, gratingGlow, aperture, led, band, phiArc, phiLabel, dimLine, dimText, dimPill, gratingLabel;
  let rackMods, traySlides;
  // Плавное включение: луч «разгорается» за доли секунды. Смена лазера или решётки гасит
  // картину и зажигает её заново — видно, что новая картина получена новым опытом.
  let power = params.on ? 1 : 0;
  let key = `${params.laser}|${params.grating}`;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY, theme: 'dark' });
      const uid = ++filterUid;
      svg.querySelector('defs').append(s('filter', { id: `wo-haze-${uid}`, x: '-20%', y: '-50%', width: '140%', height: '200%' }, [s('feGaussianBlur', { stdDeviation: 4 })]));

      // Табличка с условием главных максимумов — подсвечена тусклой лампой, как плакат на стене кабинета
      svg.append(
        s('rect', { x: 40, y: 42, width: 250, height: 70, rx: 10, fill: d.lin([[0, '#2b3442'], [1, '#1a212c']], 'v'), stroke: '#475569', 'stroke-width': 2 }),
        text(165, 78, 'd · sin φ = k · λ', { size: 28, weight: 700, fill: '#e2e8f0' }),
      );

      // Оптическая скамья: рельс на двух опорах, деления через 5 см от решётки
      svg.append(
        floorShadow((RAIL.left + RAIL.right) / 2, benchY + 4, (RAIL.right - RAIL.left) / 2, d),
        s('rect', { x: RAIL.left + 30, y: RAIL.y + 14, width: 14, height: benchY - RAIL.y - 14, fill: '#1f2630' }),
        s('rect', { x: RAIL.right - 44, y: RAIL.y + 14, width: 14, height: benchY - RAIL.y - 14, fill: '#1f2630' }),
        s('rect', { x: RAIL.left, y: RAIL.y, width: RAIL.right - RAIL.left, height: 14, rx: 4, fill: d.lin([[0, '#4b5563'], [0.5, '#9ca3af'], [1, '#374151']], 'v') }),
        s('rect', { x: RAIL.left, y: RAIL.y, width: RAIL.right - RAIL.left, height: 3, fill: '#ffffff', 'fill-opacity': 0.25 }),
      );
      const ticks = s('g');
      for (let cm = 0; GR_X + cm * SCALE <= RAIL.right - 6; cm += 5) {
        const x = GR_X + cm * SCALE;
        ticks.append(s('line', { x1: x, x2: x, y1: RAIL.y + 3, y2: RAIL.y + (cm % 10 === 0 ? 11 : 7), stroke: '#1f2937', 'stroke-width': 1.2 }));
      }
      svg.append(ticks);

      // Оптическая ось (пунктир)
      svg.append(s('line', { x1: LASER.front, x2: RAIL.right, y1: AXIS_Y, y2: AXIS_Y, stroke: '#475569', 'stroke-width': 1, 'stroke-dasharray': '5 6' }));

      // Лучи за решёткой: широкий ореол и яркая сердцевина; рисуются до экрана — экран их перекрывает
      const rayGroup = s('g', { 'stroke-linecap': 'round' });
      rays = Array.from({ length: BEAMS }, () => {
        const wide = s('line', { 'stroke-width': 6, opacity: 0 });
        const core = s('line', { 'stroke-width': 1.4, opacity: 0 });
        rayGroup.append(wide, core);
        return { wide, core };
      });
      svg.append(rayGroup);

      // Дуга угла φ₁ между осью и лучом 1-го порядка
      phiArc = s('path', { fill: 'none', stroke: '#e2e8f0', 'stroke-opacity': 0.7, 'stroke-width': 1.5 });
      phiLabel = text(0, 0, 'φ₁', { size: 15, weight: 700, fill: '#e2e8f0' });
      svg.append(phiArc, phiLabel);

      // Луч от лазера до решётки: дымка, ореол и сердцевина
      beamGlow = s('line', { x1: LASER.front + 8, y1: AXIS_Y, x2: GR_X, y2: AXIS_Y, 'stroke-width': 14, opacity: 0, filter: `url(#wo-haze-${uid})` });
      beamIn = s('line', { x1: LASER.front + 8, y1: AXIS_Y, x2: GR_X, y2: AXIS_Y, 'stroke-width': 2.2, opacity: 0 });
      svg.append(beamGlow, beamIn);

      // Лазерный модуль на рейтере: цветное кольцо на корпусе показывает, какой модуль стоит
      band = s('rect', { x: LASER.front - 30, y: AXIS_Y - LASER.r, width: 10, height: LASER.r * 2, fill: LASERS[0].color });
      led = s('circle', { cx: LASER.back + 18, cy: AXIS_Y - 4, r: 3, fill: '#3f1d1d' });
      aperture = s('circle', { cx: LASER.front + 8, cy: AXIS_Y, r: 8, opacity: 0 });
      const laser = s('g', {}, [
        ...riderParts(d, (LASER.back + LASER.front) / 2, AXIS_Y + LASER.r),
        s('rect', { x: (LASER.back + LASER.front) / 2 - 22, y: AXIS_Y + LASER.r - 4, width: 44, height: 10, rx: 3, fill: '#1f2937' }),
        s('rect', { x: LASER.back, y: AXIS_Y - LASER.r, width: LASER.front - LASER.back, height: LASER.r * 2, rx: 8, fill: d.lin([[0, '#9ca3af'], [0.3, '#e5e7eb'], [0.6, '#6b7280'], [1, '#1f2937']], 'v') }),
        band,
        s('rect', { x: LASER.front - 4, y: AXIS_Y - 9, width: 12, height: 18, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#111827']], 'v') }),
        s('rect', { x: LASER.back, y: AXIS_Y - LASER.r, width: 12, height: LASER.r * 2, rx: 6, fill: '#111827' }),
        led,
        // кнопка питания сверху корпуса
        s('rect', { x: 236, y: AXIS_Y - LASER.r - 8, width: 18, height: 9, rx: 3, fill: '#991b1b', stroke: '#1e293b', 'stroke-width': 1.5 }),
        aperture,
      ]);
      laser.style.cursor = 'pointer';
      laser.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('on', params.on ? 0 : 1);
      });
      touchTarget(laser);
      svg.append(laser);

      // Держатель решётки на рейтере: в прорези — рамка со стеклянной пластинкой, на которой нанесены штрихи
      gratingGlow = s('circle', { cx: GR_X, cy: AXIS_Y, r: 22, opacity: 0 });
      gratingLabel = text(GR_X - 16, AXIS_Y - 72, '', { size: 15, weight: 700, fill: '#cbd5e1', anchor: 'end' });
      svg.append(
        ...riderParts(d, GR_X, AXIS_Y + 50),
        s('rect', { x: GR_X - 9, y: AXIS_Y - 54, width: 18, height: 108, rx: 4, fill: d.lin([[0, '#4b5563'], [1, '#111827']], 'h'), stroke: '#0b0f14', 'stroke-width': 1 }),
        s('rect', { x: GR_X - 3, y: AXIS_Y - 44, width: 6, height: 88, rx: 1.5, fill: '#e7e2d4' }),
        s('rect', { x: GR_X - 1.5, y: AXIS_Y - 22, width: 3, height: 44, fill: d.lin([[0, '#93c5fd'], [0.5, '#f0abfc'], [1, '#86efac']], 'v'), 'fill-opacity': 0.8 }),
        gratingGlow,
        gratingLabel,
        s('line', { x1: GR_X - 14, y1: AXIS_Y - 64, x2: GR_X - 4, y2: AXIS_Y - 50, stroke: '#64748b', 'stroke-width': 1.2 }),
      );

      // Экран на рейтере: белая пластина с миллиметровой линейкой, отсчёт от центрального максимума
      const board = [
        s('rect', { x: -11, y: -HALF - 10, width: 22, height: HALF * 2 + 20, rx: 3, fill: d.lin([[0, '#9ca3af'], [1, '#4b5563']], 'h') }),
        s('rect', { x: -8, y: -HALF - 6, width: 16, height: HALF * 2 + 12, rx: 2, fill: d.lin([[0, '#f8fafc'], [1, '#cbd5e1']], 'h') }),
      ];
      for (let mm = -SCREEN_HALF * 10; mm <= SCREEN_HALF * 10; mm += 10) {
        const y = (mm / 10) * SCALE;
        const major = mm % 50 === 0;
        board.push(s('line', { x1: 8, x2: major ? 0 : 4, y1: y, y2: y, stroke: '#334155', 'stroke-width': major ? 1.4 : 0.8 }));
        if (major) board.push(text(18, y, String(Math.abs(mm / 10)), { size: 13, weight: 600, fill: '#cbd5e1', anchor: 'start' }));
      }
      board.push(text(18, -HALF - 22, tr('см'), { size: 13, weight: 600, fill: '#94a3b8', anchor: 'start' }));
      const spotGroup = s('g');
      spots = Array.from({ length: BEAMS }, () => {
        const glow = s('ellipse', { rx: 13, ry: 10, opacity: 0 });
        const core = s('ellipse', { rx: 3.2, ry: 2.6, fill: '#ffffff', opacity: 0 });
        spotGroup.append(glow, core);
        return { glow, core };
      });
      screenRider = s('g', {}, [...riderParts(d, 0, HALF + 10, true), ...board, spotGroup, s('rect', { x: -26, y: -HALF - 12, width: 52, height: HALF * 2 + 24, fill: 'transparent' })]);
      svg.append(screenRider);

      // Размерная линия L между решёткой и экраном
      dimLine = s('path', { fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.4 });
      dimPill = s('rect', { y: DIM_Y - 11, height: 22, rx: 11, fill: '#111827', stroke: '#475569', 'stroke-width': 1 });
      dimText = text(0, DIM_Y + 1, '', { size: 14, weight: 700, fill: '#e2e8f0' });
      svg.append(dimLine, dimPill, dimText);

      // Подставка с лазерными модулями слева на столе
      svg.append(
        floorShadow(76, benchY + 2, 50, d),
        s('rect', { x: 32, y: benchY - 18, width: 88, height: 18, rx: 4, fill: d.lin([[0, '#374151'], [1, '#111827']], 'v'), stroke: '#0b0f14' }),
        ...RACK_X.map((x) => s('ellipse', { cx: x, cy: benchY - 18, rx: 9, ry: 3, fill: '#05070a' })),
      );
      rackMods = LASERS.map((l, i) => {
        const x = RACK_X[i];
        const g = s('g', {}, [
          s('rect', { x: x - 9, y: benchY - 96, width: 18, height: 80, rx: 6, fill: d.lin([[0, '#1f2937'], [0.35, '#d1d5db'], [0.7, '#6b7280'], [1, '#111827']], 'h') }),
          s('rect', { x: x - 9, y: benchY - 76, width: 18, height: 8, fill: l.color }),
          s('rect', { x: x - 5, y: benchY - 104, width: 10, height: 10, rx: 2, fill: '#111827' }),
        ]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('laser', i);
        });
        touchTarget(g, 8);
        svg.append(g);
        return g;
      });
      svg.append(text(76, benchY - 122, tr('Лазеры'), { size: 13, weight: 600, fill: '#94a3b8' }));

      // Коробка с решётками справа: рамки с подписью числа штрихов на 1 мм
      svg.append(
        floorShadow(898, benchY + 2, 50, d),
        s('rect', { x: 846, y: benchY - 22, width: 104, height: 22, rx: 4, fill: d.lin([[0, '#4b3a2a'], [1, '#2a2018']], 'v'), stroke: '#0b0f14' }),
      );
      traySlides = GRATINGS.map((n, i) => {
        const x = TRAY_X[i];
        const g = s('g', {}, [
          s('rect', { x: x - 15, y: benchY - 96, width: 30, height: 78, rx: 2, fill: d.lin([[0, '#f5f0e1'], [1, '#d6cfbb']], 'v'), stroke: '#8a8270', 'stroke-width': 1 }),
          text(x, benchY - 84, String(n), { size: 13, weight: 700, fill: '#1f2937' }),
          s('rect', { x: x - 8, y: benchY - 70, width: 16, height: 40, fill: d.lin([[0, '#1e3a8a'], [0.35, '#7c3aed'], [0.65, '#0f766e'], [1, '#1e3a8a']], 'v'), 'fill-opacity': 0.55, stroke: '#475569' }),
        ]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('grating', i);
        });
        touchTarget(g, 8);
        return g;
      });
      svg.append(...traySlides, s('rect', { x: 846, y: benchY - 30, width: 104, height: 30, rx: 4, fill: d.lin([[0, '#6b5038'], [1, '#3b2c1f']], 'v'), stroke: '#0b0f14' }));
      svg.append(text(948, benchY - 112, tr('штрихов на 1 мм'), { size: 13, weight: 600, fill: '#94a3b8', anchor: 'end' }));

      // Градиенты пятен — по одному на цвет лазера
      spots.fills = LASERS.map((l) => d.rad([[0, '#ffffff', 0.95], [0.25, l.color, 0.9], [1, l.color, 0]], 0.5, 0.5));
    },

    frame(dt) {
      const k2 = `${params.laser}|${params.grating}`;
      if (k2 !== key) {
        key = k2;
        power = 0;
      }
      power += ((params.on ? 1 : 0) - power) * Math.min(1, dt * 8);
      const P = power < 0.01 ? 0 : power;
      const L = params.L * SCALE;
      const xs = GR_X + L;
      const laser = LASERS[params.laser];
      const color = laser.color;

      screenRider.setAttribute('transform', `translate(${xs} ${AXIS_Y})`);
      band.setAttribute('fill', color);
      led.setAttribute('fill', params.on ? '#22c55e' : '#3f1d1d');
      gratingLabel.textContent = `d = 1/${GRATINGS[params.grating]} ${tr('мм')}`;
      // Модуль и решётка, стоящие на скамье, пропадают из подставки и коробки и не ловят щелчки
      const park = (g, inUse) => {
        g.setAttribute('opacity', inUse ? 0 : 1);
        g.style.pointerEvents = inUse ? 'none' : 'auto';
      };
      rackMods.forEach((g, i) => park(g, i === params.laser));
      traySlides.forEach((g, i) => park(g, i === params.grating));

      // Луч до решётки и свечение в точке, где он её пересекает
      for (const el of [beamIn, beamGlow]) el.setAttribute('stroke', color);
      beamIn.setAttribute('opacity', P);
      beamGlow.setAttribute('opacity', P * 0.45);
      aperture.setAttribute('fill', spots.fills[params.laser]);
      aperture.setAttribute('opacity', P);
      gratingGlow.setAttribute('fill', spots.fills[params.laser]);
      gratingGlow.setAttribute('opacity', P * 0.8);

      // Веер лучей: порядок k идёт под углом sin φ = kλ/d. Луч кончается на экране, если попал
      // в пределы линейки, иначе уходит мимо экрана до края сцены или до рельса.
      const kM = kMax(params);
      const sinStep = laser.nm / 1000 / (1000 / GRATINGS[params.grating]);
      let n = 0;
      for (let k = -kM; k <= kM; k++) {
        if (n >= BEAMS) break;
        const ray = rays[n];
        const spot = spots[n];
        n++;
        const phi = Math.asin(k * sinStep);
        const dy = -Math.tan(phi) * L; // вверх — положительные порядки
        // Яркость максимумов падает с номером порядка (огибающая дифракции на одной щели)
        const I = k === 0 ? 1 : 0.75 / (1 + 0.35 * Math.abs(k));
        let x2;
        let y2;
        const hit = Math.abs(dy) <= HALF;
        if (hit) {
          x2 = xs - 8;
          y2 = AXIS_Y + dy * ((L - 8) / L);
        } else {
          const cos = Math.cos(phi);
          const sin = -Math.sin(phi);
          const tX = (960 - GR_X) / cos;
          const tY = sin < 0 ? (0 - AXIS_Y) / sin : (RAIL.y - AXIS_Y) / sin;
          const t = Math.min(tX, tY);
          x2 = GR_X + cos * t;
          y2 = AXIS_Y + sin * t;
        }
        for (const el of [ray.wide, ray.core]) {
          el.setAttribute('x1', GR_X);
          el.setAttribute('y1', AXIS_Y);
          el.setAttribute('x2', x2.toFixed(1));
          el.setAttribute('y2', y2.toFixed(1));
          el.setAttribute('stroke', color);
        }
        // Лучи мимо экрана — тонкие и бледные: они лишь показывают, что порядок существует,
        // и не спорят за внимание с пятнами на линейке
        ray.wide.setAttribute('opacity', hit ? (P * I * 0.22).toFixed(3) : 0);
        ray.core.setAttribute('opacity', (P * I * (hit ? 0.75 : 0.3)).toFixed(3));
        if (hit) {
          spot.glow.setAttribute('cx', 0);
          spot.glow.setAttribute('cy', dy.toFixed(1));
          spot.core.setAttribute('cx', 0);
          spot.core.setAttribute('cy', dy.toFixed(1));
          spot.glow.setAttribute('fill', spots.fills[params.laser]);
          spot.glow.setAttribute('opacity', (P * Math.min(1, I + 0.25)).toFixed(3));
          spot.core.setAttribute('opacity', (P * I).toFixed(3));
        } else {
          spot.glow.setAttribute('opacity', 0);
          spot.core.setAttribute('opacity', 0);
        }
      }
      for (let i = n; i < BEAMS; i++) {
        rays[i].wide.setAttribute('opacity', 0);
        rays[i].core.setAttribute('opacity', 0);
        spots[i].glow.setAttribute('opacity', 0);
        spots[i].core.setAttribute('opacity', 0);
      }

      // Дуга φ₁ с подписью — только если подпись помещается между осью и лучом 1-го порядка
      const phi1 = Math.asin(Math.min(1, sinStep));
      const rLabel = Math.max(70, 22 / phi1);
      const showPhi = P > 0.5 && kM >= 1 && rLabel + 10 < L;
      if (showPhi) {
        const r = rLabel - 14;
        phiArc.setAttribute('d', `M${GR_X + r} ${AXIS_Y} A${r} ${r} 0 0 0 ${(GR_X + r * Math.cos(phi1)).toFixed(1)} ${(AXIS_Y - r * Math.sin(phi1)).toFixed(1)}`);
        phiLabel.setAttribute('x', (GR_X + (rLabel + 4) * Math.cos(phi1 / 2)).toFixed(1));
        phiLabel.setAttribute('y', (AXIS_Y - (rLabel + 4) * Math.sin(phi1 / 2)).toFixed(1));
      }
      phiArc.setAttribute('opacity', showPhi ? 1 : 0);
      phiLabel.setAttribute('opacity', showPhi ? 1 : 0);

      // Размерная линия L со стрелками и подписью посередине
      const a = 6;
      dimLine.setAttribute('d', `M${GR_X} ${DIM_Y - 8} V${DIM_Y + 8} M${xs} ${DIM_Y - 8} V${DIM_Y + 8} M${GR_X} ${DIM_Y} H${xs} M${GR_X + a} ${DIM_Y - 4} L${GR_X} ${DIM_Y} L${GR_X + a} ${DIM_Y + 4} M${xs - a} ${DIM_Y - 4} L${xs} ${DIM_Y} L${xs - a} ${DIM_Y + 4}`);
      const label = `L = ${params.L} ${tr('см')}`;
      const w = label.length * 8 + 16;
      const cx = (GR_X + xs) / 2;
      dimText.setAttribute('x', cx);
      dimText.textContent = label;
      dimPill.setAttribute('x', cx - w / 2);
      dimPill.setAttribute('width', w);
    },
  });

  draggable(scene, screenRider, {
    onDrag: (x) => set('L', (x - GR_X) / SCALE),
  });
  scene.svg.style.userSelect = 'none';
  return scene;
}

// Рейтер скамьи: стойка от держателя до рельса и башмак, обхватывающий рельс.
// local — координаты внутри группы экрана (начало на оптической оси), иначе — абсолютные
function riderParts(d, x, y0, local = false) {
  const railY = local ? RAIL.y - AXIS_Y : RAIL.y;
  return [
    s('rect', { x: x - 4, y: y0, width: 8, height: railY - y0, fill: d.lin(['#6b7280', '#9ca3af', '#374151']) }),
    s('path', { d: `M${x - 18} ${railY - 6} L${x + 18} ${railY - 6} L${x + 13} ${railY + 10} L${x - 13} ${railY + 10} Z`, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
  ];
}
