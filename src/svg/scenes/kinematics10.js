// Сцена «Движение тела, брошенного под углом к горизонту»: на столе физкабинета — баллистический пистолет
// на стойке и длинный горизонтальный лоток с мерной лентой. Ось поворота ствола проходит через точку вылета
// шарика (как у школьных пусковых установок с транспортиром), поэтому шарик вылетает и падает на лоток
// на одной и той же высоте — ровно тот случай, для которого записана формула L = v₀²·sin 2α / g.
// Ствол поворачивают за рукоятку (угол α по транспортиру), начальная скорость задаётся сжатием пружины —
// оно видно в окошке ствола. Щелчок по красному спусковому рычагу — выстрел (fired = 1); повторный щелчок
// после приземления заряжает пистолет снова. Если во время опыта сменить угол или скорость, шарик
// возвращают в ствол и стреляют заново — так каждое значение измерено отдельным выстрелом.
// Полёт показан замедленно (в 2 раза): настоящий выстрел длится доли секунды и глаз не успевает за шариком.
// Числа (дальность, время, высота) — только в панели показаний под сценой, на сцене их не дублируем.
// Следы прошлых выстрелов с той же скоростью (траектория и отметка на копировальной бумаге) остаются —
// по ним видно, что при 30° и 60° шарик падает в одну точку.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, text, touchTarget } from '../kit.js';

const BENCH = 450;
const LX = 150; // точка вылета шарика (и ось поворота ствола)
const LY = 340;
const BALL_R = 10;
const BOARD_Y = LY + BALL_R; // верх лотка: шарик падает на уровень вылета
const BOARD_END = 940;
const PX = 400; // px на метр
const BARREL = 86; // длина ствола позади точки вылета
const SLOW = 2; // во сколько раз замедлен показ полёта
const TURN_SPEED = 60; // °/с — ствол поворачивается плавно
const PAUSE = 0.35; // с — пауза перед повторным выстрелом, чтобы был виден старт
const STROBE = 0.04; // с — интервал «стробоскопических» положений шарика
const DOTS = 24;
const HISTORY = 6; // сколько прошлых выстрелов оставлять на лотке
const LEGS = [236, 540, 860];

export function kinematics10Scene(container, params, set, { range, flightTime, maxHeight, position }) {
  let barrelG, spring, piston, ball, lever, readyLed;
  let ghostG, marksG, dotsG, curPath, apexG, apexLine, apexText;
  const dots = [];
  // Ход опыта: held — заряжен, aim — ствол поворачивается перед повторным выстрелом, pause — ждёт выстрела,
  // run — шарик летит, done — шарик на лотке
  let phase = params.fired ? 'aim' : 'held';
  let angle = params.alpha; // угол, на котором ствол нарисован сейчас (догоняет params.alpha)
  let tRun = 0;
  let wait = 0;
  let nextDot = 0;
  let prevKey = `${params.alpha}|${params.v0}`;
  // Прошлые выстрелы: по одному на пару «угол, скорость»; порядок вставки — порядок выстрелов
  const history = new Map();
  let historyKey = '';

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Табличка с формулой дальности
      svg.append(
        s('rect', { x: 28, y: 32, width: 206, height: 62, rx: 10, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 3 }),
        text(131, 64, 'L = v₀²·sin 2α / g', { size: 21, weight: 700, fill: '#f8fafc' }),
      );

      ghostG = s('g', { fill: 'none', stroke: '#64748b', 'stroke-opacity': 0.45, 'stroke-width': 1.6 });
      svg.append(ghostG);

      // Стойку рисуем до лотка: лоток ближе к зрителю и не закрывает ноль мерной ленты
      svg.append(
        floorShadow(LX, BENCH + 2, 60, d),
        s('rect', { x: LX - 50, y: BENCH - 10, width: 100, height: 10, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: LX - 7, y: LY, width: 14, height: BENCH - LY - 10, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      );
      buildBoard(svg, d);

      marksG = s('g');
      svg.append(marksG);

      // Траектория текущего выстрела: пунктир и «стробоскопические» положения шарика
      curPath = s('path', { fill: 'none', stroke: '#2563eb', 'stroke-width': 2, 'stroke-dasharray': '7 6', opacity: 0 });
      dotsG = s('g');
      for (let i = 0; i < DOTS; i++) {
        const c = s('circle', { r: 4, fill: '#f59e0b', 'fill-opacity': 0.85, stroke: '#b45309', 'stroke-width': 0.8, opacity: 0 });
        dots.push(c);
        dotsG.append(c);
      }
      apexLine = s('path', { fill: 'none', stroke: '#7c3aed', 'stroke-width': 1.6, 'stroke-dasharray': '4 4' });
      apexText = text(0, 0, '', { size: 18, weight: 700, fill: '#6d28d9', anchor: 'start' });
      // Светлая обводка: подпись читается поверх бледных траекторий прошлых выстрелов
      Object.assign(apexText.style, { paintOrder: 'stroke', stroke: '#f1f5f9', strokeWidth: '4px', strokeLinejoin: 'round' });
      apexG = s('g', { opacity: 0 }, [apexLine, apexText]);
      svg.append(curPath, dotsG, apexG);

      buildLauncher(svg, d);
    },

    frame(dt) {
      const key = `${params.alpha}|${params.v0}`;
      // Новый угол или скорость во время опыта: шарик возвращают в ствол и стреляют заново
      if (key !== prevKey) {
        prevKey = key;
        if (params.fired && phase !== 'held') phase = 'aim';
      }

      const turn = TURN_SPEED * dt;
      angle = Math.abs(params.alpha - angle) <= turn ? params.alpha : angle + Math.sign(params.alpha - angle) * turn;
      const aimed = angle === params.alpha;

      if (!params.fired) {
        phase = 'held';
      } else if (phase === 'held' || phase === 'aim') {
        // Выстрел только когда ствол уже повернут на заданный угол
        if (aimed) {
          phase = phase === 'held' ? 'run' : 'pause';
          wait = PAUSE;
          if (phase === 'run') startRun();
        }
      } else if (phase === 'pause') {
        wait -= dt;
        if (wait <= 0) {
          phase = 'run';
          startRun();
        }
      } else if (phase === 'run') {
        tRun += dt / SLOW;
        const T = flightTime(params);
        while (nextDot <= Math.min(tRun, T) + 1e-9) {
          showDot(nextDot);
          nextDot += STROBE;
        }
        if (tRun >= T) {
          tRun = T;
          phase = 'done';
          remember();
        }
      }

      // Ствол, пружина, рычаг
      barrelG.setAttribute('transform', `translate(${LX} ${LY}) rotate(${(-angle).toFixed(2)})`);
      const loaded = phase === 'held' || phase === 'aim' || phase === 'pause';
      // Чем сильнее сжата пружина, тем больше начальная скорость: у заряженного пистолета поршень отведён назад
      const px = loaded ? -66 + (4 - params.v0) * 10 : -16;
      piston.setAttribute('x', (px - 3).toFixed(1));
      spring.setAttribute('d', zigzag(-74, px - 3));
      lever.setAttribute('transform', `rotate(${loaded ? 0 : 28} 186 404)`);
      readyLed.setAttribute('fill', loaded ? '#22c55e' : '#475569');

      // Шарик
      let bx = LX;
      let by = LY;
      if (phase === 'run' || phase === 'done') {
        const pos = position(params, tRun);
        bx = LX + pos.x * PX;
        by = LY - Math.max(0, pos.y) * PX;
      }
      ball.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)})`);

      // Пунктир траектории и высота подъёма — после выстрела
      const flying = phase === 'run' || phase === 'done';
      curPath.setAttribute('opacity', phase === 'done' ? 0.9 : 0);
      curPath.setAttribute('d', parabola(params));
      if (!flying) dots.forEach((c) => c.setAttribute('opacity', 0));
      const T = flightTime(params);
      const pastApex = phase === 'done' || (phase === 'run' && tRun >= T / 2);
      apexG.setAttribute('opacity', pastApex ? 1 : 0);
      const ax = LX + (range(params) / 2) * PX;
      const ay = LY - maxHeight(params) * PX;
      apexLine.setAttribute('d', `M${ax.toFixed(1)} ${(ay + BALL_R + 2).toFixed(1)} V${BOARD_Y} M${(ax - 8).toFixed(1)} ${ay.toFixed(1)} H${(ax + 8).toFixed(1)}`);
      // Буква h — у пунктира посередине высоты, внутри параболы: там её не пересекают ни траектория, ни точки
      apexText.setAttribute('x', (ax + 6).toFixed(1));
      apexText.setAttribute('y', ((ay + BOARD_Y) / 2 + 5).toFixed(1));
      apexText.textContent = 'h';

      if (historyKey !== `${[...history.keys()].join(';')}#${params.v0}`) drawHistory();
    },
  });

  function startRun() {
    tRun = 0;
    nextDot = 0;
    dots.forEach((c) => c.setAttribute('opacity', 0));
  }

  function showDot(t) {
    const i = Math.round(t / STROBE);
    const c = dots[i];
    if (!c) return;
    const pos = position(params, t);
    c.setAttribute('cx', (LX + pos.x * PX).toFixed(1));
    c.setAttribute('cy', (LY - Math.max(0, pos.y) * PX).toFixed(1));
    c.setAttribute('opacity', 1);
  }

  // Парабола от точки вылета до точки падения: квадратичная кривая Безье с контрольной точкой
  // на высоте 2h над серединой — это в точности траектория, а не приближение
  function parabola(p) {
    const L = range(p) * PX;
    const h = maxHeight(p) * PX;
    return `M${LX} ${LY} Q${(LX + L / 2).toFixed(1)} ${(LY - 2 * h).toFixed(1)} ${(LX + L).toFixed(1)} ${LY}`;
  }

  function remember() {
    const key = `${params.alpha}|${params.v0}`;
    history.delete(key);
    history.set(key, { alpha: params.alpha, v0: params.v0, path: parabola(params), x: LX + range(params) * PX });
    while (history.size > HISTORY) history.delete(history.keys().next().value);
  }

  // Следы прошлых выстрелов: бледная траектория и отметка на копировальной бумаге с подписью угла.
  // Выстрелы, попавшие в одну точку (30° и 60°), подписываются одной меткой — равенство видно сразу.
  function drawHistory() {
    historyKey = `${[...history.keys()].join(';')}#${params.v0}`;
    // Выстрелы с другой скоростью не показываем: их метки угла путали бы (60° при 2 м/с и 60° при 4 м/с
    // падают в разные точки), а лишние линии только загромождают лоток
    const same = [...history.values()].filter((h) => h.v0 === params.v0);
    ghostG.replaceChildren(...same.map((h) => s('path', { d: h.path })));
    const groups = [];
    for (const h of same) {
      const g = groups.find((x) => Math.abs(x.x - h.x) < 3);
      if (g) g.alphas.push(h.alpha);
      else groups.push({ x: h.x, alphas: [h.alpha] });
    }
    groups.sort((a, b) => a.x - b.x);
    const nodes = [];
    let lastX = -Infinity;
    let row = 0;
    for (const g of groups) {
      // Близкие подписи разводим по двум строкам, чтобы не наезжали друг на друга
      row = g.x - lastX < 46 ? 1 - row : 0;
      lastX = g.x;
      const ly = BOARD_Y + 44 + row * 18;
      const label = g.alphas.sort((a, b) => a - b).map((a) => `${a}°`).join(', ');
      nodes.push(
        s('ellipse', { cx: g.x.toFixed(1), cy: BOARD_Y + 1, rx: 6, ry: 2.4, fill: '#0f172a', 'fill-opacity': 0.75 }),
        s('path', { d: `M${g.x.toFixed(1)} ${BOARD_Y + 30} V${ly - 9}`, stroke: '#0f172a', 'stroke-opacity': 0.5, 'stroke-width': 1.2 }),
        text(g.x, ly, label, { size: 13, weight: 700, fill: '#1e293b' }),
      );
    }
    marksG.replaceChildren(...nodes);
  }

  function zigzag(x0, x1) {
    const n = 9;
    const step = (x1 - x0) / n;
    let dPath = `M${x0} 0`;
    for (let i = 0; i < n; i++) dPath += ` L${(x0 + step * (i + 0.5)).toFixed(1)} ${i % 2 ? 3.5 : -3.5}`;
    return `${dPath} L${x1.toFixed(1)} 0`;
  }

  // Горизонтальный лоток на ножках: сверху лист бумаги с копиркой, на торце — мерная лента,
  // ноль ленты — прямо под точкой вылета
  function buildBoard(svg, d) {
    const w = BOARD_END - LX;
    svg.append(floorShadow((LX + BOARD_END) / 2, BENCH + 2, 380, d, 7));
    for (const x of LEGS) {
      svg.append(s('rect', { x: x - 5, y: BOARD_Y + 30, width: 10, height: BENCH - BOARD_Y - 30, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }));
      svg.append(s('rect', { x: x - 16, y: BENCH - 6, width: 32, height: 6, rx: 2, fill: '#334155' }));
    }
    svg.append(
      s('rect', { x: LX, y: BOARD_Y, width: w, height: 30, rx: 2, fill: d.lin([[0, '#d9bf98'], [1, '#a88660']], 'v'), stroke: '#7d5f3f', 'stroke-width': 1.2 }),
      // бумага с копиркой на верхней грани
      s('rect', { x: LX + 40, y: BOARD_Y - 1.5, width: w - 50, height: 3, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 0.6 }),
    );
    const tape = s('g');
    const end = 170; // см
    tape.append(s('rect', { x: LX, y: BOARD_Y + 4, width: end * (PX / 100) + 30, height: 22, rx: 2, fill: '#fef9c3', stroke: '#ca8a04', 'stroke-width': 1 }));
    for (let cm = 0; cm <= end; cm += 5) {
      const x = LX + cm * (PX / 100);
      const major = cm % 10 === 0;
      tape.append(s('line', { x1: x, y1: BOARD_Y + 4, x2: x, y2: BOARD_Y + 4 + (major ? 8 : 5), stroke: '#334155', 'stroke-width': major ? 1.4 : 0.8 }));
      if (major && cm % 20 === 0) tape.append(text(x + (cm === 0 ? 5 : 0), BOARD_Y + 18, String(cm), { size: 13, weight: 600, fill: '#334155', anchor: cm === 0 ? 'start' : 'middle' }));
    }
    tape.append(text(LX + end * (PX / 100) + 16, BOARD_Y + 18, tr('см'), { size: 13, weight: 600, fill: '#334155' }));
    svg.append(tape);
  }

  // Пистолет: транспортир, ствол на оси в точке вылета, пружина в окошке ствола,
  // спусковой механизм с рычагом на стойке
  function buildLauncher(svg, d) {
    // Транспортир: прозрачная четверть круга; угол читают по оси ствола (рукоятка — вниз-влево)
    const R = 82;
    const prot = s('g');
    prot.append(s('path', { d: `M${LX} ${LY} L${LX - R} ${LY} A ${R} ${R} 0 0 0 ${LX} ${LY + R} Z`, fill: '#e0f2fe', 'fill-opacity': 0.55, stroke: '#0369a1', 'stroke-opacity': 0.6, 'stroke-width': 1.2 }));
    for (let a = 0; a <= 90; a += 5) {
      // Подпись 90° упала бы на стойку, а такой угол у пистолета и не выставить
      const r = (a * Math.PI) / 180;
      const len = a % 15 === 0 ? 12 : 6;
      const cx = -Math.cos(r);
      const cy = Math.sin(r);
      prot.append(s('line', { x1: LX + cx * R, y1: LY + cy * R, x2: LX + cx * (R - len), y2: LY + cy * (R - len), stroke: '#0c4a6e', 'stroke-width': a % 15 === 0 ? 1.4 : 0.8 }));
      if (a % 15 === 0 && a < 90) prot.append(text(LX + cx * (R + 15), LY + cy * (R + 13), `${a}°`, { size: 13, weight: 600, fill: '#0c4a6e' }));
    }
    svg.append(prot);

    // Спусковой рычаг: щелчок — выстрел, после приземления — зарядить снова
    readyLed = s('circle', { cx: 172, cy: 421, r: 3.5, fill: '#22c55e' });
    lever = s('g', {}, [
      s('rect', { x: 186, y: 401, width: 28, height: 6, rx: 3, fill: '#991b1b' }),
      s('circle', { cx: 218, cy: 404, r: 9, fill: d.rad(['#fca5a5', '#dc2626', '#7f1d1d']) }),
    ]);
    const trigger = s('g', {}, [
      s('rect', { x: LX + 7, y: 398, width: 6, height: 8, fill: '#475569' }),
      s('rect', { x: 158, y: 392, width: 30, height: 40, rx: 4, fill: d.lin([[0, '#334155'], [1, '#0f172a']], 'v') }),
      readyLed,
      lever,
      s('circle', { cx: 186, cy: 404, r: 3, fill: '#e2e8f0' }),
    ]);
    trigger.style.cursor = 'pointer';
    trigger.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    touchTarget(trigger);
    svg.append(trigger);

    // Шарик рисуем до ствола: заряженный, он наполовину скрыт в дуле
    ball = s('g', { style: 'cursor:pointer' }, [
      s('circle', { r: BALL_R, fill: d.rad([[0, '#f8fafc'], [0.45, '#94a3b8'], [1, '#334155']], 0.35, 0.3), stroke: '#334155', 'stroke-width': 0.8 }),
    ]);
    ball.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      toggle();
    });
    svg.append(ball);

    // Ствол в собственных координатах: ось вдоль +x, дуло — в начале координат
    spring = s('path', { fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
    piston = s('rect', { x: -20, y: -5, width: 6, height: 10, rx: 1.5, fill: '#f59e0b' });
    const handle = s('g', {}, [
      s('rect', { x: -BARREL - 22, y: -7, width: 24, height: 14, rx: 7, fill: d.lin([[0, '#1f2937'], [0.4, '#4b5563'], [1, '#111827']], 'v') }),
      s('rect', { x: -BARREL - 18, y: -4, width: 16, height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.25 }),
    ]);
    barrelG = s('g', {}, [
      s('rect', { x: -BARREL, y: -12, width: BARREL - 4, height: 24, rx: 4, fill: d.lin([[0, '#e2e8f0'], [0.35, '#94a3b8'], [1, '#475569']], 'v'), stroke: '#334155', 'stroke-width': 1.2 }),
      // окошко с пружиной: по нему видно, насколько она сжата
      s('rect', { x: -78, y: -6, width: 66, height: 12, rx: 3, fill: '#0f172a' }),
      spring,
      piston,
      s('rect', { x: -9, y: -13, width: 7, height: 26, rx: 2, fill: d.lin([[0, '#cbd5e1'], [1, '#334155']], 'v'), stroke: '#1e293b', 'stroke-width': 1 }),
      handle,
    ]);
    svg.append(barrelG);
    // Ствол поворачивают за рукоятку: угол — между осью ствола и горизонтом
    // scene ещё не создана, пока идёт build(): координаты берём у неё уже во время перетаскивания
    draggable({ point: (e) => scene.point(e) }, handle, {
      onDrag(x, y) {
        const deg = (Math.atan2(y - LY, LX - x) * 180) / Math.PI;
        set('alpha', deg);
      },
    });
  }

  function toggle() {
    if (!params.fired) set('fired', 1);
    else if (phase === 'done') set('fired', 0);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
