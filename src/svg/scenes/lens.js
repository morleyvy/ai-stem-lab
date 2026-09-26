// Сцена «Собирающая линза»: затемнённая оптическая комната, оптическая скамья с рейтерами —
// свеча, линза в оправе, экран. Свечу зажигают щелчком по фитилю; свечу и экран двигают мышью.
// Изображение на экране резкое, только когда экран стоит на расстоянии f от линзы; при
// отклонении оно расплывается пропорционально промаху — ученик сам ищет резкость, как на уроке.
// В темноте виден световой конус от пламени к линзе и от линзы к экрану (рассеяние в дымке).
// Когда предмет ближе фокуса, изображение мнимое — рисуется полупрозрачным на стороне свечи.

import { createScene, draggable, floorShadow, room, s } from '../kit.js';

const LENS_X = 480;
const AXIS_Y = 260; // высота оптической оси над рельсом
const SCALE = 6.4; // пикселей на сантиметр
const OBJ_H = 60; // высота пламени над осью (условный масштаб объекта)
const RAIL = { left: 70, right: 900, y: AXIS_Y + 96 };
const BASE = 20; // отступ от оси до верха стойки рейтера — здесь «стоит» предмет/экран
const benchY = 430;
const APERTURE = 78; // полувысота светового отверстия линзы
const FLAME_Y = -52; // центр пламени относительно оси — «точка предмета» для светового конуса
const SCREEN_MIN = 3; // ближе к линзе экран не подвинуть — мешает оправа
const SCREEN_MAX = (RAIL.right - 20 - LENS_X) / SCALE;
const FOCUS_TOL = 1; // допуск резкости, см
let filterUid = 0;

export function lensScene(container, params, set, { imageDistance }) {
  let candleRider, screenRider, screenImg, screenPatch, blurNode, virtualGroup, virtualFlame, guideLines, fMarks, lensGlass, lensHalo;
  let flame, flameHalo, coneIn, coneOut;
  let screenCm = 25; // положение экрана — состояние сцены, а не регулятор: его ищут руками
  let mySharp = params.sharp; // последнее значение sharp, выставленное самой сценой
  let autoUntil = 0; // до этого момента экран сам «доезжает» до резкости (запасная кнопка в работе)
  let litK = params.lit ? 1 : 0; // плавное разгорание пламени
  let lastBlur = -1;

  const xOfD = (d) => LENS_X - d * SCALE;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY, theme: 'dark' });

      // Фильтры создаются один раз: дымка светового конуса и размытие изображения на экране
      const uid = ++filterUid;
      blurNode = s('feGaussianBlur', { stdDeviation: 0 });
      svg.querySelector('defs').append(
        s('filter', { id: `lens-haze-${uid}`, x: '-20%', y: '-20%', width: '140%', height: '140%' }, [s('feGaussianBlur', { stdDeviation: 6 })]),
        s('filter', { id: `lens-blur-${uid}`, x: '-150%', y: '-60%', width: '400%', height: '220%' }, [blurNode]),
      );

      // Оптическая скамья: металлический рельс на двух опорах, с делениями
      svg.append(
        floorShadow((RAIL.left + RAIL.right) / 2, benchY + 6, (RAIL.right - RAIL.left) / 2, d),
        s('rect', { x: RAIL.left + 30, y: RAIL.y + 14, width: 14, height: benchY - RAIL.y - 14, fill: '#1f2630' }),
        s('rect', { x: RAIL.right - 44, y: RAIL.y + 14, width: 14, height: benchY - RAIL.y - 14, fill: '#1f2630' }),
        s('rect', { x: RAIL.left, y: RAIL.y, width: RAIL.right - RAIL.left, height: 14, rx: 4, fill: d.lin([[0, '#4b5563'], [0.5, '#9ca3af'], [1, '#374151']], 'v') }),
        s('rect', { x: RAIL.left, y: RAIL.y, width: RAIL.right - RAIL.left, height: 3, fill: '#ffffff', 'fill-opacity': 0.25 }),
      );
      const ticks = s('g');
      for (let x = RAIL.left; x <= RAIL.right; x += 20) {
        ticks.append(s('line', { x1: x, x2: x, y1: RAIL.y, y2: RAIL.y + ((x - RAIL.left) % 100 === 0 ? 7 : 4), stroke: '#1f2937', 'stroke-opacity': 0.7, 'stroke-width': 1 }));
      }
      svg.append(ticks);

      // Оптическая ось (пунктир)
      svg.append(s('line', { x1: RAIL.left, x2: RAIL.right, y1: AXIS_Y, y2: AXIS_Y, stroke: '#475569', 'stroke-width': 1.2, 'stroke-dasharray': '5 6' }));

      // Световые конусы в дымке: от пламени к линзе и от линзы к экрану
      const coneFill = d.lin([[0, '#fde68a', 0.5], [1, '#fb923c', 0.35]], 'h');
      coneIn = s('path', { fill: coneFill, filter: `url(#lens-haze-${uid})`, opacity: 0 });
      coneOut = s('path', { fill: coneFill, filter: `url(#lens-haze-${uid})`, opacity: 0 });
      svg.append(coneIn, coneOut);

      // Метки фокусов F и 2F на оси — только деления, без подписей (значения — в регуляторах)
      fMarks = [-2, -1, 1, 2].map(() => ({
        dot: s('circle', { cy: AXIS_Y, r: 4, fill: '#f59e0b' }),
        tick: s('line', { y1: RAIL.y, y2: RAIL.y + 7, stroke: '#b45309', 'stroke-width': 2 }),
      }));
      for (const m of fMarks) svg.append(m.tick, m.dot);

      // Экран на рейтере — молочно-белая пластина в рамке; на ней световое пятно и изображение
      screenPatch = s('ellipse', { cx: 0, rx: 9, ry: 20, fill: d.rad([[0, '#fff7ed', 0.9], [1, '#fdba74', 0]], 0.5, 0.5), opacity: 0 });
      screenImg = s('path', { fill: d.rad([[0, '#fffbeb'], [0.55, '#fbbf24'], [1, '#f97316', 0]], 0.5, 0.5), opacity: 0, filter: `url(#lens-blur-${uid})` });
      const screenClip = `lens-screen-${uid}`;
      svg.querySelector('defs').append(s('clipPath', { id: screenClip }, [s('rect', { x: -9, y: -86, width: 18, height: 172, rx: 5 })]));
      screenRider = rider(d, [
        s('rect', { x: -9, y: -86, width: 18, height: 172, rx: 5, fill: d.lin([[0, '#4b5563'], [0.4, '#6b7280'], [1, '#374151']], 'h'), stroke: '#1f2937', 'stroke-width': 1.5 }),
        s('g', { 'clip-path': `url(#${screenClip})` }, [screenPatch]),
        screenImg,
      ], { gripY: 0 });
      svg.append(screenRider);

      // Линза в оправе на рейтере: форма меняется при изменении фокусного расстояния;
      // мягкий ореол вокруг стекла — свет свечи рассеивается на его поверхности
      lensHalo = s('ellipse', { rx: 46, ry: 104, fill: d.rad([[0, '#fde68a', 0.45], [0.6, '#fdba74', 0.12], [1, '#fdba74', 0]], 0.5, 0.5), opacity: 0 });
      lensGlass = s('path', { stroke: '#60a5fa', 'stroke-width': 2, fill: d.lin([[0, '#93c5fd', 0.2], [0.5, '#eff6ff', 0.4], [1, '#93c5fd', 0.2]]) });
      const lensRider = rider(d, [
        lensHalo,
        s('rect', { x: -15, y: -92, width: 30, height: 184, rx: 12, fill: d.lin([[0, '#374151'], [1, '#111827']], 'v') }),
        lensGlass,
      ]);
      lensRider.setAttribute('transform', `translate(${LENS_X} ${AXIS_Y})`);
      svg.append(lensRider);

      // Мнимое изображение — полупрозрачное пламя со штриховыми линиями-подсказками
      guideLines = s('g', { stroke: '#ca8a04', 'stroke-width': 1.3, 'stroke-dasharray': '5 5' });
      const virtualPath = s('path', { fill: d.rad([[0, '#fef9c3'], [0.55, '#fbbf24'], [1, '#f97316', 0]], 0.5, 0.35) });
      virtualFlame = { path: virtualPath, set: (mag) => virtualPath.setAttribute('d', dropPath(0, -OBJ_H * mag)) };
      virtualGroup = s('g', { opacity: 0 }, [guideLines, virtualPath]);
      svg.append(virtualGroup);

      // Свеча-предмет: воск с фитилём на рейтере; пламя и тёплый ореол появляются, когда свечу зажгли
      const topY = BASE - OBJ_H;
      const wax = s('rect', { x: -9, y: topY, width: 18, height: OBJ_H, fill: d.lin([[0, '#a8a07a'], [0.5, '#e7dcae'], [1, '#8a7f55']], 'h') });
      const wick = s('path', { d: `M0 ${topY} q 1 -5 -1 -9`, stroke: '#1f2937', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' });
      flameHalo = s('circle', { cy: topY - 14, r: 80, fill: d.rad([[0, '#fde68a', 0.4], [0.4, '#fb923c', 0.12], [1, '#fb923c', 0]], 0.5, 0.5), opacity: 0 });
      flame = s('path', { d: dropPath(topY - 2, topY - 26), fill: d.rad([[0, '#fef9c3'], [0.55, '#fbbf24'], [1, '#f97316', 0]], 0.5, 0.35), opacity: 0 });
      candleRider = rider(d, [flameHalo, wax, wick, flame], { gripY: BASE - OBJ_H * 0.6 });
      // Щелчок по фитилю зажигает (или гасит) свечу; зона щелчка лежит поверх зоны перетаскивания
      const wickHit = s('circle', { cy: topY - 12, r: 16, fill: 'transparent' });
      wickHit.style.cursor = 'pointer';
      wickHit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('lit', params.lit ? 0 : 1);
      });
      candleRider.append(wickHit);
      svg.append(candleRider);
    },

    frame(dt, now) {
      const F = params.F;
      const f = imageDistance(params);
      const candleX = xOfD(params.d);
      candleRider.setAttribute('transform', `translate(${candleX} ${AXIS_Y})`);
      litK += ((params.lit ? 1 : 0) - litK) * Math.min(1, dt * 6);

      // Пламя живое: слегка вытягивается и колышется
      const topY = BASE - OBJ_H;
      const flick = 1 + 0.07 * Math.sin(now * 13) + 0.04 * Math.sin(now * 29 + 1);
      flame.setAttribute('transform', `translate(0 ${topY}) scale(${(0.9 + 0.1 / flick) * litK} ${flick * litK}) translate(0 ${-topY})`);
      flame.setAttribute('opacity', litK);
      flameHalo.setAttribute('opacity', litK * (0.85 + 0.15 * Math.sin(now * 11)));
      lensHalo.setAttribute('opacity', litK * 0.8);

      // Кривизна линзы: короче фокус — сильнее выпуклость стёкол
      const bulge = Math.max(14, Math.min(38, 260 / F));
      const lensH = 168;
      lensGlass.setAttribute('d', `M0 ${-lensH / 2} Q ${bulge} 0 0 ${lensH / 2} Q ${-bulge} 0 0 ${-lensH / 2} Z`);

      // Метки F и 2F — видимы, только если попадают в пределы скамьи
      [-2, -1, 1, 2].forEach((k, i) => {
        const x = LENS_X + k * F * SCALE;
        const visible = x > RAIL.left + 10 && x < RAIL.right - 10;
        fMarks[i].dot.setAttribute('cx', x);
        fMarks[i].tick.setAttribute('x1', x);
        fMarks[i].tick.setAttribute('x2', x);
        fMarks[i].dot.setAttribute('opacity', visible ? 1 : 0);
        fMarks[i].tick.setAttribute('opacity', visible ? 1 : 0);
      });

      const real = Boolean(params.lit) && f !== null && f > 0;
      updateFocus(dt, now, f, real);
      const xs = LENS_X + screenCm * SCALE;
      screenRider.setAttribute('transform', `translate(${xs} ${AXIS_Y})`);

      // Световые конусы: к линзе — от пламени; за линзой — сходятся к изображению пламени
      // (или расходятся от мнимого) и обрываются на экране. Сечение конуса на экране — световое пятно.
      const yObj = FLAME_Y;
      const flameX = candleX;
      coneIn.setAttribute('d', `M${flameX} ${AXIS_Y + yObj} L${LENS_X} ${AXIS_Y - APERTURE} L${LENS_X} ${AXIS_Y + APERTURE} Z`);
      let yt, yb;
      if (f !== null && f > 0) {
        const ix = LENS_X + f * SCALE;
        const iy = -yObj * (f / params.d); // изображение перевёрнуто
        const k = (xs - LENS_X) / (ix - LENS_X);
        yt = -APERTURE + (iy + APERTURE) * k;
        yb = APERTURE + (iy - APERTURE) * k;
      } else {
        // Мнимое изображение (или d = F): лучи за линзой расходятся (идут параллельно)
        const slope = f === null ? -yObj / (params.d * SCALE) : null;
        const vx = f === null ? 0 : LENS_X + f * SCALE;
        const vy = f === null ? 0 : yObj * Math.abs(f / params.d);
        const along = (yL) => (f === null ? yL + slope * (xs - LENS_X) : yL + ((yL - vy) / (LENS_X - vx)) * (xs - LENS_X));
        // Расходящийся пучок обрезаем по рельсу и верху сцены — дальше свет всё равно гаснет в темноте
        yt = Math.max(-AXIS_Y + 20, along(-APERTURE));
        yb = Math.min(RAIL.y - AXIS_Y, along(APERTURE));
      }
      coneOut.setAttribute('d', `M${LENS_X} ${AXIS_Y - APERTURE} L${LENS_X} ${AXIS_Y + APERTURE} L${xs} ${AXIS_Y + yb} L${xs} ${AXIS_Y + yt} Z`);
      coneIn.setAttribute('opacity', litK * 0.22);
      coneOut.setAttribute('opacity', litK * 0.22);

      // Пятно на экране: чем шире сечение конуса, тем тусклее (свет распределён по большей площади)
      const half = Math.abs(yb - yt) / 2 + 6;
      screenPatch.setAttribute('cy', (yt + yb) / 2);
      screenPatch.setAttribute('ry', half);
      screenPatch.setAttribute('opacity', litK * Math.min(0.9, 30 / (half + 10)));

      if (real) {
        // Действительное перевёрнутое изображение на экране; размытие — по промаху экрана мимо f
        const miss = Math.abs(screenCm - f);
        const mag = Math.max(0.3, Math.min(1.8, Math.abs(f / params.d)));
        const blur = Math.round(Math.min(14, miss * 2.2) * 2) / 2;
        if (blur !== lastBlur) {
          blurNode.setAttribute('stdDeviation', blur);
          lastBlur = blur;
        }
        screenImg.setAttribute('d', dropPath(0, OBJ_H * mag));
        screenImg.setAttribute('opacity', (litK * 0.95) / (1 + miss * 0.25));
        virtualGroup.setAttribute('opacity', 0);
      } else {
        screenImg.setAttribute('opacity', 0);
        if (params.lit && f !== null && f < 0) {
          const imgX = Math.max(RAIL.left + 40, LENS_X + f * SCALE);
          const mag = Math.max(0.4, Math.min(2.2, Math.abs(f / params.d)));
          virtualFlame.set(mag);
          virtualGroup.setAttribute('transform', `translate(${imgX} ${AXIS_Y})`);
          virtualGroup.setAttribute('opacity', 0.5 * litK);
          guideLines.replaceChildren(
            s('line', { x1: LENS_X - imgX, y1: BASE - OBJ_H, x2: 0, y2: -OBJ_H * mag }),
            s('line', { x1: candleX - imgX, y1: BASE - OBJ_H, x2: 0, y2: -OBJ_H * mag }),
          );
        } else {
          virtualGroup.setAttribute('opacity', 0);
        }
      }
    },
  });

  // Резкость — функция положения экрана. Если sharp = 1 выставили снаружи (кнопка в карточке шага),
  // экран сам плавно доезжает до изображения; иначе сцена сама пересчитывает sharp по промаху.
  function updateFocus(dt, now, f, real) {
    if (params.sharp !== mySharp) {
      mySharp = params.sharp;
      if (params.sharp === 1) autoUntil = now + 1.2;
    }
    const reachable = real && f >= SCREEN_MIN && f <= SCREEN_MAX;
    if (now < autoUntil && reachable) {
      screenCm += (f - screenCm) * Math.min(1, dt * 6);
      return;
    }
    const v = reachable && Math.abs(screenCm - f) <= FOCUS_TOL ? 1 : 0;
    if (v !== params.sharp) {
      set('sharp', v);
      mySharp = params.sharp;
    }
  }

  draggable(scene, candleRider, {
    onDrag: (x) => set('d', (LENS_X - x) / SCALE),
  });
  draggable(scene, screenRider, {
    onDrag: (x) => {
      autoUntil = 0;
      screenCm = Math.max(SCREEN_MIN, Math.min(SCREEN_MAX, (x - LENS_X) / SCALE));
    },
  });
  return scene;
}

// Рейтер: держатель, скользящий по рельсу скамьи — стойка снизу и площадка сверху
function rider(d, content, { gripY = null } = {}) {
  const g = s('g', {}, [
    s('path', { d: 'M-18 96 L18 96 L11 110 L-11 110 Z', fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
    s('rect', { x: -5, y: BASE, width: 10, height: 96 - BASE, fill: d.lin(['#6b7280', '#9ca3af', '#374151']) }),
    ...content,
  ]);
  if (gripY !== null) g.append(s('circle', { cy: gripY, r: 34, fill: 'transparent' }));
  return g;
}

// Капля пламени от baseY (широкое основание) до tipY (остриё) — знак (tipY − baseY) задаёт направление
function dropPath(baseY, tipY) {
  const w = Math.abs(tipY - baseY) * 0.45;
  const midY = baseY + (tipY - baseY) * 0.18;
  return `M0 ${tipY} Q ${w} ${midY} 0 ${baseY} Q ${-w} ${midY} 0 ${tipY} Z`;
}
