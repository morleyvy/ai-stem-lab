// Сцена «Второй закон Ньютона»: на столе — дорожка, тележка с брусками по 100 г и датчиком силы,
// у края стола — блок, через который перекинута нить к подвесу с дисками по 10 г. Запасные бруски,
// диски и табло силы не рисуем: массы и силу ученик видит на ползунках и в панели показаний.
// Тележку держит электромагнитный стопор; щелчок по тележке отпускает её (released = 1),
// секундомер на стенде идёт, пока тележка не пройдёт 0,5 м до оптического датчика.
// Щелчок по остановившейся тележке возвращает её к стопору. Если ученик меняет массу тележки или груза
// во время опыта, тележку возвращают к стопору и отпускают снова — так каждое значение измерено заново.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, readout, room, s, shade, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 230;
const RAIL_TOP = BENCH - 12;
const WHEEL_R = 10;
const CART_LEN = 112;
const BACK0 = 362; // задний край тележки у стопора
const FRONT0 = BACK0 + CART_LEN;
const TRAVEL = 200; // px — путь 0,5 м до оптического датчика (масштаб 400 px на метр)
const GATE_X = FRONT0 + TRAVEL;
const THREAD_Y = 188; // высота крючка датчика силы: нить идёт горизонтально к верху блока
const PULLEY = { x: 852, y: THREAD_Y + 18, r: 18 };
const HANG_X = PULLEY.x + PULLEY.r;
const HOOK_Y0 = 242; // верх крючка подвеса у стопора: пройдя 0,5 м, груз как раз ложится на коврик
const TABLE_END = 838; // правый край стола: за ним груз свободно опускается к полу
const FLOOR_Y = 528;
const BARS = 8; // брусков по 100 г: тележка 0,2 кг + до 8 брусков = до 1 кг
const DISCS = 20; // дисков по 10 г на подвесе — до 200 г
const DISC_H = 3;
const BACK_SPEED = 520; // px/с — тележку возвращают к стопору рукой, быстро
const PAUSE = 0.4; // с — пауза у стопора перед повторным пуском, чтобы был виден старт

export function dynamics9Scene(container, params, set, { accel, runTime, PATH }) {
  const PX = TRAVEL / PATH;
  let cart, wheels, cartBars, hanger, discs, thread, pulleySpokes, hangShadow;
  let timer, magnetLed, gateLed, gateBeam;
  // Ход опыта: held — у стопора, run — едет, done — дошла до датчика, back — возвращается, pause — ждёт пуска
  let phase = params.released ? 'run' : 'held';
  let pos = 0;
  let tRun = 0;
  let wait = 0;
  let prevKey = `${params.M}|${params.mh}`;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Стол на ножках, а не глухая тумба: под столешницей видна стена и пол, а справа за торцом стола
      // груз свободно опускается к полу. Столешницу из room() справа обрезаем стеной.
      const APRON = BENCH + 62;
      const LEGS = [46, TABLE_END - 72];
      svg.append(
        s('rect', { x: TABLE_END, y: BENCH - 10, width: 960 - TABLE_END, height: 26, fill: d.lin([[0, '#e3e8ee'], [1, '#dde3ea']], 'v') }),
        s('rect', { x: 0, y: BENCH + 16, width: 960, height: FLOOR_Y - BENCH - 16, fill: d.lin([[0, '#d9dfe7'], [1, '#e6eaef']], 'v') }),
        s('rect', { x: 0, y: FLOOR_Y - 10, width: 960, height: 10, fill: d.lin([[0, '#c7b299'], [1, '#a88f72']], 'v') }),
        s('rect', { x: 0, y: FLOOR_Y, width: 960, height: 540 - FLOOR_Y, fill: d.lin([[0, '#9c8466'], [1, '#7d6649']], 'v') }),
        // царга под столешницей и тень под ней на стене
        s('rect', { x: 0, y: APRON, width: TABLE_END, height: 26, fill: d.lin([[0, '#0f172a', 0.18], [1, '#0f172a', 0]], 'v') }),
        s('rect', { x: 0, y: BENCH + 16, width: TABLE_END, height: APRON - BENCH - 16, fill: d.lin([[0, '#9c7b55'], [1, '#7d5f3f']], 'v') }),
        s('rect', { x: 0, y: BENCH + 16, width: TABLE_END, height: 6, fill: d.lin([[0, '#000000', 0.25], [1, '#000000', 0]], 'v') }),
        s('rect', { x: TABLE_END - 4, y: BENCH, width: 8, height: 16, rx: 3, fill: d.lin([[0, '#c4a47a'], [1, '#9c7b55']]) }),
        ...LEGS.flatMap((x) => [
          floorShadow(x + 11, FLOOR_Y, 26, d),
          s('rect', { x, y: APRON, width: 22, height: FLOOR_Y - APRON, fill: d.lin([[0, '#7d5f3f'], [0.4, '#a88660'], [1, '#5c4128']]) }),
        ]),
        // мягкий коврик, на который опускается груз
        floorShadow(HANG_X, FLOOR_Y - 2, 44, d),
        s('rect', { x: HANG_X - 38, y: FLOOR_Y - 8, width: 76, height: 8, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      );
      hangShadow = floorShadow(HANG_X, FLOOR_Y - 8, 20, d);
      svg.append(hangShadow);

      // Секундомер — единственный прибор на стенде: его отсчёт виден, пока тележка едет до датчика
      timer = readout(d, { x: 415, y: 40, w: 190, caption: tr('Секундомер, с'), color: '#fbbf24' });
      svg.append(
        // провода секундомера: к стопору (пуск) и к оптическому датчику (стоп)
        s('path', { d: `M470 110 C 470 140, 347 132, 347 168`, fill: 'none', stroke: '#1e293b', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        s('path', { d: `M550 110 C 550 128, ${GATE_X} 112, ${GATE_X} 138`, fill: 'none', stroke: '#1e293b', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        timer.g,
      );

      buildRail(svg, d);

      // Оптический датчик позади дорожки: луч пересекает дорожку, тележка проезжает перед стойкой
      gateLed = s('circle', { cx: GATE_X, cy: 150, r: 4, fill: '#ef4444' });
      gateBeam = s('circle', { cx: GATE_X, cy: 186, r: 5, fill: '#ef4444', 'fill-opacity': 0.85 });
      svg.append(
        s('rect', { x: GATE_X - 4, y: 138, width: 8, height: RAIL_TOP - 138, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
        s('rect', { x: GATE_X - 12, y: 138, width: 24, height: 22, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        gateLed,
        s('rect', { x: GATE_X - 8, y: 178, width: 16, height: 16, rx: 3, fill: '#1e293b' }),
        gateBeam,
      );

      // Блок на струбцине у края стола
      pulleySpokes = s('g', {}, [0, 60, 120].map((a) => s('line', { x1: -13, y1: 0, x2: 13, y2: 0, stroke: '#64748b', 'stroke-width': 2.5, transform: `rotate(${a})` })));
      svg.append(
        s('rect', { x: TABLE_END - 30, y: BENCH - 6, width: 26, height: 30, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: TABLE_END - 26, y: BENCH + 24, width: 18, height: 10, rx: 2, fill: '#334155' }),
        s('path', { d: `M${TABLE_END - 14} ${BENCH - 6} L${PULLEY.x - 4} ${PULLEY.y + 4} L${PULLEY.x + 4} ${PULLEY.y - 4} L${TABLE_END - 6} ${BENCH - 6} Z`, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
        s('circle', { cx: PULLEY.x, cy: PULLEY.y, r: PULLEY.r + 1, fill: d.rad([[0, '#e2e8f0'], [0.75, '#94a3b8'], [1, '#475569']], 0.4, 0.35), stroke: '#475569', 'stroke-width': 1.5 }),
        s('circle', { cx: PULLEY.x, cy: PULLEY.y, r: PULLEY.r - 5, fill: 'none', stroke: '#64748b', 'stroke-width': 1.2 }),
        s('g', { transform: `translate(${PULLEY.x} ${PULLEY.y})` }, [pulleySpokes]),
        s('circle', { cx: PULLEY.x, cy: PULLEY.y, r: 4, fill: '#1e293b' }),
      );

      thread = s('path', { fill: 'none', stroke: '#334155', 'stroke-width': 1.6 });
      svg.append(thread);

      hanger = buildHanger(d);
      cart = buildCart(d);
      svg.append(hanger, cart);
    },

    frame(dt) {
      const a = accel(params);
      const key = `${params.M}|${params.mh}`;
      // Новая масса во время опыта: тележку возвращают к стопору и отпускают снова
      if (key !== prevKey) {
        prevKey = key;
        if (params.released && phase !== 'held') phase = 'back';
      }

      if (!params.released) {
        phase = 'held';
        pos = Math.max(0, pos - BACK_SPEED * dt);
      } else if (phase === 'held') {
        if (pos > 0) {
          pos = Math.max(0, pos - BACK_SPEED * dt);
        } else {
          phase = 'run';
          tRun = 0;
        }
      } else if (phase === 'back') {
        pos = Math.max(0, pos - BACK_SPEED * dt);
        if (pos === 0) {
          phase = 'pause';
          wait = PAUSE;
        }
      } else if (phase === 'pause') {
        wait -= dt;
        if (wait <= 0) {
          phase = 'run';
          tRun = 0;
        }
      } else if (phase === 'run') {
        // Равноускоренное движение без начальной скорости: s = a·t²/2
        tRun += dt;
        pos = 0.5 * a * tRun * tRun * PX;
        if (pos >= TRAVEL) {
          pos = TRAVEL;
          phase = 'done';
        }
      }

      const moving = phase === 'run' || phase === 'done';
      timer.set(phase === 'done' ? fmt(runTime(params), 3) : phase === 'run' ? fmt(tRun, 3) : '0,000');
      magnetLed.setAttribute('fill', moving ? '#475569' : '#ef4444');
      const hit = phase === 'done';
      gateLed.setAttribute('fill', hit ? '#22c55e' : '#ef4444');
      gateBeam.setAttribute('fill', hit ? '#22c55e' : '#ef4444');

      cart.setAttribute('transform', `translate(${pos.toFixed(1)} 0)`);
      const roll = ((pos / WHEEL_R) * 180) / Math.PI;
      wheels.forEach((w) => w.setAttribute('transform', `rotate(${roll.toFixed(1)})`));
      pulleySpokes.setAttribute('transform', `rotate(${(((pos / PULLEY.r) * 180) / Math.PI).toFixed(1)})`);

      // Нить нерастяжима: на сколько тележка проехала вправо, на столько груз опустился
      const hookX = FRONT0 + 26 + pos;
      const hookY = HOOK_Y0 + pos;
      thread.setAttribute('d', `M${hookX.toFixed(1)} ${THREAD_Y} H${PULLEY.x} A ${PULLEY.r} ${PULLEY.r} 0 0 1 ${HANG_X} ${PULLEY.y} V${hookY.toFixed(1)}`);
      hanger.setAttribute('transform', `translate(0 ${pos.toFixed(1)})`);
      const gap = FLOOR_Y - 8 - (HOOK_Y0 + 78 + pos);
      hangShadow.setAttribute('rx', 16 + gap / 14);
      hangShadow.setAttribute('opacity', Math.max(0.15, 1 - gap / 260));

      // Бруски: на тележке столько, сколько добавлено к её 0,2 кг
      const k = Math.round((params.M - 0.2) / 0.1);
      cartBars.forEach((b, i) => b.setAttribute('opacity', i < k ? 1 : 0));
      const n = Math.round(params.mh / 10);
      discs.forEach((el, i) => el.setAttribute('opacity', i < n ? 1 : 0));
    },
  });

  // Брусок 100 г: стальной параллелепипед со скошенной гранью сверху
  function bar(d, x, y) {
    return s('g', {}, [
      s('rect', { x, y, width: 24, height: 12, rx: 2, fill: d.lin([[0, '#e2e8f0'], [0.5, '#94a3b8'], [1, '#64748b']], 'v'), stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: x + 2, y: y + 2, width: 20, height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.6 }),
    ]);
  }

  function disc(d, x, y, i) {
    return s('rect', { x: x - 17, y, width: 34, height: DISC_H, rx: 1.2, fill: i % 2 ? '#c2860f' : '#d99a1c', stroke: '#8a5a06', 'stroke-width': 0.6 });
  }

  // Дорожка: алюминиевый профиль на ножках, электромагнитный стопор в начале, буфер за датчиком,
  // мерная лента на торце стола: 0 — передний край тележки у стопора, 50 см — оптический датчик
  function buildRail(svg, d) {
    svg.append(
      floorShadow(580, BENCH + 2, 260, d, 6),
      s('rect', { x: 330, y: RAIL_TOP, width: TABLE_END - 344, height: 10, rx: 2, fill: d.lin([[0, '#f1f5f9'], [0.4, '#cbd5e1'], [1, '#64748b']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
      s('rect', { x: 330, y: RAIL_TOP + 3, width: TABLE_END - 344, height: 1.5, fill: '#94a3b8' }),
      s('rect', { x: 336, y: RAIL_TOP + 10, width: 14, height: 2, fill: '#334155' }),
      s('rect', { x: TABLE_END - 34, y: RAIL_TOP + 10, width: 14, height: 2, fill: '#334155' }),
    );
    // Электромагнит-стопор: катушка в корпусе, держит стальную пластину на задней стенке тележки
    magnetLed = s('circle', { cx: 347, cy: 168, r: 4, fill: '#ef4444' });
    const coil = [];
    for (let y = 182; y < 204; y += 4) coil.push(s('rect', { x: 340, y, width: 18, height: 2.4, fill: '#b45309' }));
    const magnet = s('g', {}, [
      s('rect', { x: 334, y: 172, width: 26, height: RAIL_TOP - 172, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      ...coil,
      magnetLed,
    ]);
    magnet.style.cursor = 'pointer';
    magnet.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(magnet);
    svg.append(magnet);
    // Буфер с резиновым наконечником: останавливает тележку сразу за датчиком
    const bx = GATE_X + 24;
    svg.append(
      s('rect', { x: bx, y: 198, width: 8, height: RAIL_TOP - 198, rx: 2, fill: '#334155' }),
      s('rect', { x: bx - 3, y: 194, width: 6, height: 14, rx: 3, fill: '#111827' }),
    );
    // Мерная лента
    const tape = s('g');
    tape.append(s('rect', { x: FRONT0 - 18, y: BENCH + 24, width: TRAVEL + 50, height: 34, rx: 3, fill: '#fef9c3', stroke: '#ca8a04', 'stroke-width': 1 }));
    for (let cm = 0; cm <= 50; cm++) {
      const x = FRONT0 + cm * (TRAVEL / 50);
      const major = cm % 10 === 0;
      const mid = cm % 5 === 0;
      tape.append(s('line', { x1: x, y1: BENCH + 24, x2: x, y2: BENCH + 24 + (major ? 12 : mid ? 8 : 5), stroke: '#334155', 'stroke-width': major ? 1.4 : 0.8 }));
      if (major) tape.append(text(x, BENCH + 47, String(cm), { size: 13, weight: 600, fill: '#334155' }));
    }
    tape.append(text(FRONT0 + TRAVEL + 20, BENCH + 47, tr('см'), { size: 13, weight: 600, fill: '#334155' }));
    svg.append(tape);
  }

  // Тележка: синий корпус на четырёх колёсах (видны два), бруски сверху, датчик силы с крючком спереди
  function buildCart(d) {
    wheels = [];
    const wheel = (cx) => {
      const spokes = s('g', {}, [
        s('line', { x1: -6, y1: 0, x2: 6, y2: 0, stroke: '#94a3b8', 'stroke-width': 2 }),
        s('line', { x1: 0, y1: -6, x2: 0, y2: 6, stroke: '#94a3b8', 'stroke-width': 2 }),
      ]);
      wheels.push(spokes);
      return s('g', { transform: `translate(${cx} ${RAIL_TOP - WHEEL_R})` }, [
        s('circle', { r: WHEEL_R, fill: d.rad([[0, '#475569'], [1, '#0f172a']], 0.4, 0.35) }),
        s('circle', { r: 6.5, fill: '#cbd5e1' }),
        spokes,
        s('circle', { r: 2, fill: '#334155' }),
      ]);
    };
    cartBars = [];
    for (let i = 0; i < BARS; i++) cartBars.push(bar(d, BACK0 + 7 + (i % 4) * 25, 158 - Math.floor(i / 4) * 12));
    const body = s('rect', { x: BACK0, y: 168, width: CART_LEN, height: 34, rx: 5, fill: d.lin([[0, shade('#2563eb', 0.25)], [0.5, '#2563eb'], [1, shade('#2563eb', -0.35)]], 'v'), stroke: '#1e3a8a', 'stroke-width': 1.2 });
    const g = s('g', {}, [
      floorShadow(BACK0 + CART_LEN / 2, RAIL_TOP + 1, 62, d, 4),
      // стальная пластина, которую держит электромагнит
      s('rect', { x: BACK0 - 3, y: 176, width: 4, height: 22, rx: 1, fill: '#94a3b8' }),
      ...cartBars.slice(4),
      ...cartBars.slice(0, 4),
      body,
      s('rect', { x: BACK0 + 4, y: 171, width: CART_LEN - 8, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.35 }),
      s('rect', { x: BACK0 + 10, y: 182, width: CART_LEN - 20, height: 12, rx: 3, fill: '#1e40af', 'fill-opacity': 0.45 }),
      wheel(BACK0 + 22),
      wheel(BACK0 + CART_LEN - 22),
      // датчик силы: корпус с экраном и крючок, к которому привязана нить
      s('rect', { x: FRONT0, y: 177, width: 22, height: 22, rx: 3, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: FRONT0 + 4, y: 181, width: 14, height: 7, rx: 1.5, fill: '#065f46' }),
      s('path', { d: `M${FRONT0 + 22} ${THREAD_Y} h4`, stroke: '#475569', 'stroke-width': 2 }),
      s('circle', { cx: FRONT0 + 27, cy: THREAD_Y, r: 2.5, fill: 'none', stroke: '#475569', 'stroke-width': 1.5 }),
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(g);
    return g;
  }

  // Подвес: крючок, стержень с опорной шайбой и диски по 10 г; массой самого подвеса пренебрегаем
  function buildHanger(d) {
    discs = [];
    const bottom = HOOK_Y0 + 78;
    const parts = [
      s('path', { d: `M${HANG_X} ${HOOK_Y0} c 5 0 6 7 0 9 V${bottom - 4}`, fill: 'none', stroke: '#475569', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
    ];
    for (let i = 0; i < DISCS; i++) {
      const el = disc(d, HANG_X, bottom - 4 - (i + 1) * DISC_H, i);
      discs.push(el);
      parts.push(el);
    }
    parts.push(s('rect', { x: HANG_X - 19, y: bottom - 4, width: 38, height: 4, rx: 1.5, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }));
    const g = s('g', {}, parts);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(g);
    return g;
  }

  // Щелчок по тележке (стопору, грузу): у стопора — отпустить; доехавшую — вернуть к стопору
  function toggle() {
    if (!params.released) set('released', 1);
    else if (phase === 'done') set('released', 0);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}

