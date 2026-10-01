// Сцена «Получение кислорода»: химический стол. Слева — баночка с чёрным порошком MnO₂ и шпателем,
// в центре — колба с отводом (колба Бунзена) с 5 мл раствора пероксида водорода под резиновой пробкой;
// резиновая трубка ведёт от отвода к тройнику с краном и дальше в газовый шприц на 100 мл, закреплённый
// в лапке штатива. Справа — стаканчик с тлеющей лучинкой. Ученик сам ведёт опыт:
//   шпатель тащат к горлышку колбы (или нажимают на него) → пробка приподнимается, порошок ссыпается
//   в пероксид, начинается бурное выделение пузырьков (catalyst = 1);
//   регулятор «Время» → поршень шприца выдвигается на объём собранного кислорода;
//   лучинку тащат к крану тройника → кран открывается, лучинка ярко вспыхивает (splint = 1).
// Объём и скорость считает модель (src/sims/gases.js); сцена только догоняет их плавно, чтобы
// движение поршня было видно, а число пузырьков в колбе следует за скоростью реакции.

import { bubblePool, createScene, draggable, floorShadow, mixHex, room, s, text } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 450;

const FX = 270; // ось колбы
const NECK = { top: 214, shoulder: 292, r: 20 };
const BASE = { y: 448, r: 96 };
const LEVEL = 398; // уровень раствора в колбе
const ARM = { x1: FX + 18, y1: 238, x2: FX + 72, y2: 250 }; // отвод колбы
const LINE_Y = 168; // ось тройника и шприца
const TEE = { x1: 376, x2: 412, branchX: 394, tapY: 132, tipY: 98 };
const BARREL = { x1: 424, x2: 694, top: 146, bottom: 190 };
const ZERO_X = 454; // деление «0» шкалы шприца
const PX_PER_ML = 2.3; // 100 мл — 230 единиц сцены
const ROD = 252; // длина штока поршня
const STAND_X = 440;
const JAR = { x: 104, bottom: 448, w: 86, h: 92 };
const SPATULA_REST = { x: 112, y: 418, angle: 8 }; // ложечка шпателя — в порошке
const POUR = { x: FX + 2, y: 190 }; // ложечка над горлышком колбы
const SPLINT_REST = { x: 836, y: 346, angle: 112 }; // кончик лучинки, стоящей в стаканчике
const SPLINT_LEN = 118;
const SPLINT_HELD = -42; // в руке лучинку держат за конец, кончиком вниз-влево к крану
const OUTLET = { x: TEE.branchX + 7, y: TEE.tipY - 5 };
const GRAINS = 16;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Колба с отводом: горло, конус, плоское дно
const flaskPath = () => `M${FX - NECK.r} ${NECK.top} V${NECK.shoulder} L${FX - BASE.r + 2} ${BASE.y - 18} Q${FX - BASE.r - 2} ${BASE.y} ${FX - BASE.r + 16} ${BASE.y} H${FX + BASE.r - 16} Q${FX + BASE.r + 2} ${BASE.y} ${FX + BASE.r - 2} ${BASE.y - 18} L${FX + NECK.r} ${NECK.shoulder} V${NECK.top}`;
// Полуширина колбы на высоте y (для пены и пузырей у стенок)
const halfAt = (y) => (y <= NECK.shoulder ? NECK.r : NECK.r + ((y - NECK.shoulder) / (BASE.y - 18 - NECK.shoulder)) * (BASE.r - 2 - NECK.r));

export function gasesScene(container, params, set, { volume, rate, SPLINT_MIN }) {
  let gasFill, plunger, liquid, sediment, labelText, stopper, tapHandle, puff;
  let spatula, pile, spatulaHome, topLayer, splint, shaft, ember, flame, flash, bubbles;
  const foam = [];
  const motes = [];
  const grains = [];
  const smoke = [];
  let acc = 0;

  // Шпатель: rest — в баночке, drag — в руке, fly — к горлышку, pour — ссыпает порошок, back — обратно, used — пустой
  let spat = params.catalyst ? 'used' : 'rest';
  const spatPos = { ...SPATULA_REST };
  let pourT = 0;
  let lift = 0; // пробка: 0 — в горлышке, 1 — приподнята
  let sedimentK = params.catalyst ? 1 : 0;
  const grab = { dx: 0, dy: 0 };

  // Лучинка: rest — в стаканчике, drag — в руке, test — у крана, done — догорела
  let splintState = 'rest';
  const splintPos = { ...SPLINT_REST };
  let testT = 0;
  let flared = false;
  let tested = Boolean(params.splint);

  let shownTime = params.time;
  let shownV = volume(params, shownTime);

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'lab' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      // ── Штатив с лапкой: держит шприц за передний конец, чтобы шкала оставалась открытой ──
      const metal = d.lin(['#64748b', '#e2e8f0', '#475569']);
      svg.append(
        floorShadow(STAND_X, BENCH + 1, 62, d),
        s('rect', { x: STAND_X - 56, y: BENCH - 10, width: 112, height: 12, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
        s('rect', { x: STAND_X - 4, y: BARREL.bottom - 4, width: 8, height: BENCH - BARREL.bottom - 6, fill: metal }),
      );

      // ── Газовый шприц ──
      const bw = BARREL.x2 - BARREL.x1;
      const bh = BARREL.bottom - BARREL.top;
      svg.append(s('rect', { x: BARREL.x1, y: BARREL.top, width: bw, height: bh, rx: 6, fill: d.lin([[0, '#dbe4ef', 0.45], [0.5, '#f1f5f9', 0.15], [1, '#cbd5e1', 0.5]], 'v') }));
      // Кислород бесцветен; лёгкий оттенок только показывает, где в шприце газ
      gasFill = s('rect', { x: BARREL.x1 + 2, y: BARREL.top + 2, height: bh - 4, width: 0, fill: '#e0f2fe', 'fill-opacity': 0.55 });
      svg.append(gasFill);
      plunger = s('g', {}, [
        s('rect', { x: 0, y: LINE_Y - 5, width: ROD, height: 10, rx: 2, fill: d.lin([[0, '#f8fafc'], [0.5, '#cbd5e1'], [1, '#94a3b8']], 'v'), stroke: '#94a3b8', 'stroke-width': 0.8 }),
        s('rect', { x: -10, y: BARREL.top + 1.5, width: 12, height: bh - 3, rx: 3, fill: d.lin([[0, '#475569'], [0.4, '#1f2937'], [1, '#0f172a']], 'v') }),
        s('rect', { x: ROD, y: LINE_Y - 24, width: 9, height: 48, rx: 3, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']]), stroke: '#64748b', 'stroke-width': 1 }),
      ]);
      svg.append(plunger);
      // Шкала шприца: деления каждые 10 мл, подписи каждые 20 мл
      for (let v = 0; v <= 100; v += 10) {
        const x = ZERO_X + v * PX_PER_ML;
        svg.append(s('line', { x1: x, x2: x, y1: BARREL.top + 1, y2: BARREL.top + (v % 20 ? 7 : 12), stroke: '#334155', 'stroke-width': v % 20 ? 1 : 1.6 }));
        if (v % 20 === 0) svg.append(text(x, BARREL.top - 12, String(v), { size: 13, weight: 600, fill: '#334155' }));
      }
      svg.append(
        text(BARREL.x2 + 14, BARREL.top - 12, tr('мл'), { size: 13, weight: 600, fill: '#334155', anchor: 'start' }),
        s('rect', { x: BARREL.x1, y: BARREL.top, width: bw, height: bh, rx: 6, fill: d.lin([[0, '#ffffff', 0.7], [0.14, '#ffffff', 0.18], [0.5, '#ffffff', 0.03], [0.84, '#94a3b8', 0.14], [1, '#ffffff', 0.45]], 'v'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: BARREL.x1 + 10, y: BARREL.top + 5, width: bw - 24, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.8 }),
        // упор для пальцев на открытом конце цилиндра
        s('rect', { x: BARREL.x2 - 2, y: BARREL.top - 12, width: 7, height: bh + 24, rx: 2.5, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']]), stroke: '#64748b', 'stroke-width': 1 }),
        // носик шприца
        s('rect', { x: TEE.x2, y: LINE_Y - 5, width: BARREL.x1 - TEE.x2 + 1, height: 10, rx: 2, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.2 }),
        // лапка штатива обхватывает цилиндр
        s('rect', { x: STAND_X - 7, y: BARREL.top - 7, width: 14, height: 8, rx: 2, fill: metal }),
        s('rect', { x: STAND_X - 7, y: BARREL.bottom - 1, width: 14, height: 8, rx: 2, fill: metal }),
        s('rect', { x: STAND_X - 2, y: BARREL.top - 7, width: 4, height: bh + 14, fill: '#475569', 'fill-opacity': 0.5 }),
        text((ZERO_X + BARREL.x2) / 2, BARREL.bottom + 22, tr('Газовый шприц'), { size: 13, weight: 600, fill: '#475569' }),
      );

      // ── Тройник с краном: газ идёт в шприц, через кран его выпускают на лучинку ──
      const glassTube = (dPath, w = 9) => [
        s('path', { d: dPath, stroke: '#94a3b8', 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none' }),
        s('path', { d: dPath, stroke: '#f1f5f9', 'stroke-width': w - 3.5, 'stroke-linecap': 'round', fill: 'none' }),
      ];
      svg.append(
        ...glassTube(`M${TEE.x1} ${LINE_Y} H${TEE.x2 + 2}`),
        ...glassTube(`M${TEE.branchX} ${LINE_Y} V${TEE.tipY}`, 8),
        s('ellipse', { cx: TEE.branchX, cy: TEE.tapY, rx: 8, ry: 7, fill: d.rad(['#f8fafc', '#94a3b8']), stroke: '#64748b', 'stroke-width': 1 }),
      );
      tapHandle = s('rect', { x: TEE.branchX - 15, y: TEE.tapY - 2, width: 30, height: 4, rx: 2, fill: '#475569' });
      puff = s('ellipse', { cx: OUTLET.x - 6, cy: TEE.tipY - 12, rx: 10, ry: 7, fill: '#e2e8f0', opacity: 0 });
      svg.append(tapHandle, puff);

      // ── Баночка с MnO₂: задняя стенка и порошок ──
      const jarTop = JAR.bottom - JAR.h;
      const jarPath = `M${JAR.x - JAR.w / 2} ${jarTop} V${JAR.bottom - 10} Q${JAR.x - JAR.w / 2} ${JAR.bottom} ${JAR.x - JAR.w / 2 + 10} ${JAR.bottom} H${JAR.x + JAR.w / 2 - 10} Q${JAR.x + JAR.w / 2} ${JAR.bottom} ${JAR.x + JAR.w / 2} ${JAR.bottom - 10} V${jarTop}`;
      const jarClip = `jar${uid}`;
      defs.append(s('clipPath', { id: jarClip }, [s('path', { d: jarPath })]));
      svg.append(
        floorShadow(JAR.x, JAR.bottom + 3, JAR.w * 0.62, d),
        s('path', { d: jarPath, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('path', { d: `M${JAR.x - JAR.w / 2} ${JAR.bottom - 30} Q${JAR.x - 10} ${JAR.bottom - 38} ${JAR.x + JAR.w / 2} ${JAR.bottom - 32} V${JAR.bottom} H${JAR.x - JAR.w / 2} Z`, fill: d.lin([[0, '#292524'], [1, '#0c0a09']], 'v'), 'clip-path': `url(#${jarClip})` }),
      );

      // Шпатель: ложечка в (0, 0), ручка вверх; на ложечке горка порошка — тем больше, чем больше масса
      pile = s('ellipse', { cx: 0, cy: -5, rx: 7, ry: 4, fill: d.rad(['#44403c', '#0c0a09']) });
      spatula = s('g', {}, [
        s('rect', { x: -14, y: -160, width: 28, height: 168, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('rect', { x: -2.6, y: -156, width: 5.2, height: 132, rx: 2.6, fill: d.lin(['#64748b', '#f1f5f9', '#64748b']) }),
        s('path', { d: 'M-2.6 -26 L-9 -9 Q-10 3 0 3 Q10 3 9 -9 L2.6 -26 Z', fill: d.lin(['#64748b', '#e2e8f0', '#64748b']), stroke: '#475569', 'stroke-width': 0.8 }),
        pile,
      ]);
      spatulaHome = s('g', {}, [spatula]);
      svg.append(spatulaHome);
      // Передняя стенка баночки и этикетка — поверх шпателя
      svg.append(
        s('rect', { x: JAR.x - 30, y: JAR.bottom - 72, width: 60, height: 26, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
        text(JAR.x, JAR.bottom - 58.5, tr('MnO₂'), { size: 15, weight: 700, fill: '#1e293b' }),
        s('path', { d: jarPath, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.2 }),
        s('path', { d: `M${JAR.x - JAR.w / 2 - 2} ${jarTop} H${JAR.x + JAR.w / 2 + 2}`, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      );

      // ── Колба с отводом ──
      const fp = flaskPath();
      const flaskClip = `flask${uid}`;
      defs.append(s('clipPath', { id: flaskClip }, [s('path', { d: `${fp} Z` })]));
      const content = s('g', { 'clip-path': `url(#${flaskClip})` });
      liquid = s('rect', { x: FX - BASE.r, y: LEVEL, width: BASE.r * 2, height: BASE.y - LEVEL + 2, fill: '#dbeafe', 'fill-opacity': 0.8 });
      sediment = s('path', { d: `M${FX - 70} ${BASE.y} Q${FX - 40} ${BASE.y - 9} ${FX} ${BASE.y - 10} Q${FX + 40} ${BASE.y - 9} ${FX + 70} ${BASE.y} Z`, fill: d.lin([[0, '#292524'], [1, '#0c0a09']], 'v'), opacity: 0 });
      content.append(
        liquid,
        s('rect', { x: FX - BASE.r, y: LEVEL, width: BASE.r * 2, height: BASE.y - LEVEL + 2, fill: d.lin([[0, '#0f172a', 0.14], [0.3, '#ffffff', 0.14], [0.7, '#ffffff', 0], [1, '#0f172a', 0.18]]) }),
        sediment,
      );
      // Взвесь порошка, которую пузыри поднимают со дна
      for (let i = 0; i < 14; i++) {
        const c = s('circle', { r: 1.3 + (i % 3) * 0.5, fill: '#1c1917', opacity: 0 });
        motes.push({ c, x: FX - 64 + ((i * 37) % 128), y: LEVEL + 8 + ((i * 13) % 30), ph: i * 0.9 });
        content.append(c);
      }
      bubbles = bubblePool(content, 40, { color: '#ffffff' });
      // Пена на поверхности раствора
      for (let i = 0; i < 15; i++) {
        const c = s('circle', { cx: FX - 70 + i * 10, cy: LEVEL - 1 - (i % 2) * 2, r: 3 + (i % 3), fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 0.7, opacity: 0 });
        foam.push(c);
        content.append(c);
      }
      // Ссыпающиеся крупинки MnO₂ — внутри колбы, за передней стенкой
      for (let i = 0; i < GRAINS; i++) {
        const c = s('circle', { r: 1.6 + (i % 3) * 0.5, fill: '#1c1917', opacity: 0 });
        grains.push({ c, x: 0, y: 0, v: 0, live: false, delay: 0 });
        content.append(c);
      }
      svg.append(
        floorShadow(FX, BASE.y + 3, BASE.r * 1.05, d),
        s('path', { d: `${fp} Z`, fill: '#eef3f7', 'fill-opacity': 0.3 }),
        content,
        s('ellipse', { cx: FX, cy: LEVEL, rx: halfAt(LEVEL) - 3, ry: 3.5, fill: '#ffffff', 'fill-opacity': 0.5, stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 1.2 }),
        // отвод колбы и резиновая трубка к тройнику
        ...glassTube(`M${ARM.x1} ${ARM.y1} L${ARM.x2} ${ARM.y2}`, 9),
        s('path', { d: `M${ARM.x2 - 4} ${ARM.y2 - 1} C${ARM.x2 + 40} ${ARM.y2 + 6}, ${TEE.x1 - 14} ${LINE_Y}, ${TEE.x1 + 4} ${LINE_Y}`, stroke: '#3f3f46', 'stroke-width': 11, 'stroke-linecap': 'round', fill: 'none' }),
        s('path', { d: `M${ARM.x2 - 4} ${ARM.y2 - 4} C${ARM.x2 + 38} ${ARM.y2 + 2}, ${TEE.x1 - 16} ${LINE_Y - 4}, ${TEE.x1 + 4} ${LINE_Y - 4}`, stroke: '#a1a1aa', 'stroke-opacity': 0.6, 'stroke-width': 2, fill: 'none' }),
        s('path', { d: fp, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
        s('rect', { x: FX - NECK.r - 4, y: NECK.top - 4, width: NECK.r * 2 + 8, height: 7, rx: 3, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.2 }),
        s('path', { d: `M${FX - BASE.r + 22} ${BASE.y - 30} L${FX - NECK.r - 4} ${NECK.shoulder + 22}`, stroke: '#ffffff', 'stroke-opacity': 0.6, 'stroke-width': 3, 'stroke-linecap': 'round' }),
        // этикетка с концентрацией раствора
        s('rect', { x: FX - 38, y: 330, width: 76, height: 28, rx: 4, fill: '#ffffff', 'fill-opacity': 0.92, stroke: '#cbd5e1', 'stroke-width': 1 }),
      );
      labelText = text(FX, 344.5, '', { size: 14, weight: 700, fill: '#0f766e' });
      svg.append(labelText);

      // Резиновая пробка в горлышке
      stopper = s('g', {}, [
        s('path', { d: `M${FX - 24} ${NECK.top - 22} H${FX + 24} L${FX + 17} ${NECK.top + 8} H${FX - 17} Z`, fill: d.lin([[0, '#7f1d1d'], [0.35, '#b45353'], [1, '#5f1414']]), stroke: '#450a0a', 'stroke-width': 1 }),
        s('rect', { x: FX - 24, y: NECK.top - 22, width: 48, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.18 }),
      ]);
      svg.append(stopper);

      // ── Стаканчик с лучинкой ──
      const cx = SPLINT_REST.x - 28;
      svg.append(
        floorShadow(cx, BENCH + 1, 22, d),
        s('path', { d: `M${cx - 17} ${BENCH - 40} L${cx - 14} ${BENCH - 2} Q${cx} ${BENCH + 2} ${cx + 14} ${BENCH - 2} L${cx + 17} ${BENCH - 40} Z`, fill: '#e2e8f0', 'fill-opacity': 0.5, stroke: '#94a3b8', 'stroke-width': 1.5 }),
      );
      // Лучинка: кончик в (0, 0), древко рисуется под меняющимся углом
      ember = s('ellipse', { cx: 0, cy: 0, rx: 4.5, ry: 3.2, fill: '#f97316' });
      flame = s('path', { d: 'M0 4 C -9 -2, -6 -16, 0 -30 C 6 -16, 9 -2, 0 4 Z', fill: d.lin([[0, '#fde68a'], [0.5, '#fb923c'], [1, '#fef9c3']], 'v'), opacity: 0 });
      flash = s('circle', { cx: 0, cy: -8, r: 40, fill: d.rad([[0, '#fffbeb', 1], [0.4, '#fde68a', 0.8], [1, '#fb923c', 0]], 0.5, 0.5), opacity: 0 });
      shaft = [
        s('line', { x1: 0, y1: 0, stroke: '#d6b17a', 'stroke-width': 4, 'stroke-linecap': 'round' }),
        s('line', { x1: 0, y1: 0, stroke: '#3f2a1c', 'stroke-width': 4.4, 'stroke-linecap': 'round' }),
      ];
      for (let i = 0; i < 4; i++) smoke.push(s('circle', { r: 3 + i, fill: '#94a3b8', opacity: 0, 'pointer-events': 'none' }));
      splint = s('g', {}, [
        s('circle', { cx: 0, cy: 0, r: 20, fill: '#000', 'fill-opacity': 0 }), // зона захвата у кончика
        ...shaft, flash, flame, ember,
      ]);
      svg.append(splint, ...smoke);
      svg.append(s('path', { d: `M${cx - 17} ${BENCH - 22} L${cx - 14} ${BENCH - 2} Q${cx} ${BENCH + 2} ${cx + 14} ${BENCH - 2} L${cx + 17} ${BENCH - 22}`, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.2 }));

      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt, now) {
      // Время и объём догоняют регуляторы постепенно — видно, как выдвигается поршень
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * 3) : Math.max(params.time, shownTime - dt * 8);
      const target = volume(params, shownTime);
      shownV += (target - shownV) * Math.min(1, dt * 10);
      if (Math.abs(target - shownV) < 0.05) shownV = target;
      const headX = ZERO_X + Math.min(100, shownV) * PX_PER_ML;
      plunger.setAttribute('transform', `translate(${headX.toFixed(1)} 0)`);
      gasFill.setAttribute('width', Math.max(0, headX - 10 - BARREL.x1 - 2).toFixed(1));
      labelText.textContent = `H₂O₂ ${params.c}%`;

      updateSpatula(dt);

      // Пузыри кислорода: их число следует за скоростью реакции в показанный момент
      const r = sedimentK > 0.5 ? rate(params, shownTime) : 0;
      acc += dt * Math.min(45, r * 1.1);
      while (acc >= 1) {
        acc -= 1;
        bubbles.spawn(FX + (Math.random() - 0.5) * 130, BASE.y - 8 - Math.random() * 6, 1.8 + Math.random() * 2.6);
      }
      bubbles.update(dt, LEVEL + 2, 0.5);
      const vigor = clamp01(r / 30);
      // Взвесь MnO₂ мутит раствор, пока реакция идёт бурно
      liquid.setAttribute('fill', mixHex('#dbeafe', '#78716c', vigor * 0.55 * sedimentK));
      sediment.setAttribute('opacity', sedimentK.toFixed(2));
      sediment.setAttribute('transform', `translate(${FX} ${BASE.y}) scale(${(0.55 + params.m * 0.45).toFixed(2)} ${(0.4 + params.m * 0.6).toFixed(2)}) translate(${-FX} ${-BASE.y})`);
      foam.forEach((c, i) => c.setAttribute('opacity', clamp01(vigor * 1.6 - (i % 4) * 0.12).toFixed(2)));
      motes.forEach((p) => {
        p.c.setAttribute('cx', (p.x + Math.sin(now * 2.3 + p.ph) * 6).toFixed(1));
        p.c.setAttribute('cy', (p.y + Math.cos(now * 1.7 + p.ph) * 4).toFixed(1));
        p.c.setAttribute('opacity', (vigor * sedimentK * 0.8).toFixed(2));
      });

      updateSplint(dt, now);
    },
  });

  // ── Шпатель с MnO₂ ──
  function updateSpatula(dt) {
    if (params.catalyst === 1 && (spat === 'rest' || spat === 'drag')) spat = 'fly';
    // Новый опыт (катализатор убран) — свежая порция порошка на шпателе
    if (params.catalyst === 0 && spat === 'used') {
      spat = 'rest';
      sedimentK = 0;
    }
    let liftTo = 0;
    if (spat === 'fly') {
      liftTo = 1;
      const k = Math.min(1, dt * 6);
      spatPos.x += (POUR.x - spatPos.x) * k;
      spatPos.y += (POUR.y - spatPos.y) * k;
      spatPos.angle += (0 - spatPos.angle) * k;
      if (Math.hypot(spatPos.x - POUR.x, spatPos.y - POUR.y) < 2 && lift > 0.95) {
        spat = 'pour';
        pourT = 0;
        grains.forEach((g, i) => Object.assign(g, { x: POUR.x + (Math.random() - 0.5) * 8, y: POUR.y + 2, v: 0, live: true, delay: 0.2 + i * 0.025 }));
      }
    } else if (spat === 'pour') {
      liftTo = 1;
      pourT += dt;
      // Шпатель наклоняют — порошок ссыпается в горлышко
      spatPos.angle = Math.min(65, pourT * 200);
      if (pourT > 1.3) spat = 'back';
    } else if (spat === 'back') {
      const k = Math.min(1, dt * 5);
      spatPos.x += (SPATULA_REST.x - spatPos.x) * k;
      spatPos.y += (SPATULA_REST.y - spatPos.y) * k;
      spatPos.angle += (SPATULA_REST.angle - spatPos.angle) * k;
      // Отпущенный мимо колбы шпатель возвращается с порошком, после внесения — пустым
      if (Math.hypot(spatPos.x - SPATULA_REST.x, spatPos.y - SPATULA_REST.y) < 1) spat = params.catalyst ? 'used' : 'rest';
    } else if (spat === 'used' || spat === 'rest') {
      Object.assign(spatPos, SPATULA_REST);
    }
    lift += (liftTo - lift) * Math.min(1, dt * (liftTo ? 7 : 5));
    stopper.setAttribute('transform', `translate(${(lift * 34).toFixed(1)} ${(-lift * 58).toFixed(1)}) rotate(${(lift * 18).toFixed(1)} ${FX} ${NECK.top})`);

    // Горка порошка на ложечке: исчезает, пока он ссыпается
    const left = spat === 'pour' ? clamp01(1 - (pourT - 0.2) / 0.45) : spat === 'used' || (spat === 'back' && params.catalyst) ? 0 : 1;
    pile.setAttribute('rx', ((3.5 + params.m * 6) * left).toFixed(2));
    pile.setAttribute('ry', ((2 + params.m * 3) * left).toFixed(2));
    pile.setAttribute('opacity', left > 0.02 ? 1 : 0);

    for (const g of grains) {
      if (!g.live) {
        g.c.setAttribute('opacity', 0);
        continue;
      }
      if (spat === 'pour' && pourT < g.delay) continue;
      g.v += 700 * dt;
      g.y += g.v * dt;
      g.x += (FX - g.x) * Math.min(1, dt * 3);
      if (g.y >= LEVEL) {
        g.live = false;
        // Порошок дошёл до раствора — катализатор внесён, реакция началась
        if (params.catalyst !== 1) set('catalyst', 1);
        sedimentK = Math.max(sedimentK, 0.3);
      }
      g.c.setAttribute('cx', g.x.toFixed(1));
      g.c.setAttribute('cy', g.y.toFixed(1));
      g.c.setAttribute('opacity', g.live ? 1 : 0);
    }
    if (params.catalyst === 1) sedimentK = Math.min(1, sedimentK + dt * 1.5);

    spatula.style.pointerEvents = spat === 'rest' || spat === 'drag' ? '' : 'none';
    if (!held.has(spatula)) place(spatula, spat === 'rest' || spat === 'used' ? spatulaHome : topLayer);
    spatula.setAttribute('transform', `translate(${spatPos.x.toFixed(1)} ${spatPos.y.toFixed(1)}) rotate(${spatPos.angle.toFixed(1)})`);
  }

  // ── Тлеющая лучинка ──
  // Проба: вызвана перетаскиванием к крану либо извне (splint = 1). Порог вспышки тот же,
  // что в показаниях модели, — сцена и табло не расходятся
  function startTest() {
    splintState = 'test';
    tested = true;
    testT = 0;
    flared = volume(params) >= SPLINT_MIN;
    Object.assign(splintPos, { x: OUTLET.x, y: OUTLET.y });
    if (flared && params.splint !== 1) set('splint', 1);
  }

  function updateSplint(dt, now) {
    if (params.splint === 1 && !tested && (splintState === 'rest' || splintState === 'drag')) startTest();
    if (params.splint === 0 && tested && splintState !== 'test') tested = false;

    let flameK = 0;
    let flashK = 0;
    let tapOpen = 0;
    if (splintState === 'test') {
      testT += dt;
      tapOpen = testT < 1.6 ? 1 : 0;
      if (flared) {
        // Кислород из крана — лучинка вспыхивает и горит ярким пламенем
        flashK = Math.max(0, 1 - Math.abs(testT - 0.35) / 0.45);
        flameK = testT < 3.6 ? 1 : 0;
      }
      if (testT > (flared ? 4 : 1.4)) {
        splintState = flared ? 'done' : 'rest';
        testT = 0;
        Object.assign(splintPos, SPLINT_REST);
      }
    } else if (splintState === 'done') {
      // Погасшую лучинку через несколько секунд заменяем новой тлеющей — пробу можно повторить
      testT += dt;
      if (testT > 4) splintState = 'rest';
    }
    tapHandle.setAttribute('transform', `rotate(${tapOpen * 90} ${TEE.branchX} ${TEE.tapY})`);
    puff.setAttribute('opacity', (tapOpen && flared ? 0.5 * Math.max(0, 1 - testT / 1.2) : 0).toFixed(2));

    // В руке лучинка поворачивается кончиком к крану; в стаканчике стоит кончиком вверх
    const want = splintState === 'drag' || splintState === 'test' ? SPLINT_HELD : SPLINT_REST.angle;
    splintPos.angle += (want - splintPos.angle) * Math.min(1, dt * 9);
    const a = (splintPos.angle * Math.PI) / 180;
    shaft[0].setAttribute('x2', (Math.cos(a) * SPLINT_LEN).toFixed(1));
    shaft[0].setAttribute('y2', (Math.sin(a) * SPLINT_LEN).toFixed(1));
    shaft[1].setAttribute('x2', (Math.cos(a) * 12).toFixed(1));
    shaft[1].setAttribute('y2', (Math.sin(a) * 12).toFixed(1));
    splint.setAttribute('transform', `translate(${splintPos.x.toFixed(1)} ${splintPos.y.toFixed(1)})`);
    const flicker = 0.85 + 0.15 * Math.sin(now * 23) * Math.sin(now * 7);
    flame.setAttribute('opacity', (flameK * flicker).toFixed(2));
    flame.setAttribute('transform', `scale(${(1 + flashK * 0.8).toFixed(2)} ${((1 + flashK * 1.2) * flicker).toFixed(2)})`);
    flash.setAttribute('opacity', flashK.toFixed(2));
    flash.setAttribute('r', (20 + flashK * 55).toFixed(1));
    const glowing = splintState !== 'done';
    ember.setAttribute('fill', glowing ? (Math.sin(now * 5) > 0 ? '#f97316' : '#ea580c') : '#3f2a1c');
    ember.setAttribute('opacity', flameK ? 0 : 1);
    smoke.forEach((c, i) => {
      const k = (now * 0.5 + i / smoke.length) % 1;
      c.setAttribute('cx', (splintPos.x + Math.sin(now * 2 + i) * 4 + k * 6).toFixed(1));
      c.setAttribute('cy', (splintPos.y - 8 - k * 46).toFixed(1));
      c.setAttribute('opacity', (glowing && !flameK ? 0.28 * (1 - k) : 0).toFixed(2));
    });
    splint.style.pointerEvents = splintState === 'rest' || splintState === 'drag' ? '' : 'none';
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  // Взятый шпатель поднимаем наверх до того, как draggable() захватит указатель (обработчик зарегистрирован раньше)
  const held = new Set();
  spatula.addEventListener('pointerdown', () => {
    if (spat !== 'rest') return;
    held.add(spatula);
    place(spatula, topLayer);
  });
  const release = () => held.delete(spatula);
  spatula.addEventListener('pointerup', release);
  spatula.addEventListener('pointercancel', release);

  draggable(scene, spatula, {
    onDrag(x, y) {
      if (spat !== 'rest' && spat !== 'drag') return;
      if (spat === 'rest') {
        grab.dx = spatPos.x - x;
        grab.dy = spatPos.y - y;
        spat = 'drag';
      }
      spatPos.x = Math.max(20, Math.min(940, x + grab.dx));
      spatPos.y = Math.max(170, Math.min(BENCH - 4, y + grab.dy));
      spatPos.angle = 0;
    },
    onEnd() {
      // Простое нажатие на шпатель (без переноса) тоже вносит порошок — на телефоне так удобнее
      if (spat === 'rest') {
        spat = 'fly';
        return;
      }
      if (spat !== 'drag') return;
      // Ложечку поднесли к горлышку колбы — порошок ссыпается в пероксид
      if (Math.abs(spatPos.x - FX) < 60 && spatPos.y > NECK.top - 90 && spatPos.y < NECK.shoulder + 40) spat = 'fly';
      else spat = 'back';
    },
  });

  draggable(scene, splint, {
    onDrag(x, y) {
      if (splintState !== 'rest' && splintState !== 'drag') return;
      splintState = 'drag';
      splintPos.x = Math.max(20, Math.min(940, x));
      splintPos.y = Math.max(60, Math.min(BENCH - 4, y));
    },
    onEnd() {
      if (splintState === 'rest') {
        // Нажатие без переноса: лучинку подносят к крану сами
        startTest();
        return;
      }
      if (splintState !== 'drag') return;
      if (Math.hypot(splintPos.x - OUTLET.x, splintPos.y - OUTLET.y) < 50) startTest();
      else {
        splintState = 'rest';
        Object.assign(splintPos, SPLINT_REST);
      }
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
