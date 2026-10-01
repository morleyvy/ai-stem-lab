// Сцена «Работа и мощность»: штатив с электрической лебёдкой (двигатель и барабан), нить с датчиком силы
// и подвесом, на подвесе — диски по 0,5 кг. Груз стоит в ящике с песком, рядом — линейка с концевым
// выключателем: на этой высоте лебёдка останавливается. Кнопка «Пуск» (или щелчок по двигателю) поднимает
// груз (lift = 1), выключатель на линейке перетаскивают вверх-вниз. Красный рычаг у барабана (или щелчок
// по поднятому грузу) расцепляет барабан — груз падает в песок (drop = 1).
// На сцене один прибор — секундомер: время подъёма видно «вживую», а все расчётные числа (F, A, N, Eп, Eк)
// показывает панель показаний под сценой, чтобы не дублировать их на нескольких табло.
// Если ученик меняет массу, высоту или скорость во время опыта, груз опускают и поднимают заново —
// так каждое значение измерено с нуля.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, readout, room, s, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 452;
const SAND = 440; // уровень песка: отсюда отсчитывается высота подъёма (0 на линейке)
const PX = 240; // px на метр
const LOAD_X = 576; // ось нити и груза
const DRUM = { x1: 548, x2: 604, y: 64, r: 14 };
const DISC_H = 9;
const DISC_W = 64;
const DISCS = 6; // дисков по 0,5 кг: до 3 кг
const SENSOR_TOP = 104; // от низа груза до кольца датчика силы
const RULER_X = 648;
const LOWER_SPEED = 1; // м/с — опускает груз двигатель, быстро, чтобы не ждать
const PAUSE = 0.3; // с — пауза у стола перед повторным подъёмом
const HOLD = 0.5; // с — груз замирает наверху, прежде чем его отпустят
const BTN = { x: 250, y: 404, r: 26 }; // кнопка «Пуск/Стоп» на пульте лебёдки

export function workPowerScene(container, params, set, { liftTime, G }) {
  let load, discs, thread, windings, sandGrains, flag, flagLine, loadShadow;
  let timer, btnCap, btnLabel, motorLed;
  // Ход опыта: rest — на столе, lower — опускается (лебёдку выключили), reset — опускается перед новым
  // подъёмом, pause — ждёт пуска, up — поднимается, top — висит наверху, hold — вот-вот отпустят,
  // fall — падает, landed — лежит в песке после падения
  let phase = 'rest';
  let pos = 0; // м — высота низа груза над песком
  let tUp = 0;
  let tFall = 0;
  let wait = 0;
  let burst = 0;
  let dropTop = 0; // высота, с которой груз начал падать
  // Масса на подвесе: диски меняют только у песка, поэтому новая масса «доходит» до груза, когда его опустят
  let mNow = params.m;
  let prevKey = `${params.m}|${params.h}|${params.v}`;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Табличка с формулами на стенде
      svg.append(
        s('rect', { x: 740, y: 140, width: 190, height: 80, rx: 10, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 3 }),
        text(835, 166, 'A = F · s', { size: 24, weight: 700, fill: '#f8fafc' }),
        text(835, 197, 'N = A / t', { size: 24, weight: 700, fill: '#f8fafc' }),
      );

      timer = readout(d, { x: 740, y: 40, w: 190, caption: tr('Секундомер, с'), color: '#fbbf24' });
      svg.append(timer.g);

      buildControl(svg, d);
      buildSandBox(svg, d, 'back');
      buildRuler(svg, d);

      buildStand(svg, d);
      thread = s('line', { x1: LOAD_X, x2: LOAD_X, y1: DRUM.y + DRUM.r, stroke: '#334155', 'stroke-width': 1.6 });
      loadShadow = floorShadow(LOAD_X, SAND + 1, 30, d);
      svg.append(loadShadow, thread);
      load = buildLoad(d);
      svg.append(load);
      buildSandBox(svg, d, 'front');
      buildWinch(svg, d);

      sandGrains = [];
      for (let i = 0; i < 12; i++) {
        const c = s('circle', { r: 2.2, fill: i % 2 ? '#d6b98a' : '#c8a46e', opacity: 0 });
        sandGrains.push({ c, x: 0, y: 0, vx: 0, vy: 0 });
        svg.append(c);
      }
    },

    frame(dt) {
      const key = `${params.m}|${params.h}|${params.v}`;
      const changed = key !== prevKey;
      prevKey = key;
      const h = params.h;

      if (!params.lift) {
        if (pos > 0) {
          phase = 'lower';
          pos = Math.max(0, pos - LOWER_SPEED * dt);
        } else {
          phase = 'rest';
        }
      } else {
        // Новое значение массы, высоты или скорости — опыт начинается заново с пола
        if (changed && phase !== 'rest' && phase !== 'lower') {
          phase = pos > 0 ? 'reset' : 'pause';
          wait = PAUSE;
        }
        if (phase === 'rest' || phase === 'lower') {
          if (pos > 0) phase = 'reset';
          else {
            phase = 'up';
            tUp = 0;
          }
        }
        if (phase === 'reset') {
          pos = Math.max(0, pos - LOWER_SPEED * dt);
          if (pos === 0) {
            phase = 'pause';
            wait = PAUSE;
          }
        } else if (phase === 'pause') {
          wait -= dt;
          if (wait <= 0) {
            phase = 'up';
            tUp = 0;
          }
        } else if (phase === 'up') {
          // Равномерный подъём: двигатель держит постоянную скорость v
          tUp += dt;
          pos = Math.min(h, params.v * tUp);
          if (pos >= h) phase = 'top';
        } else if (phase === 'top') {
          if (params.drop) {
            phase = 'hold';
            wait = HOLD;
          }
        } else if (phase === 'hold') {
          wait -= dt;
          if (!params.drop) phase = 'top';
          else if (wait <= 0) {
            phase = 'fall';
            tFall = 0;
            dropTop = pos;
          }
        } else if (phase === 'fall') {
          // Свободное падение без начальной скорости: h − g·t²/2
          tFall += dt;
          pos = dropTop - (G * tFall * tFall) / 2;
          if (pos <= 0) {
            pos = 0;
            phase = 'landed';
            splash();
          }
        } else if (phase === 'landed') {
          // Груз снова зацепили за нить (drop = 0) — лебёдка поднимет его заново
          if (!params.drop) {
            phase = 'pause';
            wait = PAUSE;
          }
        }
      }

      if (pos <= 0) mNow = params.m;
      draw(dt);
    },
  });

  function draw(dt) {
    const m = mNow;
    const yb = SAND - pos * PX;
    load.setAttribute('transform', `translate(0 ${(yb - SAND).toFixed(1)})`);
    thread.setAttribute('y2', (yb - SENSOR_TOP).toFixed(1));
    // Витки нити на барабане «бегут» при вращении: сдвиг пропорционален смотанной длине
    windings.setAttribute('transform', `translate(0 ${(-((pos * PX) % 5)).toFixed(2)})`);
    loadShadow.setAttribute('opacity', Math.max(0.15, 1 - pos * 1.6).toFixed(2));
    loadShadow.setAttribute('rx', (30 + pos * 30).toFixed(1));

    const n = Math.round(m / 0.5);
    discs.forEach((el, i) => el.setAttribute('opacity', i < n ? 1 : 0));

    const fy = SAND - params.h * PX;
    flag.setAttribute('transform', `translate(0 ${fy.toFixed(1)})`);
    flagLine.setAttribute('opacity', pos > 0 && Math.abs(pos - params.h) < 1e-6 ? 0.25 : 0.9);

    const running = phase === 'up' || phase === 'reset' || phase === 'lower';
    motorLed.setAttribute('fill', running ? '#22c55e' : '#475569');
    const on = !!params.lift;
    btnCap.setAttribute('fill', on ? '#dc2626' : '#16a34a');
    btnLabel.textContent = tr(on ? 'Стоп' : 'Пуск');

    const lifted = phase === 'top' || phase === 'hold' || phase === 'fall' || phase === 'landed';
    timer.set(phase === 'up' ? fmt(tUp, 2) : lifted ? fmt(liftTime(params), 2) : '0,00');

    // Песок разлетается при ударе
    if (burst > 0) {
      burst -= dt;
      for (const p of sandGrains) {
        p.vy += 600 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.c.setAttribute('cx', p.x.toFixed(1));
        p.c.setAttribute('cy', p.y.toFixed(1));
        p.c.setAttribute('opacity', Math.max(0, Math.min(1, burst * 2)).toFixed(2));
      }
    }
  }

  function splash() {
    burst = 0.7;
    sandGrains.forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      p.x = LOAD_X + side * (DISC_W / 2 - 4);
      p.y = SAND - 2;
      p.vx = side * (40 + ((i * 37) % 90));
      p.vy = -(120 + ((i * 53) % 140)) * Math.min(1, 0.5 + dropTop);
    });
  }

  // Пульт лебёдки: одна большая кнопка «Пуск/Стоп» и кабель к двигателю
  function buildControl(svg, d) {
    const x = BTN.x - 60;
    const y = BENCH - 84;
    svg.append(
      floorShadow(BTN.x, BENCH + 1, 66, d, 6),
      s('path', { d: `M${BTN.x + 40} ${y + 4} C ${BTN.x + 90} ${y - 40}, 398 ${y - 10}, 398 ${y - 80} V 96 C 398 82, 420 80, 452 76`, fill: 'none', stroke: '#1e293b', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      s('rect', { x, y, width: 120, height: 84, rx: 10, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.5 }),
    );
    btnCap = s('circle', { cx: BTN.x, cy: BTN.y + 10, r: BTN.r - 5, fill: '#16a34a' });
    btnLabel = text(BTN.x, y + 18, '', { size: 16, weight: 800, fill: '#1e293b' });
    const btn = s('g', {}, [
      s('circle', { cx: BTN.x, cy: BTN.y + 10, r: BTN.r, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      btnCap,
      s('ellipse', { cx: BTN.x - 6, cy: BTN.y + 2, rx: 8, ry: 4, fill: '#ffffff', 'fill-opacity': 0.4 }),
    ]);
    btn.style.cursor = 'pointer';
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggleMotor();
    });
    touchTarget(btn);
    svg.append(btnLabel, btn);
  }

  // Ящик с песком: задняя стенка и песок рисуются за грузом, передняя стенка — перед ним
  function buildSandBox(svg, d, part) {
    const x1 = 508;
    const x2 = 644;
    if (part === 'back') {
      svg.append(
        floorShadow((x1 + x2) / 2, BENCH + 1, (x2 - x1) / 2 + 6, d, 5),
        s('rect', { x: x1 + 4, y: 430, width: x2 - x1 - 8, height: 12, fill: '#8a6a43' }),
        s('path', { d: `M${x1 + 4} ${SAND} Q ${(x1 + x2) / 2} ${SAND - 5}, ${x2 - 4} ${SAND} V ${SAND + 4} H ${x1 + 4} Z`, fill: d.lin([[0, '#e7cf9f'], [1, '#c8a46e']], 'v') }),
      );
    } else {
      svg.append(
        s('rect', { x: x1, y: SAND - 2, width: x2 - x1, height: BENCH - SAND + 2, rx: 2, fill: d.lin([[0, '#c49a68'], [1, '#8a6a43']], 'v'), stroke: '#6b4f33', 'stroke-width': 1.2 }),
        s('rect', { x: x1 + 2, y: SAND - 1, width: x2 - x1 - 4, height: 2, fill: '#ffffff', 'fill-opacity': 0.3 }),
      );
    }
  }

  // Линейка 0–100 см от уровня песка и концевой выключатель на ней
  function buildRuler(svg, d) {
    const top = SAND - PX - 14;
    const g = s('g');
    g.append(
      floorShadow(RULER_X + 14, BENCH + 1, 22, d),
      s('rect', { x: RULER_X - 6, y: BENCH - 8, width: 40, height: 8, rx: 2, fill: '#475569' }),
      s('rect', { x: RULER_X, y: top, width: 28, height: BENCH - 8 - top, rx: 2, fill: d.lin([[0, '#fef3c7'], [1, '#fde68a']]), stroke: '#ca8a04', 'stroke-width': 1 }),
    );
    for (let cm = 0; cm <= 100; cm += 2) {
      const y = SAND - (cm / 100) * PX;
      const major = cm % 10 === 0;
      g.append(s('line', { x1: RULER_X, x2: RULER_X + (major ? 14 : 7), y1: y, y2: y, stroke: '#334155', 'stroke-width': major ? 1.4 : 0.8 }));
      if (major) g.append(text(RULER_X + 33, y, String(cm), { size: 13, weight: 600, fill: '#334155', anchor: 'start' }));
    }
    g.append(text(RULER_X + 14, top - 12, tr('см'), { size: 13, weight: 600, fill: '#334155' }));
    svg.append(g);

    // Концевой выключатель: красная скоба на линейке; пунктир показывает, докуда поднимется низ груза
    flagLine = s('line', { x1: LOAD_X - DISC_W / 2 - 6, x2: RULER_X - 10, y1: 0, y2: 0, stroke: '#dc2626', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' });
    flag = s('g', {}, [
      flagLine,
      s('path', { d: `M${RULER_X - 12} 0 L ${RULER_X - 3} -7 V 7 Z`, fill: '#dc2626' }),
      s('rect', { x: RULER_X - 4, y: -9, width: 36, height: 18, rx: 3, fill: '#dc2626', 'fill-opacity': 0.25, stroke: '#b91c1c', 'stroke-width': 2 }),
      s('rect', { x: RULER_X + 28, y: -6, width: 8, height: 12, rx: 2, fill: '#b91c1c' }),
    ]);
    svg.append(flag);
  }

  // Штатив: тяжёлое основание, стойка, муфта с кронштейном лебёдки
  function buildStand(svg, d) {
    svg.append(
      floorShadow(420, BENCH + 1, 76, d, 6),
      s('rect', { x: 352, y: BENCH - 12, width: 136, height: 12, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: 414, y: 34, width: 10, height: BENCH - 46, rx: 3, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      s('rect', { x: 407, y: 54, width: 24, height: 30, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('circle', { cx: 400, cy: 69, r: 5, fill: '#334155' }),
      s('rect', { x: 431, y: 63, width: 20, height: 12, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'v') }),
    );
  }

  // Лебёдка: двигатель с рёбрами, редуктор, барабан с витками нити и рычаг расцепления
  function buildWinch(svg, d) {
    const motor = s('g', {}, [
      s('rect', { x: 450, y: 46, width: 76, height: 40, rx: 8, fill: d.lin([[0, '#60a5fa'], [0.35, '#2563eb'], [1, '#1e3a8a']], 'v'), stroke: '#1e3a8a', 'stroke-width': 1.2 }),
      ...[0, 1, 2, 3, 4, 5].map((i) => s('rect', { x: 460 + i * 10, y: 49, width: 4, height: 34, rx: 2, fill: '#1e3a8a', 'fill-opacity': 0.35 })),
      s('rect', { x: 526, y: 52, width: 20, height: 28, rx: 3, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'v'), stroke: '#334155' }),
      s('circle', { cx: 462, cy: 56, r: 3.5, fill: '#475569' }),
    ]);
    motorLed = motor.lastChild;
    motor.style.cursor = 'pointer';
    motor.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggleMotor();
    });
    touchTarget(motor);

    windings = s('g');
    for (let y = DRUM.y - DRUM.r - 5; y <= DRUM.y + DRUM.r + 5; y += 5) {
      windings.append(s('line', { x1: DRUM.x1 + 4, x2: DRUM.x2 - 4, y1: y, y2: y + 2, stroke: '#78350f', 'stroke-opacity': 0.45, 'stroke-width': 1 }));
    }
    const clip = s('clipPath', { id: 'wp-drum' }, [s('rect', { x: DRUM.x1, y: DRUM.y - DRUM.r, width: DRUM.x2 - DRUM.x1, height: DRUM.r * 2 })]);
    svg.append(clip);
    const drum = s('g', {}, [
      s('rect', { x: DRUM.x1, y: DRUM.y - DRUM.r, width: DRUM.x2 - DRUM.x1, height: DRUM.r * 2, fill: d.lin([[0, '#fde68a'], [0.4, '#d6a85a'], [1, '#8a5a2b']], 'v') }),
      s('g', { 'clip-path': 'url(#wp-drum)' }, [windings]),
      s('rect', { x: DRUM.x1 - 4, y: DRUM.y - DRUM.r - 6, width: 6, height: DRUM.r * 2 + 12, rx: 2, fill: d.lin([[0, '#cbd5e1'], [1, '#475569']], 'v') }),
      s('rect', { x: DRUM.x2 - 2, y: DRUM.y - DRUM.r - 6, width: 6, height: DRUM.r * 2 + 12, rx: 2, fill: d.lin([[0, '#cbd5e1'], [1, '#475569']], 'v') }),
    ]);

    // Рычаг расцепления: поворачивают — барабан крутится свободно, груз падает
    const lever = s('g', {}, [
      s('rect', { x: 604, y: 58, width: 14, height: 12, rx: 3, fill: '#334155' }),
      s('rect', { x: 612, y: 30, width: 5, height: 34, rx: 2, fill: '#475569' }),
      s('circle', { cx: 614.5, cy: 28, r: 8, fill: d.rad([[0, '#f87171'], [1, '#b91c1c']], 0.35, 0.3) }),
    ]);
    lever.style.cursor = 'pointer';
    lever.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      release();
    });
    touchTarget(lever);
    svg.append(motor, drum, lever, text(630, 30, tr('Отпустить груз'), { size: 13, weight: 600, fill: '#b91c1c', anchor: 'start' }));
  }

  // Груз: кольцо датчика силы, датчик, крючок, стержень подвеса с дисками по 0,5 кг
  function buildLoad(d) {
    const yb = SAND;
    discs = [];
    const parts = [
      s('circle', { cx: LOAD_X, cy: yb - SENSOR_TOP + 3, r: 3, fill: 'none', stroke: '#475569', 'stroke-width': 1.6 }),
      s('rect', { x: LOAD_X - 15, y: yb - 100, width: 30, height: 26, rx: 4, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: LOAD_X - 10, y: yb - 95, width: 20, height: 9, rx: 1.5, fill: '#065f46' }),
      s('path', { d: `M${LOAD_X} ${yb - 74} V ${yb - 68} c 6 0 6 7 0 7`, fill: 'none', stroke: '#475569', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      s('rect', { x: LOAD_X - 2, y: yb - 64, width: 4, height: 62, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
    ];
    for (let i = 0; i < DISCS; i++) {
      const y = yb - 4 - (i + 1) * DISC_H;
      const el = s('g', {}, [
        s('rect', { x: LOAD_X - DISC_W / 2, y, width: DISC_W, height: DISC_H - 1, rx: 2.5, fill: d.lin([[0, '#9ca3af'], [0.3, '#e5e7eb'], [0.6, '#6b7280'], [1, '#374151']]), stroke: '#374151', 'stroke-width': 0.8 }),
        s('rect', { x: LOAD_X - 3, y, width: 6, height: DISC_H - 1, fill: '#374151', 'fill-opacity': 0.55 }),
      ]);
      discs.push(el);
      parts.push(el);
    }
    parts.push(s('rect', { x: LOAD_X - 24, y: yb - 4, width: 48, height: 4, rx: 1.5, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }));
    const g = s('g', {}, parts);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      release();
    });
    touchTarget(g);
    return g;
  }

  // Пуск — поднять груз; Стоп — опустить его на стол и зацепить снова, если он был отпущен
  function toggleMotor() {
    if (!params.lift) {
      set('lift', 1);
    } else {
      set('drop', 0);
      set('lift', 0);
    }
  }

  // Отпустить можно только поднятый (или поднимаемый) груз
  function release() {
    if (params.lift && !params.drop && phase !== 'reset' && phase !== 'pause') set('drop', 1);
  }

  // Перетаскивание подключаем после createScene: обработчикам нужна сама сцена (пересчёт координат указателя)
  // Концевой выключатель ведём вверх-вниз по линейке
  draggable(scene, flag, {
    onDrag: (_, py) => set('h', (SAND - py) / PX),
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
