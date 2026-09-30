// Сцена «Пульс и нагрузка» — медицинский кабинет: светлая стена с панелью, линолеум на полу,
// кушетка, настенные часы с секундной стрелкой, настенный монитор ЭКГ, беговая дорожка
// и учебная модель сердца на тумбе. Сначала пульс измеряют вручную: пальцы на запястье руки,
// лежащей на кушетке (щелчок по руке), 15 секунд считаем удары, ЧСС = удары × 4.
// До этого монитор в режиме ожидания и частоту не показывает.

import { createScene, floorShadow, readout, s, shade, text, W, H, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const FLOOR = 420; // линия стыка стены и пола
const HEART = { x: 105, y: 236, k: 0.6 };
const MONITOR = { x: 380, y: 36, w: 250, h: 176 };
const TREADMILL = { x: 792, bottom: 470, w: 280 };
const CLOCK = { x: 112, y: 96, r: 46 };
const COUCH = { x1: 196, x2: 600, top: 352 };
const WRIST = { x: 458, y: 334 }; // точка прощупывания пульса (лучевая артерия)
const COUNT_TIME = 15; // с — стандартный подсчёт пульса

export function pulseScene(container, params, set, { heartRate, zone }) {
  let heartBody, heartGlow, sweepPath, hrScreenText, zoneText, standbyText, beltStripes, consoleEl, secondHand, sector, fingers, target, ring, beatsOut, hrOut;
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
  let handK = 0; // рука считающего: 0 — убрана, 1 — пальцы на запястье

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
      // Анатомическая форма (вид спереди): асимметричные желудочки верхушкой влево-вниз,
      // ушко предсердия, дуга аорты, лёгочный ствол и верхняя полая вена — не «сердечко»
      const P = (dx, dy) => `${hx + dx * k} ${hy + dy * k}`;
      // Сосуд: тёмная оболочка, основной цвет и блик — выглядит как трубка, а не как линия
      const vessel = (path, color, w) => [
        s('path', { d: path, fill: 'none', stroke: shade(color, -0.35), 'stroke-width': (w + 3) * k, 'stroke-linecap': 'round' }),
        s('path', { d: path, fill: 'none', stroke: color, 'stroke-width': w * k, 'stroke-linecap': 'round' }),
        s('path', { d: path, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': w * 0.25 * k, 'stroke-linecap': 'round', transform: `translate(${-w * 0.2 * k} 0)` }),
      ];
      heartBody = s('path', {
        d: `M${P(-40, -52)} C ${P(-92, -30)}, ${P(-80, 52)}, ${P(-6, 96)} C ${P(42, 62)}, ${P(72, 4)}, ${P(52, -42)} C ${P(38, -72)}, ${P(-8, -74)}, ${P(-40, -52)} Z`,
        fill: d.rad([[0, shade('#e11d48', 0.35)], [0.6, '#be123c'], [1, shade('#be123c', -0.4)]], 0.35, 0.3), stroke: '#7f1d1d', 'stroke-width': 1.5,
      });
      const heartGroup = s('g', {}, [
        // верхняя полая вена и дуга аорты с ветвями — позади желудочков
        ...vessel(`M${P(-44, -44)} V ${hy - 116 * k}`, '#3b82f6', 16),
        ...vessel(`M${P(-2, -30)} C ${P(-4, -92)}, ${P(8, -118)}, ${P(32, -118)} C ${P(54, -118)}, ${P(62, -100)}, ${P(60, -70)}`, '#e11d48', 20),
        ...[-4, 18, 38].map((dx) => vessel(`M${P(dx + 6, -112)} L ${P(dx + 2, -134)}`, '#e11d48', 8)).flat(),
        heartBody,
        // правые отделы спереди чуть темнее: видно, что желудочков два
        s('path', { d: `M${P(-40, -52)} C ${P(-76, -30)}, ${P(-70, 34)}, ${P(-22, 80)} C ${P(-14, 40)}, ${P(-10, -8)}, ${P(-2, -50)} Z`, fill: '#881337', 'fill-opacity': 0.28 }),
        // ушко левого предсердия
        s('path', { d: `M${P(40, -50)} C ${P(62, -66)}, ${P(76, -46)}, ${P(58, -30)} C ${P(52, -36)}, ${P(46, -42)}, ${P(40, -50)} Z`, fill: shade('#be123c', -0.1), stroke: '#7f1d1d', 'stroke-width': 1.2 }),
        // межжелудочковая борозда с венечной артерией
        s('path', { d: `M${P(-2, -50)} C ${P(-10, -8)}, ${P(-14, 40)}, ${P(-22, 80)}`, fill: 'none', stroke: '#7f1d1d', 'stroke-width': 3, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }),
        s('path', { d: `M${P(-2, -50)} C ${P(-10, -8)}, ${P(-14, 40)}, ${P(-22, 80)}`, fill: 'none', stroke: '#fda4af', 'stroke-width': 1.2, 'stroke-opacity': 0.8 }),
        // лёгочный ствол — спереди, делится на две лёгочные артерии
        ...vessel(`M${P(-18, -46)} C ${P(-22, -80)}, ${P(-10, -96)}, ${P(8, -100)}`, '#60a5fa', 16),
        ...vessel(`M${P(-18, -86)} L ${P(-38, -100)}`, '#60a5fa', 10),
        // блик на желудочках
        s('path', { d: `M${P(24, -40)} C ${P(44, -30)}, ${P(50, -4)}, ${P(42, 20)}`, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 5 * k, 'stroke-linecap': 'round' }),
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
      standbyText = text(sx + 10, sy + 24, tr('ожидание'), { size: 13, weight: 600, fill: '#64748b', anchor: 'start' });
      svg.append(sweepPath, hrScreenText, zoneText, standbyText, text(sx + sw / 2, sy + sh + 15, tr('ЧСС, уд/мин'), { size: 11, fill: '#cbd5e1' }));

      // ---- Табло ручного подсчёта на стене над кушеткой ----
      beatsOut = readout(d, { x: 236, y: 222, w: 124, caption: tr('Удары за 15 с'), color: '#fda4af' });
      hrOut = readout(d, { x: 370, y: 222, w: 124, caption: tr('ЧСС = удары × 4'), color: '#fda4af' });
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

      // ---- Рука пациента на кушетке, ладонью вверх (вид сбоку) ----
      // Предплечье лежит на простыне, кисть расслаблена: пальцы чуть согнуты, большой палец
      // приподнят над ладонью. Выше локтя рука уходит под сложенное одеяло — пациента
      // целиком не рисуем, чтобы не загромождать кабинет.
      const bed = top - 3; // верх простыни
      const skin = d.lin([[0, '#f8d9c2'], [0.45, '#efbf9d'], [1, '#d39673']], 'v');
      const skinLine = '#b9805d';
      const skinStroke = { stroke: skinLine, 'stroke-width': 1, 'stroke-linejoin': 'round' };
      const W0 = WRIST.x;
      const arm = s('g', { style: 'cursor: pointer' }, [
        s('rect', { x: 250, y: 290, width: 320, height: 66, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        // мягкая тень руки на простыне
        s('ellipse', { cx: W0 - 30, cy: bed + 1, rx: 150, ry: 3.5, fill: '#0f172a', 'fill-opacity': 0.12 }),
        // закатанный рукав рубашки у локтя
        s('path', { d: `M330 ${bed - 32} C 336 ${bed - 34}, 344 ${bed - 33}, 350 ${bed - 31} L 352 ${bed} L 330 ${bed} Z`, fill: d.lin([[0, '#b7cdea'], [1, '#86a5cf']], 'v'), stroke: '#6f8fbb', 'stroke-width': 1 }),
        s('path', { d: `M338 ${bed - 32} L 339 ${bed - 1}`, stroke: '#6f8fbb', 'stroke-opacity': 0.5, 'stroke-width': 1 }),
        // предплечье: к запястью сужается, нижний край лежит на простыне
        s('path', { d: `M348 ${bed - 27} C 385 ${bed - 28}, 425 ${bed - 21}, ${W0 + 4} ${bed - 15} L ${W0 + 6} ${bed} L 348 ${bed} Z`, fill: skin, ...skinStroke }),
        s('path', { d: `M358 ${bed - 24} C 392 ${bed - 25}, 420 ${bed - 20}, ${W0 - 8} ${bed - 15}`, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': 2, 'stroke-linecap': 'round' }),
        // кисть: ладонь с возвышением у основания большого пальца, согнутые пальцы
        s('path', {
          d: `M${W0} ${bed - 15} C ${W0 + 12} ${bed - 21}, ${W0 + 30} ${bed - 22}, ${W0 + 44} ${bed - 18} C ${W0 + 56} ${bed - 17}, ${W0 + 66} ${bed - 20}, ${W0 + 73} ${bed - 25} C ${W0 + 78} ${bed - 29}, ${W0 + 86} ${bed - 27}, ${W0 + 85} ${bed - 20} C ${W0 + 84} ${bed - 11}, ${W0 + 71} ${bed - 1}, ${W0 + 50} ${bed} L ${W0 + 2} ${bed} Z`,
          fill: skin, ...skinStroke,
        }),
        // границы согнутых пальцев (вид со стороны мизинца)
        s('path', { d: `M${W0 + 46} ${bed - 12} C ${W0 + 58} ${bed - 12}, ${W0 + 70} ${bed - 17}, ${W0 + 79} ${bed - 24}`, fill: 'none', stroke: skinLine, 'stroke-opacity': 0.5, 'stroke-width': 1, 'stroke-linecap': 'round' }),
        // мизинец — ближний к нам, согнут сильнее остальных
        s('path', { d: `M${W0 + 46} ${bed - 7} C ${W0 + 56} ${bed - 7}, ${W0 + 64} ${bed - 10}, ${W0 + 70} ${bed - 15} C ${W0 + 74} ${bed - 18}, ${W0 + 79} ${bed - 16}, ${W0 + 77} ${bed - 11} C ${W0 + 74} ${bed - 5}, ${W0 + 64} ${bed - 1}, ${W0 + 52} ${bed - 0.5}`, fill: skin, ...skinStroke }),
        // большой палец приподнят над ладонью
        s('path', { d: `M${W0 + 10} ${bed - 18} C ${W0 + 17} ${bed - 28}, ${W0 + 30} ${bed - 31}, ${W0 + 39} ${bed - 29} C ${W0 + 45} ${bed - 28}, ${W0 + 45} ${bed - 22}, ${W0 + 39} ${bed - 22} C ${W0 + 32} ${bed - 21}, ${W0 + 25} ${bed - 19}, ${W0 + 20} ${bed - 16} Z`, fill: skin, ...skinStroke }),
        // складка запястья и голубоватая вена
        s('path', { d: `M${W0 + 1} ${bed - 13} Q ${W0 - 2} ${bed - 7} ${W0 + 1} ${bed - 2}`, fill: 'none', stroke: skinLine, 'stroke-opacity': 0.6, 'stroke-width': 1 }),
        s('path', { d: `M${W0 - 60} ${bed - 17} Q ${W0 - 32} ${bed - 14} ${W0 - 8} ${bed - 12}`, fill: 'none', stroke: '#8fa9c9', 'stroke-width': 1.3, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }),
        // сложенное одеяло у изголовья: плечо пациента под ним
        s('path', { d: `M283 ${bed} L 285 ${bed - 34} Q 286 ${bed - 42} 295 ${bed - 42} L 325 ${bed - 41} Q 335 ${bed - 40} 336 ${bed - 30} L 338 ${bed} Z`, fill: d.lin([[0, '#e2e8f0'], [1, '#b8c4d0']], 'v'), stroke: '#94a3b8', 'stroke-width': 1 }),
        s('path', { d: `M287 ${bed - 28} Q 311 ${bed - 25} 336 ${bed - 27} M288 ${bed - 14} Q 311 ${bed - 11} 337 ${bed - 13}`, fill: 'none', stroke: '#94a3b8', 'stroke-opacity': 0.7, 'stroke-width': 1.2 }),
        s('path', { d: `M291 ${bed - 38} Q 309 ${bed - 40} 327 ${bed - 38}`, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.7, 'stroke-width': 2, 'stroke-linecap': 'round' }),
      ]);
      // Мишень на запястье, пока пульс не измеряли: подсказывает, куда щёлкнуть
      target = s('circle', { cx: WRIST.x, cy: WRIST.y, r: 7, fill: '#f43f5e', 'fill-opacity': 0.15, stroke: '#f43f5e', 'stroke-width': 1.5, 'stroke-dasharray': '3 2.5' });
      ring = s('ellipse', { cx: WRIST.x, cy: WRIST.y + 2, rx: 6, ry: 3, fill: 'none', stroke: '#f43f5e', 'stroke-width': 1.5, opacity: 0 });

      // Рука того, кто считает пульс: указательный и средний пальцы на лучевой артерии,
      // безымянный и мизинец поджаты, рукав белого халата. Рисуется в своей системе координат
      // (кончики пальцев — в начале, кисть вдоль +x) и поворачивается к запястью сверху-справа.
      const fingerPair = [[-5, -7, 38, -10, shade('#efbf9d', -0.08)], [0, 0, 38, -2, '#f3c7a7']];
      const fingerHand = s('g', { transform: `translate(${WRIST.x} ${WRIST.y}) rotate(-28)` }, [
        // рукав халата с манжетой, растворяется к краю
        s('path', { d: 'M72 -17 C 100 -20, 128 -23, 150 -24 L 150 18 C 128 17, 100 14, 74 12 Z', fill: d.lin([[0, '#ffffff'], [0.65, '#f1f5f9'], [1, '#f1f5f9', 0]]) }),
        s('path', { d: 'M72 -17 L 74 12', stroke: '#cbd5e1', 'stroke-width': 1.2 }),
        s('path', { d: 'M82 -18 L 84 13', stroke: '#e2e8f0', 'stroke-width': 1 }),
        // тыльная сторона кисти и поджатые пальцы
        s('path', { d: 'M34 -13 C 48 -17, 62 -16, 74 -13 L 74 10 C 62 12, 52 13, 44 15 C 35 17, 28 12, 30 5 C 31 0, 32 -6, 34 -13 Z', fill: skin, ...skinStroke }),
        s('path', { d: 'M33 3 C 38 6, 44 7, 52 6', fill: 'none', stroke: skinLine, 'stroke-opacity': 0.5, 'stroke-width': 1 }),
        // вытянутые пальцы: средний (дальний) и указательный, с бликом ногтя
        ...fingerPair.flatMap(([x1, y1, x2, y2, fill]) => [
          s('line', { x1, y1, x2, y2, stroke: skinLine, 'stroke-width': 10.5, 'stroke-linecap': 'round' }),
          s('line', { x1, y1, x2, y2, stroke: fill, 'stroke-width': 8.5, 'stroke-linecap': 'round' }),
          s('path', { d: `M${x1 + 1} ${y1 - 3} Q ${x1 + 5} ${y1 - 4.5} ${x1 + 9} ${y1 - 3.5}`, fill: 'none', stroke: '#fbe3d3', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
        ]),
      ]);
      fingers = s('g', { opacity: 0 }, [fingerHand]);
      arm.append(target, ring, fingers);
      touchTarget(arm);
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
      // Пальцы ложатся на запястье на время подсчёта и убираются после него
      handK += ((counting ? 1 : 0) - handK) * Math.min(1, dt * 7);
      fingers.setAttribute('opacity', Math.min(1, handK * 1.6));
      fingers.setAttribute('transform', `translate(${(1 - handK) * 34} ${(1 - handK) * -18 + press * 1.5})`);
      target.setAttribute('opacity', !counting && result === null ? 0.55 + 0.45 * Math.sin(now * 4) : 0);
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
