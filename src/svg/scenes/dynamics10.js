// Сцена «Сила трения скольжения»: на столе физкабинета — длинная доска со сменным покрытием
// (дерево, стекло, резина), деревянный брусок 12 × 6 × 3 см с грузами по 100 г и горизонтальный
// школьный динамометр, который ученик тянет рукой. Потянуть динамометр вправо (или нажать на него) —
// pull = 1: пружина растягивается до Fтр, и брусок едет равномерно; нажатие на динамометр доехавшего
// бруска возвращает его к началу. Щелчок по бруску ставит его на другую грань, по грузу на полке — кладёт груз
// на брусок, по грузу на бруске — снимает его, по образцу покрытия — меняет поверхность доски.
// Если что-то меняют во время опыта, брусок возвращают к началу и тянут заново — каждое значение
// измерено при равномерном движении, как требует методика.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 440;
const BOARD_TOP = BENCH - 20;
const BOARD = { x1: 30, x2: 940 };
const LEN = 150; // px — длина бруска 12 см (12,5 px на сантиметр)
const HEIGHT = [38, 75]; // видимая высота бруска: на широкой грани — 3 см, на узкой — 6 см
const BX0 = 190; // задний край бруска в начале опыта: слева остаётся место для стрелки Fтр
const TRAVEL = 170; // px — сколько брусок проезжает за один опыт (шкала динамометра не уходит за кадр)
const SPEED = 80; // px/с — равномерное движение
const BACK_SPEED = 600; // px/с — брусок возвращают рукой, быстро
const RAMP = 0.35; // с — пружина растягивается до Fтр, пока брусок ещё стоит
const PAUSE = 0.35; // с — пауза в начале перед повторным опытом
const K = 32; // px на 1 Н — растяжение пружины динамометра (шкала 0…5 Н)
const ARROW = 40; // px на 1 Н — длина стрелки силы трения
const BODY_W = 5 * K + 58; // корпус динамометра
const ZERO = BODY_W - 26; // нуль шкалы от левого края корпуса; 5 Н — левее на 5K
const ROD0 = 40; // длина тяги от крючка до корпуса при нерастянутой пружине
const POINTER_X = ROD0 + ZERO; // указатель на тяге: против нуля шкалы, когда пружина не растянута
const WEIGHT = { w: 32, h: 30 };
const SHELF = { x: 40, y: 250, w: 220 };
const SLOTS = 4; // грузов по 100 г: брусок 100 г + до 4 грузов = до 500 г
const TILES = [676, 764, 852];
const TILE_Y = 58;
// Цвета покрытий доски: дерево, стекло, резина (порядок — как в sims/dynamics10.js)
const COATS = ['#d6b48a', '#cfe7f1', '#3f3f46'];
const SURFACE_NAMES = ['дерево', 'стекло', 'резина'];

export function dynamics10Scene(container, params, set, { friction }) {
  let plateBody;
  let block, blockBody, blockShine, blockGrain, eye, blockWeights, shelfWeights, dyno, spring, thread, arm;
  let coats, tiles, frArrow, frLabel, vArrow;
  // Ход опыта: held — брусок у начала, run — едет, done — доехал, back — возвращается, pause — ждёт
  let phase = params.pull ? 'run' : 'held';
  let pos = 0;
  let tRun = 0;
  let wait = 0;
  let prevKey = keyOf();

  function keyOf() {
    return `${params.surface}|${params.m}|${params.side}`;
  }

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Табличка с законом — числа показывает панель показаний под сценой, на стенде их не дублируем
      svg.append(
        s('rect', { x: 40, y: 40, width: 200, height: 56, rx: 10, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 3 }),
        text(140, 69, tr('Fтр = μN'), { size: 26, weight: 700, fill: '#f8fafc' }),
      );

      buildTiles(svg, d);
      buildShelf(svg, d);
      buildBoard(svg, d);

      thread = s('path', { fill: 'none', stroke: '#334155', 'stroke-width': 1.6 });
      frArrow = s('path', { fill: 'none', stroke: '#dc2626', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      frLabel = text(0, BOARD_TOP - 3, tr('Fтр'), { size: 16, weight: 700, fill: '#dc2626', anchor: 'end' });
      vArrow = s('g', {}, [
        s('path', { d: 'M0 0 H54 M46 -6 L55 0 L46 6', fill: 'none', stroke: '#16a34a', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        text(66, 0, 'v', { size: 16, weight: 700, fill: '#16a34a' }),
      ]);
      block = buildBlock(d);
      dyno = buildDyno(d);
      arm = buildArm(d);
      svg.append(thread, block, frArrow, frLabel, vArrow, dyno, arm);
      bindDyno([dyno, arm]);
    },

    frame(dt) {
      const key = keyOf();
      // Новое покрытие, груз или грань во время опыта: брусок возвращают к началу и тянут снова
      if (key !== prevKey) {
        prevKey = key;
        if (params.pull && phase !== 'held') phase = 'back';
      }

      let ramp = 0;
      if (!params.pull) {
        phase = 'held';
        pos = Math.max(0, pos - BACK_SPEED * dt);
      } else if (phase === 'held') {
        if (pos > 0) pos = Math.max(0, pos - BACK_SPEED * dt);
        else {
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
        // Сначала пружина растягивается, пока её сила не сравняется с силой трения, затем брусок
        // едет с постоянной скоростью — показание динамометра при этом не меняется
        tRun += dt;
        pos = Math.max(0, tRun - RAMP) * SPEED;
        if (pos >= TRAVEL) {
          pos = TRAVEL;
          phase = 'done';
        }
      }
      if (phase === 'run') ramp = Math.min(1, tRun / RAMP);
      if (phase === 'done') ramp = 1;

      const F = friction(params) * ramp;
      const moving = phase === 'run' && tRun > RAMP;

      // Покрытие доски и выбранный образец
      coats.forEach((c, i) => c.setAttribute('opacity', i === params.surface ? 1 : 0));
      tiles.forEach((t, i) => {
        const on = i === params.surface;
        t.frame.setAttribute('stroke', on ? '#2563eb' : '#94a3b8');
        t.frame.setAttribute('stroke-width', on ? 3.5 : 1.5);
        t.label.setAttribute('fill', on ? '#1d4ed8' : '#334155');
        t.label.setAttribute('font-weight', on ? 700 : 500);
      });

      // Брусок на выбранной грани и грузы на нём
      const h = HEIGHT[params.side];
      const top = BOARD_TOP - h;
      blockBody.setAttribute('y', top);
      blockBody.setAttribute('height', h);
      blockShine.setAttribute('y', top + 2);
      blockGrain.setAttribute('transform', `translate(0 ${top}) scale(1 ${h / 75})`);
      const hookY = BOARD_TOP - h / 2;
      eye.setAttribute('cy', hookY);
      const n = Math.round((params.m - 100) / 100);
      blockWeights.forEach((w, i) => {
        w.setAttribute('opacity', i < n ? 1 : 0);
        w.style.pointerEvents = i < n ? 'auto' : 'none';
        w.setAttribute('transform', `translate(0 ${top})`);
      });
      shelfWeights.forEach((w, i) => {
        const on = i >= n;
        w.setAttribute('opacity', on ? 1 : 0);
        w.style.pointerEvents = on ? 'auto' : 'none';
      });
      block.setAttribute('transform', `translate(${pos.toFixed(1)} 0)`);

      // Динамометр: нить от ушка бруска к крючку, растянутая пружина отодвигает корпус от крючка
      const bx = BX0 + pos;
      const hookX = bx + LEN + 24;
      const e = F * K;
      thread.setAttribute('d', `M${bx + LEN + 8} ${hookY} H${hookX - 5}`);
      dyno.setAttribute('transform', `translate(${hookX.toFixed(1)} ${hookY})`);
      // Указатель сидит на тяге и движется вместе с крючком, а корпус со шкалой отъезжает на растяжение
      // пружины: указатель встаёт против деления F = e / K
      const body = ROD0 + e; // левый край корпуса относительно крючка
      plateBody.setAttribute('transform', `translate(${body.toFixed(1)} 0)`);
      spring.setAttribute('d', springPath(POINTER_X + 2, body + BODY_W - 8));
      arm.setAttribute('transform', `translate(${(hookX + body + BODY_W - 2).toFixed(1)} ${hookY}) scale(1.2)`);

      // Стрелка силы трения — у нижнего края бруска, против движения; её длина пропорциональна Fтр
      const show = phase === 'done' || moving;
      const len = friction(params) * ARROW;
      frArrow.setAttribute('d', show ? `M${bx} ${BOARD_TOP - 3} H${bx - len} M${bx - len + 8} ${BOARD_TOP - 9} L${bx - len} ${BOARD_TOP - 3} L${bx - len + 8} ${BOARD_TOP + 3}` : '');
      frLabel.setAttribute('x', bx - len - 6);
      frLabel.setAttribute('opacity', show ? 1 : 0);
      vArrow.setAttribute('opacity', moving ? 1 : 0);
      vArrow.setAttribute('transform', `translate(${bx + 26} ${top - (n ? WEIGHT.h : 0) - 16})`);
    },
  });

  // Образцы покрытий на стенде: щелчок по образцу кладёт такое покрытие на доску
  function buildTiles(svg, d) {
    svg.append(text(TILES[1] + 38, 44, tr('Покрытие доски'), { size: 15, weight: 600, fill: '#334155' }));
    tiles = TILES.map((x, i) => {
      const frame = s('rect', { x, y: TILE_Y, width: 76, height: 48, rx: 6, fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.5 });
      const label = text(x + 38, TILE_Y + 64, tr(SURFACE_NAMES[i]), { size: 14, weight: 500, fill: '#334155' });
      const g = s('g', {}, [coatFill(d, i, x + 3, TILE_Y + 3, 70, 42), frame, label]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('surface', i);
      });
      touchTarget(g, 10);
      svg.append(g);
      return { frame, label };
    });
  }

  // Заливка покрытия: дерево с волокнами, стекло с бликами, резина с мелким рифлением
  function coatFill(d, i, x, y, w, h) {
    const parts = [s('rect', { x, y, width: w, height: h, rx: 3, fill: d.lin([[0, shade(COATS[i], 0.15)], [1, shade(COATS[i], -0.12)]], 'v') })];
    if (i === 0) {
      for (let k = 0; k < h / 6; k++) {
        const yy = y + 3 + k * 6;
        parts.push(s('path', { d: `M${x} ${yy} C ${x + w * 0.3} ${yy - 2}, ${x + w * 0.6} ${yy + 2}, ${x + w} ${yy}`, fill: 'none', stroke: '#8a6a43', 'stroke-opacity': 0.35, 'stroke-width': 1 }));
      }
    } else if (i === 1 && h > 20) {
      parts.push(s('path', { d: `M${x + w * 0.15} ${y + h} L${x + w * 0.35} ${y} M${x + w * 0.3} ${y + h} L${x + w * 0.5} ${y}`, stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 3 }));
    } else if (i === 1) {
      // Тонкий лист стекла на доске: блик по верхней кромке и зеленоватый торец
      parts.push(
        s('rect', { x, y, width: w, height: 1.6, fill: '#ffffff', 'fill-opacity': 0.9 }),
        s('rect', { x, y: y + h - 2, width: w, height: 2, fill: '#5eaaa8', 'fill-opacity': 0.6 }),
      );
    } else {
      const rib = d.pattern('rubber', 6, 6, [s('circle', { cx: 3, cy: 3, r: 1.1, fill: '#18181b', 'fill-opacity': 0.6 })]);
      parts.push(s('rect', { x, y, width: w, height: h, rx: 3, fill: rib }));
    }
    return s('g', {}, parts);
  }

  // Доска на столе: фанерное основание и сменное покрытие сверху
  function buildBoard(svg, d) {
    svg.append(
      floorShadow((BOARD.x1 + BOARD.x2) / 2, BENCH + 1, 470, d, 6),
      s('rect', { x: BOARD.x1, y: BOARD_TOP + 6, width: BOARD.x2 - BOARD.x1, height: 14, rx: 2, fill: d.lin([[0, '#e7cfa6'], [1, '#b58f62']], 'v'), stroke: '#8a6a43', 'stroke-width': 1 }),
    );
    coats = [0, 1, 2].map((i) => {
      const g = coatFill(d, i, BOARD.x1, BOARD_TOP, BOARD.x2 - BOARD.x1, 7);
      svg.append(g);
      return g;
    });
  }

  // Груз 100 г: латунный цилиндр с крючком (вид сбоку)
  function weight(d, x, y) {
    const { w, h } = WEIGHT;
    return s('g', {}, [
      s('path', { d: `M${x + w / 2 - 5} ${y - 1} a 5 5 0 1 1 10 0`, fill: 'none', stroke: '#8a5a06', 'stroke-width': 2.2 }),
      s('rect', { x, y, width: w, height: h, rx: 3, fill: d.lin([[0, '#a16207'], [0.35, '#fde68a'], [0.6, '#d99a1c'], [1, '#854d0e']]), stroke: '#713f12', 'stroke-width': 1 }),
      s('rect', { x, y: y + 6, width: w, height: 1.5, fill: '#713f12', 'fill-opacity': 0.5 }),
      s('rect', { x, y: y + h - 7, width: w, height: 1.5, fill: '#713f12', 'fill-opacity': 0.4 }),
    ]);
  }

  // Полка с запасными грузами: щелчок по грузу кладёт его на брусок
  function buildShelf(svg, d) {
    svg.append(
      s('path', { d: `M${SHELF.x + 24} ${SHELF.y + 8} v22 l18 -22 Z M${SHELF.x + SHELF.w - 24} ${SHELF.y + 8} v22 l-18 -22 Z`, fill: '#64748b' }),
      floorShadow(SHELF.x + SHELF.w / 2, SHELF.y + 1, 80, d, 4),
      s('rect', { x: SHELF.x, y: SHELF.y, width: SHELF.w, height: 9, rx: 2, fill: d.lin([[0, '#c4a47a'], [1, '#8a6a43']], 'v') }),
      text(SHELF.x + SHELF.w / 2, SHELF.y + 40, tr('грузы по 100 г'), { size: 13, weight: 600, fill: '#334155' }),
    );
    shelfWeights = [];
    for (let i = 0; i < SLOTS; i++) {
      // Справа налево: первым берут крайний правый груз, ближайший к бруску
      const g = weight(d, SHELF.x + 170 - i * 48, SHELF.y - WEIGHT.h);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('m', params.m + 100);
      });
      touchTarget(g, 8);
      shelfWeights.push(g);
      svg.append(g);
    }
  }

  // Деревянный брусок с ушком для нити спереди; грузы стоят на его верхней грани
  function buildBlock(d) {
    blockBody = s('rect', { x: BX0, width: LEN, rx: 3, fill: d.lin([[0, '#b98a52'], [0.18, '#d6ad74'], [0.45, '#dcb57e'], [0.52, '#c7995f'], [0.85, '#be8f57'], [1, '#a97a45']]), stroke: '#6b4f33', 'stroke-width': 1.2 });
    blockShine = s('rect', { x: BX0 + 3, width: LEN - 6, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.35 });
    blockGrain = s('g', { fill: 'none', stroke: '#7d5f3f', 'stroke-opacity': 0.35, 'stroke-width': 1 });
    for (let k = 0; k < 5; k++) {
      const y = 9 + k * 13;
      blockGrain.append(s('path', { d: `M${BX0 + 4} ${y} C ${BX0 + 40} ${y - 3}, ${BX0 + 80} ${y + 3}, ${BX0 + LEN - 4} ${y}` }));
    }
    eye = s('circle', { cx: BX0 + LEN + 4, r: 4, fill: 'none', stroke: '#475569', 'stroke-width': 2 });
    blockWeights = [];
    for (let i = 0; i < SLOTS; i++) {
      // Груз рисуется относительно верхней грани бруска (смещение по y задаётся в кадре)
      const g = weight(d, BX0 + 3 + i * 37, -WEIGHT.h);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        // Снимают верхний по порядку груз — тот, что положили последним
        set('m', params.m - 100);
      });
      blockWeights.push(g);
    }
    const body = s('g', {}, [floorShadow(BX0 + LEN / 2, BOARD_TOP, 82, d, 4), blockBody, blockGrain, blockShine, eye]);
    body.style.cursor = 'pointer';
    body.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      // Щелчок ставит брусок на другую грань; если опыт уже шёл, брусок протянут заново (см. frame)
      set('side', params.side ? 0 : 1);
    });
    touchTarget(body, 14);
    return s('g', {}, [body, ...blockWeights]);
  }

  // Динамометр: крючок, тяга, корпус-планка со шкалой 0…5 Н, пружина в прорези и красный указатель.
  // Начало координат — крючок; корпус уезжает вправо на растяжение пружины (задаётся в кадре).
  function buildDyno(d) {
    const rod = s('rect', { x: 3, y: -1.5, width: POINTER_X - 3, height: 3, fill: '#94a3b8' });
    spring = s('path', { fill: 'none', stroke: '#475569', 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
    const pointer = s('path', { d: `M${POINTER_X} -14 V7`, stroke: '#dc2626', 'stroke-width': 3.5, 'stroke-linecap': 'round' });
    const plate = s('g');
    const scale = s('g');
    for (let i = 0; i <= 10; i++) {
      const x = ZERO - (i / 2) * K;
      scale.append(s('line', { x1: x, x2: x, y1: i % 2 ? -10 : -14, y2: -6, stroke: '#334155', 'stroke-width': i % 2 ? 0.9 : 1.6 }));
      if (i % 2 === 0) scale.append(text(x, -23, String(i / 2), { size: 15, weight: 600, fill: '#334155' }));
    }
    scale.append(text(ZERO + 16, -23, 'Н', { size: 15, weight: 700, fill: '#334155' }));
    plate.append(
      s('rect', { x: 0, y: -32, width: BODY_W, height: 48, rx: 7, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('rect', { x: 6, y: -5, width: BODY_W - 12, height: 10, rx: 4, fill: '#cbd5e1' }),
      scale,
      s('rect', { x: BODY_W - 8, y: -12, width: 10, height: 24, rx: 2, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
      // блик на прозрачном корпусе
      s('rect', { x: 8, y: 10, width: BODY_W - 18, height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.8 }),
    );
    const plateG = s('g', {}, [plate]);
    const hook = s('path', { d: 'M3 0 C 3 -7, -6 -7, -6 0 C -6 5, -1 6, 1 4', fill: 'none', stroke: '#475569', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    plateBody = plateG;
    return s('g', {}, [hook, rod, plateG, spring, pointer]);
  }

  // Зигзаг пружины в прорези корпуса между указателем и правым креплением
  function springPath(x1, x2) {
    const n = 12;
    let dd = `M${x1.toFixed(1)} 0`;
    for (let i = 1; i < n; i++) dd += ` L${(x1 + ((x2 - x1) * i) / n).toFixed(1)} ${i % 2 ? -3 : 3}`;
    return `${dd} L${x2.toFixed(1)} 0`;
  }

  // Рука, которая держит кольцо динамометра: кулак и предплечье в рукаве уходят за правый край кадра
  function buildArm(d) {
    const skin = d.lin([[0, '#f2c9a5'], [1, '#d9a27a']], 'v');
    return s('g', {}, [
      s('circle', { cx: 6, cy: 0, r: 8, fill: 'none', stroke: '#475569', 'stroke-width': 3 }),
      s('path', { d: 'M30 -6 L 420 -130', stroke: '#c58e66', 'stroke-width': 30, 'stroke-linecap': 'round' }),
      s('path', { d: 'M150 -45 L 460 -144', stroke: shade('#2563eb', -0.15), 'stroke-width': 44, 'stroke-linecap': 'round' }),
      s('path', { d: 'M150 -45 L 158 -48', stroke: '#1e3a8a', 'stroke-width': 46, 'stroke-linecap': 'butt' }),
      s('rect', { x: 8, y: -17, width: 38, height: 34, rx: 12, fill: skin, stroke: '#b07a55', 'stroke-width': 1.2 }),
      s('path', { d: 'M12 -6 H30 M12 2 H30 M12 10 H28', stroke: '#b07a55', 'stroke-width': 1.2, 'stroke-linecap': 'round' }),
      s('path', { d: 'M10 -15 C 4 -12, 4 -4, 12 -4', fill: skin, stroke: '#b07a55', 'stroke-width': 1.2 }),
    ]);
  }

  // Динамометр тянут вправо: сдвиг больше 20 единиц — опыт начинается; простой щелчок — тоже,
  // а щелчок по доехавшему бруску с динамометром возвращает его к началу
  function bindDyno(nodes) {
    for (const node of nodes) {
      node.style.cursor = 'grab';
      touchTarget(node, 16);
      node.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        node.setPointerCapture?.(e.pointerId);
        const x0 = scene.point(e).x;
        let dragged = false;
        const move = (ev) => {
          if (!dragged && scene.point(ev).x - x0 > 20) {
            dragged = true;
            if (!params.pull) set('pull', 1);
          }
        };
        const up = () => {
          node.removeEventListener('pointermove', move);
          node.removeEventListener('pointerup', up);
          node.removeEventListener('pointercancel', up);
          if (dragged) return;
          if (!params.pull) set('pull', 1);
          else if (phase === 'done') set('pull', 0);
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up);
        node.addEventListener('pointercancel', up);
      });
    }
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
