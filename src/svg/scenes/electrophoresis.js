// Сцена «Гель-электрофорез ДНК»: кабинет биологии. На столе — прозрачная камера для горизонтального
// электрофореза, показанная сверху-спереди: в буфере лежит пластина агарозного геля с шестью дорожками,
// у левого края — лунки и чёрный электрод-катод (−), у правого — красный анод (+). Вдоль геля — линейка в мм.
// Слева — штатив с пробирками проб и микропипеткой, справа — источник тока с тумблером, над гелем — УФ-лампа. Ученик сам:
//   переносит микропипетку к лункам → пипетка обходит все шесть лунок и заполняет их синими пробами (load = 1);
//   щёлкает тумблер источника → у электродов идут пузырьки, синий краситель ползёт к аноду (power = 1);
//   щёлкает лампу → свет в кабинете гаснет, гель в УФ светится, видны полосы ДНК (uv = 0/1);
//   щёлкает по дорожке геля → выбирает дорожку для измерения (lane).
// Полосы рисуются по каждому фрагменту отдельно: близкие фрагменты сами накладываются в одну полосу.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';

const BENCH = 486;
const TANK = { x1: 146, x2: 624, top: 196, rim: 462, front: 484 };
const INNER = { x1: 158, x2: 612, top: 206, bottom: 452 };
const GEL = { x1: 198, x2: 562, top: 214, bottom: 410 };
const ZERO_X = 218; // начало отсчёта — передний край лунок
const PX = 4.2; // пикселей сцены на 1 мм геля: 80 мм шкалы — до края геля
const LANE_Y = (i) => 232 + i * 32;
const WELL = { x: 210, w: 8, h: 18 };
const CATHODE_X = 176;
const ANODE_X = 596;
const RULER_Y = 418;
const SUPPLY = { x1: 670, x2: 900, top: 404, bottom: 484 };
const SWITCH = { x: 856, y: 456 };
const JACK_BLACK = { x: 710, y: 456 };
const JACK_RED = { x: 742, y: 456 };
const LAMP = { x1: 250, x2: 530, top: 110, bottom: 144 };
const PIPETTE_REST = { x: 60, y: 452 }; // кончик микропипетки в пробирке штатива
const SWEEP_X = WELL.x + WELL.w / 2;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Микропипетка: кончик в (0, 0), прозрачный наконечник, серый корпус, кнопка сверху
function micropipette(d) {
  return s('g', {}, [
    s('rect', { x: -20, y: -196, width: 40, height: 200, fill: '#000', 'fill-opacity': 0 }), // зона захвата
    s('path', { d: 'M-1 0 L-5 -40 H5 L1 0 Z', fill: '#f8fafc', 'fill-opacity': 0.75, stroke: '#94a3b8', 'stroke-width': 1 }),
    s('rect', { x: -6, y: -46, width: 12, height: 8, rx: 2, fill: '#cbd5e1', stroke: '#64748b', 'stroke-width': 0.8 }),
    s('path', { d: 'M-6 -46 L-9 -120 H9 L6 -46 Z', fill: d.lin(['#64748b', '#e2e8f0', '#94a3b8', '#475569']), stroke: '#334155', 'stroke-width': 1 }),
    s('rect', { x: -12, y: -172, width: 24, height: 54, rx: 7, fill: d.lin(['#1e3a8a', '#3b82f6', '#1e40af']), stroke: '#1e3a8a', 'stroke-width': 1 }),
    s('path', { d: 'M12 -160 Q24 -158 22 -146 L12 -146 Z', fill: '#1e40af' }), // упор для пальца
    s('rect', { x: -7, y: -164, width: 14, height: 22, rx: 3, fill: '#0f172a' }),
    s('rect', { x: -4, y: -188, width: 8, height: 16, rx: 2, fill: '#cbd5e1', stroke: '#64748b', 'stroke-width': 0.8 }),
    s('rect', { x: -9, y: -194, width: 18, height: 7, rx: 3.5, fill: '#e2e8f0', stroke: '#64748b', 'stroke-width': 0.8 }),
  ]);
}

export function electrophoresisScene(container, params, set, { LANES, GEL_MM, bands, dyeFront }) {
  const lanes = LANES.length;
  const bandEls = []; // [дорожка][фрагмент]
  const wells = [];
  const wellFill = [];
  const dyeEls = [];
  const laneLabels = [];
  const bubbles = [];
  let gelFill, gelUv, dim, cone, tube, laneFrame, led, lever, pipette, pipetteHome, topLayer, lampGroup;

  // Микропипетка: rest — в пробирке, drag — в руке, fly — к первой лунке, sweep — обходит лунки,
  // back — возвращается, used — пробы нанесены
  let pip = params.load ? 'used' : 'rest';
  const pipPos = { ...PIPETTE_REST };
  let loaded = params.load ? lanes : 0;
  let sweepT = 0;
  const grab = { dx: 0, dy: 0 };
  let shownT = params.load && params.power ? params.time : 0;
  let runU = params.U;
  let uvK = params.uv ? 1 : 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);
      const glowId = `glow${uid}`;
      defs.append(s('filter', { id: glowId, x: '-60%', y: '-30%', width: '220%', height: '160%' }, [
        s('feGaussianBlur', { stdDeviation: 1.6, result: 'b' }),
        s('feMerge', {}, [s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' })]),
      ]));

      // ── Камера для электрофореза ──
      svg.append(
        floorShadow((TANK.x1 + TANK.x2) / 2, BENCH + 2, 270, d, 14),
        // Передняя стенка камеры: прозрачный акрил, сквозь него виден слой буфера
        s('rect', { x: TANK.x1, y: TANK.rim, width: TANK.x2 - TANK.x1, height: TANK.front - TANK.rim, rx: 4, fill: d.lin([[0, '#dbeafe', 0.9], [1, '#bfdbfe', 0.9]], 'v'), stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('rect', { x: TANK.x1 + 4, y: TANK.rim + 9, width: TANK.x2 - TANK.x1 - 8, height: 11, rx: 2, fill: '#93c5fd', 'fill-opacity': 0.45 }),
        // Дно и борта камеры сверху
        s('rect', { x: TANK.x1, y: TANK.top, width: TANK.x2 - TANK.x1, height: TANK.rim - TANK.top, rx: 8, fill: d.lin([[0, '#e2e8f0'], [1, '#cbd5e1']], 'v'), stroke: '#94a3b8', 'stroke-width': 2 }),
        // Буфер
        s('rect', { x: INNER.x1, y: INNER.top, width: INNER.x2 - INNER.x1, height: INNER.bottom - INNER.top, rx: 5, fill: d.lin([[0, '#cfe7f3'], [1, '#b9dcee']], 'v') }),
      );
      // Пластина геля: молочно-прозрачная агароза на подложке
      gelFill = s('rect', { x: GEL.x1, y: GEL.top, width: GEL.x2 - GEL.x1, height: GEL.bottom - GEL.top, rx: 3, fill: '#eef3f6', 'fill-opacity': 0.85, stroke: '#b6c6d3', 'stroke-width': 1.2 });
      // В ультрафиолете гель тёмно-фиолетовый, на нём светятся полосы
      gelUv = s('rect', { x: GEL.x1, y: GEL.top, width: GEL.x2 - GEL.x1, height: GEL.bottom - GEL.top, rx: 3, fill: d.lin([[0, '#3b2a78'], [1, '#22184a']], 'v'), opacity: 0 });
      svg.append(gelFill, gelUv);

      // Электроды: проволока вдоль краёв камеры, клеммы на переднем борту
      const electrode = (x, color) => s('g', {}, [
        s('line', { x1: x, y1: INNER.top + 4, x2: x, y2: INNER.bottom - 4, stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
        s('rect', { x: x - 7, y: INNER.bottom - 4, width: 14, height: 14, rx: 3, fill: d.lin([[0, color], [1, '#0f172a']], 'v') }),
      ]);
      svg.append(electrode(CATHODE_X, '#1f2937'), electrode(ANODE_X, '#dc2626'));
      // Пузырьки газа у электродов при включённом токе (у катода водорода вдвое больше)
      for (let i = 0; i < 26; i++) {
        const atCathode = i < 17;
        const c = s('circle', { r: 1.6 + (i % 3) * 0.6, fill: '#ffffff', stroke: '#93c5fd', 'stroke-width': 0.6, opacity: 0, 'pointer-events': 'none' });
        bubbles.push({ c, x: (atCathode ? CATHODE_X : ANODE_X) + ((i * 7) % 9) - 4, y0: INNER.top + 10 + ((i * 53) % (INNER.bottom - INNER.top - 24)), phase: (i * 0.37) % 1 });
        svg.append(c);
      }

      // Линейка вдоль геля: 0 — у лунок
      const ruler = s('g', {}, [
        s('rect', { x: GEL.x1, y: RULER_Y - 4, width: 588 - GEL.x1, height: 30, rx: 3, fill: '#fffbeb', 'fill-opacity': 0.9, stroke: '#d6c7a1', 'stroke-width': 1 }),
        text(ZERO_X + GEL_MM * PX + 12, RULER_Y + 15, tr('мм'), { size: 13, weight: 600, fill: '#57534e', anchor: 'start' }),
      ]);
      for (let mm = 0; mm <= GEL_MM; mm += 2) {
        const x = ZERO_X + mm * PX;
        const big = mm % 10 === 0;
        ruler.append(s('line', { x1: x, x2: x, y1: RULER_Y - 4, y2: RULER_Y - 4 + (big ? 9 : 5), stroke: '#78716c', 'stroke-width': big ? 1.3 : 0.8 }));
        if (big) ruler.append(text(x, RULER_Y + 15, String(mm), { size: 13, weight: 600, fill: '#57534e' }));
      }
      svg.append(ruler);
      // На передней стенке — обозначения электродов
      svg.append(
        text(CATHODE_X + 44, TANK.rim + 12, tr('катод (−)'), { size: 13, weight: 700, fill: '#1f2937' }),
        text(ANODE_X - 40, TANK.rim + 12, tr('анод (+)'), { size: 13, weight: 700, fill: '#b91c1c' }),
      );

      // Лунки, синий краситель и полосы ДНК на каждой дорожке
      const bandLayer = s('g', { filter: `url(#${glowId})` });
      for (let i = 0; i < lanes; i++) {
        const y = LANE_Y(i);
        const well = s('rect', { x: WELL.x, y: y - WELL.h / 2, width: WELL.w, height: WELL.h, rx: 1.5, fill: '#cbd8e2', stroke: '#8fa3b5', 'stroke-width': 1 });
        wells.push(well);
        svg.append(well);
        const wf = s('rect', { x: WELL.x + 1, y: y - WELL.h / 2 + 1, width: WELL.w - 2, height: WELL.h - 2, rx: 1, fill: '#2563eb', opacity: 0 });
        wellFill.push(wf);
        const dye = s('rect', { y: y - 8, width: 9, height: 16, rx: 3, fill: '#2563eb', opacity: 0 });
        dyeEls.push(dye);
        svg.append(wf, dye);
        bandEls.push(LANES[i].frags.map(() => {
          const b = s('rect', { y: y - 8, width: 5, height: 16, rx: 1.5, fill: '#ffd59a', opacity: 0, 'pointer-events': 'none' });
          bandLayer.append(b);
          return b;
        }));
      }

      // Источник тока с табло, гнёздами и тумблером
      const sx = SUPPLY.x1;
      const sw = SUPPLY.x2 - SUPPLY.x1;
      svg.append(
        floorShadow((SUPPLY.x1 + SUPPLY.x2) / 2, BENCH + 2, 150, d, 10),
        s('rect', { x: sx, y: SUPPLY.top, width: sw, height: SUPPLY.bottom - SUPPLY.top, rx: 12, fill: d.lin([[0, '#f1f5f9'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.2 }),
        s('rect', { x: sx + 10, y: SUPPLY.top + 26, width: sw - 20, height: SUPPLY.bottom - SUPPLY.top - 34, rx: 8, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v') }),
        text((SUPPLY.x1 + SUPPLY.x2) / 2, SUPPLY.top + 15, tr('Источник тока'), { size: 13, weight: 700, fill: '#334155' }),
      );
      // Выходные гнёзда: чёрное (−) и красное (+)
      for (const [j, color] of [[JACK_BLACK, '#111827'], [JACK_RED, '#dc2626']]) {
        svg.append(s('circle', { cx: j.x, cy: j.y, r: 9, fill: '#0b1017' }), s('circle', { cx: j.x, cy: j.y, r: 6.5, fill: color, stroke: '#0b1017', 'stroke-width': 1 }));
      }
      led = s('circle', { cx: SWITCH.x - 40, cy: SWITCH.y, r: 5, fill: '#7f1d1d' });
      svg.append(led);
      // Тумблер: щелчок включает ток
      lever = s('rect', { x: -4, y: -20, width: 8, height: 20, rx: 3, fill: d.lin(['#e2e8f0', '#94a3b8']) });
      const toggle = s('g', { transform: `translate(${SWITCH.x} ${SWITCH.y})` }, [
        s('rect', { x: -18, y: -18, width: 36, height: 36, fill: '#000', 'fill-opacity': 0 }),
        s('rect', { x: -12, y: -10, width: 24, height: 20, rx: 4, fill: '#0f172a', stroke: '#475569' }),
        lever,
        s('circle', { cx: 0, cy: 0, r: 5, fill: '#64748b' }),
      ]);
      toggle.style.cursor = 'pointer';
      toggle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        // Ток включают один раз: выключение посреди опыта не «возвращает» ДНК в лунки
        if (!params.power) set('power', 1);
      });
      touchTarget(toggle);
      svg.append(toggle);

      // Провода от клемм камеры к гнёздам источника лежат на столе
      svg.append(
        s('path', { d: `M${CATHODE_X} ${INNER.bottom + 8} C ${CATHODE_X - 4} ${BENCH + 8}, ${CATHODE_X + 40} ${BENCH + 9}, 300 ${BENCH + 8} S ${JACK_BLACK.x - 30} ${BENCH + 10}, ${JACK_BLACK.x} ${JACK_BLACK.y}`, fill: 'none', stroke: '#111827', 'stroke-width': 4, 'stroke-linecap': 'round' }),
        s('path', { d: `M${ANODE_X} ${INNER.bottom + 8} C ${ANODE_X + 6} ${BENCH + 4}, ${ANODE_X + 40} ${BENCH + 13}, 660 ${BENCH + 12} S ${JACK_RED.x - 8} ${BENCH + 6}, ${JACK_RED.x} ${JACK_RED.y}`, fill: 'none', stroke: '#dc2626', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      );

      // Микропипетка в пробирке штатива; штатив с пробами — поверх неё
      pipette = micropipette(d);
      pipetteHome = s('g', {}, [pipette]);
      svg.append(pipetteHome);
      const rack = s('g', {}, [
        floorShadow(58, BENCH + 2, 52, d, 6),
        s('rect', { x: 14, y: BENCH - 30, width: 90, height: 30, rx: 4, fill: d.lin([[0, '#fde68a'], [1, '#f59e0b']], 'v'), stroke: '#b45309', 'stroke-width': 1 }),
      ]);
      for (let i = 0; i < 6; i++) {
        const x = 22 + i * 15;
        rack.append(
          s('path', { d: `M${x - 5} ${BENCH - 50} V${BENCH - 24} Q${x} ${BENCH - 14} ${x + 5} ${BENCH - 24} V${BENCH - 50} Z`, fill: '#eff6ff', 'fill-opacity': 0.8, stroke: '#94a3b8', 'stroke-width': 0.8 }),
          s('path', { d: `M${x - 4} ${BENCH - 32} V${BENCH - 24} Q${x} ${BENCH - 16} ${x + 4} ${BENCH - 24} V${BENCH - 32} Z`, fill: '#3b82f6', 'fill-opacity': 0.85 }),
          s('rect', { x: x - 6, y: BENCH - 54, width: 12, height: 5, rx: 1.5, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 0.8 }),
        );
      }
      rack.append(s('rect', { x: 14, y: BENCH - 26, width: 90, height: 6, fill: '#b45309', 'fill-opacity': 0.25 }));
      svg.append(rack);

      // Затемнение кабинета в УФ: всё, кроме геля, уходит в полумрак
      dim = s('path', {
        d: `M0 0 H960 V540 H0 Z M${GEL.x1} ${GEL.top} V${GEL.bottom} H${GEL.x2} V${GEL.top} Z`,
        fill: '#0b0820', 'fill-rule': 'evenodd', opacity: 0, 'pointer-events': 'none',
      });
      svg.append(bandLayer, dim);

      // УФ-лампа: щелчок включает и выключает
      tube = s('rect', { x: LAMP.x1 + 14, y: LAMP.bottom - 2, width: LAMP.x2 - LAMP.x1 - 28, height: 7, rx: 3.5, fill: '#6d28d9' });
      cone = s('path', { d: `M${LAMP.x1 + 14} ${LAMP.bottom + 4} L${GEL.x1} ${GEL.top} H${GEL.x2} L${LAMP.x2 - 14} ${LAMP.bottom + 4} Z`, fill: d.lin([[0, '#a78bfa', 0.35], [1, '#7c3aed', 0.05]], 'v'), opacity: 0, 'pointer-events': 'none' });
      lampGroup = s('g', {}, [
        s('rect', { x: LAMP.x1 - 6, y: LAMP.top - 6, width: LAMP.x2 - LAMP.x1 + 12, height: LAMP.bottom - LAMP.top + 16, fill: '#000', 'fill-opacity': 0 }),
        s('rect', { x: LAMP.x1, y: LAMP.top, width: LAMP.x2 - LAMP.x1, height: LAMP.bottom - LAMP.top, rx: 8, fill: d.lin([[0, '#64748b'], [0.4, '#334155'], [1, '#1e293b']], 'v'), stroke: '#0f172a', 'stroke-width': 1 }),
        s('rect', { x: LAMP.x1 + 4, y: LAMP.top + 3, width: LAMP.x2 - LAMP.x1 - 8, height: 5, rx: 2.5, fill: '#ffffff', 'fill-opacity': 0.18 }),
        tube,
        text((LAMP.x1 + LAMP.x2) / 2, (LAMP.top + LAMP.bottom) / 2 + 1, tr('УФ-лампа'), { size: 14, weight: 700, fill: '#e2e8f0' }),
      ]);
      lampGroup.style.cursor = 'pointer';
      lampGroup.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('uv', params.uv ? 0 : 1);
      });
      touchTarget(lampGroup);
      svg.append(cone, lampGroup);

      // Подписи дорожек и рамка выбранной дорожки — поверх затемнения, чтобы читались и в УФ
      laneFrame = s('rect', { x: GEL.x1 + 3, width: GEL.x2 - GEL.x1 - 6, height: 26, rx: 5, fill: 'none', stroke: '#f59e0b', 'stroke-width': 2.2, 'stroke-dasharray': '7 4', 'pointer-events': 'none' });
      svg.append(laneFrame);
      for (let i = 0; i < lanes; i++) {
        const y = LANE_Y(i);
        const label = text(TANK.x1 - 10, y, tr(LANES[i].short), { size: 14, weight: 700, fill: '#334155', anchor: 'end' });
        laneLabels.push(label);
        // Щелчок по дорожке или её подписи выбирает её для измерения
        const hit = s('g', {}, [
          s('rect', { x: 84, y: y - 16, width: GEL.x2 - 84, height: 32, fill: '#000', 'fill-opacity': 0 }),
        ]);
        hit.style.cursor = 'pointer';
        hit.addEventListener('pointerdown', () => set('lane', i));
        svg.append(label, hit);
      }

      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt, now) {
      // Движение проб догоняет регулятор времени постепенно — видно, как идёт электрофорез
      // ДНК в геле назад не идёт: меньшее время или другое напряжение — это уже новый гель, опыт идёт с лунок
      const target = params.load && params.power ? params.time : 0;
      if (target < shownT || params.U !== runU) shownT = 0;
      runU = params.U;
      shownT = Math.min(target, shownT + dt * 25);
      uvK += ((params.uv ? 1 : 0) - uvK) * Math.min(1, dt * 8);

      updatePipette(dt);

      // Табло на источнике нет: напряжение и время видны на регуляторах, ход опыта — по синему красителю
      led.setAttribute('fill', params.power ? '#4ade80' : '#7f1d1d');
      lever.setAttribute('transform', params.power ? 'rotate(35 0 0)' : 'rotate(-35 0 0)');

      // Пузырьки у электродов: чем выше напряжение, тем их больше
      const gas = params.power ? clamp01((params.U - 30) / 120) : 0;
      bubbles.forEach((b, i) => {
        const k = (now * 0.9 + b.phase) % 1;
        const on = gas > (i % 9) / 9;
        b.c.setAttribute('cx', b.x + Math.sin(now * 3 + i) * 1.5);
        b.c.setAttribute('cy', b.y0 - k * 10);
        b.c.setAttribute('opacity', on ? (1 - k) * 0.9 : 0);
      });

      // УФ: кабинет темнеет, гель становится фиолетовым, синий краситель почти не виден
      dim.setAttribute('opacity', (0.62 * uvK).toFixed(3));
      gelUv.setAttribute('opacity', uvK.toFixed(3));
      cone.setAttribute('opacity', uvK.toFixed(3));
      tube.setAttribute('fill', params.uv ? '#c4b5fd' : '#4c1d95');
      for (const l of laneLabels) l.setAttribute('fill', uvK > 0.5 ? '#e9d5ff' : '#334155');

      const dyeD = dyeFront(params, shownT);
      for (let i = 0; i < lanes; i++) {
        const filled = i < loaded;
        // В ультрафиолете пустые лунки — тёмные прорези в светящемся геле, а не светлые пятна
        wells[i].setAttribute('opacity', (1 - 0.8 * uvK).toFixed(3));
        // Проба уходит из лунки, как только краситель отошёл от неё на пару миллиметров
        wellFill[i].setAttribute('opacity', filled ? (1 - clamp01(dyeD / 3)) * (1 - 0.6 * uvK) : 0);
        const showDye = filled && dyeD > 0.4 && dyeD <= GEL_MM;
        dyeEls[i].setAttribute('x', (ZERO_X + dyeD * PX - 4.5).toFixed(1));
        dyeEls[i].setAttribute('opacity', showDye ? 0.75 * (1 - 0.7 * uvK) : 0);
        const frags = LANES[i].frags;
        // Ушедшие за край геля фрагменты bands() не возвращает — их полосы гаснут
        const inGel = new Map(bands(i, params, shownT).flatMap((g) => g.members).map((m) => [m.L, m.d]));
        for (let j = 0; j < frags.length; j++) {
          const dist = inGel.get(frags[j]);
          const el = bandEls[i][j];
          const visible = filled && dist !== undefined && dist > 0.3;
          el.setAttribute('x', visible ? (ZERO_X + dist * PX - 2.5).toFixed(1) : 0);
          el.setAttribute('opacity', visible ? (0.95 * uvK).toFixed(3) : 0);
        }
      }

      laneFrame.setAttribute('y', LANE_Y(params.lane) - 13);
      laneLabels.forEach((l, i) => l.setAttribute('font-size', i === params.lane ? 16 : 14));
    },
  });

  // ── Микропипетка ──
  function updatePipette(dt) {
    if (params.load === 1 && (pip === 'rest' || pip === 'drag')) pip = 'fly';
    const toward = (tx, ty, k) => {
      pipPos.x += (tx - pipPos.x) * k;
      pipPos.y += (ty - pipPos.y) * k;
      return Math.hypot(pipPos.x - tx, pipPos.y - ty);
    };
    if (pip === 'fly') {
      if (toward(SWEEP_X, LANE_Y(0), Math.min(1, dt * 6)) < 2) {
        pip = 'sweep';
        sweepT = 0;
      }
    } else if (pip === 'sweep') {
      // Пипетка задерживается над каждой лункой и переходит к следующей
      sweepT += dt;
      const per = 0.32;
      const lane = Math.min(lanes - 1, Math.floor(sweepT / per));
      const k = clamp01((sweepT - lane * per) / (per * 0.5));
      pipPos.x = SWEEP_X;
      pipPos.y = LANE_Y(lane) + (lane > 0 && k < 1 ? (k - 1) * 32 : 0);
      if (k >= 1) loaded = Math.max(loaded, lane + 1);
      if (sweepT > per * lanes + 0.2) {
        loaded = lanes;
        pip = 'back';
      }
    } else if (pip === 'back') {
      if (toward(PIPETTE_REST.x, PIPETTE_REST.y, Math.min(1, dt * 5)) < 1) pip = 'used';
    } else if (pip === 'used') {
      Object.assign(pipPos, PIPETTE_REST);
      loaded = lanes;
    }
    pipette.style.pointerEvents = pip === 'rest' || pip === 'drag' ? '' : 'none';
    if (!held.has(pipette)) place(pipette, pip === 'rest' || pip === 'used' ? pipetteHome : topLayer);
    pipette.setAttribute('transform', `translate(${pipPos.x.toFixed(1)} ${pipPos.y.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  const held = new Set();
  pipette.addEventListener('pointerdown', () => {
    if (pip !== 'rest') return;
    held.add(pipette);
    place(pipette, topLayer);
  });
  pipette.addEventListener('pointerup', () => held.delete(pipette));
  pipette.addEventListener('pointercancel', () => held.delete(pipette));

  draggable(scene, pipette, {
    onDrag(x, y) {
      if (pip !== 'rest' && pip !== 'drag') return;
      if (pip === 'rest') {
        grab.dx = pipPos.x - x;
        grab.dy = pipPos.y - y;
        pip = 'drag';
      }
      pipPos.x = Math.max(20, Math.min(940, x + grab.dx));
      pipPos.y = Math.max(200, Math.min(BENCH, y + grab.dy));
    },
    onEnd() {
      if (pip !== 'drag') return;
      // Кончик поднесён к лункам — пробы наносят во все дорожки по очереди
      if (pipPos.x > GEL.x1 - 50 && pipPos.x < GEL.x1 + 90 && pipPos.y > GEL.top - 60 && pipPos.y < GEL.bottom + 30) {
        pip = 'fly';
        set('load', 1);
      } else {
        pip = 'rest';
        Object.assign(pipPos, PIPETTE_REST);
      }
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
