// Сцена «Закон сохранения импульса»: на столе — гладкая дорожка с пусковыми пружинами на обоих концах.
// Синяя тележка 1 стоит у левой пружины, оранжевая тележка 2 — посередине дорожки или, если ей задана
// скорость навстречу, у правой пружины. Щелчок по тележке или пружине запускает опыт (launched = 1);
// щелчок по буферу на левом торце тележки 2 меняет пластилин (неупругий удар) на стальной пружинный
// буфер (упругий удар). Над тележками — стрелки их импульсов, вверху — их сумма: она не меняется при ударе.
// Чисел на сцене нет: скорости, импульс и энергия — в панели показаний под сценой.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 430;
const RAIL_TOP = 400;
const WHEEL_R = 12;
const L = 140; // длина тележки
const BODY_Y = 338;
const BODY_H = 44;
const BUF = 12; // толщина пластилина или пружинного буфера на тележке 2
const LEFT_FACE = 72; // упор левой пусковой пружины: задний торец тележки 1 на старте
const RIGHT_FACE = 888; // упор правой пусковой пружины
const MID = 460; // где стоит неподвижная тележка 2
const PX = 300; // px на метр: скорость 1 м/с — 300 px/с, опыт длится 1–3 с, как на настоящей дорожке
const AS = 180; // px на 1 кг·м/с у стрелок импульса над тележками
const ZX = 480; // ноль шкалы суммарного импульса на стенде
const AS_TOT = 150;
const ARROW_Y = 268;
const BACK_SPEED = 650; // px/с — тележки возвращают на старт рукой, быстро
const PAUSE = 0.4; // с — пауза на старте перед повторным пуском, чтобы был виден старт
const KICK = 0.25; // с — сколько пусковой шток остаётся выдвинутым после выстрела

const BLUE = '#2563eb';
const ORANGE = '#ea580c';
const GREEN = '#16a34a';

export function conservationScene(container, params, set, { afterHit, V1 }) {
  let cart1, cart2, wheels1, wheels2, bars1, bars2, needle, plasticine, spring, attach;
  let arrow1, arrow2, label1, label2, totP1, totP2, totP, plungers;
  // Ход опыта: held — на старте, run — едут навстречу, after — после удара, back — возвращаются, pause — ждут пуска
  let phase = 'held';
  const start2 = () => (params.v2 > 0 ? RIGHT_FACE - L : MID);
  let x1 = LEFT_FACE;
  let x2 = start2();
  let w1 = 0; // текущие скорости тележек, м/с (проекции на ось x)
  let w2 = 0;
  let shown = [0, 0]; // скорости, по которым рисуют стрелки импульсов: до или сразу после удара
  let tRun = 0;
  let wait = 0;
  let squeeze = 0;
  let prevKey = keyOf();

  function keyOf() {
    return `${params.m1}|${params.m2}|${params.v2}|${params.kind}`;
  }

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Табличка с законом
      svg.append(
        s('rect', { x: 290, y: 30, width: 380, height: 54, rx: 10, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 3 }),
        text(480, 58, 'm₁v₁ + m₂v₂ = m₁u₁ + m₂u₂', { size: 22, weight: 700, fill: '#f8fafc' }),
      );

      // Сумма импульсов: стрелки p₁ и p₂ «цепочкой», под ними — их сумма
      totP1 = s('path', { fill: BLUE });
      totP2 = s('path', { fill: ORANGE });
      totP = s('path', { fill: GREEN });
      svg.append(
        s('rect', { x: 290, y: 100, width: 380, height: 104, rx: 10, fill: '#ffffff', 'fill-opacity': 0.92, stroke: '#cbd5e1', 'stroke-width': 1.5 }),
        text(480, 120, tr('Сумма импульсов p₁ + p₂'), { size: 15, weight: 700, fill: '#334155' }),
        s('line', { x1: ZX, y1: 134, x2: ZX, y2: 196, stroke: '#94a3b8', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }),
        totP1,
        totP2,
        totP,
      );

      buildTrack(svg, d);

      // Стрелки импульсов над тележками
      arrow1 = s('path', { fill: BLUE });
      arrow2 = s('path', { fill: ORANGE });
      label1 = text(0, ARROW_Y - 20, 'p₁', { size: 17, weight: 700, fill: shade(BLUE, -0.2) });
      label2 = text(0, ARROW_Y - 20, 'p₂', { size: 17, weight: 700, fill: shade(ORANGE, -0.2) });
      svg.append(arrow1, arrow2, label1, label2);

      cart2 = buildCart2(d);
      cart1 = buildCart1(d);
      svg.append(cart2, cart1);
    },

    frame(dt) {
      const key = keyOf();
      // Новые массы, скорости или буфер во время опыта: тележки возвращают на старт и запускают снова
      if (key !== prevKey) {
        prevKey = key;
        if (params.launched && phase !== 'held') phase = 'back';
      }

      if (!params.launched) {
        phase = 'held';
        home(dt);
      } else if (phase === 'held') {
        if (!home(dt)) startRun();
      } else if (phase === 'back') {
        if (!home(dt)) {
          phase = 'pause';
          wait = PAUSE;
        }
      } else if (phase === 'pause') {
        wait -= dt;
        if (wait <= 0) startRun();
      } else if (phase === 'run') {
        tRun += dt;
        x1 += w1 * PX * dt;
        x2 += w2 * PX * dt;
        if (x1 + L >= x2 - BUF) {
          // Удар длится сотые доли секунды — на экране он мгновенный: тележки в касании, скорости новые
          x1 = x2 - BUF - L;
          const { u1, u2 } = afterHit(params);
          w1 = u1;
          w2 = u2;
          shown = [u1, u2];
          phase = 'after';
          squeeze = 0.14;
        }
      } else if (phase === 'after') {
        tRun += dt;
        x1 += w1 * PX * dt;
        x2 += w2 * PX * dt;
        stops();
      }
      squeeze = Math.max(0, squeeze - dt);

      // До пуска и после возврата на старт тележки стоят — стрелок импульса нет
      const running = phase === 'run' || phase === 'after';
      const v = running ? shown : [0, 0];

      // Тележки, колёса, грузы
      cart1.setAttribute('transform', `translate(${x1.toFixed(1)} 0)`);
      cart2.setAttribute('transform', `translate(${x2.toFixed(1)} 0)`);
      const roll = (x) => `rotate(${(((x / WHEEL_R) * 180) / Math.PI).toFixed(1)})`;
      wheels1.forEach((w) => w.setAttribute('transform', roll(x1)));
      wheels2.forEach((w) => w.setAttribute('transform', roll(x2)));
      const k1 = Math.round((params.m1 - 0.2) / 0.1);
      const k2 = Math.round((params.m2 - 0.2) / 0.1);
      bars1.forEach((b, i) => b.setAttribute('opacity', i < k1 ? 1 : 0));
      bars2.forEach((b, i) => b.setAttribute('opacity', i < k2 ? 1 : 0));

      // Сцепка: игла и пластилин — для неупругого удара, стальная пружина — для упругого
      needle.setAttribute('opacity', params.kind ? 0 : 1);
      plasticine.setAttribute('opacity', params.kind ? 0 : 1);
      spring.setAttribute('opacity', params.kind ? 1 : 0);
      spring.setAttribute('transform', `scale(${squeeze > 0 && params.kind ? 0.45 : 1} 1)`);

      // Пусковые штоки выдвигаются в момент выстрела и снова взводятся
      const fired = phase === 'run' && tRun < KICK;
      plungers[0].setAttribute('transform', `translate(${fired ? 10 : 0} 0)`);
      plungers[1].setAttribute('transform', `translate(${fired && params.v2 > 0 ? -10 : 0} 0)`);

      // Импульсы тележек
      const p1 = params.m1 * v[0];
      const p2 = params.m2 * v[1];
      const c1 = x1 + L / 2;
      const c2 = x2 + L / 2;
      setArrow(arrow1, label1, c1, ARROW_Y, p1 * AS);
      setArrow(arrow2, label2, c2, ARROW_Y, p2 * AS);
      // p₂ — чуть ниже p₁ и от её конца: навстречу направленные стрелки не закрывают друг друга
      totP1.setAttribute('d', arrowPath(ZX, 144, p1 * AS_TOT, 3, 7));
      totP2.setAttribute('d', arrowPath(ZX + p1 * AS_TOT, 162, p2 * AS_TOT, 3, 7));
      totP.setAttribute('d', arrowPath(ZX, 184, (p1 + p2) * AS_TOT, 4.5, 10));
    },
  });

  // Тележки едут на старт; возвращает true, пока ещё в пути
  function home(dt) {
    const step = BACK_SPEED * dt;
    const t2 = start2();
    x1 = x1 > LEFT_FACE ? Math.max(LEFT_FACE, x1 - step) : Math.min(LEFT_FACE, x1 + step);
    x2 = x2 > t2 ? Math.max(t2, x2 - step) : Math.min(t2, x2 + step);
    // Пока тележки возвращают, они не должны проходить друг сквозь друга
    if (x1 + L > x2 - BUF) x1 = x2 - BUF - L;
    w1 = 0;
    w2 = 0;
    return x1 !== LEFT_FACE || x2 !== t2;
  }

  function startRun() {
    phase = 'run';
    tRun = 0;
    w1 = V1;
    w2 = -params.v2;
    shown = [w1, w2];
  }

  // Мягкие упоры на концах дорожки; сцепленные тележки останавливаются вместе
  function stops() {
    if (x1 < LEFT_FACE) {
      x1 = LEFT_FACE;
      w1 = 0;
      if (!params.kind) w2 = 0;
    }
    if (x2 + L > RIGHT_FACE) {
      x2 = RIGHT_FACE - L;
      w2 = 0;
      if (!params.kind) w1 = 0;
    }
    if (!params.kind) {
      // Сцепленные тележки — одно тело
      if (w1 === 0) x2 = x1 + L + BUF;
      else x1 = x2 - BUF - L;
      return;
    }
    // Тележка, догнавшая остановленную, мягко упирается в неё
    if (x1 + L > x2 - BUF) {
      if (w2 === 0) {
        x1 = x2 - BUF - L;
        w1 = 0;
      } else {
        x2 = x1 + L + BUF;
        w2 = 0;
      }
    }
  }

  // Стрелка вектора: стержень и наконечник; короткая стрелка — только наконечник
  function arrowPath(x0, y, len, half = 4, headHalf = 9) {
    if (Math.abs(len) < 1) return '';
    const dir = Math.sign(len);
    const a = Math.abs(len);
    const head = Math.min(14, a);
    const xb = x0 + dir * (a - head);
    const xt = x0 + len;
    return `M${x0.toFixed(1)} ${y - half} H${xb.toFixed(1)} V${y - headHalf} L${xt.toFixed(1)} ${y} L${xb.toFixed(1)} ${y + headHalf} V${y + half} H${x0.toFixed(1)} Z`;
  }

  function setArrow(path, label, x0, y, len) {
    path.setAttribute('d', arrowPath(x0, y, len, 3.5, 9));
    const visible = Math.abs(len) >= 1;
    label.setAttribute('opacity', visible ? 1 : 0);
    label.setAttribute('x', (x0 + len / 2).toFixed(1));
  }

  // Брусок 100 г — как в работе «Второй закон Ньютона»
  function bar(d, x, y) {
    return s('g', {}, [
      s('rect', { x, y, width: 28, height: 13, rx: 2, fill: d.lin([[0, '#e2e8f0'], [0.5, '#94a3b8'], [1, '#64748b']], 'v'), stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: x + 2, y: y + 2, width: 24, height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.6 }),
    ]);
  }

  // Общая часть тележки в своих координатах (задний торец — x = 0): корпус 0,2 кг, до 8 брусков, колёса
  function cartBody(d, color, label, wheels, bars) {
    const wheel = (cx) => {
      const spokes = s('g', {}, [
        s('line', { x1: -7, y1: 0, x2: 7, y2: 0, stroke: '#94a3b8', 'stroke-width': 2 }),
        s('line', { x1: 0, y1: -7, x2: 0, y2: 7, stroke: '#94a3b8', 'stroke-width': 2 }),
      ]);
      wheels.push(spokes);
      return s('g', { transform: `translate(${cx} ${RAIL_TOP - WHEEL_R})` }, [
        s('circle', { r: WHEEL_R, fill: d.rad([[0, '#475569'], [1, '#0f172a']], 0.4, 0.35) }),
        s('circle', { r: 8, fill: '#cbd5e1' }),
        spokes,
        s('circle', { r: 2, fill: '#334155' }),
      ]);
    };
    for (let i = 0; i < 8; i++) bars.push(bar(d, 8 + (i % 4) * 32, BODY_Y - 13 - Math.floor(i / 4) * 13));
    return [
      floorShadow(L / 2, RAIL_TOP + 1, 74, d, 4),
      // Верхний ряд брусков кладём первым, чтобы он оказался позади нижнего
      ...bars.slice(4),
      ...bars.slice(0, 4),
      s('rect', { x: 0, y: BODY_Y, width: L, height: BODY_H, rx: 5, fill: d.lin([[0, shade(color, 0.25)], [0.5, color], [1, shade(color, -0.35)]], 'v'), stroke: shade(color, -0.5), 'stroke-width': 1.2 }),
      s('rect', { x: 4, y: BODY_Y + 3, width: L - 8, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.35 }),
      s('circle', { cx: L / 2, cy: BODY_Y + 22, r: 13, fill: '#ffffff', 'fill-opacity': 0.9 }),
      text(L / 2, BODY_Y + 23, label, { size: 17, weight: 700, fill: shade(color, -0.4) }),
      wheel(28),
      wheel(L - 28),
    ];
  }

  function buildCart1(d) {
    wheels1 = [];
    bars1 = [];
    // Игла на переднем торце входит в пластилин тележки 2 — так тележки сцепляются
    needle = s('path', { d: `M${L} ${BODY_Y + 20} L${L + 10} ${BODY_Y + 22} L${L} ${BODY_Y + 24} Z`, fill: '#475569' });
    const g = s('g', {}, [
      ...cartBody(d, BLUE, '1', wheels1, bars1),
      // стальная пластина на переднем торце — по ней бьёт пружинный буфер
      s('rect', { x: L - 3, y: BODY_Y + 5, width: 3, height: BODY_H - 10, rx: 1, fill: '#94a3b8' }),
      needle,
    ]);
    clickable(g, toggleLaunch);
    return g;
  }

  function buildCart2(d) {
    wheels2 = [];
    bars2 = [];
    const body = s('g', {}, cartBody(d, ORANGE, '2', wheels2, bars2));
    clickable(body, toggleLaunch);
    const y0 = BODY_Y + 6;
    const y1 = BODY_Y + BODY_H - 6;
    plasticine = s('g', {}, [
      s('rect', { x: -BUF, y: y0, width: BUF + 2, height: y1 - y0, rx: 5, fill: d.lin([[0, '#a3e635'], [0.5, '#65a30d'], [1, '#3f6212']]), stroke: '#365314', 'stroke-width': 1 }),
      s('ellipse', { cx: -BUF / 2, cy: y0 + 6, rx: 3, ry: 2, fill: '#ffffff', 'fill-opacity': 0.35 }),
    ]);
    // Пружинный буфер: стальная лента дугой; при ударе сжимается к торцу тележки
    spring = s('path', { d: `M0 ${y0} C ${-BUF * 1.4} ${y0 + 2}, ${-BUF * 1.4} ${y1 - 2}, 0 ${y1}`, fill: 'none', stroke: '#475569', 'stroke-width': 4, 'stroke-linecap': 'round' });
    attach = s('g', {}, [
      // Невидимая зона щелчка шире самого буфера: пластилин узкий, по нему трудно попасть
      s('rect', { x: -BUF - 8, y: BODY_Y - 2, width: BUF + 22, height: BODY_H + 4, fill: 'transparent', 'pointer-events': 'all' }),
      plasticine,
      spring,
    ]);
    clickable(attach, () => set('kind', params.kind ? 0 : 1), 10);
    return s('g', {}, [body, attach]);
  }

  // Дорожка: алюминиевый профиль на ножках, пусковые пружины и датчики движения на обоих концах
  function buildTrack(svg, d) {
    svg.append(
      floorShadow(480, BENCH + 2, 440, d, 7),
      s('rect', { x: 20, y: RAIL_TOP, width: 920, height: 10, rx: 2, fill: d.lin([[0, '#f1f5f9'], [0.4, '#cbd5e1'], [1, '#64748b']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
      s('rect', { x: 20, y: RAIL_TOP + 3, width: 920, height: 1.5, fill: '#94a3b8' }),
      ...[110, 850].flatMap((x) => [
        s('rect', { x: x - 5, y: RAIL_TOP + 10, width: 10, height: BENCH - RAIL_TOP - 14, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
        s('rect', { x: x - 16, y: BENCH - 6, width: 32, height: 6, rx: 2, fill: '#334155' }),
      ]),
    );
    plungers = [launcher(svg, d, 1), launcher(svg, d, -1)];
  }

  // Пусковое устройство: корпус, сжатая пружина и шток с упором.
  // side = 1 — левый конец (толкает вправо), −1 — правый
  function launcher(svg, d, side) {
    const face = side > 0 ? LEFT_FACE : RIGHT_FACE;
    const bx = side > 0 ? 22 : RIGHT_FACE + 24;
    const coilFrom = side > 0 ? bx + 26 : face + 6;
    const coilTo = side > 0 ? face - 6 : bx;
    let coil = `M${coilFrom} ${BODY_Y + 22}`;
    for (let i = 1; i <= 6; i++) coil += ` L${coilFrom + ((coilTo - coilFrom) * i) / 6} ${BODY_Y + 22 + (i % 2 ? -7 : 7)}`;
    const plunger = s('g', {}, [
      s('rect', { x: side > 0 ? face - 6 : face, y: BODY_Y + 4, width: 6, height: BODY_H - 8, rx: 2, fill: '#1e293b' }),
    ]);
    const g = s('g', {}, [
      // по тонкой пружине трудно попасть — щелчок принимает вся область пускового устройства
      s('rect', { x: Math.min(bx, face), y: BODY_Y - 20, width: side > 0 ? face - bx : bx + 26 - face, height: RAIL_TOP - BODY_Y + 20, fill: 'transparent', 'pointer-events': 'all' }),
      // корпус пусковой пружины, закреплённый на дорожке
      s('rect', { x: bx, y: BODY_Y, width: 26, height: RAIL_TOP - BODY_Y, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v'), stroke: '#1e293b', 'stroke-width': 1 }),
      s('path', { d: coil, fill: 'none', stroke: '#b45309', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
      plunger,
    ]);
    clickable(g, toggleLaunch);
    svg.append(g);
    return plunger;
  }

  function clickable(g, fn, pad = 30) {
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      fn();
    });
    touchTarget(g, pad);
  }

  // Щелчок по тележке или пружине: на старте — запустить; после опыта — вернуть на старт
  function toggleLaunch() {
    if (!params.launched) set('launched', 1);
    else if (phase === 'after' || phase === 'run') set('launched', 0);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
