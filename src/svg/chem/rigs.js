// Установки химической сцены. Каждая рисует своё оборудование в слой parent и возвращает
// описание, с которым работает chemLab.js:
//   theme     — обстановка комнаты (kit.room)
//   vessels   — сосуды, куда наливают реактивы (у пробирок в штативе их несколько)
//   rotate    — true: каждый новый опыт — в следующем сосуде (вместо мытья)
//   heater    — { update(temperature, dt, now) } или null
//   stopper   — { set(k) } пробка, которую вынимают на время добавления реактива (0..1)
//   receiver  — { jolt(dt) } приёмник газа (вздрагивает от хлопка)
//   splint    — { home, target, angle } где лежит лучинка и куда её подносят; null — лучинки нет
//
//   beaker — стакан на плитке (свободная лаборатория)
//   hood   — то же в вытяжном шкафу (концентрированная H₂SO₄)
//   tubes  — пробирки в деревянном штативе
//   gas    — пробирка с отводом, газоотводная трубка и пробирка-приёмник
//            (receiver: 'down' — вверх дном для лёгкого H₂, 'up' — горлышком вверх для тяжёлого CO₂)
//   burner — пробирка в лапке штатива над спиртовкой, цифровой термометр

import { floorShadow, hotplate, s, text } from '../kit.js';
import { labBeaker, testTube } from './vessels.js';

const BENCH_Y = 494;

export function buildRig(name, d, parent, opts = {}) {
  const build = { beaker: beakerRig, hood: beakerRig, tubes: tubesRig, gas: gasRig, burner: burnerRig }[name] ?? beakerRig;
  return build(d, parent, { ...opts, name });
}

function beakerRig(d, parent, { name }) {
  const plate = hotplate(d, { x: 480, y: 452, w: 250 });
  const cup = labBeaker(d, { x: 480, bottom: 452, w: 200, h: 215 });
  parent.append(plate.g, cup.g);
  const hood = name === 'hood';
  return {
    theme: hood ? 'hood' : 'lab',
    vessels: [cup],
    heater: {
      update(t) {
        plate.setHeat(Math.max(0, (t - 22) / 78));
        plate.setTemp(t);
      },
    },
    // Под вытяжкой работают с концентрированной кислотой — лучинку туда не кладём
    splint: hood ? null : { home: { x: 700, y: BENCH_Y - 5 }, target: { x: 492, y: cup.top - 4 }, angle: 32 },
  };
}

function tubesRig(d, parent) {
  const xs = [390, 450, 510, 570];
  const bottom = 470;
  const wood = d.lin([[0, '#c89b68'], [1, '#a47748']], 'v');
  const woodDark = d.lin([[0, '#a47748'], [1, '#7c5530']], 'v');
  parent.append(
    floorShadow(480, BENCH_Y + 2, 170, d),
    s('rect', { x: 330, y: 474, width: 300, height: 20, rx: 4, fill: woodDark }),
    s('rect', { x: 330, y: 474, width: 300, height: 3, rx: 1.5, fill: '#d9b58a' }),
    s('rect', { x: 340, y: 382, width: 12, height: 94, rx: 3, fill: wood }),
    s('rect', { x: 608, y: 382, width: 12, height: 94, rx: 3, fill: wood }),
  );
  const tubes = xs.map((x) => testTube(d, { x, bottom, w: 42, h: 196 }));
  for (const t of tubes) parent.append(t.g);
  // Верхняя планка с гнёздами проходит перед пробирками
  const plank = s('g', {}, [
    s('rect', { x: 330, y: 378, width: 300, height: 16, rx: 4, fill: wood }),
    s('rect', { x: 330, y: 378, width: 300, height: 3, rx: 1.5, fill: '#e3c49c' }),
    ...xs.map((x) => s('ellipse', { cx: x, cy: 380, rx: 23, ry: 3, fill: '#6b4526', 'fill-opacity': 0.35 })),
  ]);
  parent.append(plank);
  return { theme: 'lab', vessels: tubes, rotate: true, heater: null, splint: null };
}

// Штатив: чугунное основание, стойка и лапки (arms: [{ y, x1, x2 }])
function stand(d, { x, top, arms }) {
  const g = s('g', {}, [
    floorShadow(x, BENCH_Y + 2, 80, d),
    s('rect', { x: x - 60, y: BENCH_Y - 10, width: 120, height: 10, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
    s('rect', { x: x - 4, y: top, width: 8, height: BENCH_Y - 10 - top, rx: 3, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
  ]);
  for (const a of arms) {
    g.append(
      s('rect', { x: Math.min(a.x1, a.x2), y: a.y - 3, width: Math.abs(a.x2 - a.x1), height: 6, rx: 3, fill: d.lin([[0, '#cbd5e1'], [1, '#64748b']], 'v') }),
      s('rect', { x: x - 9, y: a.y - 9, width: 18, height: 18, rx: 4, fill: '#334155' }),
      s('circle', { cx: x, cy: a.y, r: 3, fill: '#94a3b8' }),
    );
  }
  return g;
}

// Лапка штатива, охватывающая пробирку (рисуется поверх стекла)
function jaws(x, y, w) {
  return s('g', {}, [
    s('rect', { x: x - w / 2 - 5, y: y - 9, width: w + 10, height: 18, rx: 5, fill: '#b08968', stroke: '#7f5539', 'stroke-width': 1.5 }),
    s('rect', { x: x - w / 2 - 5, y: y - 9, width: w + 10, height: 4, rx: 2, fill: '#d6b48c' }),
  ]);
}

function gasRig(d, parent, { receiver = 'down' }) {
  const up = receiver === 'up';
  const tube = testTube(d, { x: 400, bottom: 452, w: 56, h: 228, sideArm: true });
  const rx = 650;
  parent.append(stand(d, { x: 525, top: 200, arms: [{ y: 330, x1: 400, x2: 525 }, { y: up ? 390 : 250, x1: 525, x2: rx }] }));
  parent.append(tube.g, jaws(400, 330, 56));

  // Приёмник: та же пробирка; вверх дном — повёрнута на 180°
  const recv = up
    ? testTube(d, { x: rx, bottom: 462, w: 44, h: 170 })
    : testTube(d, { x: rx, bottom: 372, w: 44, h: 186 });
  // Поворот вокруг середины (y = 279): закрытое дно оказывается вверху (y≈186), горлышко — внизу (y≈372)
  const recvWrap = s('g', {}, [up ? recv.g : s('g', { transform: `rotate(180 ${rx} 279)` }, [recv.g])]);

  // Резиновый шланг от отвода и стеклянная трубка, заведённая в приёмник до самого дна
  const a = tube.armEnd;
  const hose = up
    ? `M${a.x - 4} ${a.y + 2} C ${a.x + 40} ${a.y - 8}, ${rx - 110} 234, ${rx - 56} 234`
    : `M${a.x - 4} ${a.y + 2} C ${a.x + 60} ${a.y}, ${rx - 110} 440, ${rx - 56} 440`;
  const glass = up
    ? `M${rx - 58} 234 H${rx - 14} Q${rx} 234 ${rx} 248 V444`
    : `M${rx - 58} 440 H${rx - 14} Q${rx} 440 ${rx} 426 V206`;
  parent.append(
    s('path', { d: hose, fill: 'none', stroke: '#3f3f46', 'stroke-width': 10, 'stroke-linecap': 'round' }),
    s('path', { d: hose, fill: 'none', stroke: '#71717a', 'stroke-width': 2.5, 'stroke-linecap': 'round', transform: 'translate(0 -2.5)' }),
    recvWrap,
    s('path', { d: glass, fill: 'none', stroke: '#94a3b8', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('path', { d: glass, fill: 'none', stroke: '#f1f5f9', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    jaws(rx, up ? 390 : 250, 44),
  );

  // Резиновая пробка в горлышке реакционной пробирки
  const plug = s('g', {}, [
    s('path', { d: `M${400 - 25} ${tube.top - 14} H${400 + 25} L${400 + 21} ${tube.top + 10} H${400 - 21} Z`, fill: d.lin(['#5b3a2e', '#8a5a44', '#4a2e24']), stroke: '#3b2119', 'stroke-width': 1.5 }),
    s('rect', { x: 400 - 25, y: tube.top - 14, width: 50, height: 4, rx: 2, fill: '#a0715a' }),
  ]);
  parent.append(plug);

  let jolt = 0;
  const mouth = up ? { x: rx - 8, y: recv.top - 4 } : { x: rx - 6, y: 376 };
  return {
    theme: 'lab',
    vessels: [tube],
    heater: null,
    stopper: {
      // Пробку вынимают и отводят влево-вверх, чтобы не мешала склянке
      set(k) {
        plug.setAttribute('transform', `translate(${-70 * k} ${-46 * k}) rotate(${-25 * k} 400 ${tube.top})`);
      },
    },
    receiver: {
      kick() {
        jolt = 0.3;
      },
      update(dt) {
        if (jolt <= 0) return;
        jolt = Math.max(0, jolt - dt);
        const k = jolt * 8;
        recvWrap.setAttribute('transform', jolt ? `translate(${(Math.random() - 0.5) * k} ${(Math.random() - 0.5) * k})` : '');
      },
    },
    closedGas: true,
    splint: { home: { x: 760, y: BENCH_Y - 5 }, target: mouth, angle: up ? 38 : 28 },
  };
}

function burnerRig(d, parent) {
  const x = 480;
  const tube = testTube(d, { x, bottom: 372, w: 54, h: 172 });
  parent.append(stand(d, { x: 330, top: 200, arms: [{ y: 250, x1: 330, x2: x }] }));

  // Спиртовка: стеклянный резервуар со спиртом, металлическая трубка с фитилём
  const lamp = s('g', {}, [
    floorShadow(x, BENCH_Y + 2, 70, d),
    s('path', { d: `M${x - 52} ${BENCH_Y} Q${x - 60} ${BENCH_Y - 44} ${x - 18} ${BENCH_Y - 54} H${x + 18} Q${x + 60} ${BENCH_Y - 44} ${x + 52} ${BENCH_Y} Z`, fill: d.lin([[0, '#dbe4ef', 0.8], [0.4, '#ffffff', 0.5], [1, '#cbd5e1', 0.85]]), stroke: '#94a3b8', 'stroke-width': 2 }),
    s('path', { d: `M${x - 50} ${BENCH_Y - 2} Q${x - 54} ${BENCH_Y - 24} ${x - 40} ${BENCH_Y - 28} H${x + 40} Q${x + 54} ${BENCH_Y - 24} ${x + 50} ${BENCH_Y - 2} Z`, fill: '#bfdbfe', 'fill-opacity': 0.55 }),
    s('rect', { x: x - 38, y: BENCH_Y - 48, width: 8, height: 34, rx: 4, fill: '#ffffff', 'fill-opacity': 0.6 }),
    s('rect', { x: x - 14, y: BENCH_Y - 66, width: 28, height: 14, rx: 3, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']) }),
    s('rect', { x: x - 5, y: BENCH_Y - 76, width: 10, height: 12, rx: 2, fill: d.lin([[0, '#f5f5f4'], [1, '#d6d3d1']], 'v') }),
    s('rect', { x: x - 5, y: BENCH_Y - 78, width: 10, height: 4, rx: 2, fill: '#57534e' }),
  ]);
  // Колпачок снят и лежит рядом — спиртовку тушат, накрывая им пламя
  const cap = s('g', {}, [
    s('path', { d: `M${x + 88} ${BENCH_Y} V${BENCH_Y - 22} Q${x + 88} ${BENCH_Y - 34} ${x + 102} ${BENCH_Y - 34} Q${x + 116} ${BENCH_Y - 34} ${x + 116} ${BENCH_Y - 22} V${BENCH_Y} Z`, fill: d.lin([[0, '#dbe4ef', 0.8], [0.4, '#ffffff', 0.5], [1, '#cbd5e1', 0.85]]), stroke: '#94a3b8', 'stroke-width': 2 }),
  ]);

  const wickY = BENCH_Y - 78;
  const glow = s('ellipse', { cx: x, cy: tube.bottom - 4, rx: 38, ry: 22, fill: d.rad([[0, '#fb923c', 0.55], [1, '#fb923c', 0]], 0.5, 0.5), opacity: 0 });
  const flame = s('g', { opacity: 0 }, [
    s('path', { d: 'M0 0 C -15 -8, -13 -34, 0 -54 C 13 -34, 15 -8, 0 0 Z', fill: d.rad([[0, '#fef3c7', 0.95], [0.55, '#fbbf24', 0.8], [1, '#f97316', 0.15]], 0.5, 0.75) }),
    s('path', { d: 'M0 -2 C -6 -6, -6 -18, 0 -28 C 6 -18, 6 -6, 0 -2 Z', fill: '#93c5fd', 'fill-opacity': 0.7 }),
  ]);
  parent.append(lamp, cap, glow, flame, tube.g, jaws(x, 250, 54));

  // Цифровой термометр: щуп в пробирке, провод и табло на столе
  const probeTop = tube.top - 14; // над полкой ничего не должно торчать
  const screen = text(700, BENCH_Y - 26, '20,0', { size: 17, weight: 700, fill: '#22d3ee' });
  parent.append(
    s('path', { d: `M${x + 13} ${probeTop - 14} C ${x + 60} ${probeTop - 22}, 660 ${probeTop - 10}, 690 ${BENCH_Y - 52}`, fill: 'none', stroke: '#1f2937', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
    s('rect', { x: x + 11, y: probeTop, width: 4, height: 150, rx: 2, fill: d.lin(['#64748b', '#f1f5f9', '#64748b']) }),
    s('rect', { x: x + 8, y: probeTop - 16, width: 10, height: 20, rx: 3, fill: '#1f2937' }),
    floorShadow(700, BENCH_Y + 2, 60, d),
    s('rect', { x: 644, y: BENCH_Y - 56, width: 112, height: 56, rx: 10, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
    s('rect', { x: 654, y: BENCH_Y - 42, width: 92, height: 32, rx: 6, fill: '#0f172a' }),
    text(700, BENCH_Y - 49, 't, °C', { size: 9, weight: 600, fill: '#cbd5e1' }),
    screen,
  );

  return {
    theme: 'lab',
    vessels: [tube],
    heater: {
      // Спиртовка горит, пока раствор нужно нагревать; пламя слегка колышется
      update(t, dt, now) {
        const on = t > 20;
        flame.setAttribute('opacity', on ? 1 : 0);
        glow.setAttribute('opacity', on ? Math.min(1, 0.35 + (t - 20) / 80) : 0);
        if (on) {
          const sx = 1 + 0.05 * Math.sin(now * 17) + 0.03 * Math.sin(now * 29);
          const sy = 1 + 0.08 * Math.sin(now * 13 + 1) + 0.04 * Math.sin(now * 31);
          flame.setAttribute('transform', `translate(${x} ${wickY}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) skewX(${(3 * Math.sin(now * 7)).toFixed(2)})`);
        }
        screen.textContent = `${t.toFixed(1).replace('.', ',')}`;
        screen.setAttribute('fill', t > 60 ? '#fb7185' : '#22d3ee');
      },
    },
    splint: null,
  };
}
