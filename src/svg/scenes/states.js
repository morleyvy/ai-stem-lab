// Сцена «Плавление и кипение воды»: химическая лаборатория. На электроплитке — стакан со льдом,
// в него опущен щуп датчика температуры (в лапке штатива); щуп кабелем соединён с регистратором
// данных, который рисует график температуры от времени нагрева. Отдельного термометра нет:
// число температуры показывает панель показаний, а сцена — только график, ради которого опыт.
// Плитку включают тумблером на корпусе, мощность меняют поворотом ручки. Справа на охлаждающем
// элементе лежит холодное стекло: его подносят к стакану, и над кипящей водой пар конденсируется в капли.
// Время на табло догоняет регулятор постепенно, поэтому площадки плавления и кипения
// «проживаются» на глазах: график идёт ровно, а лёд тает или вода выкипает.

import { beaker, bubblePool, createScene, draggable, floorShadow, hotplate, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 455;
const PLATE = { x: 255, y: 405, w: 250 };
const CUP = { x: 255, bottom: PLATE.y - 8, w: 160, h: 175 }; // стакан 250 мл: деление 50 мл — пятая часть высоты
const CUP_ML = 250;
const CUP_TOP = CUP.bottom - CUP.h;
const PROBE = { x: 222, top: 150, tip: 388 };
const STAND_X = 92;
const TOGGLE = { x: PLATE.x + 22, y: PLATE.y + 13 };
const KNOB = { x: PLATE.x + PLATE.w / 2 - 30, y: PLATE.y + 26 }; // ручка готовой плитки из набора
// Холодное стекло: на охлаждающем элементе справа от плитки и над стаканом в держателе
const PACK = { x: 462, w: 118 };
const GLASS_HOME = { x: PACK.x, y: BENCH - 17 };
const GLASS_HOLD = { x: 296, y: 200 };
const PANE = { w: 92, h: 7 };
// Регистратор данных: экран с графиком t(время)
const LOG = { x1: 548, x2: 928, y1: 60, y2: 375 };
const GR = { x0: 616, x1: 892, top: 160, bottom: 330, tMax: 15, Tmin: -20, Tmax: 110 };
const gx = (t) => GR.x0 + (t / GR.tMax) * (GR.x1 - GR.x0);
const gy = (T) => GR.bottom - ((T - GR.Tmin) / (GR.Tmax - GR.Tmin)) * (GR.bottom - GR.top);
const CUBE = 26; // px — кубик льда 25 г
const ICE_PER_CUBE = 25;
const MIN_PER_S = 4; // скорость «прокрутки» времени на табло — 4 мин опыта за секунду

// Кубики на дне пустого стакана: нижний ряд из пяти, сверху — второй ряд
const STACK = [[-62, 0], [-31, 0], [0, 0], [31, 0], [62, 0], [-46, 1], [-15, 1], [16, 1]];
// Плавающие кубики: правее щупа, двумя рядами со сдвигом
const FLOAT = [[10, 0], [42, 0], [-22, 0], [56, 1], [26, 1], [-6, 1], [-38, 1], [70, 0]];

export function statesScene(container, params, set, { stateAt, glassLevel }) {
  let vessel, hp, knob, plateScreen, rocker, lamp, lampGlow, knobPointer, submerged, bubbles;
  let pane, paneHome, topLayer, fog, packLabel, curve, ghost, dot, legendNow, legendOld;
  const cubes = [];
  const dropsOn = [];
  const falling = [];
  const steam = [];
  let shownTime = params.time;
  let acc = 0;
  let steamAcc = 0;
  let fogK = 0; // насколько запотело стекло: 0 — сухое, 1 — покрыто каплями
  let held = false; // стекло держат указателем — кадр не должен переносить его между слоями
  let moved = false;
  // Предыдущий опыт (другая масса или мощность) остаётся на графике пунктиром — для сравнения площадок
  let curKey = `${params.m}|${params.P}|${params.heater}`;
  let oldParams = null;
  let drawnKey = '';

  // Стекло: home — лежит на охлаждающем элементе, drag — в руке, fly — летит к стакану или обратно, held — над стаканом
  let gs = params.glass ? 'held' : 'home';
  const gpos = params.glass ? { ...GLASS_HOLD } : { ...GLASS_HOME };
  let gTarget = gpos;
  const grab = { dx: 0, dy: 0 };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'lab' });
      const uid = Math.random().toString(36).slice(2);
      const defs = svg.querySelector('defs');
      defs.append(s('filter', { id: `st-blur-${uid}`, x: '-60%', y: '-60%', width: '220%', height: '220%' }, [s('feGaussianBlur', { stdDeviation: 4 })]));

      // ── Штатив: чугунное основание, стойка и лапка, которая держит щуп ──
      svg.append(
        floorShadow(STAND_X + 10, BENCH + 3, 60, d),
        s('rect', { x: STAND_X - 46, y: BENCH - 12, width: 112, height: 12, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: STAND_X - 5, y: 52, width: 10, height: BENCH - 60, rx: 3, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
        s('rect', { x: STAND_X - 9, y: 100, width: 18, height: 22, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: STAND_X, y: 106, width: PROBE.x - STAND_X + 6, height: 9, fill: d.lin([[0, '#cbd5e1'], [1, '#64748b']], 'v') }),
      );

      // ── Электроплитка с тумблером, лампой и ручкой мощности ──
      hp = hotplate(d, PLATE);
      // Табло готовой плитки показывает мощность, а не температуру: температуру меряет термометр
      plateScreen = hp.g.querySelector('text');
      svg.append(hp.g);
      rocker = s('rect', { x: TOGGLE.x - 11, y: TOGGLE.y + 2, width: 22, height: 9, rx: 2, fill: d.lin([[0, '#e5e7eb'], [1, '#9ca3af']], 'v') });
      lampGlow = s('circle', { cx: TOGGLE.x + 30, cy: TOGGLE.y + 12, r: 13, fill: d.rad([[0, '#fecaca', 0.9], [1, '#ef4444', 0]], 0.5, 0.5), opacity: 0 });
      lamp = s('circle', { cx: TOGGLE.x + 30, cy: TOGGLE.y + 12, r: 4.5, fill: '#4c0519', stroke: '#1e293b', 'stroke-width': 1 });
      const toggle = s('g', {}, [
        s('rect', { x: TOGGLE.x - 15, y: TOGGLE.y, width: 30, height: 24, rx: 4, fill: '#0f172a', stroke: '#475569', 'stroke-width': 1 }),
        rocker,
        s('rect', { x: TOGGLE.x - 17, y: TOGGLE.y - 6, width: 34, height: 36, fill: 'transparent' }), // увеличенная зона нажатия
      ]);
      toggle.style.cursor = 'pointer';
      touchTarget(toggle);
      toggle.addEventListener('pointerdown', () => set('heater', params.heater ? 0 : 1));
      knobPointer = s('rect', { x: KNOB.x - 1.5, y: KNOB.y - 12, width: 3, height: 8, rx: 1.5, fill: '#fff7ed' });
      knob = s('g', {}, [
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 18, fill: '#000', 'fill-opacity': 0 }),
        s('circle', { cx: KNOB.x, cy: KNOB.y, r: 13, fill: d.rad(['#fdba74', '#c2410c']), stroke: '#7c2d12', 'stroke-width': 1 }),
        knobPointer,
      ]);
      svg.append(toggle, lampGlow, lamp, knob);

      // ── Стакан со льдом ──
      vessel = beaker(d, CUP);
      // Цифры мерных делений стакана в этом опыте не нужны и спорили бы со шкалой графика
      vessel.g.querySelectorAll('text').forEach((e) => e.remove());
      svg.append(vessel.g);
      vessel.setColor('#bfe3f5');
      bubbles = bubblePool(vessel.content, 90);
      const iceFill = d.lin([[0, '#ffffff', 0.97], [0.5, '#e0f2fe', 0.95], [1, '#a5d8f3', 0.95]], 'v');
      const n = STACK.length;
      for (let i = 0; i < n; i++) {
        const g = s('g', { opacity: 0 }, [
          s('rect', { x: -CUBE / 2, y: -CUBE / 2, width: CUBE, height: CUBE, rx: 5, fill: iceFill, stroke: '#3b9ed8', 'stroke-width': 1.6 }),
          s('path', { d: `M${-CUBE / 2 + 5} ${-CUBE / 2 + 6} L${-2} ${-CUBE / 2 + 6}`, stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
          s('path', { d: `M${CUBE / 2 - 7} ${-4} L${CUBE / 2 - 7} ${CUBE / 2 - 7}`, stroke: '#7dd3fc', 'stroke-opacity': 0.6, 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
        ]);
        vessel.content.append(g);
        cubes.push({ g, x: CUP.x + STACK[i][0], y: CUP.bottom - CUBE / 2 - 3, a: (i * 37) % 13 - 6 });
      }

      // ── Щуп датчика, опущенный в стакан ──
      svg.append(
        // кабель щупа уходит вверх и к регистратору
        s('path', { d: `M${PROBE.x} ${PROBE.top - 30} C ${PROBE.x} 26, ${LOG.x1 - 60} 30, ${LOG.x1} 150`, stroke: '#1e293b', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }),
        s('rect', { x: PROBE.x - 2.5, y: PROBE.top, width: 5, height: PROBE.tip - PROBE.top, rx: 2.5, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
        s('rect', { x: PROBE.x - 6, y: PROBE.top - 34, width: 12, height: 40, rx: 4, fill: d.lin([[0, '#334155'], [0.5, '#64748b'], [1, '#1e293b']]) }),
        // лапка штатива с винтом охватывает рукоятку щупа
        s('rect', { x: PROBE.x - 12, y: 102, width: 24, height: 17, rx: 4, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']], 'v') }),
      );
      // Погружённая часть щупа видна сквозь воду — тонируем её, высота зависит от уровня воды
      submerged = s('rect', { x: PROBE.x - 6, width: 12, rx: 4, fill: '#9fd3ea', 'fill-opacity': 0.3 });
      svg.append(submerged);

      // Пар над стаканом — заранее созданные размытые клубы
      const steamGroup = s('g', { filter: `url(#st-blur-${uid})`, 'pointer-events': 'none' });
      for (let i = 0; i < 18; i++) {
        const e = s('ellipse', { rx: 11, ry: 13, fill: '#cbd5e1', stroke: '#94a3b8', 'stroke-width': 2, 'stroke-opacity': 0.5, opacity: 0 });
        steamGroup.append(e);
        steam.push({ e, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, alive: false });
      }
      svg.append(steamGroup);

      // ── Охлаждающий элемент с холодным стеклом ──
      svg.append(
        floorShadow(PACK.x, BENCH + 2, PACK.w * 0.6, d),
        s('rect', { x: PACK.x - PACK.w / 2, y: BENCH - 14, width: PACK.w, height: 14, rx: 6, fill: d.lin([[0, '#7dd3fc'], [1, '#0284c7']], 'v'), stroke: '#0369a1', 'stroke-width': 1 }),
        s('rect', { x: PACK.x - PACK.w / 2 + 6, y: BENCH - 12, width: PACK.w - 12, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.55 }),
      );
      packLabel = s('g', {}, [
        s('rect', { x: PACK.x - 66, y: BENCH - 66, width: 132, height: 24, rx: 6, fill: '#ffffff', stroke: '#bae6fd', 'stroke-width': 1.2 }),
        text(PACK.x, BENCH - 53.5, tr('Холодное стекло'), { size: 13, weight: 700, fill: '#0369a1' }),
      ]);
      svg.append(packLabel);

      // Стекло: центр пластинки в (0, 0), справа — деревянный держатель
      fog = s('rect', { x: -PANE.w / 2 + 2, y: PANE.h / 2 - 1, width: PANE.w - 4, height: 4, rx: 2, fill: '#e0f2fe', opacity: 0 });
      const dropsG = s('g');
      for (let i = 0; i < 12; i++) {
        const e = s('ellipse', { cx: -PANE.w / 2 + 8 + i * 7.3, cy: PANE.h / 2 + 3 + (i % 3), rx: 2.4, ry: 3 + (i % 2), fill: '#e0f2fe', stroke: '#7dd3fc', 'stroke-width': 0.8, opacity: 0 });
        dropsG.append(e);
        dropsOn.push(e);
      }
      pane = s('g', {}, [
        s('rect', { x: -PANE.w / 2 - 8, y: -18, width: PANE.w + 70, height: 36, fill: '#000', 'fill-opacity': 0 }), // зона захвата
        s('rect', { x: -PANE.w / 2, y: -PANE.h / 2, width: PANE.w, height: PANE.h, rx: 2, fill: d.lin([[0, '#f0f9ff', 0.9], [0.5, '#bae6fd', 0.55], [1, '#e0f2fe', 0.85]], 'v'), stroke: '#7dd3fc', 'stroke-width': 1.2 }),
        s('rect', { x: -PANE.w / 2 + 4, y: -PANE.h / 2 + 1.2, width: PANE.w - 30, height: 1.6, rx: 0.8, fill: '#ffffff', 'fill-opacity': 0.9 }),
        fog,
        dropsG,
        s('rect', { x: PANE.w / 2 - 12, y: -8, width: 18, height: 16, rx: 3, fill: d.lin([[0, '#d6a86a'], [1, '#8a5a2b']], 'v') }),
        s('rect', { x: PANE.w / 2 + 6, y: -4, width: 56, height: 8, rx: 4, fill: d.lin([[0, '#e2b77a'], [1, '#9a6a35']], 'v') }),
      ]);
      paneHome = s('g', {}, [pane]);
      svg.append(paneHome);

      // Падающие с холодного стекла капли
      for (let i = 0; i < 4; i++) {
        const e = s('ellipse', { rx: 2.2, ry: 3, fill: '#e0f2fe', stroke: '#7dd3fc', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
        svg.append(e);
        falling.push({ e, x: 0, y: 0, v: 0, live: false });
      }

      // ── Регистратор данных с графиком ──
      buildLogger(svg, d);
      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt, now) {
      // Сменились масса, мощность или нагреватель — прежний опыт остаётся на графике пунктиром
      const key = `${params.m}|${params.P}|${params.heater}`;
      if (key !== curKey) {
        // Пунктиром запоминаем только опыт, который успел пойти: при повороте ручки на старте
        // промежуточные мощности не должны вытеснять с графика настоящий прошлый опыт
        if (params.heater && curKey.endsWith('|1') && shownTime > 0.2) {
          const [m, P] = curKey.split('|').map(Number);
          oldParams = { m, P, heater: 1, time: shownTime };
        }
        curKey = key;
        drawnKey = '';
      }
      const dir = Math.sign(params.time - shownTime);
      shownTime = dir > 0 ? Math.min(params.time, shownTime + dt * MIN_PER_S) : Math.max(params.time, shownTime - dt * MIN_PER_S * 2);
      const st = stateAt(params, shownTime);
      const on = Boolean(params.heater);

      // Плитка
      plateScreen.textContent = `${params.P} Вт`;
      plateScreen.setAttribute('fill', on ? '#fb923c' : '#475569');
      hp.setHeat(on ? 0.25 + (params.P / 500) * 0.75 : 0);
      rocker.setAttribute('y', TOGGLE.y + (on ? 2 : 13));
      lamp.setAttribute('fill', on ? '#f87171' : '#4c0519');
      lampGlow.setAttribute('opacity', on ? 0.9 : 0);
      knobPointer.setAttribute('transform', `rotate(${-135 + ((params.P - 100) / 400) * 270} ${KNOB.x} ${KNOB.y})`);

      // Вода: плавающий лёд вытесняет воду своей массой, поэтому уровень — по сумме масс льда и воды
      const liquid = st.water > 0.05;
      vessel.setLevel(liquid ? (st.water + st.ice) / CUP_ML + (st.phase === 3 ? 0.004 * Math.sin(now * 15) : 0) : 0);
      const surf = vessel.surfaceY;
      submerged.setAttribute('y', liquid ? surf : CUP.bottom);
      submerged.setAttribute('height', liquid ? Math.max(0, PROBE.tip + 4 - surf) : 0);

      // Лёд: кубики по 25 г, тают все одинаково; в пустом стакане лежат на дне, в воде — плавают
      const count = Math.round(params.m / ICE_PER_CUBE);
      const k = params.m > 0 ? Math.cbrt(Math.max(0, st.ice) / params.m) : 0;
      cubes.forEach((c, i) => {
        const visible = i < count && st.ice > 0.05;
        c.g.setAttribute('opacity', visible ? 1 : 0);
        if (!visible) return;
        const size = CUBE * Math.max(0.25, k);
        let tx;
        let ty;
        if (liquid) {
          tx = CUP.x + FLOAT[i][0];
          ty = surf - size * 0.05 + FLOAT[i][1] * size * 0.45 + Math.sin(now * 1.3 + i) * 1.2;
        } else {
          tx = CUP.x + STACK[i][0];
          ty = CUP.bottom - 3 - size / 2 - STACK[i][1] * (size - 3);
        }
        c.x += (tx - c.x) * Math.min(1, dt * 4);
        c.y += (ty - c.y) * Math.min(1, dt * 4);
        c.g.setAttribute('transform', `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${c.a}) scale(${(size / CUBE).toFixed(3)})`);
      });

      // Пузыри: при кипении — бурно по всему дну, перед кипением — редкие мелкие у дна
      const boiling = st.phase === 3;
      const rate = boiling ? 25 + params.P * 0.12 : st.phase === 2 && st.T > 75 ? (st.T - 75) * 0.5 : 0;
      acc += dt * rate;
      while (acc >= 1) {
        acc -= 1;
        bubbles.spawn(CUP.x - 58 + Math.random() * 130, CUP.bottom - 6, boiling ? 2.5 + Math.random() * 4 : 1.5 + Math.random() * 1.5);
      }
      // Пузыри до кипения схлопываются, не дойдя до поверхности — вода сверху ещё холоднее
      bubbles.update(dt, liquid ? (boiling ? surf + 2 : surf + 40) : CUP.bottom + 10, boiling ? 0.5 : 0.2);

      // Пар: над кипящей водой клубами, над горячей — едва заметно
      const steamK = boiling ? 1 : st.phase === 2 ? Math.max(0, (st.T - 60) / 40) * 0.35 : 0;
      updateSteam(dt, steamK, surf);

      updateGlass(dt, glassLevel({ ...params, time: shownTime }));
      drawGraph(st);
    },
  });

  function buildLogger(svg, d) {
    const { x1, x2, y1, y2 } = LOG;
    const sx = x1 + 14;
    const sy = y1 + 14;
    const sw = x2 - x1 - 28;
    const sh = y2 - y1 - 40;
    svg.append(
      floorShadow((x1 + x2) / 2, BENCH + 3, 90, d),
      s('rect', { x: (x1 + x2) / 2 - 18, y: y2 - 4, width: 36, height: BENCH - y2 - 6, fill: d.lin(['#334155', '#64748b', '#1e293b']) }),
      s('rect', { x: (x1 + x2) / 2 - 70, y: BENCH - 12, width: 140, height: 12, rx: 5, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 16, fill: d.lin([[0, '#465467'], [0.5, '#2b3544'], [1, '#1a212c']], 'v'), stroke: '#0b1017', 'stroke-width': 1, filter: d.url('soft') }),
      s('rect', { x: x1 + 2, y: y1 + 2, width: x2 - x1 - 4, height: 18, rx: 14, fill: d.lin([[0, '#ffffff', 0.14], [1, '#ffffff', 0]], 'v') }),
      s('rect', { x: sx - 1, y: sy - 1, width: sw + 2, height: sh + 2, rx: 8, fill: d.lin([[0, '#05080d'], [1, '#56657a']], 'v') }),
      s('rect', { x: sx, y: sy, width: sw, height: sh, rx: 7, fill: d.lin([[0, '#0a0f18'], [1, '#111a27']], 'v') }),
      text((x1 + x2) / 2, y2 - 13, tr('Датчик температуры'), { size: 13, weight: 600, fill: '#c5cfdb' }),
      s('circle', { cx: x2 - 22, cy: y2 - 13, r: 4.5, fill: '#34d399', 'fill-opacity': 0.2 }),
      s('circle', { cx: x2 - 22, cy: y2 - 13, r: 2.2, fill: '#34d399' }),
    );
    // Сетка, оси и отметки
    const grid = s('g', { stroke: '#1f2a3a', 'stroke-width': 1 });
    for (let t = 0; t <= GR.tMax; t += 2.5) grid.append(s('line', { x1: gx(t), x2: gx(t), y1: GR.top, y2: GR.bottom }));
    for (let T = -20; T <= 110; T += 10) grid.append(s('line', { x1: GR.x0, x2: GR.x1, y1: gy(T), y2: gy(T) }));
    svg.append(grid);
    svg.append(
      s('path', { d: `M${GR.x0} ${GR.top - 6} V${GR.bottom} H${GR.x1 + 6}`, stroke: '#64748b', 'stroke-width': 1.5, fill: 'none' }),
      s('line', { x1: GR.x0, x2: GR.x1, y1: gy(0), y2: gy(0), stroke: '#38bdf8', 'stroke-width': 1.4, 'stroke-dasharray': '6 5', 'stroke-opacity': 0.8 }),
      s('line', { x1: GR.x0, x2: GR.x1, y1: gy(100), y2: gy(100), stroke: '#fb923c', 'stroke-width': 1.4, 'stroke-dasharray': '6 5', 'stroke-opacity': 0.8 }),
      text(GR.x1, gy(0) - 10, tr('плавление'), { size: 13, weight: 600, fill: '#7dd3fc', anchor: 'end' }),
      text(GR.x1, gy(100) + 12, tr('кипение'), { size: 13, weight: 600, fill: '#fdba74', anchor: 'end' }),
      ...[100, 50, 0].map((T) => text(GR.x0 - 8, gy(T), String(T), { size: 13, weight: 600, fill: '#94a3b8', anchor: 'end' })),
      text(GR.x0 - 8, GR.top - 14, '°C', { size: 13, weight: 700, fill: '#94a3b8', anchor: 'end' }),
      ...[0, 5, 10].map((t) => text(gx(t), GR.bottom + 13, String(t), { size: 13, weight: 600, fill: '#94a3b8' })),
      text(GR.x1 + 4, GR.bottom + 13, '15 мин', { size: 13, weight: 600, fill: '#94a3b8', anchor: 'end' }),
    );
    // Пунктир прошлого опыта толще опорных линий 0 и 100 °C: его площадки лежат прямо на них и должны быть видны
    ghost = s('path', { fill: 'none', stroke: '#e2e8f0', 'stroke-width': 3.5, 'stroke-dasharray': '7 5', 'stroke-opacity': 0.85 });
    curve = s('path', { fill: 'none', stroke: '#fb7185', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    dot = s('circle', { r: 5, fill: '#fecdd3', stroke: '#fb7185', 'stroke-width': 2 });
    svg.append(ghost, curve, dot);
    // Температура и время — только в панели показаний; на экране подписаны кривые,
    // и только когда есть прошлый опыт для сравнения
    legendNow = text(sx + 14, sy + 24, '', { size: 14, weight: 700, fill: '#fda4af', anchor: 'start' });
    legendOld = text(sx + sw - 14, sy + 24, '', { size: 14, weight: 700, fill: '#cbd5e1', anchor: 'end' });
    svg.append(legendNow, legendOld);
  }

  // Кривая t(время) от 0 до t — по той же модели, что и показания приборов
  function path(p, tEnd) {
    const pts = [];
    const n = Math.max(1, Math.ceil(tEnd / 0.05));
    for (let i = 0; i <= n; i++) {
      const t = (tEnd * i) / n;
      const s1 = stateAt(p, t);
      if (s1.phase === 4) break;
      pts.push(`${gx(t).toFixed(1)} ${gy(s1.T).toFixed(1)}`);
    }
    return pts.length > 1 ? `M${pts.join(' L')}` : '';
  }

  function drawGraph(st) {
    const key = `${curKey}|${shownTime.toFixed(3)}`;
    if (key !== drawnKey) {
      drawnKey = key;
      curve.setAttribute('d', params.heater ? path(params, shownTime) : '');
      ghost.setAttribute('d', oldParams ? path(oldParams, oldParams.time) : '');
    }
    const T = st.phase === 4 ? null : st.T;
    const tDry = st.phase === 4 ? st.boilEnd : shownTime;
    dot.setAttribute('cx', gx(Math.min(shownTime, tDry)));
    dot.setAttribute('cy', gy(T ?? 100));
    dot.setAttribute('opacity', params.heater ? 1 : 0);
    legendNow.textContent = oldParams ? `${tr('сейчас')}: ${params.P} Вт, ${params.m} г` : '';
    legendOld.textContent = oldParams ? `${tr('пунктир')}: ${oldParams.P} Вт, ${oldParams.m} г` : '';
  }

  function updateSteam(dt, k, surf) {
    steamAcc += dt * k * 9;
    while (steamAcc >= 1) {
      steamAcc -= 1;
      const p = steam.find((q) => !q.alive);
      if (!p) break;
      Object.assign(p, { x: CUP.x - 10 + Math.random() * 70, y: Math.min(surf, CUP_TOP + 20), vx: (Math.random() - 0.5) * 14, vy: -(36 + Math.random() * 26), age: 0, life: 1.6 + Math.random() * 0.8, alive: true });
    }
    const capY = gs === 'held' ? gpos.y + PANE.h / 2 + 10 : -100;
    for (const p of steam) {
      if (!p.alive) {
        p.e.setAttribute('opacity', 0);
        continue;
      }
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Над стаканом стекло: пар упирается в него и растекается в стороны
      if (gs === 'held' && p.y < capY && Math.abs(p.x - gpos.x) < PANE.w / 2 + 6) {
        p.y = capY;
        p.vx += Math.sign(p.x - gpos.x || 1) * 40 * dt;
        p.age += dt * 1.5;
      }
      if (p.age >= p.life) {
        p.alive = false;
        p.e.setAttribute('opacity', 0);
        continue;
      }
      const a = p.age / p.life;
      p.e.setAttribute('cx', p.x.toFixed(1));
      p.e.setAttribute('cy', p.y.toFixed(1));
      p.e.setAttribute('rx', (9 + a * 16).toFixed(1));
      p.e.setAttribute('ry', (11 + a * 14).toFixed(1));
      p.e.setAttribute('opacity', (Math.sin(a * Math.PI) * 0.5).toFixed(3));
    }
  }

  // ── Холодное стекло ──
  function updateGlass(dt, level) {
    if (params.glass === 1 && gs === 'home') flyTo(GLASS_HOLD);
    if (params.glass === 0 && gs === 'held') flyTo(GLASS_HOME);
    if (gs === 'fly') {
      const kk = Math.min(1, dt * 6);
      gpos.x += (gTarget.x - gpos.x) * kk;
      gpos.y += (gTarget.y - gpos.y) * kk;
      if (Math.hypot(gpos.x - gTarget.x, gpos.y - gTarget.y) < 1) {
        Object.assign(gpos, gTarget);
        gs = gTarget === GLASS_HOLD ? 'held' : 'home';
      }
    }
    // Капли нарастают постепенно и сохнут, когда стекло убрали
    const want = gs === 'held' ? Math.max(0, level) : 0;
    fogK += (want / 2 - fogK) * Math.min(1, dt * (want ? 0.8 : 2));
    fog.setAttribute('opacity', (Math.min(1, fogK * 2) * 0.7).toFixed(3));
    dropsOn.forEach((e, i) => e.setAttribute('opacity', fogK > 0.55 + (i % 4) * 0.1 ? 1 : 0));
    if (gs === 'held' && fogK > 0.85 && Math.random() < dt * 1.6) {
      const f = falling.find((q) => !q.live);
      if (f) Object.assign(f, { x: gpos.x - PANE.w / 2 + 10 + Math.random() * (PANE.w - 20), y: gpos.y + PANE.h / 2 + 5, v: 0, live: true });
    }
    for (const f of falling) {
      if (!f.live) {
        f.e.setAttribute('opacity', 0);
        continue;
      }
      f.v += 700 * dt;
      f.y += f.v * dt;
      if (f.y > vessel.surfaceY - 2) f.live = false;
      f.e.setAttribute('cx', f.x.toFixed(1));
      f.e.setAttribute('cy', f.y.toFixed(1));
      f.e.setAttribute('opacity', f.live ? 1 : 0);
    }
    packLabel.setAttribute('opacity', gs === 'home' ? 1 : 0);
    if (!held) place(pane, gs === 'home' ? paneHome : topLayer);
    pane.setAttribute('transform', `translate(${gpos.x.toFixed(1)} ${gpos.y.toFixed(1)})`);
  }
  function flyTo(target) {
    gTarget = target;
    gs = 'fly';
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  pane.addEventListener('pointerdown', () => {
    held = true;
    place(pane, topLayer);
  });
  const release = () => { held = false; };
  pane.addEventListener('pointerup', release);
  pane.addEventListener('pointercancel', release);

  // Ручку ведут мышью влево-вправо: от 100 до 500 Вт
  draggable(scene, knob, {
    onDrag: (x) => set('P', 100 + Math.max(0, Math.min(1, (x - (KNOB.x - 90)) / 180)) * 400),
  });

  draggable(scene, pane, {
    onDrag(x, y) {
      if (gs === 'fly') return;
      if (!moved) {
        grab.dx = gpos.x - x;
        grab.dy = gpos.y - y;
        moved = true;
      }
      gs = 'drag';
      gpos.x = Math.max(60, Math.min(900, x + grab.dx));
      gpos.y = Math.max(60, Math.min(BENCH - 17, y + grab.dy));
    },
    onEnd() {
      const wasHeld = params.glass === 1;
      if (!moved) {
        // Щелчок переносит стекло: с охлаждающего элемента — к стакану (на телефоне тянуть неудобно),
        // от стакана — обратно
        if (wasHeld && gs === 'held') set('glass', 0);
        else if (!wasHeld && gs === 'home') set('glass', 1);
        return;
      }
      moved = false;
      // Стекло поднесли к верху стакана — оно остаётся над ним в держателе
      const near = Math.abs(gpos.x - CUP.x) < 90 && gpos.y > CUP_TOP - 110 && gpos.y < CUP_TOP + 60;
      if (near) {
        flyTo(GLASS_HOLD);
        if (!wasHeld) set('glass', 1);
      } else {
        flyTo(GLASS_HOME);
        if (wasHeld) set('glass', 0);
      }
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
