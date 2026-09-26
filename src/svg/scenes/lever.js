// Сцена «Рычаг»: лабораторный рычаг на штативе у стенда физкабинета. К плечам подвешены
// подвесы для грузов; на столе стоит набор гирь по 100 г. Ученик переносит гири мышью
// из набора на подвесы (и обратно, и с подвеса на подвес) — масса на подвесе равна числу гирь.
// Сам подвес можно сдвигать вдоль плеча. Наклон балки задаётся разницей моментов сил.

import { createScene, cylinderShade, draggable, floorShadow, room, s, shade } from '../kit.js';

const BENCH_Y = 460;
const MAX_ARM = 50; // см — соответствует диапазону контролов l1/l2
const HALF = 320; // px — длина полуплеча на экране, когда l = MAX_ARM
const CX = 470;
const BEAM_Y = 170;
const PIECE = 0.1; // кг — масса одной гири
const MAX_ON_HOOK = 20; // до 2 кг на подвесе
const TOTAL = 40; // гирь в наборе: хватает, чтобы нагрузить оба подвеса до предела
const DISC = { w: 40, h: 7 };
const HOOK = 12; // крючок подвеса
const HANGER = 150; // стержень подвеса: на нём помещаются все 20 гирь
const PEGS = [855, 905]; // стержни подставки набора на столе
const PEG_TOP = BENCH_Y - 12 - MAX_ON_HOOK * DISC.h - 8;

export function leverScene(container, params, set, { moment }) {
  let beamGroup, flying;
  const hangers = {};
  const tray = [[], []];
  let angle = 0;
  // Гиря в руке ученика: откуда взята и где сейчас; returning — летит обратно в набор
  const hand = { active: false, from: null, x: 0, y: 0, dx: 0, dy: 0, returning: false, tx: 0, ty: 0 };

  const count = (id) => Math.round(params[id === 'l1' ? 'm1' : 'm2'] / PIECE);
  const massId = (id) => (id === 'l1' ? 'm1' : 'm2');

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH_Y, theme: 'stand' });

      // Штатив рычага: основание, стойка, ось вращения
      svg.append(
        floorShadow(CX, BENCH_Y + 6, 100, d),
        s('rect', { x: CX - 90, y: BENCH_Y - 14, width: 180, height: 14, rx: 4, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
        s('rect', { x: CX - 7, y: BEAM_Y, width: 14, height: BENCH_Y - 14 - BEAM_Y, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
        s('rect', { x: CX - 16, y: BEAM_Y + 18, width: 32, height: 22, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        // неподвижная вертикаль-ориентир над опорой — по ней видно отклонение балки от горизонтали
        s('line', { x1: CX, y1: BEAM_Y - 70, x2: CX, y2: BEAM_Y - 16, stroke: '#94a3b8', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }),
      );

      // Балка с делениями рисуется один раз, дальше только поворачивается целиком
      beamGroup = s('g');
      beamGroup.append(s('rect', { x: -HALF - 10, y: -8, width: HALF * 2 + 20, height: 16, rx: 5, fill: cylinderShade(d, '#c68a4e') }));
      for (let i = -10; i <= 10; i++) {
        const x = (i / 10) * HALF;
        beamGroup.append(s('rect', { x: x - 1, y: -8, width: 2, height: i % 5 === 0 ? 10 : 5, fill: '#7c4a1e' }));
      }
      beamGroup.append(s('circle', { cx: 0, cy: 0, r: 6, fill: d.rad(['#e2e8f0', '#475569']) }));
      svg.append(beamGroup);

      // Подставка набора гирь на столе: основание и два стержня
      svg.append(
        floorShadow((PEGS[0] + PEGS[1]) / 2, BENCH_Y + 5, 70, d),
        s('rect', { x: PEGS[0] - 32, y: BENCH_Y - 12, width: PEGS[1] - PEGS[0] + 64, height: 12, rx: 3, fill: d.lin([[0, '#9c7b55'], [1, '#6b4f33']], 'v') }),
        ...PEGS.map((px) => s('rect', { x: px - 2, y: PEG_TOP, width: 4, height: BENCH_Y - 12 - PEG_TOP, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) })),
      );
      const trayG = s('g');
      for (let p = 0; p < 2; p++) {
        for (let k = 0; k < MAX_ON_HOOK; k++) {
          const disc = weightDisc(d, PEGS[p], BENCH_Y - 12 - (k + 1) * DISC.h);
          tray[p].push(disc);
          trayG.append(disc);
        }
      }
      svg.append(trayG);

      // Подвесы: крючок, стержень, нижняя тарелка и гири на ней (лишние скрыты)
      for (const id of ['l1', 'l2']) {
        const rod = s('path', { fill: 'none', stroke: '#475569', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
        const plate = s('rect', { width: DISC.w + 6, height: 4, rx: 2, fill: '#334155' });
        const stack = Array.from({ length: MAX_ON_HOOK }, () => weightDisc(d, 0, 0));
        const stackG = s('g', {}, stack);
        // широкая невидимая зона стержня — за неё подвес двигают вдоль плеча
        const grip = s('rect', { width: 26, height: HOOK + HANGER, fill: '#ffffff', 'fill-opacity': 0 });
        const g = s('g', {}, [rod, grip, plate, stackG]);
        svg.append(g);
        hangers[id] = { g, rod, plate, stack, stackG, grip, ax: 0, ay: 0 };
      }

      // Гиря, которую ученик несёт в руке (одна на всю сцену)
      flying = weightDisc(d, 0, 0);
      flying.setAttribute('opacity', 0);
      flying.setAttribute('pointer-events', 'none');
      svg.append(flying);
    },

    frame(dt) {
      const M1 = moment(params.m1, params.l1);
      const M2 = moment(params.m2, params.l2);
      const target = Math.max(-0.22, Math.min(0.22, (M2 - M1) * 0.25));
      angle += (target - angle) * Math.min(1, dt * 3);
      beamGroup.setAttribute('transform', `translate(${CX} ${BEAM_Y}) rotate(${(angle * 180) / Math.PI})`);

      for (const [id, side, l] of [['l1', -1, params.l1], ['l2', 1, params.l2]]) {
        const h = hangers[id];
        const dx = side * (l / MAX_ARM) * HALF;
        // Точка подвеса — нижняя грань балки на повёрнутом плече
        const ax = CX + dx * Math.cos(angle) - 8 * Math.sin(angle);
        const ay = BEAM_Y + dx * Math.sin(angle) + 8 * Math.cos(angle);
        h.ax = ax;
        h.ay = ay;
        const bottom = ay + HOOK + HANGER;
        h.rod.setAttribute('d', `M${ax + 4} ${ay - 2} Q${ax + 6} ${ay + 8} ${ax} ${ay + HOOK} V${bottom}`);
        h.grip.setAttribute('x', ax - 13);
        h.grip.setAttribute('y', ay);
        h.plate.setAttribute('x', ax - DISC.w / 2 - 3);
        h.plate.setAttribute('y', bottom);
        // Гиря, которую ученик снял с этого подвеса, уже в руке — на подвесе её не рисуем
        const n = count(id) - (hand.active && !hand.returning && hand.from === id ? 1 : 0);
        h.stack.forEach((disc, k) => {
          disc.setAttribute('transform', `translate(${ax.toFixed(1)} ${(bottom - (k + 1) * DISC.h).toFixed(1)})`);
          disc.setAttribute('opacity', k < n ? 1 : 0);
          disc.setAttribute('pointer-events', k < n ? 'auto' : 'none');
        });
      }

      // Набор: сколько гирь осталось на подставке (раскладываем по двум стержням)
      const inHand = hand.active && hand.from === 'tray' ? 1 : 0;
      const left = Math.max(0, TOTAL - count('l1') - count('l2') - inHand);
      const onPeg = [Math.min(MAX_ON_HOOK, Math.ceil(left / 2)), Math.floor(left / 2)];
      tray.forEach((list, p) => list.forEach((disc, k) => {
        disc.setAttribute('opacity', k < onPeg[p] ? 1 : 0);
        disc.setAttribute('pointer-events', k < onPeg[p] ? 'auto' : 'none');
      }));

      if (hand.returning) {
        const k = Math.min(1, dt * 9);
        hand.x += (hand.tx - hand.x) * k;
        hand.y += (hand.ty - hand.y) * k;
        if (Math.hypot(hand.tx - hand.x, hand.ty - hand.y) < 2) {
          hand.active = false;
          hand.returning = false;
        }
      }
      flying.setAttribute('opacity', hand.active ? 1 : 0);
      flying.setAttribute('transform', `translate(${hand.x.toFixed(1)} ${hand.y.toFixed(1)})`);
    },
  });

  // Гиря 100 г: разрезной цилиндр-«шайба» со щелью для стержня; координаты — центр по оси, верх
  function weightDisc(d, x, y) {
    return s('g', { transform: `translate(${x} ${y})` }, [
      s('rect', { x: -DISC.w / 2, y: 0, width: DISC.w, height: DISC.h - 0.6, rx: 2, fill: cylinderShade(d, '#8a8f98'), stroke: shade('#8a8f98', -0.45), 'stroke-width': 0.6 }),
      s('rect', { x: -1.5, y: 0, width: 3, height: DISC.h - 0.6, fill: '#334155', 'fill-opacity': 0.7 }),
    ]);
  }

  // Куда упала гиря: на подвес, если отпущена рядом с его стержнем
  function dropTarget(x, y) {
    for (const id of ['l1', 'l2']) {
      const h = hangers[id];
      if (Math.abs(x - h.ax) < 45 && y > h.ay - 20 && y < h.ay + HOOK + HANGER + 30) return id;
    }
    return null;
  }

  // Место на подставке, куда встанет возвращаемая гиря (раскладка — как в кадре)
  function trayTarget() {
    const left = Math.max(0, TOTAL - count('l1') - count('l2') - 1);
    const p = left % 2 ? 1 : 0;
    const n = (p === 0 ? Math.ceil(left / 2) : Math.floor(left / 2)) + 1;
    return { tx: PEGS[p], ty: BENCH_Y - 12 - Math.min(MAX_ON_HOOK, n) * DISC.h };
  }

  function takeFrom(from, x, y) {
    if (hand.active) return false;
    if (from !== 'tray' && count(from) <= 1) return false; // на подвесе остаётся хотя бы одна гиря
    if (from === 'tray' && TOTAL - count('l1') - count('l2') <= 0) return false;
    Object.assign(hand, { active: true, returning: false, from, x, y: y - DISC.h / 2 });
    return true;
  }

  function drop(x, y) {
    if (!hand.active || hand.returning) return;
    const to = dropTarget(x, y);
    const from = hand.from;
    if (to && to !== from && count(to) >= MAX_ON_HOOK) {
      // Подвес полон: гиря возвращается туда, откуда её взяли
      if (from === 'tray') Object.assign(hand, { returning: true, ...trayTarget() });
      else hand.active = false;
      return;
    }
    if (to && to !== from) {
      // Сначала снимаем гирю с исходного подвеса, потом кладём на новый — масса считается по числу гирь
      if (from !== 'tray') set(massId(from), (count(from) - 1) * PIECE);
      set(massId(to), (count(to) + 1) * PIECE);
      hand.active = false;
      return;
    }
    if (to === from) {
      hand.active = false; // вернули на тот же подвес
      return;
    }
    // Мимо подвеса: гиря возвращается в набор
    if (from !== 'tray') set(massId(from), (count(from) - 1) * PIECE);
    Object.assign(hand, { returning: true, from: 'tray', ...trayTarget() });
  }

  const carry = (from) => ({
    onDrag(x, y) {
      if (!hand.active && !hand.returning) {
        if (!takeFrom(from, x, y)) return;
      }
      if (hand.returning) return;
      hand.x = x;
      hand.y = y - DISC.h / 2;
    },
    onEnd() {
      if (hand.active && !hand.returning && hand.from === from) drop(hand.x, hand.y + DISC.h / 2);
    },
  });

  const trayG = tray[0][0].parentNode;
  draggable(scene, trayG, carry('tray'));
  for (const [id, side] of [['l1', -1], ['l2', 1]]) {
    const h = hangers[id];
    draggable(scene, h.stackG, carry(id));
    // Подвес без гирь (за стержень) двигается вдоль плеча
    draggable(scene, h.grip, {
      onDrag: (x) => set(id, Math.max(5, Math.min(MAX_ARM, side * ((x - CX) / HALF) * MAX_ARM))),
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
