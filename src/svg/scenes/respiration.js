// Сцена «Дыхание семян»: кабинет биологии, на столе две стеклянные банки с одинаковыми семенами гороха.
// Левая банка накрыта стеклянной пластинкой — в неё опускают горящую лучинку. Правая закрыта пробкой,
// через которую проходят воронка с краном, термометр и газоотводная трубка в пробирку с известковой водой.
// Ученик сам переносит лучинку в левую банку (пластинка сдвигается, пламя гаснет там, где мало кислорода)
// и колбу с водой к воронке (вода вытесняет газ из банки, пузыри идут через известковую воду, она мутнеет).
// Справа — три чашки с семенами: щелчок по чашке выбирает семена для опыта (прорастающие, сухие, варёные).

import { bubblePool, createScene, draggable, floorShadow, mixHex, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const JAR_A = { x: 165, w: 120, top: 268, bottom: 466 }; // банка для пробы лучинкой
const JAR_B = { x: 350, w: 136, top: 268, bottom: 466 }; // банка с пробкой, термометром и воронкой
const FUNNEL = { x: 316, top: 112, tap: 214, stem: 446 };
const THERMO = { x: 350, top: 150, bulb: 444, zero: 424, perDeg: 6 }; // шкала 0…40 °C
const OUTLET = { x: 384, y: 172 }; // колено газоотводной трубки
const LIME = { x: 580, top: 300, bottom: 452, w: 34, fill: 344 }; // пробирка с известковой водой
const TUBE_END = LIME.bottom - 18; // трубка опущена почти до дна — газ проходит через всю известковую воду
const FLASK = { x: 474, y: 384 }; // горлышко колбы с водой в покое
const POUR = { x: 334, y: 98, angle: -112 }; // колба наклонена над воронкой
const SPLINT_REST = { x: 58, y: 330, angle: 0 }; // кончик лучинки, стоящей в стаканчике с песком
const SPLINT_IN = { x: JAR_A.x - 8, y: 356, angle: 194 }; // кончик в банке, над семенами
const SPLINT_LEN = 128;
const DISHES = [690, 800, 900]; // чашки с семенами: прорастающие, сухие, варёные
const DISH_Y = 456;
const LABELS = ['Прорастающие', 'Сухие', 'Варёные'];

// Горошины разных семян: прорастающие набухшие светло-зелёные с корешками, сухие мелкие жёлтые,
// варёные разваренные тусклые — цвет сразу подсказывает, живые ли семена
const LOOK = [
  { r: 7, stops: ['#f4f1c4', '#c9c46e', '#8f8a3c'] },
  { r: 5.6, stops: ['#f3dc94', '#d1ac4f', '#94742c'] },
  { r: 7.6, stops: ['#d7d3b0', '#a29d72', '#6d6a49'] },
];

// Детерминированный генератор: горошины лежат одинаково при каждом открытии сцены
function rng(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

// Контур банки: прямые стенки, скруглённое дно, плечики и широкое горло
function jarPath({ x, w, top, bottom }) {
  const r = 16;
  const neck = w / 2 - 10;
  const shoulder = top + 22;
  return `M${x - neck} ${top} V${top + 8} Q${x - w / 2} ${top + 10} ${x - w / 2} ${shoulder} V${bottom - r} Q${x - w / 2} ${bottom} ${x - w / 2 + r} ${bottom} H${x + w / 2 - r} Q${x + w / 2} ${bottom} ${x + w / 2} ${bottom - r} V${shoulder} Q${x + w / 2} ${top + 10} ${x + neck} ${top + 8} V${top}`;
}

// Высота слоя семян в банке (100 г гороха)
const PILE = 58;

export function respirationScene(container, params, set, { gas }) {
  const jars = []; // { peas: [{ c, sprout, y }] }
  let column, plate, splint, flame, ember, smoke, limeLiquid, limeCloud, sediment;
  let flask, flaskWater, stream, jarWater, stemWater, tapHandle, bubbles, topLayer, splintHome, flaskHome;
  const dishRings = [];
  let lookUrls;
  let acc = 0;
  let shownTime = params.time;

  // Лучинка: rest — в стаканчике, drag — в руке, fly — летит к банке, in — в банке
  let spl = params.splint ? 'in' : 'rest';
  const splPos = { ...(params.splint ? SPLINT_IN : SPLINT_REST) };
  let plateShift = params.splint ? 1 : 0;

  // Колба с водой: rest | drag | fly | pour | back | used
  let flk = params.lime ? 'used' : 'rest';
  const flkPos = { x: FLASK.x, y: FLASK.y, angle: 0 };
  let pourT = 0;
  let waterK = params.lime ? 1 : 0; // сколько воды уже в банке (0…1)
  let cloudK = 0; // мутность, видимая в пробирке, догоняет расчётную постепенно
  const grab = { dx: 0, dy: 0 };

  // Газ в банке пересчитываем, только когда меняются условия — расчёт идёт по шагам времени
  let cacheKey = '';
  let cached = null;
  const state = () => {
    const key = `${params.seeds}|${params.T}|${shownTime.toFixed(2)}`;
    if (key !== cacheKey) {
      cacheKey = key;
      const g = gas(params, shownTime);
      cached = { ...g, tin: params.T + g.dT };
    }
    return cached;
  };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);
      lookUrls = LOOK.map((l) => d.rad([[0, l.stops[0]], [0.6, l.stops[1]], [1, l.stops[2]]], 0.35, 0.3));

      // ── Стаканчик с песком, в нём горящая лучинка ──
      splintHome = s('g');
      svg.append(floorShadow(SPLINT_REST.x, BENCH - 1, 30, d), splintHome);

      // ── Две банки с семенами ──
      for (const [i, J] of [JAR_A, JAR_B].entries()) {
        const clip = `jar${i}${uid}`;
        defs.append(s('clipPath', { id: clip }, [s('path', { d: jarPath(J) })]));
        svg.append(
          floorShadow(J.x, J.bottom + 3, J.w * 0.6, d),
          s('path', { d: jarPath(J), fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        );
        const inside = s('g', { 'clip-path': `url(#${clip})` });
        svg.append(inside);
        jars.push({ J, inside, peas: [] });
      }
      // Горошины насыпаны рядами снизу вверх; видны те, что ниже верхнего края слоя данной массы
      jars.forEach(({ J, inside, peas }, i) => {
        const r = rng(7 + i * 31);
        for (let row = 0; row * 9.5 < PILE + 8; row++) {
          const y = J.bottom - 6 - row * 9.5;
          const n = Math.floor((J.w - 10) / 13);
          for (let k = 0; k < n; k++) {
            const x = J.x - J.w / 2 + 9 + k * 13 + (row % 2 ? 6 : 0) + (r() - 0.5) * 3;
            if (x > J.x + J.w / 2 - 6) continue;
            const py = y + (r() - 0.5) * 3;
            const c = s('circle', { cx: x.toFixed(1), cy: py.toFixed(1), r: 7, stroke: '#6b6a3a', 'stroke-width': 0.6, 'stroke-opacity': 0.5 });
            // Корешок у каждой третьей прорастающей горошины: белый изогнутый отросток
            const dir = r() > 0.5 ? 1 : -1;
            const sprout = (row + k) % 3 === 0 ? s('path', { fill: 'none', stroke: '#fbfaf3', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0 }) : null;
            peas.push({ c, sprout, x, y: py, dir });
          }
        }
        // Верхние ряды рисуем последними, чтобы они лежали поверх нижних
        peas.sort((a, b) => b.y - a.y);
        for (const p of peas) inside.append(p.c);
        for (const p of peas) if (p.sprout) inside.append(p.sprout);
      });

      // Вода, вытеснившая газ, — слой на дне правой банки
      jarWater = s('rect', { x: JAR_B.x - JAR_B.w / 2, y: JAR_B.bottom, width: JAR_B.w, height: 0, fill: '#93c5fd', 'fill-opacity': 0.45 });
      jars[1].inside.append(jarWater);

      // ── Термометр, газоотводная трубка и воронка правой банки ──
      column = s('rect', { x: THERMO.x - 1.8, width: 3.6, rx: 1.8, fill: '#dc2626' });
      svg.append(
        s('rect', { x: THERMO.x - 6.5, y: THERMO.top, width: 13, height: THERMO.bulb - THERMO.top, rx: 6.5, fill: d.lin([[0, '#ffffff', 0.7], [0.5, '#f8fafc', 0.35], [1, '#cbd5e1', 0.6]]), stroke: '#94a3b8', 'stroke-width': 1.2 }),
        ...Array.from({ length: 9 }, (_, i) => s('line', { x1: THERMO.x + 2.5, x2: THERMO.x + (i % 2 ? 5 : 7), y1: THERMO.zero - i * 5 * THERMO.perDeg, y2: THERMO.zero - i * 5 * THERMO.perDeg, stroke: '#64748b', 'stroke-width': 1 })),
        column,
        s('circle', { cx: THERMO.x, cy: THERMO.bulb, r: 7, fill: d.rad(['#f87171', '#991b1b']) }),
      );
      // Газоотводная трубка: из банки вверх, вбок и вниз до дна пробирки
      const outlet = `M${OUTLET.x} ${JAR_B.top + 10} V${OUTLET.y + 10} Q${OUTLET.x} ${OUTLET.y} ${OUTLET.x + 10} ${OUTLET.y} H${LIME.x - 10} Q${LIME.x} ${OUTLET.y} ${LIME.x} ${OUTLET.y + 10} V${TUBE_END}`;
      svg.append(
        s('path', { d: outlet, fill: 'none', stroke: '#94a3b8', 'stroke-width': 7, 'stroke-linejoin': 'round' }),
        s('path', { d: outlet, fill: 'none', stroke: '#f1f5f9', 'stroke-width': 4, 'stroke-linejoin': 'round' }),
      );
      // Воронка: конус сверху, длинный стебель почти до дна, кран над пробкой
      stemWater = s('rect', { x: FUNNEL.x - 1.8, y: FUNNEL.tap, width: 3.6, height: 0, fill: '#60a5fa', opacity: 0.9 });
      tapHandle = s('rect', { x: FUNNEL.x - 13, y: FUNNEL.tap - 3, width: 26, height: 6, rx: 3, fill: d.lin([[0, '#e2e8f0'], [1, '#64748b']], 'v'), stroke: '#475569', 'stroke-width': 0.8 });
      svg.append(
        s('rect', { x: FUNNEL.x - 3.5, y: FUNNEL.top + 40, width: 7, height: FUNNEL.stem - FUNNEL.top - 40, rx: 3, fill: '#f1f5f9', 'fill-opacity': 0.6, stroke: '#94a3b8', 'stroke-width': 1.2 }),
        stemWater,
        s('path', { d: `M${FUNNEL.x - 28} ${FUNNEL.top} L${FUNNEL.x - 4} ${FUNNEL.top + 42} H${FUNNEL.x + 4} L${FUNNEL.x + 28} ${FUNNEL.top} Z`, fill: d.lin([[0, '#ffffff', 0.7], [0.5, '#f1f5f9', 0.25], [1, '#cbd5e1', 0.6]]), stroke: '#94a3b8', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
        s('ellipse', { cx: FUNNEL.x, cy: FUNNEL.top, rx: 28, ry: 4, fill: '#ffffff', 'fill-opacity': 0.5, stroke: '#94a3b8', 'stroke-width': 1.2 }),
        s('circle', { cx: FUNNEL.x, cy: FUNNEL.tap, r: 6, fill: '#cbd5e1', stroke: '#64748b', 'stroke-width': 1 }),
        tapHandle,
      );

      // Стекло банок поверх содержимого
      for (const { J } of jars) {
        svg.append(
          s('path', { d: jarPath(J), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.4 }),
          s('rect', { x: J.x - J.w / 2 + 9, y: J.top + 34, width: 6, height: J.bottom - J.top - 64, rx: 3, fill: '#ffffff', 'fill-opacity': 0.6 }),
          s('rect', { x: J.x - J.w / 2 + 6, y: J.top - 4, width: J.w - 12, height: 8, rx: 3, fill: d.lin([[0, '#e2e8f0'], [1, '#b6c2cf']], 'v'), stroke: '#94a3b8', 'stroke-width': 1 }),
        );
      }
      // Резиновая пробка правой банки
      svg.append(
        s('path', { d: `M${JAR_B.x - 50} ${JAR_B.top - 14} H${JAR_B.x + 50} L${JAR_B.x + 46} ${JAR_B.top + 14} H${JAR_B.x - 46} Z`, fill: d.lin([[0, '#9f3b2b'], [0.45, '#c2563f'], [1, '#6f2318']]), stroke: '#5b1c12', 'stroke-width': 1 }),
        s('rect', { x: JAR_B.x - 48, y: JAR_B.top - 14, width: 96, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.18 }),
      );
      // Стеклянная пластинка на левой банке (сдвигается, когда опускают лучинку)
      plate = s('rect', { x: JAR_A.x - 64, y: JAR_A.top - 9, width: 128, height: 6, rx: 2, fill: '#e0f2fe', 'fill-opacity': 0.75, stroke: '#94a3b8', 'stroke-width': 1.2 });
      svg.append(plate);

      // ── Пробирка с известковой водой в штативе ──
      const lclip = `lime${uid}`;
      const tube = `M${LIME.x - LIME.w / 2} ${LIME.top} V${LIME.bottom - LIME.w / 2} A ${LIME.w / 2} ${LIME.w / 2} 0 0 0 ${LIME.x + LIME.w / 2} ${LIME.bottom - LIME.w / 2} V${LIME.top}`;
      defs.append(s('clipPath', { id: lclip }, [s('path', { d: tube })]));
      limeLiquid = s('rect', { x: LIME.x - LIME.w / 2, y: LIME.fill, width: LIME.w, height: LIME.bottom - LIME.fill, fill: '#bae6fd', 'fill-opacity': 0.55 });
      // Муть — молочно-серая и плотная: на светлом фоне белая муть была бы почти не видна
      limeCloud = s('rect', { x: LIME.x - LIME.w / 2, y: LIME.fill, width: LIME.w, height: LIME.bottom - LIME.fill, fill: d.lin([[0, '#d6d3d1'], [1, '#8f8a85']], 'v'), opacity: 0 });
      sediment = s('ellipse', { cx: LIME.x, cy: LIME.bottom - 6, rx: 13, ry: 7, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1, opacity: 0 });
      const limeIn = s('g', { 'clip-path': `url(#${lclip})` }, [limeLiquid, limeCloud, sediment]);
      bubbles = bubblePool(limeIn, 18, { color: '#ffffff' });
      svg.append(
        floorShadow(LIME.x, BENCH, 46, d),
        // Деревянный штатив: две стойки и планка с гнездом
        s('rect', { x: LIME.x - 40, y: 394, width: 8, height: BENCH - 394, rx: 2, fill: d.lin(['#a16207', '#ca8a04', '#854d0e']) }),
        s('rect', { x: LIME.x + 32, y: 394, width: 8, height: BENCH - 394, rx: 2, fill: d.lin(['#a16207', '#ca8a04', '#854d0e']) }),
        s('rect', { x: LIME.x - 44, y: BENCH - 10, width: 88, height: 10, rx: 3, fill: d.lin([[0, '#ca8a04'], [1, '#854d0e']], 'v') }),
        s('path', { d: tube, fill: '#eef3f7', 'fill-opacity': 0.3 }),
        limeIn,
        s('ellipse', { cx: LIME.x, cy: LIME.fill, rx: LIME.w / 2 - 3, ry: 2.5, fill: '#ffffff', 'fill-opacity': 0.6 }),
        s('path', { d: tube, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: LIME.x - LIME.w / 2 - 3, y: LIME.top - 3, width: LIME.w + 6, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: LIME.x - 44, y: 392, width: 88, height: 12, rx: 3, fill: d.lin([[0, '#eab308'], [1, '#a16207']], 'v') }),
      );
      // Бирка пробирки
      const limeLabel = tr('Известковая вода');
      const tagW = Math.max(96, limeLabel.length * 8 + 20);
      svg.append(
        s('path', { d: `M${LIME.x + LIME.w / 2} 330 L${LIME.x + 44} 330`, stroke: '#94a3b8', 'stroke-width': 1.2 }),
        s('rect', { x: LIME.x + 44, y: 318, width: tagW, height: 24, rx: 5, fill: '#fffbeb', stroke: '#d6c7a1', 'stroke-width': 1.2 }),
        text(LIME.x + 44 + tagW / 2, 330.5, limeLabel, { size: 13, weight: 600, fill: '#78350f' }),
      );

      // ── Чашки Петри с семенами: щелчок выбирает семена для опыта ──
      DISHES.forEach((x, i) => {
        const r = rng(100 + i);
        const ring = s('ellipse', { cx: x, cy: DISH_Y, rx: 46, ry: 14, fill: 'none', stroke: '#16a34a', 'stroke-width': 3, opacity: 0 });
        const seeds = [];
        for (let k = 0; k < 9; k++) {
          const sx = x - 22 + (k % 5) * 11 + (k > 4 ? 5 : 0) + (r() - 0.5) * 3;
          const sy = DISH_Y - 4 + (k > 4 ? 4 : -1) + (r() - 0.5) * 2;
          seeds.push(s('circle', { cx: sx.toFixed(1), cy: sy.toFixed(1), r: LOOK[i].r * 0.75, fill: lookUrls[i], stroke: '#6b6a3a', 'stroke-width': 0.5, 'stroke-opacity': 0.5 }));
          if (i === 0 && k % 2 === 0) seeds.push(s('path', { d: `M${sx + 3} ${sy + 2} q 5 4 9 1`, fill: 'none', stroke: '#fbfaf3', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
        }
        const dish = s('g', {}, [
          s('rect', { x: x - 44, y: DISH_Y - 32, width: 88, height: 44, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
          floorShadow(x, BENCH - 1, 44, d, 6),
          ring,
          s('ellipse', { cx: x, cy: DISH_Y + 4, rx: 40, ry: 9, fill: d.lin([[0, '#e2e8f0'], [1, '#cbd5e1']], 'v'), stroke: '#94a3b8', 'stroke-width': 1 }),
          s('ellipse', { cx: x, cy: DISH_Y, rx: 38, ry: 8, fill: '#f8fafc', 'fill-opacity': 0.8, stroke: '#cbd5e1', 'stroke-width': 1 }),
          ...seeds,
          s('path', { d: `M${x - 38} ${DISH_Y} Q${x} ${DISH_Y + 14} ${x + 38} ${DISH_Y}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-opacity': 0.8 }),
          text(x, 420, tr(LABELS[i]), { size: 13, weight: 600, fill: '#334155' }),
        ]);
        dish.style.cursor = 'pointer';
        dish.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('seeds', i);
        });
        touchTarget(dish, 8);
        dishRings.push(ring);
        svg.append(dish);
      });

      // ── Колба с водой: горлышко в (0, 0), коническое тело ниже ──
      flaskWater = s('path', { d: 'M-24 46 L-30 74 Q-31 80 -25 80 H25 Q31 80 30 74 L24 46 Z', fill: '#93c5fd', 'fill-opacity': 0.7 });
      stream = s('path', { fill: 'none', stroke: '#60a5fa', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0, 'pointer-events': 'none' });
      flask = s('g', {}, [
        s('rect', { x: -36, y: -10, width: 72, height: 96, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('path', { d: 'M-8 0 V22 L-31 72 Q-34 82 -24 82 H24 Q34 82 31 72 L8 22 V0 Z', fill: '#eef3f7', 'fill-opacity': 0.35 }),
        flaskWater,
        s('path', { d: 'M-8 0 V22 L-31 72 Q-34 82 -24 82 H24 Q34 82 31 72 L8 22 V0 Z', fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }),
        s('rect', { x: -10, y: -3, width: 20, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: -19, y: 50, width: 38, height: 20, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
        text(0, 60.5, tr('Вода'), { size: 13, weight: 700, fill: '#1d4ed8' }),
      ]);
      flaskHome = s('g', {}, [floorShadow(FLASK.x, BENCH - 1, 34, d), flask]);
      svg.append(flaskHome, stream);

      // ── Лучинка: кончик в (0, 0), палочка уходит вниз; пламя рисуется отдельно и всегда смотрит вверх ──
      splint = s('g', {}, [
        s('rect', { x: -14, y: -14, width: 28, height: SPLINT_LEN + 14, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('line', { x1: 0, y1: 0, x2: 0, y2: SPLINT_LEN, stroke: '#d6b17a', 'stroke-width': 5, 'stroke-linecap': 'round' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 14, stroke: '#3f2a1c', 'stroke-width': 5.4, 'stroke-linecap': 'round' }),
      ]);
      ember = s('ellipse', { rx: 4, ry: 3, fill: '#f97316', 'pointer-events': 'none' });
      flame = s('path', { d: 'M0 4 C -10 -2, -7 -18, 0 -34 C 7 -18, 10 -2, 0 4 Z', fill: d.lin([[0, '#fef9c3'], [0.45, '#fb923c'], [1, '#fde68a']], 'v'), 'pointer-events': 'none' });
      smoke = Array.from({ length: 5 }, (_, i) => s('circle', { r: 3 + i * 0.8, fill: '#94a3b8', opacity: 0, 'pointer-events': 'none' }));
      splintHome.append(splint);
      topLayer = s('g');
      // Передняя стенка стаканчика с песком перекрывает низ лучинки
      svg.append(
        s('path', { d: `M${SPLINT_REST.x - 24} ${BENCH - 46} L${SPLINT_REST.x - 21} ${BENCH - 3} Q${SPLINT_REST.x} ${BENCH + 1} ${SPLINT_REST.x + 21} ${BENCH - 3} L${SPLINT_REST.x + 24} ${BENCH - 46} Z`, fill: '#e7d3a7', 'fill-opacity': 0.9 }),
        s('path', { d: `M${SPLINT_REST.x - 24} ${BENCH - 46} L${SPLINT_REST.x - 21} ${BENCH - 3} Q${SPLINT_REST.x} ${BENCH + 1} ${SPLINT_REST.x + 21} ${BENCH - 3} L${SPLINT_REST.x + 24} ${BENCH - 46}`, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.6 }),
        topLayer, ember, flame, ...smoke,
      );
    },

    frame(dt, now) {
      // Время опыта догоняет регулятор постепенно: видно, как семена расходуют кислород час за часом
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * 10) : Math.max(params.time, shownTime - dt * 20);
      const g = state();

      const colTop = THERMO.zero - Math.max(-3, Math.min(42, g.tin)) * THERMO.perDeg;
      column.setAttribute('y', colTop.toFixed(1));
      column.setAttribute('height', (THERMO.bulb - colTop).toFixed(1));

      // Семена: вид по типу, корешки растут, пока семена дышат
      const look = LOOK[params.seeds];
      const growth = params.seeds === 0 ? Math.min(1, 0.35 + (21 - g.o2) / 14) : 0;
      for (const { J, peas } of jars) {
        const surface = J.bottom - PILE;
        for (const p of peas) {
          const on = p.y >= surface;
          p.c.setAttribute('opacity', on ? 1 : 0);
          p.c.setAttribute('r', look.r);
          p.c.setAttribute('fill', lookUrls[params.seeds]);
          if (p.sprout) {
            const L = 5 + 9 * growth;
            p.sprout.setAttribute('d', `M${(p.x + p.dir * 4).toFixed(1)} ${(p.y + 3).toFixed(1)} q ${(p.dir * L * 0.4).toFixed(1)} ${(L * 0.6).toFixed(1)} ${(p.dir * L).toFixed(1)} ${(L * 0.3).toFixed(1)}`);
            p.sprout.setAttribute('opacity', on && growth > 0 ? 1 : 0);
          }
        }
      }
      dishRings.forEach((r, i) => r.setAttribute('opacity', i === params.seeds ? 1 : 0));

      updateSplint(dt, now, g);
      updateFlask(dt, g);
    },
  });

  // ── Лучинка ──
  function updateSplint(dt, now, g) {
    if (params.splint === 1 && (spl === 'rest' || spl === 'drag')) spl = 'fly';
    if (params.splint === 0 && spl === 'in') spl = 'rest';
    if (spl === 'fly') {
      const k = Math.min(1, dt * 5);
      splPos.x += (SPLINT_IN.x - splPos.x) * k;
      splPos.y += (SPLINT_IN.y - splPos.y) * k;
      splPos.angle += (SPLINT_IN.angle - splPos.angle) * k;
      if (Math.hypot(splPos.x - SPLINT_IN.x, splPos.y - SPLINT_IN.y) < 1.5) spl = 'in';
    } else if (spl === 'in') {
      Object.assign(splPos, SPLINT_IN);
    } else if (spl === 'rest') {
      Object.assign(splPos, SPLINT_REST);
    }
    // Пластинка отъезжает, пока лучинку опускают в банку
    const wantPlate = spl === 'fly' || spl === 'in' ? 1 : 0;
    plateShift += (wantPlate - plateShift) * Math.min(1, dt * 6);
    plate.setAttribute('transform', `translate(${(plateShift * 40).toFixed(1)} 0)`);

    splint.style.pointerEvents = spl === 'rest' || spl === 'drag' ? '' : 'none';
    if (!held.has(splint)) place(splint, spl === 'rest' ? splintHome : topLayer);
    splint.setAttribute('transform', `translate(${splPos.x.toFixed(1)} ${splPos.y.toFixed(1)}) rotate(${splPos.angle.toFixed(1)})`);

    // Пламя — по кислороду в банке, когда лучинка внутри; на воздухе горит ровно
    const inside = spl === 'in';
    const o2 = inside ? g.o2 : 21;
    const size = o2 >= 18 ? 1 : o2 >= 16 ? 0.25 + ((o2 - 16) / 2) * 0.6 : 0;
    const flick = 1 + Math.sin(now * 17) * 0.06 + Math.sin(now * 29) * 0.04;
    flame.setAttribute('transform', `translate(${splPos.x.toFixed(1)} ${splPos.y.toFixed(1)}) scale(${(size * 1.1).toFixed(2)} ${(size * flick * 1.25).toFixed(2)})`);
    flame.setAttribute('opacity', size > 0 ? 0.95 : 0);
    ember.setAttribute('cx', splPos.x.toFixed(1));
    ember.setAttribute('cy', splPos.y.toFixed(1));
    ember.setAttribute('fill', size > 0 ? '#f97316' : '#7c2d12');
    // Погасшая лучинка дымит: тонкая струйка поднимается к горлу банки
    smoke.forEach((c, i) => {
      const k = (now * 0.45 + i / smoke.length) % 1;
      c.setAttribute('cx', (splPos.x + Math.sin(now * 2 + i) * 4 + k * 5).toFixed(1));
      c.setAttribute('cy', (splPos.y - 6 - k * 70).toFixed(1));
      c.setAttribute('opacity', inside && size === 0 ? (0.35 * (1 - k)).toFixed(2) : 0);
    });
  }

  // ── Колба с водой ──
  function updateFlask(dt, g) {
    if (params.lime === 1 && (flk === 'rest' || flk === 'drag')) flk = 'fly';
    if (params.lime === 0 && flk === 'used') {
      flk = 'rest';
      waterK = 0;
    }
    if (flk === 'fly') {
      const k = Math.min(1, dt * 5);
      flkPos.x += (POUR.x - flkPos.x) * k;
      flkPos.y += (POUR.y - flkPos.y) * k;
      flkPos.angle += (POUR.angle - flkPos.angle) * k;
      if (Math.hypot(flkPos.x - POUR.x, flkPos.y - POUR.y) < 1.5 && Math.abs(flkPos.angle - POUR.angle) < 2) {
        flk = 'pour';
        pourT = 0;
      }
    } else if (flk === 'pour') {
      // Вода льётся в воронку, по стеблю уходит на дно банки и вытесняет газ в известковую воду
      pourT += dt;
      waterK = Math.min(1, pourT / 1.6);
      acc += dt * 14;
      while (acc >= 1) {
        acc -= 1;
        bubbles.spawn(LIME.x + (Math.random() - 0.5) * 6, TUBE_END, 2 + Math.random() * 2.5);
      }
      if (pourT > 1.9) flk = 'back';
    } else if (flk === 'back') {
      const k = Math.min(1, dt * 5);
      flkPos.x += (FLASK.x - flkPos.x) * k;
      flkPos.y += (FLASK.y - flkPos.y) * k;
      flkPos.angle += (0 - flkPos.angle) * k;
      if (Math.hypot(flkPos.x - FLASK.x, flkPos.y - FLASK.y) < 1) flk = 'used';
    } else if (flk === 'used' || flk === 'rest') {
      Object.assign(flkPos, { x: FLASK.x, y: FLASK.y, angle: 0 });
    }
    bubbles.update(dt, LIME.fill + 2, 0.3);

    const pouring = flk === 'pour';
    stream.setAttribute('d', `M${POUR.x - 4} ${POUR.y + 2} Q${FUNNEL.x + 6} ${POUR.y + 4} ${FUNNEL.x + 2} ${FUNNEL.top + 20}`);
    stream.setAttribute('opacity', pouring ? 0.85 : 0);
    tapHandle.setAttribute('transform', pouring ? `rotate(90 ${FUNNEL.x} ${FUNNEL.tap})` : '');
    stemWater.setAttribute('height', pouring ? FUNNEL.stem - FUNNEL.tap : 0);
    const wh = 18 * waterK;
    jarWater.setAttribute('y', (JAR_B.bottom - wh).toFixed(1));
    jarWater.setAttribute('height', wh.toFixed(1));
    // В колбе убывает столько воды, сколько ушло в банку
    flaskWater.setAttribute('transform', `translate(0 ${(waterK * 18).toFixed(1)}) scale(1 ${(1 - waterK * 0.55).toFixed(2)})`);

    // Мутность известковой воды: CaCO₃ выпадает тем сильнее, чем больше CO₂ прошло через пробирку
    const target = params.lime && flk !== 'fly' ? Math.max(0, Math.min(1, (g.co2 - 0.3) / 3)) : 0;
    const speed = flk === 'pour' ? 0.9 : 3;
    cloudK += Math.sign(target - cloudK) * Math.min(Math.abs(target - cloudK), dt * speed);
    limeCloud.setAttribute('opacity', cloudK.toFixed(3));
    sediment.setAttribute('opacity', (Math.max(0, cloudK - 0.3) * 1.2).toFixed(3));
    limeLiquid.setAttribute('fill', mixHex('#bae6fd', '#cbd5e1', cloudK));

    flask.style.pointerEvents = flk === 'rest' || flk === 'drag' ? '' : 'none';
    if (!held.has(flask)) place(flask, flk === 'rest' || flk === 'used' ? flaskHome : topLayer);
    flask.setAttribute('transform', `translate(${flkPos.x.toFixed(1)} ${flkPos.y.toFixed(1)}) rotate(${flkPos.angle.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  // Взятый предмет поднимаем наверх до того, как draggable() захватит указатель (обработчик зарегистрирован раньше)
  const held = new Set();
  for (const [node, st] of [[splint, () => spl], [flask, () => flk]]) {
    node.addEventListener('pointerdown', () => {
      if (st() !== 'rest') return;
      held.add(node);
      place(node, topLayer);
    });
    const release = () => held.delete(node);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
  }

  // Перенос мышью/пальцем: держим предмет за ту точку, за которую взяли
  const carry = (st, pos, setSt) => ({
    onDrag(x, y) {
      if (st() !== 'rest' && st() !== 'drag') return;
      if (st() === 'rest') {
        grab.dx = pos.x - x;
        grab.dy = pos.y - y;
        setSt('drag');
      }
      pos.x = Math.max(20, Math.min(940, x + grab.dx));
      pos.y = Math.max(60, Math.min(BENCH - 4, y + grab.dy));
    },
  });

  draggable(scene, splint, {
    ...carry(() => spl, splPos, (v) => { spl = v; }),
    onEnd() {
      if (spl !== 'drag') return;
      // Кончик лучинки у горла левой банки — опускаем её внутрь
      if (Math.abs(splPos.x - JAR_A.x) < 75 && splPos.y > JAR_A.top - 90 && splPos.y < JAR_A.bottom - 60) {
        spl = 'fly';
        set('splint', 1);
      } else {
        spl = 'rest';
      }
    },
  });

  draggable(scene, flask, {
    ...carry(() => flk, flkPos, (v) => { flk = v; }),
    onEnd() {
      if (flk !== 'drag') return;
      // Горлышко колбы над воронкой — наклоняем и наливаем воду
      if (Math.abs(flkPos.x - FUNNEL.x) < 70 && flkPos.y > FUNNEL.top - 90 && flkPos.y < FUNNEL.top + 110) {
        flk = 'fly';
        set('lime', 1);
      } else {
        flk = 'rest';
      }
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
