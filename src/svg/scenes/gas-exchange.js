// Сцена «Спирометрия и газообмен»: одна установка — водяной спирометр. Стеклянный бак с водой,
// всплывающий колокол со шкалой в литрах и мундштук на шланге. От красного крана на колоколе
// резиновая трубка идёт в колбу с известковой водой. Табло на сцене нет: объём читают по шкале,
// а точное число — в панели показаний под сценой.
// Щелчок по мундштуку — следующий выдох (спокойный → резервный → ЖЁЛ): колокол сперва опускается
// (воздух выпущен), потом всплывает на выдохнутый объём.
// Щелчок по крану или колбе — воздух из колокола пузырится через известковую воду, и она мутнеет.

import { bubblePool, createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 456;

// Установка рисуется в своих координатах и увеличивается вокруг точки на столе, чтобы занять центр кадра
const K = 1.15;
const OX = 186;

// ── Водяной спирометр ──
const TANK = { x1: 60, x2: 250, top: 206, bottom: 444 };
const WATER_Y = 234;
const BELL = { x1: 88, x2: 222, h: 196, top0: 220 }; // top0 — верх пустого колокола
const K_BELL = 0.03; // px на 1 мл: 3,5 л поднимают колокол на 105 px
const RULER = { x1: 20, x2: 54 };
const MOUTH = { x: 318, y: 414 }; // мундштук спирометра
const VALVE_X = (BELL.x1 + BELL.x2) / 2 + 46; // кран на колоколе — правее центра, носиком вправо

// ── Колба с известковой водой ──
const FL = { x: 440, neck: 338, bottom: 446, liq: 398 };
const LIME_RUN = 5; // с: воздух из колокола пузырится через воду

const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const seg = (t, a, b) => ease((t - a) / (b - a));

// Колба Эрленмейера: узкое горло, коническое тело, скруглённое дно
function flaskPath(x) {
  const n = 13;
  const w = 50;
  const { neck, bottom } = FL;
  return `M${x - n} ${neck} V${neck + 22} L${x - w + 4} ${bottom - 8} Q${x - w} ${bottom} ${x - w + 8} ${bottom} H${x + w - 8} Q${x + w} ${bottom} ${x + w - 4} ${bottom - 8} L${x + n} ${neck + 22} V${neck}`;
}

export function gasExchangeScene(container, params, set, model) {
  const { spiroVolume, rate } = model;
  let bell, pointer, puff, hose, milky, pool;

  // Номер текущего выдоха и время с его начала; при открытии уже выполненный выдох не повторяем
  let shownExhale = params.exhale;
  let mt = params.exhale ? 99 : 0;
  let bellV = spiroVolume(params);

  // Известковая вода: время опыта; при открытии уже проведённый опыт показываем сразу
  let lt = params.lime ? LIME_RUN : -1;
  let shownLime = params.lime;
  let bubbleAcc = 0;
  // Мутнеет только от выдыхаемого воздуха: если колокол был пуст, вода остаётся прозрачной
  let cloud = params.lime && params.exhale ? 1 : 0;
  let cloudTarget = cloud;

  const bellTop = (v) => BELL.top0 - v * K_BELL;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);
      const rig = s('g', { transform: `translate(${OX} ${BENCH}) scale(${K}) translate(0 ${-BENCH})` });
      svg.append(rig);

      // ── Спирометр: подставка, бак, вода ──
      const tankW = TANK.x2 - TANK.x1;
      const tankH = TANK.bottom - TANK.top;
      rig.append(
        floorShadow((TANK.x1 + TANK.x2) / 2, BENCH + 2, 120, d, 10),
        s('rect', { x: TANK.x1 - 10, y: TANK.bottom, width: tankW + 20, height: BENCH - TANK.bottom, rx: 3, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
        s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 8, fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        s('rect', { x: TANK.x1 + 2, y: WATER_Y, width: tankW - 4, height: TANK.bottom - WATER_Y - 2, rx: 6, fill: '#bfdbfe', 'fill-opacity': 0.5 }),
        // Трубка от мундштука проходит через дно бака внутрь колокола, выше уровня воды
        s('rect', { x: 150, y: WATER_Y - 12, width: 10, height: TANK.bottom - WATER_Y + 12, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
      );

      // Колокол: лёгкий цилиндр из оргстекла, всплывает, когда в него выдыхают; кран на нём щёлкаемый
      const bw = BELL.x2 - BELL.x1;
      const valve = s('g', {}, [
        s('rect', { x: VALVE_X - 4, y: -16, width: 8, height: 16, fill: d.lin(['#475569', '#cbd5e1', '#475569']) }),
        s('rect', { x: VALVE_X - 4, y: -15, width: 22, height: 6, rx: 2, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'v') }),
        s('rect', { x: VALVE_X - 9, y: -24, width: 18, height: 7, rx: 2, fill: '#dc2626' }),
      ]);
      bell = s('g', {}, [
        s('rect', { x: BELL.x1, y: 0, width: bw, height: BELL.h, rx: 6, fill: d.lin([[0, '#cbd5e1'], [0.25, '#f8fafc'], [0.6, '#e2e8f0'], [1, '#94a3b8']]), stroke: '#64748b', 'stroke-width': 1.5 }),
        s('rect', { x: BELL.x1 - 3, y: -4, width: bw + 6, height: 10, rx: 4, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1 }),
        s('rect', { x: BELL.x1 + 12, y: 12, width: 8, height: BELL.h - 30, rx: 4, fill: '#ffffff', 'fill-opacity': 0.7 }),
        valve,
      ]);
      rig.append(bell);
      // Вода впереди колокола: погружённая часть видна сквозь воду, чуть голубее
      const waterClip = `water${uid}`;
      defs.append(s('clipPath', { id: waterClip }, [s('rect', { x: TANK.x1, y: WATER_Y, width: tankW, height: TANK.bottom - WATER_Y, rx: 6 })]));
      rig.append(
        s('rect', { x: TANK.x1, y: WATER_Y, width: tankW, height: TANK.bottom - WATER_Y, fill: '#93c5fd', 'fill-opacity': 0.32, 'clip-path': `url(#${waterClip})` }),
        s('line', { x1: TANK.x1 + 3, x2: TANK.x2 - 3, y1: WATER_Y, y2: WATER_Y, stroke: '#ffffff', 'stroke-opacity': 0.9, 'stroke-width': 2 }),
        s('rect', { x: TANK.x1, y: TANK.top, width: tankW, height: tankH, rx: 8, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2.5 }),
      );

      // Шкала на стойке слева: 0…4 л, деления через 0,5 л; указатель — стрелка от колокола
      rig.append(
        s('rect', { x: RULER.x1 - 2, y: 92, width: RULER.x2 - RULER.x1 + 4, height: TANK.bottom - 92, rx: 4, fill: d.lin(['#64748b', '#cbd5e1', '#64748b']) }),
        s('rect', { x: RULER.x1, y: 96, width: RULER.x2 - RULER.x1, height: 134, rx: 3, fill: '#fffbeb', stroke: '#d6c7a1', 'stroke-width': 1 }),
        text((RULER.x1 + RULER.x2) / 2, 82, 'л', { size: 14, weight: 700, fill: '#475569' }),
      );
      for (let v = 0; v <= 4000; v += 500) {
        const y = bellTop(v);
        const major = v % 1000 === 0;
        rig.append(s('line', { x1: RULER.x2 - (major ? 12 : 7), x2: RULER.x2, y1: y, y2: y, stroke: '#78350f', 'stroke-width': major ? 1.6 : 1 }));
        if (major) rig.append(text(RULER.x1 + 11, y, String(v / 1000), { size: 13, weight: 700, fill: '#78350f' }));
      }
      pointer = s('g', {}, [
        s('line', { x1: RULER.x2 + 2, x2: BELL.x1 - 2, y1: 0, y2: 0, stroke: '#475569', 'stroke-width': 2 }),
        s('path', { d: `M${RULER.x2 + 1} 0 l 9 -5 v 10 Z`, fill: '#dc2626' }),
      ]);
      rig.append(pointer);

      // Шланг с мундштуком: выходит из подставки под баком
      const mouthHose = `M${TANK.x2 + 8} ${TANK.bottom + 4} C ${TANK.x2 + 50} ${BENCH + 4}, ${MOUTH.x - 30} ${MOUTH.y + 40}, ${MOUTH.x - 6} ${MOUTH.y + 12}`;
      puff = s('path', { d: mouthHose, fill: 'none', stroke: '#e0f2fe', 'stroke-width': 3, 'stroke-dasharray': '6 10', opacity: 0, 'pointer-events': 'none' });
      const mouthpiece = s('g', {}, [
        s('path', { d: mouthHose, fill: 'none', stroke: '#334155', 'stroke-width': 11, 'stroke-linecap': 'round' }),
        s('path', { d: mouthHose, fill: 'none', stroke: '#64748b', 'stroke-width': 7, 'stroke-dasharray': '2 3' }),
        s('g', { transform: `rotate(-35 ${MOUTH.x} ${MOUTH.y})` }, [
          s('rect', { x: MOUTH.x - 9, y: MOUTH.y - 6, width: 18, height: 26, rx: 4, fill: d.lin(['#94a3b8', '#f1f5f9', '#94a3b8']), stroke: '#64748b', 'stroke-width': 1 }),
          s('rect', { x: MOUTH.x - 15, y: MOUTH.y - 22, width: 30, height: 18, rx: 8, fill: d.lin(['#cbd5e1', '#ffffff', '#cbd5e1']), stroke: '#64748b', 'stroke-width': 1.2 }),
          s('rect', { x: MOUTH.x - 9, y: MOUTH.y - 18, width: 18, height: 5, rx: 2.5, fill: '#334155' }),
        ]),
      ]);
      mouthpiece.style.cursor = 'pointer';
      mouthpiece.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        // Выдохи идут по порядку измерений; после ЖЁЛ — снова спокойный
        set('exhale', params.exhale >= 3 ? 1 : params.exhale + 1);
      });
      touchTarget(mouthpiece, 16);
      rig.append(mouthpiece, puff);

      // ── Колба с известковой водой: трубка от крана опущена под воду ──
      const clip = `fl${uid}`;
      defs.append(s('clipPath', { id: clip }, [s('path', { d: flaskPath(FL.x) })]));
      const content = s('g', { 'clip-path': `url(#${clip})` }, [
        s('rect', { x: FL.x - 50, y: FL.liq, width: 100, height: FL.bottom - FL.liq, fill: '#bfdbfe', 'fill-opacity': 0.35 }),
      ]);
      pool = bubblePool(content, 14, { color: '#ffffff' });
      // Взвесь мела CaCO₃ поверх трубки: на светлом фоне белая муть почти не видна — даём серовато-голубой низ и осадок
      milky = s('g', { 'clip-path': `url(#${clip})`, opacity: cloud, 'pointer-events': 'none' }, [
        s('rect', { x: FL.x - 50, y: FL.liq, width: 100, height: FL.bottom - FL.liq, fill: d.lin([[0, '#f8fafc', 0.96], [1, '#cbd5e1', 0.98]], 'v') }),
        s('ellipse', { cx: FL.x, cy: FL.bottom - 3, rx: 46, ry: 8, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1 }),
      ]);
      hose = s('path', { fill: 'none', stroke: '#7f1d1d', 'stroke-width': 6, 'stroke-linecap': 'round', 'pointer-events': 'none' });
      const glassTube = `M${FL.x} ${FL.neck - 20} V${FL.bottom - 14}`;
      const flask = s('g', {}, [
        floorShadow(FL.x, FL.bottom + 3, 54, d),
        s('path', { d: flaskPath(FL.x), fill: d.lin([[0, '#dbe4ef', 0.5], [0.5, '#f1f5f9', 0.2], [1, '#cbd5e1', 0.55]]) }),
        content,
        s('line', { x1: FL.x - 44, x2: FL.x + 44, y1: FL.liq, y2: FL.liq, stroke: '#ffffff', 'stroke-width': 1.5, 'clip-path': `url(#${clip})` }),
        s('path', { d: glassTube, stroke: '#94a3b8', 'stroke-width': 6, 'stroke-linecap': 'round' }),
        s('path', { d: glassTube, stroke: '#f1f5f9', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        milky,
        s('path', { d: flaskPath(FL.x), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('path', { d: `M${FL.x - 16} ${FL.neck - 12} H${FL.x + 16} L${FL.x + 13} ${FL.neck + 6} H${FL.x - 13} Z`, fill: d.lin(['#7f1d1d', '#b91c1c', '#7f1d1d']) }),
      ]);
      rig.append(hose, flask);
      svg.append(text(OX + K * FL.x, BENCH + 34, tr('Известковая вода'), { size: 15, weight: 700, fill: '#1f2937' }));

      const runLime = (e) => {
        e.stopPropagation();
        // Повторный щелчок снова пропускает воздух; помутневшая вода уже не просветлеет
        if (params.lime) {
          lt = 0;
          if (params.exhale) cloudTarget = 1;
        } else set('lime', 1);
      };
      for (const el of [valve, flask]) {
        el.style.cursor = 'pointer';
        el.addEventListener('pointerdown', runLime);
        touchTarget(el, 14);
      }
    },

    frame(dt) {
      // ── Новый выдох в спирометр: колокол опускается, потом всплывает на выдохнутый объём ──
      if (params.exhale !== shownExhale) {
        shownExhale = params.exhale;
        mt = 0;
      }
      mt += dt;
      const target = spiroVolume(params);
      let fill = 1;
      if (shownExhale === 1) fill = seg(mt, 0.4, 0.4 + 30 / rate(params));
      else if (shownExhale === 2) fill = seg(mt, 0.4, 2.0);
      else if (shownExhale === 3) fill = seg(mt, 0.4, 2.4);
      bellV = mt < 0.4 ? bellV * (1 - Math.min(1, dt * 8)) : target * fill;
      const top = bellTop(bellV);
      bell.setAttribute('transform', `translate(0 ${top.toFixed(1)})`);
      pointer.setAttribute('transform', `translate(0 ${(top + 2).toFixed(1)})`);
      puff.setAttribute('opacity', shownExhale && mt > 0.4 && fill < 1 ? 0.9 : 0);
      puff.setAttribute('stroke-dashoffset', ((mt * 60) % 16).toFixed(1));

      // Резиновая трубка от крана, который ездит вместе с колоколом, к горлу колбы
      const vx = VALVE_X + 18;
      const vy = (top - 12).toFixed(1);
      hose.setAttribute('d', `M${vx} ${vy} C ${vx + 90} ${vy}, ${FL.x} ${FL.neck - 120}, ${FL.x} ${FL.neck - 18}`);

      // ── Известковая вода ──
      if (params.lime !== shownLime) {
        shownLime = params.lime;
        lt = params.lime ? 0 : -1;
        cloud = 0;
        cloudTarget = params.lime && params.exhale ? 1 : 0;
      }
      if (lt >= 0 && lt < LIME_RUN) {
        lt += dt;
        bubbleAcc += dt * 22;
        while (bubbleAcc >= 1 && lt < LIME_RUN - 0.6) {
          bubbleAcc -= 1;
          pool.spawn(FL.x + (Math.random() - 0.5) * 6, FL.bottom - 14, 2.5 + Math.random() * 2.5);
        }
        if (lt > 0.6) cloud += (cloudTarget - cloud) * Math.min(1, dt * 1.2);
      }
      pool.update(dt, FL.liq + 2, 0.3);
      milky.setAttribute('opacity', cloud.toFixed(3));
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}
