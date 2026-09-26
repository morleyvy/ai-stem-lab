// Сцена «Пульс и нагрузка» — медицинский кабинет: светлая стена с панелью, линолеум на полу,
// кушетка, настенные часы с секундной стрелкой, настенный монитор ЭКГ, беговая дорожка
// и учебная модель сердца на тумбе. Сначала пульс измеряют вручную: пальцы на запястье руки,
// лежащей на кушетке (щелчок по руке), 15 секунд считаем удары, ЧСС = удары × 4.
// До этого монитор в режиме ожидания и частоту не показывает.

import { createScene, floorShadow, readout, s, shade, text, W, H } from '../kit.js';

const FLOOR = 420; // линия стыка стены и пола
const HEART = { x: 105, y: 236, k: 0.6 };
const MONITOR = { x: 380, y: 36, w: 250, h: 176 };
const TREADMILL = { x: 792, bottom: 470, w: 280 };
const CLOCK = { x: 112, y: 96, r: 46 };
const COUCH = { x1: 196, x2: 600, top: 352 };
const WRIST = { x: 458, y: 338 }; // точка прощупывания пульса (лучевая артерия)
const COUNT_TIME = 15; // с — стандартный подсчёт пульса

export function pulseScene(container, params, set, { heartRate, zone }) {
  let heartBody, heartGlow, sweepPath, hrScreenText, zoneText, standbyText, beltStripes, consoleEl, secondHand, sector, fingers, ring, beatsOut, hrOut;
  let shownHr = heartRate(params);
  let beatPhase = 0;
  let sweep = 0;
  const points = [];
  // Ручной подсчёт: counting — идёт отсчёт; beats — насчитанные удары; result — последняя ЧСС (уд/мин)
  let counting = false;
  let countT = 0;
  let countStart = 0;
  let countPhase = 0;
  let beats = 0;
  let result = params.measured ? Math.round(heartRate(params)) : null;
  let ringT = 1;
  let press = 0;

  const scene = createScene(container, {
    build(svg, d) {
      // ---- Стены и пол кабинета ----
      svg.append(
        s('rect', { x: 0, y: 0, width: W, height: FLOOR, fill: d.lin([[0, '#f6f8f9'], [1, '#e8eef0']], 'v') }),
        // нижняя моющаяся панель стены, как в поликлинике
        s('rect', { x: 0, y: 292, width: W, height: FLOOR - 292, fill: d.lin([[0, '#dcebe7'], [1, '#cfe2dc']], 'v') }),
        s('rect', { x: 0, y: 286, width: W, height: 8, fill: d.lin([[0, '#c3d8d2'], [1, '#aac4bd']], 'v') }),
        s('ellipse', { cx: W * 0.45, cy: 0, rx: W * 0.6, ry: 300, fill: d.rad([[0, '#ffffff', 0.7], [1, '#ffffff', 0]], 0.5, 0.2) }),
        // плинтус и линолеум
        s('rect', { x: 0, y: FLOOR - 8, width: W, height: 8, fill: '#e5e9eb' }),
        s('rect', { x: 0, y: FLOOR, width: W, height: H - FLOOR, fill: d.lin([[0, '#c3cdd3'], [1, '#a4b0b8']], 'v') }),
        s('g', { stroke: '#94a3ad', 'stroke-opacity': 0.35, 'stroke-width': 1 }, [
          ...[455, 500].map((y) => s('line', { x1: 0, y1: y, x2: W, y2: y })),
          ...Array.from({ length: 9 }, (_, i) => {
            const x = 60 + i * 110;
            return s('line', { x1: x, y1: FLOOR, x2: W / 2 + (x - W / 2) * 1.5, y2: H });
          }),
        ]),
      );

      // ---- Настенные часы: по секундной стрелке считают 15 секунд ----
      secondHand = s('line', { x1: CLOCK.x, y1: CLOCK.y + 8, x2: CLOCK.x, y2: CLOCK.y - CLOCK.r + 8, stroke: '#dc2626', 'stroke-width': 1.6, 'stroke-linecap': 'round' });
      sector = s('path', { fill: '#fecaca', opacity: 0 });
      const marks = Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2;
        const r1 = CLOCK.r - 4;
        const r2 = CLOCK.r - (i % 5 ? 7 : 11);
        return s('line', { x1: CLOCK.x + Math.sin(a) * r1, y1: CLOCK.y - Math.cos(a) * r1, x2: CLOCK.x + Math.sin(a) * r2, y2: CLOCK.y - Math.cos(a) * r2, stroke: '#334155', 'stroke-width': i % 5 ? 0.8 : 2 });
      });
      svg.append(
        s('circle', { cx: CLOCK.x, cy: CLOCK.y + 3, r: CLOCK.r + 6, fill: '#0f172a', 'fill-opacity': 0.1 }),
        s('circle', { cx: CLOCK.x, cy: CLOCK.y, r: CLOCK.r + 5, fill: d.lin([[0, '#e5e7eb'], [1, '#9ca3af']], 'v') }),
        s('circle', { cx: CLOCK.x, cy: CLOCK.y, r: CLOCK.r, fill: '#ffffff' }),
        sector,
        ...marks,
        s('line', { x1: CLOCK.x, y1: CLOCK.y, x2: CLOCK.x - 16, y2: CLOCK.y - 20, stroke: '#1e293b', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        s('line', { x1: CLOCK.x, y1: CLOCK.y, x2: CLOCK.x + 24, y2: CLOCK.y + 14, stroke: '#1e293b', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
        secondHand,
        s('circle', { cx: CLOCK.x, cy: CLOCK.y, r: 3, fill: '#dc2626' }),
      );

      // ---- Тумба с учебной моделью сердца ----
      svg.append(
        floorShadow(105, 474, 84, d),
        s('rect', { x: 30, y: 318, width: 150, height: 154, rx: 4, fill: d.lin([[0, '#f8fafc'], [1, '#dfe5ea']], 'v'), stroke: '#c5ced6' }),
        s('rect', { x: 26, y: 312, width: 158, height: 10, rx: 3, fill: '#e9eef2', stroke: '#c5ced6' }),
        s('line', { x1: 105, y1: 332, x2: 105, y2: 462, stroke: '#c5ced6' }),
        s('rect', { x: 92, y: 390, width: 4, height: 18, rx: 2, fill: '#94a3b8' }),
        s('rect', { x: 114, y: 390, width: 4, height: 18, rx: 2, fill: '#94a3b8' }),
      );
      const { x: hx, y: hy, k } = HEART;
      heartGlow = s('ellipse', { cx: hx, cy: hy, rx: 110 * k, ry: 110 * k, fill: d.rad([[0, '#f43f5e', 0.22], [1, '#f43f5e', 0]], 0.5, 0.5) });
      // Анатомическая форма: асимметричная, верхушкой влево-вниз, с крупными сосудами (не «сердечко»)
      const P = (dx, dy) => `${hx + dx * k} ${hy + dy * k}`;
      heartBody = s('path', {
        d: `M${P(-42, -66)} C ${P(-96, -34)}, ${P(-78, 58)}, ${P(-8, 92)} C ${P(46, 56)}, ${P(60, -24)}, ${P(38, -70)} C ${P(16, -96)}, ${P(-18, -94)}, ${P(-42, -66)} Z`,
        fill: d.rad([[0, shade('#e11d48', 0.35)], [0.6, '#be123c'], [1, shade('#be123c', -0.4)]], 0.35, 0.3), stroke: '#7f1d1d', 'stroke-width': 1.5,
      });
      const heartGroup = s('g', {}, [
        heartBody,
        s('path', { d: `M${P(-6, -88)} C ${P(10, -118)}, ${P(46, -118)}, ${P(44, -84)}`, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 13 * k, 'stroke-linecap': 'round' }),
        s('path', { d: `M${P(20, -92)} V ${hy - 128 * k}`, fill: 'none', stroke: '#7dd3fc', 'stroke-width': 11 * k, 'stroke-linecap': 'round' }),
        s('path', { d: `M${P(-30, -80)} V ${hy - 118 * k}`, fill: 'none', stroke: '#60a5fa', 'stroke-width': 10 * k, 'stroke-linecap': 'round' }),
        s('path', { d: `M${P(-20, -40)} Q ${P(0, 0)} ${P(-10, 50)}`, fill: 'none', stroke: '#7f1d1d', 'stroke-width': 2, 'stroke-opacity': 0.55 }),
      ]);
      heartGroup.dataset.cx = hx;
      heartGroup.dataset.cy = hy;
      svg.append(
        s('rect', { x: hx - 30, y: 302, width: 60, height: 10, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: hx - 3, y: hy + 50 * k, width: 6, height: 302 - hy - 50 * k, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
        heartGlow,
        heartGroup,
      );

      // ---- Настенный монитор ЭКГ на кронштейне ----
      const { x: mx, y: my, w: mw, h: mh } = MONITOR;
      svg.append(
        s('rect', { x: mx + mw / 2 - 26, y: my + mh + 4, width: 52, height: 14, rx: 3, fill: '#cbd5e1' }),
        s('rect', { x: mx + mw / 2 - 6, y: my + mh - 6, width: 12, height: 14, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
        s('rect', { x: mx, y: my, width: mw, height: mh, rx: 14, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v'), stroke: '#0f172a', filter: d.url('soft') }),
      );
      const sx = mx + 14;
      const sy = my + 14;
      const sw = mw - 28;
      const sh = mh - 44;
      svg.append(s('rect', { x: sx, y: sy, width: sw, height: sh, rx: 8, fill: '#022c22' }));
      const grid = s('g', { opacity: 0.35 });
      for (let i = 1; i < 6; i++) grid.append(s('line', { x1: sx + (sw * i) / 6, x2: sx + (sw * i) / 6, y1: sy, y2: sy + sh, stroke: '#14532d', 'stroke-width': 1 }));
      svg.append(grid);
      sweepPath = s('path', { fill: 'none', stroke: '#4ade80', 'stroke-width': 2 });
      hrScreenText = text(sx + sw - 10, sy + 24, '', { size: 22, weight: 700, fill: '#4ade80', anchor: 'end' });
      zoneText = text(sx + 10, sy + 24, '', { size: 13, weight: 600, fill: '#86efac', anchor: 'start' });
      standbyText = text(sx + 10, sy + 24, 'ожидание', { size: 13, weight: 600, fill: '#64748b', anchor: 'start' });
      svg.append(sweepPath, hrScreenText, zoneText, standbyText, text(sx + sw / 2, sy + sh + 15, 'ЧСС, уд/мин', { size: 11, fill: '#cbd5e1' }));

      // ---- Табло ручного подсчёта на стене над кушеткой ----
      beatsOut = readout(d, { x: 236, y: 222, w: 124, caption: 'Удары за 15 с', color: '#fda4af' });
      hrOut = readout(d, { x: 370, y: 222, w: 124, caption: 'ЧСС = удары × 4', color: '#fda4af' });
      svg.append(beatsOut.g, hrOut.g);

      // ---- Кушетка ----
      const { x1, x2, top } = COUCH;
      const chrome = d.lin(['#64748b', '#e2e8f0', '#475569']);
      svg.append(
        floorShadow((x1 + x2) / 2, 480, (x2 - x1) * 0.55, d, 10),
        ...[x1 + 26, x2 - 26].map((x) => s('rect', { x: x - 5, y: top + 24, width: 10, height: 478 - top - 24, rx: 3, fill: chrome })),
        s('rect', { x: x1 + 20, y: top + 60, width: x2 - x1 - 40, height: 6, rx: 3, fill: chrome }),
        s('rect', { x: x1 + 10, y: top + 20, width: x2 - x1 - 20, height: 8, rx: 3, fill: '#94a3b8' }),
        // мягкое ложе из медицинского винила и приподнятое изголовье
        s('rect', { x: x1, y: top, width: x2 - x1, height: 24, rx: 8, fill: d.lin([[0, '#4f8a96'], [1, '#2f5f69']], 'v') }),
        s('path', { d: `M${x1 + 4} ${top + 4} L${x1 + 18} ${top - 36} Q${x1 + 26} ${top - 44} ${x1 + 36} ${top - 38} L${x1 + 100} ${top + 2} Z`, fill: d.lin([[0, '#5a97a3'], [1, '#34666f']], 'v') }),
        s('rect', { x: x1 + 90, y: top - 3, width: x2 - x1 - 110, height: 6, rx: 3, fill: '#f1f5f9', 'fill-opacity': 0.9 }), // одноразовая простыня
      );

      // ---- Рука на кушетке, ладонью вверх; вторая рука прощупывает пульс на запястье ----
      const skin = d.lin([[0, '#f1c7a6'], [0.5, '#e7b48f'], [1, '#c98f6a']], 'v');
      const skinDark = '#b97c58';
      const arm = s('g', { style: 'cursor: pointer' }, [
        s('rect', { x: 300, y: 296, width: 250, height: 60, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        // рукав и предплечье
        s('path', { d: `M300 ${top - 2} L304 ${top - 26} L336 ${top - 30} L340 ${top - 1} Z`, fill: d.lin([[0, '#93a8c4'], [1, '#64789a']], 'v') }),
        s('path', { d: `M338 ${top - 28} C 380 ${top - 30}, 430 ${top - 24}, 470 ${top - 20} L 472 ${top - 2} C 430 ${top - 1}, 380 ${top}, 338 ${top - 1} Z`, fill: skin, stroke: skinDark, 'stroke-width': 1 }),
        // кисть ладонью вверх, пальцы слегка согнуты
        s('path', { d: `M468 ${top - 21} C 488 ${top - 24}, 506 ${top - 20}, 520 ${top - 14} C 530 ${top - 10}, 530 ${top - 3}, 520 ${top - 2} L 470 ${top - 1} Z`, fill: skin, stroke: skinDark, 'stroke-width': 1 }),
        s('path', { d: `M500 ${top - 20} Q 512 ${top - 30} 522 ${top - 22}`, fill: 'none', stroke: skinDark, 'stroke-width': 1.2 }),
        s('path', { d: `M430 ${top - 16} Q 448 ${top - 14} 462 ${top - 16}`, fill: 'none', stroke: '#8fa9c9', 'stroke-width': 1.2, 'stroke-opacity': 0.7 }), // вена
      ]);
      ring = s('ellipse', { cx: WRIST.x, cy: WRIST.y + 2, rx: 6, ry: 3, fill: 'none', stroke: '#f43f5e', 'stroke-width': 1.5, opacity: 0 });
      // Два пальца (указательный и средний) второй руки, кисть сверху
      fingers = s('g', {}, [
        // рукав, тыльная сторона кисти, затем два пальца: контур — более тёмная линия под телесной
        s('path', { d: `M${WRIST.x + 58} ${WRIST.y - 70} L${WRIST.x + 84} ${WRIST.y - 108} L${WRIST.x + 110} ${WRIST.y - 90} L${WRIST.x + 80} ${WRIST.y - 54} Z`, fill: d.lin([[0, '#93a8c4'], [1, '#64789a']], 'v') }),
        s('path', { d: `M${WRIST.x + 14} ${WRIST.y - 30} C ${WRIST.x + 22} ${WRIST.y - 48}, ${WRIST.x + 48} ${WRIST.y - 74}, ${WRIST.x + 66} ${WRIST.y - 72} C ${WRIST.x + 80} ${WRIST.y - 64}, ${WRIST.x + 80} ${WRIST.y - 54}, ${WRIST.x + 74} ${WRIST.y - 48} C ${WRIST.x + 60} ${WRIST.y - 34}, ${WRIST.x + 44} ${WRIST.y - 26}, ${WRIST.x + 30} ${WRIST.y - 22} Z`, fill: skin, stroke: skinDark, 'stroke-width': 1 }),
        ...[[-2, 0, 18, -32], [9, 1, 32, -28]].flatMap(([x1, y1, x2, y2]) => [
          s('line', { x1: WRIST.x + x1, y1: WRIST.y + y1, x2: WRIST.x + x2, y2: WRIST.y + y2, stroke: skinDark, 'stroke-width': 10, 'stroke-linecap': 'round' }),
          s('line', { x1: WRIST.x + x1, y1: WRIST.y + y1, x2: WRIST.x + x2, y2: WRIST.y + y2, stroke: '#ebbb97', 'stroke-width': 8, 'stroke-linecap': 'round' }),
        ]),
      ]);
      arm.append(ring, fingers);
      arm.addEventListener('click', startCount);
      svg.append(arm);

      // ---- Беговая дорожка на полу ----
      const tx = TREADMILL.x;
      const tb = TREADMILL.bottom;
      const tw = TREADMILL.w;
      const rail = d.lin(['#64748b', '#e2e8f0', '#64748b']);
      svg.append(
        floorShadow(tx, tb + 8, tw * 0.5, d, 12),
        s('path', { d: `M${tx - tw * 0.34} ${tb - 28} L ${tx - tw * 0.3} ${tb - 176} L ${tx - tw * 0.12} ${tb - 180}`, fill: 'none', stroke: rail, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('path', { d: `M${tx - tw * 0.3} ${tb - 150} H ${tx + tw * 0.12}`, fill: 'none', stroke: rail, 'stroke-width': 6, 'stroke-linecap': 'round' }),
        (consoleEl = s('rect', { x: tx - tw * 0.44, y: tb - 206, width: tw * 0.3, height: 30, rx: 6, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v') })),
        s('rect', { x: tx - tw * 0.4, y: tb - 199, width: tw * 0.22, height: 14, rx: 3, fill: '#0f172a' }),
        s('rect', { x: tx - tw / 2, y: tb - 30, width: tw, height: 30, rx: 10, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v') }),
        s('rect', { x: tx - tw / 2 - 6, y: tb - 34, width: 44, height: 36, rx: 10, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      );
      const beltClip = `treadClip${Math.random().toString(36).slice(2)}`;
      svg.querySelector('defs').append(s('clipPath', { id: beltClip }, [s('rect', { x: tx - tw / 2 + 40, y: tb - 24, width: tw - 54, height: 18, rx: 9 })]));
      beltStripes = s('g', { 'clip-path': `url(#${beltClip})` });
      for (let i = 0; i < 14; i++) beltStripes.append(s('rect', { y: tb - 24, width: 6, height: 18, fill: '#334155' }));
      svg.append(s('rect', { x: tx - tw / 2 + 40, y: tb - 24, width: tw - 54, height: 18, rx: 9, fill: '#111827' }), beltStripes);
    },

    frame(dt, now) {
      shownHr += (heartRate(params) - shownHr) * Math.min(1, dt * 1.5);
      beatPhase += dt * (shownHr / 60);
      const inBeat = beatPhase % 1;
      const pump = inBeat < 0.15 ? Math.sin((inBeat / 0.15) * Math.PI) : 0;

      // Сокращение модели сердца в такт
      const heartGroup = heartBody.parentNode;
      const cx = Number(heartGroup.dataset.cx);
      const cy = Number(heartGroup.dataset.cy);
      heartGroup.setAttribute('transform', `translate(${cx} ${cy}) scale(${1 + pump * 0.08}) translate(${-cx} ${-cy})`);
      heartGlow.setAttribute('opacity', 0.5 + pump * 0.5);

      // Ручной подсчёт пульса: пальцы ощущают толчок крови при каждом ударе
      // Время и удары считаем по реальным часам, а не по кадрам: при медленной отрисовке
      // (кадры с ограниченным dt) подсчёт всё равно длится 15 с и даёт честную частоту
      if (counting) {
        countT = Math.min(COUNT_TIME, now - countStart);
        const felt = Math.floor(countT * (shownHr / 60) + countPhase);
        if (felt > beats) {
          beats = felt;
          ringT = 0;
          press = 1;
        }
        if (countT >= COUNT_TIME) {
          counting = false;
          result = beats * 4;
          if (params.measured !== 1) set('measured', 1);
        }
      }
      // Кнопка шага работы засчитала измерение без ручного подсчёта — показываем результат сразу
      if (params.measured === 1 && result === null && !counting) {
        beats = Math.round(heartRate(params) / 4);
        result = beats * 4;
      }
      ringT = Math.min(1, ringT + dt * 2.5);
      press = Math.max(0, press - dt * 6);
      ring.setAttribute('rx', 6 + ringT * 16);
      ring.setAttribute('ry', 3 + ringT * 6);
      ring.setAttribute('opacity', counting ? 0.9 * (1 - ringT) : 0);
      fingers.setAttribute('transform', `translate(0 ${press * 1.5})`);
      beatsOut.set(counting || result !== null ? String(beats) : '—');
      hrOut.set(result !== null && !counting ? String(result) : '—');

      // Часы: секундная стрелка идёт в реальном времени; при подсчёте закрашивается сектор 15 с
      const sec = (Date.now() / 1000) % 60;
      secondHand.setAttribute('transform', `rotate(${sec * 6} ${CLOCK.x} ${CLOCK.y})`);
      if (counting) {
        const a0 = ((sec - Math.min(countT, COUNT_TIME)) / 60) * Math.PI * 2;
        const a1 = (sec / 60) * Math.PI * 2;
        const r = CLOCK.r - 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        sector.setAttribute('d', `M${CLOCK.x} ${CLOCK.y} L${CLOCK.x + Math.sin(a0) * r} ${CLOCK.y - Math.cos(a0) * r} A ${r} ${r} 0 ${large} 1 ${CLOCK.x + Math.sin(a1) * r} ${CLOCK.y - Math.cos(a1) * r} Z`);
      }
      sector.setAttribute('opacity', counting ? 0.8 : 0);

      // Монитор ЭКГ: до ручного измерения — режим ожидания (ровная линия, без частоты)
      const live = params.measured === 1;
      sweep += dt * 0.3;
      const { x: mx, y: my, w: mw, h: mh } = MONITOR;
      const sw = mw - 28;
      const sh = mh - 44;
      const x = (sweep % 1) * sw;
      if (x < 2) points.length = 0;
      const shape = !live ? 0 : inBeat < 0.04 ? -0.8 : inBeat < 0.07 ? 0.55 : inBeat < 0.2 ? -0.15 * Math.sin(((inBeat - 0.07) / 0.13) * Math.PI) : 0;
      points.push([x, shape]);
      let path = '';
      points.forEach(([px, py], i) => {
        path += `${i ? 'L' : 'M'}${mx + 14 + px} ${my + 14 + sh / 2 + py * sh * 0.35} `;
      });
      sweepPath.setAttribute('d', path);
      sweepPath.setAttribute('stroke', live ? '#4ade80' : '#475569');
      hrScreenText.textContent = live ? `${Math.round(shownHr)}` : '– –';
      hrScreenText.setAttribute('fill', live ? '#4ade80' : '#64748b');
      zoneText.textContent = live ? zone(shownHr) : '';
      standbyText.setAttribute('opacity', live ? 0 : 1);

      // Лента беговой дорожки бежит быстрее при большей нагрузке
      const speed = 40 + params.activity * 90;
      const offset = (now * speed) % 20;
      const span = TREADMILL.w - 54;
      Array.from(beltStripes.children).forEach((r, i) => r.setAttribute('x', TREADMILL.x - TREADMILL.w / 2 + 40 + (((i * 20 - offset) % span) + span) % span));
      consoleEl.setAttribute('fill', params.activity > 0 ? '#334155' : '#1e293b');
    },
  });

  // Щелчок по руке — пальцы на запястье, начинаем 15-секундный подсчёт
  function startCount() {
    if (counting) return;
    counting = true;
    countT = 0;
    countStart = performance.now() / 1000; // та же шкала, что и now в frame()
    countPhase = Math.random(); // пальцы легли в случайный момент сердечного цикла
    beats = 0;
    result = null;
  }

  return scene;
}
