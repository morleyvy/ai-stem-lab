// Сцена «Время реакции»: крупно — линейка длиной 50 см и две руки. Сверху рука партнёра держит линейку
// за верхний конец, снизу рука ученика лежит на краю парты, нулевая отметка — между большим и указательным
// пальцами. Щелчок по руке партнёра или по линейке — партнёр разжимает пальцы, линейка падает, ученик ловит
// её; падение показано замедленно в 5 раз. Слева — маленькая схема рефлекторной дуги
// «рецептор → мозг → мышца»: во время падения по ней бежит нервный импульс. Фигуры человека нет нарочно —
// для опыта важны только руки и линейка, а целая фигура с органами «на просвет» отвлекает и пугает.

import { createScene, s, shade, text, touchTarget, W } from '../kit.js';
import { tr } from '../../i18n.js';

const PX = 6; // px на 1 см
const RX = 480; // ось линейки
const RW = 44;
const FY = 372; // уровень пальцев ученика: здесь нулевая отметка до падения
const DESK_TOP = 388;
const SLOW = 5; // во столько раз замедлено падение: настоящие 0,2 с глаз не успел бы разглядеть
// Руки нарисованы в своих координатах и сдвинуты к линейке целиком
const PARTNER_SHIFT = [RX - 440, 38];
const STUDENT_SHIFT = [RX - 440, FY - 284];
const PROBLEMS = ['47 − 18 = ?', '6 · 7 = ?', '93 − 25 = ?', '8 · 9 = ?'];

// Схема рефлекторной дуги: три узла в рамке слева внизу
const CARD = { x: 36, y: 318, w: 372, h: 182 };
const NODE_Y = CARD.y + 100;
const NODES = [CARD.x + 66, CARD.x + CARD.w / 2, CARD.x + CARD.w - 66];
const NODE_R = 28;

const SKIN = '#f1c7a1';
const SKIN_DARK = '#d9a27a';
const SKIN_LINE = '#b98563';
const SLEEVE_STUDENT = '#27406b';
const SLEEVE_PARTNER = '#3f7a5a';
const SENSORY = '#0ea5e9';
const MOTOR = '#f59e0b';

export function nervousScene(container, params, set, { measure, G }) {
  let ruler, marker, sThumb, pThumb, pIndex, impulse, brainGlow, receptorIcons, receptorFlash, hop, thought, thoughtText, badge;

  // Ход опыта: ready — линейку держит партнёр; fall — падает; caught — поймана; lost — пролетела мимо;
  // reset — партнёр поднимает линейку обратно. pending — после возврата нужно отпустить снова.
  let phase = 'ready';
  let pending = false;
  let tau = 0; // время показа текущего падения, с (замедленное)
  let offset = 0; // на сколько px опустилась линейка
  let grip = 0; // 0 — пальцы ученика разжаты, 1 — сжаты
  let release = 0; // 0 — партнёр держит, 1 — пальцы партнёра разжаты
  let drop = null; // снимок условий текущей попытки
  let cueT = 9; // время после сигнала, с — для вспышки рецептора и «Хоп!»
  let brainK = 0;

  const key = () => `${params.signal}|${params.distract}`;
  let seenTrial = params.trial;
  let seenKey = key();

  const snapshot = () => ({ signal: params.signal, m: measure(params) });
  // Сцена открыта уже после попыток (свободный опыт после работы): показываем итог без анимации
  if (params.trial > 0) {
    drop = snapshot();
    phase = drop.m.caught ? 'caught' : 'lost';
    offset = drop.m.caught ? drop.m.h * PX : 600;
    grip = 1;
    release = 1;
  }

  const scene = createScene(container, {
    build(svg, d) {
      svg.append(
        s('rect', { x: 0, y: 0, width: W, height: 540, fill: d.lin([[0, '#f6f3ee'], [1, '#ebe5dc']], 'v') }),
        s('ellipse', { cx: 480, cy: 0, rx: 620, ry: 420, fill: d.rad([[0, '#ffffff', 0.55], [1, '#ffffff', 0]], 0.5, 0.2) }),
        // Край парты, на котором лежит предплечье ученика
        s('rect', { x: 580, y: DESK_TOP, width: W - 580, height: 22, rx: 3, fill: d.lin([[0, '#e2c799'], [1, '#c4a47a']], 'v') }),
        s('rect', { x: 586, y: DESK_TOP + 22, width: W - 586, height: 16, fill: '#9c7b55' }),
      );
      // Указательный палец ученика — за линейкой
      svg.append(s('g', { transform: `translate(${STUDENT_SHIFT})` }, [
        s('path', { d: 'M500 279 Q 470 279 438 284 Q 432 286 436 291 Q 470 293 500 293 Z', fill: SKIN_DARK, stroke: SKIN_LINE, 'stroke-width': 1 }),
      ]));
      buildRuler(svg, d);
      buildStudentHand(svg, d);
      buildPartnerHand(svg, d);
      buildArc(svg, d);
      hop = s('g', { opacity: 0 }, [
        s('path', { d: 'M562 64 H 632 Q 640 64 640 72 V 92 Q 640 100 632 100 H 572 L 550 110 L 558 98 Q 554 96 554 90 V 72 Q 554 64 562 64 Z', fill: '#ffffff', stroke: '#f97316', 'stroke-width': 2 }),
        text(597, 82.5, tr('Хоп!'), { size: 17, weight: 800, fill: '#c2410c' }),
      ]);
      badge = s('g', { opacity: 0 }, [
        s('rect', { x: 700, y: 20, width: 168, height: 28, rx: 14, fill: '#0f172a', 'fill-opacity': 0.72 }),
        text(784, 34.5, tr('Замедлено в 5 раз'), { size: 14, weight: 600, fill: '#f8fafc' }),
      ]);
      svg.append(hop, badge);
    },

    frame(dt, now) {
      watchParams();
      step(dt);
      draw(now);
    },
  });

  // ── Линейка 50 см: деления через 1 см, цифры через 5 см; ноль — у нижнего конца ──
  function buildRuler(svg, d) {
    const parts = [
      s('rect', { x: -RW / 2, y: -50 * PX - 6, width: RW, height: 50 * PX + 12, rx: 2.5, fill: d.lin([[0, '#f6dd9b'], [0.5, '#fbe9b8'], [1, '#e2c27a']]), stroke: '#b38b3c', 'stroke-width': 1 }),
    ];
    for (let cm = 0; cm <= 50; cm++) {
      const y = -cm * PX;
      const major = cm % 5 === 0;
      parts.push(s('line', { x1: -RW / 2, x2: -RW / 2 + (cm % 10 === 0 ? 15 : major ? 11 : 6), y1: y, y2: y, stroke: '#3f2d14', 'stroke-width': major ? 1.4 : 0.8 }));
      // Цифры прижаты к правому краю, чтобы не налезать на длинные штрихи слева
      if (major) parts.push(text(RW / 2 - 4, y, String(cm), { size: 14, weight: 700, fill: '#3f2d14', anchor: 'end' }));
    }
    ruler = s('g', {}, parts);
    ruler.style.cursor = 'pointer';
    marker = s('path', { d: `M${-RW / 2 - 16} -8 L ${-RW / 2 - 2} 0 L ${-RW / 2 - 16} 8 Z`, fill: '#dc2626', opacity: 0 });
    svg.append(ruler, s('g', { transform: `translate(${RX} ${FY})` }, [marker]));
    ruler.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onRelease();
    });
    touchTarget(ruler);
  }

  // ── Рука ученика: рукав справа, ладонь за краем парты, большой палец перед линейкой ──
  function buildStudentHand(svg, d) {
    sThumb = s('path', { fill: SKIN, stroke: SKIN_LINE, 'stroke-width': 1 });
    const sleeve = d.lin([[0, shade(SLEEVE_STUDENT, 0.12)], [1, shade(SLEEVE_STUDENT, -0.3)]], 'v');
    svg.append(s('g', { transform: `translate(${STUDENT_SHIFT})` }, [
      s('rect', { x: 556, y: 268, width: 500, height: 32, rx: 8, fill: sleeve }),
      s('rect', { x: 544, y: 271, width: 14, height: 28, rx: 5, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 1 }),
      s('path', { d: 'M550 272 Q 520 268 494 272 Q 480 276 482 288 Q 486 300 506 300 L 550 299 Z', fill: d.lin([[0, shade(SKIN, 0.1)], [1, SKIN_DARK]], 'v'), stroke: SKIN_LINE, 'stroke-width': 1 }),
      // согнутые средний, безымянный и мизинец
      ...[500, 514, 528].map((x) => s('path', { d: `M${x - 6} 296 Q ${x - 8} 308 ${x} 309 Q ${x + 8} 308 ${x + 6} 296`, fill: SKIN, stroke: SKIN_LINE, 'stroke-width': 1 })),
      sThumb,
    ]));
  }

  // ── Рука партнёра: рукав слева, пальцы держат верх линейки. Щелчок — партнёр отпускает ──
  function buildPartnerHand(svg, d) {
    pThumb = s('path', { fill: SKIN, stroke: SKIN_LINE, 'stroke-width': 1 });
    const hand = s('g', { transform: `translate(${PARTNER_SHIFT})` }, [
      s('rect', { x: 330, y: 20, width: 140, height: 64, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
      s('rect', { x: -80, y: 34, width: 452, height: 36, fill: d.lin([[0, shade(SLEEVE_PARTNER, 0.15)], [1, shade(SLEEVE_PARTNER, -0.3)]], 'v') }),
      s('rect', { x: 362, y: 32, width: 16, height: 40, rx: 6, fill: shade(SLEEVE_PARTNER, -0.15) }),
      s('path', { d: 'M376 38 Q 404 32 420 40 Q 430 50 422 64 Q 404 72 376 68 Z', fill: d.lin([[0, shade(SKIN, 0.1)], [1, SKIN_DARK]], 'v'), stroke: SKIN_LINE, 'stroke-width': 1 }),
      pThumb,
    ]);
    hand.style.cursor = 'pointer';
    hand.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onRelease();
    });
    touchTarget(hand);
    svg.append(hand);
    // Указательный палец партнёра — за линейкой: отдельный слой под линейкой
    pIndex = s('path', { fill: SKIN_DARK, stroke: SKIN_LINE, 'stroke-width': 1 });
    ruler.before(s('g', { transform: `translate(${PARTNER_SHIFT})` }, [pIndex]));
  }

  // ── Схема рефлекторной дуги: рецептор → мозг → мышца ──
  function buildArc(svg, d) {
    const { x, y, w, h } = CARD;
    const [xr, xb, xm] = NODES;
    const arrow = (x1, x2, color) => [
      s('line', { x1: x1 + NODE_R + 4, x2: x2 - NODE_R - 10, y1: NODE_Y, y2: NODE_Y, stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round' }),
      s('path', { d: `M${x2 - NODE_R - 12} ${NODE_Y - 6} L ${x2 - NODE_R - 3} ${NODE_Y} L ${x2 - NODE_R - 12} ${NODE_Y + 6} Z`, fill: color }),
    ];
    const disc = (cx) => s('circle', { cx, cy: NODE_Y, r: NODE_R, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 });
    receptorIcons = [eyeIcon(xr, NODE_Y), earIcon(xr, NODE_Y), palmIcon(xr, NODE_Y)];
    receptorFlash = s('circle', { cx: xr, cy: NODE_Y, r: NODE_R, fill: '#38bdf8', 'fill-opacity': 0.25, stroke: SENSORY, 'stroke-width': 2, opacity: 0 });
    brainGlow = s('circle', { cx: xb, cy: NODE_Y, r: NODE_R + 10, fill: '#fde68a', opacity: 0 });
    impulse = s('circle', { r: 7, fill: '#fef08a', stroke: '#ca8a04', 'stroke-width': 2, opacity: 0 });
    thoughtText = text(xb + 52, y + 30, PROBLEMS[0], { size: 14, weight: 700, fill: '#7c2d12' });
    thought = s('g', { opacity: 0 }, [
      s('rect', { x: xb - 2, y: y + 14, width: 108, height: 32, rx: 16, fill: '#fff7ed', stroke: '#fdba74', 'stroke-width': 1.2 }),
      s('circle', { cx: xb + 10, cy: y + 52, r: 3.5, fill: '#fff7ed', stroke: '#fdba74', 'stroke-width': 1 }),
      thoughtText,
    ]);
    svg.append(
      s('rect', { x, y, width: w, height: h, rx: 14, fill: '#ffffff', 'fill-opacity': 0.9, stroke: '#e2e8f0', 'stroke-width': 1.2, filter: d.url('soft') }),
      text(x + 18, y + 26, tr('Рефлекторная дуга'), { size: 14, weight: 700, fill: '#475569', anchor: 'start' }),
      ...arrow(xr, xb, SENSORY),
      ...arrow(xb, xm, MOTOR),
      brainGlow,
      disc(xr), disc(xb), disc(xm),
      receptorFlash,
      ...receptorIcons,
      brainIcon(xb, NODE_Y),
      muscleIcon(xm, NODE_Y),
      text(xr, NODE_Y + NODE_R + 20, tr('Рецептор'), { size: 14, weight: 600, fill: '#0369a1' }),
      text(xb, NODE_Y + NODE_R + 20, tr('Мозг'), { size: 14, weight: 600, fill: '#9d174d' }),
      text(xm, NODE_Y + NODE_R + 20, tr('Мышца'), { size: 14, weight: 600, fill: '#b45309' }),
      thought,
      impulse,
    );
  }

  function eyeIcon(cx, cy) {
    return s('g', { 'pointer-events': 'none' }, [
      s('path', { d: `M${cx - 15} ${cy} Q ${cx} ${cy - 13} ${cx + 15} ${cy} Q ${cx} ${cy + 13} ${cx - 15} ${cy} Z`, fill: '#ffffff', stroke: '#1e293b', 'stroke-width': 1.8 }),
      s('circle', { cx, cy, r: 5, fill: '#1e293b' }),
    ]);
  }
  function earIcon(cx, cy) {
    return s('g', { 'pointer-events': 'none', fill: 'none', stroke: '#1e293b', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, [
      s('path', { d: `M${cx - 7} ${cy - 3} Q ${cx - 7} ${cy - 13} ${cx + 1} ${cy - 13} Q ${cx + 9} ${cy - 13} ${cx + 9} ${cy - 4} Q ${cx + 9} ${cy + 2} ${cx + 3} ${cy + 6} Q ${cx} ${cy + 9} ${cx + 1} ${cy + 12} Q ${cx - 4} ${cy + 15} ${cx - 7} ${cy + 10}` }),
      s('path', { d: `M${cx - 2} ${cy - 3} Q ${cx - 1} ${cy - 8} ${cx + 3} ${cy - 7} Q ${cx + 5} ${cy - 5} ${cx + 2} ${cy - 1}` }),
    ]);
  }
  function palmIcon(cx, cy) {
    return s('g', { 'pointer-events': 'none', fill: '#ffffff', stroke: '#1e293b', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, [
      s('path', { d: `M${cx - 8} ${cy + 13} L ${cx - 9} ${cy - 2} L ${cx - 9} ${cy - 9} Q ${cx - 9} ${cy - 12} ${cx - 6.5} ${cy - 12} Q ${cx - 4} ${cy - 12} ${cx - 4} ${cy - 9} L ${cx - 4} ${cy - 14} Q ${cx - 4} ${cy - 17} ${cx - 1.5} ${cy - 17} Q ${cx + 1} ${cy - 17} ${cx + 1} ${cy - 14} L ${cx + 1} ${cy - 12} Q ${cx + 1} ${cy - 15} ${cx + 3.5} ${cy - 15} Q ${cx + 6} ${cy - 15} ${cx + 6} ${cy - 12} L ${cx + 6} ${cy - 2} L ${cx + 9} ${cy - 6} Q ${cx + 12} ${cy - 8} ${cx + 13} ${cy - 5} L ${cx + 6} ${cy + 8} L ${cx + 5} ${cy + 13} Z` }),
    ]);
  }
  // Мозг — простой значок, как в учебной схеме
  function brainIcon(cx, cy) {
    return s('g', { 'pointer-events': 'none' }, [
      s('ellipse', { cx, cy, rx: 18, ry: 14, fill: '#fbcfe8', stroke: '#db2777', 'stroke-width': 1.5 }),
      s('path', { d: `M${cx} ${cy - 14} V ${cy + 14} M${cx - 13} ${cy - 3} q 5 -5 10 0 M${cx + 3} ${cy + 4} q 5 -5 10 0`, fill: 'none', stroke: '#db2777', 'stroke-width': 1.3 }),
    ]);
  }
  // Мышца — веретено с поперечными полосками
  function muscleIcon(cx, cy) {
    return s('g', { 'pointer-events': 'none' }, [
      s('path', { d: `M${cx - 20} ${cy} Q ${cx} ${cy - 16} ${cx + 20} ${cy} Q ${cx} ${cy + 16} ${cx - 20} ${cy} Z`, fill: '#fca5a5', stroke: '#dc2626', 'stroke-width': 1.5 }),
      s('path', { d: `M${cx - 8} ${cy - 9} V ${cy + 9} M${cx} ${cy - 11} V ${cy + 11} M${cx + 8} ${cy - 9} V ${cy + 9}`, stroke: '#dc2626', 'stroke-width': 1, 'stroke-opacity': 0.6 }),
    ]);
  }

  // ── Логика опыта ──
  function onRelease() {
    if (phase === 'fall' || phase === 'reset') return;
    // Десятая попытка — последняя в серии; дальше щелчок просто повторяет опыт при тех же условиях
    if (params.trial < 10) set('trial', params.trial + 1);
    else queueDrop();
  }

  function queueDrop() {
    pending = true;
    if (phase === 'caught' || phase === 'lost') phase = 'reset';
  }

  function startFall() {
    pending = false;
    drop = snapshot();
    phase = 'fall';
    tau = 0;
    cueT = 0;
  }

  // Параметры меняют и шаги работы, и регуляторы: сцена сверяет их в каждом кадре
  function watchParams() {
    if (params.trial !== seenTrial) {
      if (params.trial === 0) {
        pending = false;
        phase = offset > 0 || release > 0 ? 'reset' : 'ready';
      } else if (params.trial > seenTrial) {
        queueDrop();
      }
      seenTrial = params.trial;
      seenKey = key();
    } else if (key() !== seenKey) {
      seenKey = key();
      // Новые условия — новая попытка с той же тренированностью
      if (params.trial > 0) queueDrop();
    }
  }

  function step(dt) {
    cueT += dt;
    if (phase === 'ready') {
      release = Math.max(0, release - dt * 6);
      grip = Math.max(0, grip - dt * 6);
      if (pending) startFall();
    } else if (phase === 'reset') {
      // Партнёр поднимает линейку обратно, ученик разжимает пальцы
      grip = Math.max(0, grip - dt * 5);
      offset = offset > 300 ? 0 : Math.max(0, offset - dt * 900);
      if (offset === 0) release = Math.max(0, release - dt * 6);
      if (offset === 0 && release === 0) {
        phase = 'ready';
        if (!params.trial) pending = false;
      }
    } else if (phase === 'fall') {
      tau += dt;
      release = Math.min(1, release + dt * 12);
      const t = tau / SLOW;
      const m = drop.m;
      offset = 0.5 * G * t ** 2 * 100 * PX;
      if (m.caught && t >= m.t) {
        offset = m.h * PX;
        phase = 'caught';
      } else if (!m.caught) {
        // Пальцы сжимаются поздно — линейка уже пролетела
        if (t >= m.t) grip = Math.min(1, grip + dt * 10);
        if (offset > 600 && t >= m.t) phase = 'lost';
      }
    } else {
      grip = Math.min(1, grip + dt * 10);
    }
    brainK = Math.max(0, brainK - dt * 1.5);
  }

  function draw(now) {
    ruler.setAttribute('transform', `translate(${RX} ${(FY + offset).toFixed(1)})`);
    marker.setAttribute('opacity', phase === 'caught' ? 1 : 0);

    // Большой палец ученика: разжат — справа от линейки, сжат — прижимает её к указательному
    const tipX = 466 - 34 * grip;
    const tipY = 276 + 6 * grip;
    sThumb.setAttribute('d', `M506 276 Q 488 266 ${tipX + 6} ${tipY - 6} Q ${tipX - 2} ${tipY - 4} ${tipX} ${tipY + 2} Q ${tipX + 4} ${tipY + 7} ${tipX + 12} ${tipY + 5} Q 486 282 500 288 Z`);
    // Пальцы партнёра: держит — прижаты к линейке, отпустил — кисть раскрывается
    const px = 452 - 30 * release;
    const py = 50 - 16 * release;
    const ix = 458 - 26 * release;
    const iy = 50 + 10 * release;
    pIndex.setAttribute('d', `M416 44 Q 440 ${42 + 6 * release} ${ix} ${iy - 4} Q ${ix + 4} ${iy} ${ix} ${iy + 4} Q 440 ${56 + 8 * release} 416 56 Z`);
    pThumb.setAttribute('d', `M402 44 Q 420 ${40 - 6 * release} ${px - 6} ${py - 5} Q ${px + 2} ${py - 4} ${px + 2} ${py + 2} Q ${px} ${py + 7} ${px - 8} ${py + 6} Q 420 ${54 - 4 * release} 404 58 Z`);

    // Рецептор на схеме — по выбранному сигналу; в миг сигнала он вспыхивает
    const sig = phase === 'fall' && drop ? drop.signal : params.signal;
    receptorIcons.forEach((el, i) => el.setAttribute('opacity', i === sig ? 1 : 0));
    const flash = Math.max(0, 1 - cueT / 0.8);
    receptorFlash.setAttribute('r', (NODE_R + 10 * (1 - flash)).toFixed(1));
    receptorFlash.setAttribute('opacity', flash.toFixed(2));
    hop.setAttribute('opacity', sig === 1 && cueT < 1.4 ? 1 : 0);

    // Нервный импульс: рецептор → мозг (дольше всего сигнал «обдумывается» здесь) → мышца
    let pos = null;
    if (phase === 'fall' && drop) {
      const f = tau / SLOW / drop.m.t;
      const [xr, xb, xm] = NODES;
      if (f < 0.25) pos = xr + (xb - xr) * (f / 0.25);
      else if (f < 0.75) {
        pos = xb;
        brainK = 1;
      } else if (f <= 1) pos = xb + (xm - xb) * ((f - 0.75) / 0.25);
    }
    impulse.setAttribute('opacity', pos === null ? 0 : 1);
    if (pos !== null) {
      impulse.setAttribute('cx', pos.toFixed(1));
      impulse.setAttribute('cy', NODE_Y - (pos === NODES[1] ? NODE_R + 2 : 0));
    }
    brainGlow.setAttribute('opacity', (brainK * 0.8).toFixed(2));
    badge.setAttribute('opacity', phase === 'fall' ? 1 : 0);

    // Счёт в уме занимает мозг — облачко с примером над узлом «Мозг»
    thought.setAttribute('opacity', params.distract ? 1 : 0);
    thoughtText.textContent = PROBLEMS[Math.floor(now / 2.5) % PROBLEMS.length];
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
