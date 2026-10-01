// Сцена «ЭДС и внутреннее сопротивление»: физический стенд, на нём вольтметр, амперметр
// и табличка с формулой U = ε − I·r; на столе — держатель с плоской батарейкой 4,5 В, запасная батарейка,
// рубильник-ключ и ползунковый реостат. Провода лежат свободно, как на настоящем уроке.
// Ученик сам ведёт опыт:
//   щелчок по ключу замыкает или размыкает цепь (switch), при замыкании у контактов искрит;
//   движок реостата тянут мышью (R) — в цепь включается обмотка от левой клеммы до движка;
//   щелчок по батарейке на столе переставляет её в держатель, а прежняя ложится на стол (source).
// Вольтметр подключён прямо к клеммам держателя, поэтому при разомкнутом ключе показывает ЭДС.
// Ток рисуется движением зарядов по проводам — от «+» батарейки по внешней цепи к «−».

import { tr } from '../../i18n.js';
import { createScene, dial, draggable, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 430;
const CHARGES = 26;
const I_MAX = 3; // А — предел шкалы амперметра
const U_MAX = 6; // В — предел шкалы вольтметра
const R_MIN = 1;
const R_MAX = 20;
const RHEO = { x: 730, y: 400, half: 100 };
const KEY = { x: 430, y: 420 };
const VM = { x: 210, y: 150, r: 64 };
const AM = { x: 520, y: 150, r: 64 };
const TERM_Y = 238; // клеммы приборов на планке под корпусом
// Батарейка: в держателе и на столе (координаты середины нижней грани)
const HOLDER = { x: 250, y: 414 };
const SPARE = { x: 80, y: BENCH };
const BAT_W = 100;
const BAT_H = 70;
const POST = { minus: { x: 186, y: 346 }, plus: { x: 314, y: 346 } };
const SWAP_TIME = 0.9; // с — батарейку переносят по дуге

// Провода. Внешняя цепь последовательная: «+» → ключ → амперметр → реостат → «−»;
// вольтметр — отдельной парой проводов прямо к клеммам держателя.
const W_PLUS_KEY = `M${POST.plus.x} ${POST.plus.y} C 340 380, 360 420, ${KEY.x - 42} ${KEY.y}`;
const W_KEY_AM = `M${KEY.x + 42} ${KEY.y} C 520 410, 450 300, ${AM.x - 30} ${TERM_Y}`;
const W_AM_RH = `M${AM.x + 30} ${TERM_Y} C 580 300, 600 330, ${RHEO.x - 114} ${RHEO.y - 24}`;
const W_RH_MINUS = `M${RHEO.x + 122} ${RHEO.y - 26} C 910 392, 905 438, 820 440 L 240 440 C 160 440, 150 380, ${POST.minus.x} ${POST.minus.y}`;
const W_V_MINUS = `M${VM.x - 30} ${TERM_Y} C 168 290, 196 300, ${POST.minus.x} ${POST.minus.y}`;
const W_V_PLUS = `M${VM.x + 30} ${TERM_Y} C 250 300, 300 300, ${POST.plus.x} ${POST.plus.y}`;

export function dcCircuitScene(container, params, set, { current, voltage }) {
  let track, charges, amm, volt, blade, slider, contact, flash;
  const bats = []; // [новая, старая]
  let length = 1;
  let phase = 0;
  let trackR = null;
  let prevSwitch = params.switch;
  let prevSource = params.source;
  let swapT = 1; // 1 — перенос закончен
  let flashT = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      buildPlate(svg, d);

      // Планки с клеммами под приборами: к ним подходят провода
      for (const m of [VM, AM]) {
        svg.append(
          s('rect', { x: m.x - 52, y: TERM_Y - 12, width: 104, height: 24, rx: 6, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
          s('rect', { x: m.x - 48, y: TERM_Y - 10, width: 96, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.15 }),
        );
      }

      // Провода: тёмная изоляция с бликом; цвет вилок — красный у «+», чёрный у «−»
      const wire = (dd, color) => s('g', {}, [
        s('path', { d: dd, fill: 'none', stroke: shade(color, -0.35), 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('path', { d: dd, fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('path', { d: dd, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.3, 'stroke-width': 1.2, 'stroke-linecap': 'round', transform: 'translate(-1 -1)' }),
      ]);
      svg.append(
        wire(W_RH_MINUS, '#334155'),
        wire(W_V_MINUS, '#334155'),
        wire(W_V_PLUS, '#dc2626'),
        wire(W_PLUS_KEY, '#dc2626'),
        wire(W_KEY_AM, '#dc2626'),
        wire(W_AM_RH, '#334155'),
      );

      volt = dial(d, { x: VM.x, y: VM.y, r: VM.r, letter: 'V', color: '#0284c7' });
      amm = dial(d, { x: AM.x, y: AM.y, r: AM.r, letter: 'A' });
      svg.append(volt.g, amm.g);
      // Пределы шкал — на корпусе прибора, как на школьных демонстрационных приборах
      svg.append(
        text(VM.x + VM.r * 0.5, VM.y - VM.r * 0.68, `0–${U_MAX} V`, { size: 13, weight: 600, fill: '#64748b' }),
        text(AM.x + AM.r * 0.5, AM.y - AM.r * 0.68, `0–${I_MAX} A`, { size: 13, weight: 600, fill: '#64748b' }),
      );
      for (const m of [VM, AM]) {
        // У амперметра «+» слева: ток приходит к нему от «+» батарейки через ключ и уходит к реостату справа,
        // а прибор включают «+» к «+» источника
        const k = m === AM ? -1 : 1;
        svg.append(clamp(d, m.x - 30 * k, TERM_Y, '#0f172a'), clamp(d, m.x + 30 * k, TERM_Y, '#b91c1c'));
        svg.append(
          // Знаки полярности — на самой планке, рядом с клеммами, чтобы провода их не закрывали
          text(m.x - 44 * k, TERM_Y + 1, '−', { size: 16, weight: 700, fill: '#e2e8f0' }),
          text(m.x + 44 * k, TERM_Y + 1, '+', { size: 16, weight: 700, fill: '#fca5a5' }),
        );
      }

      buildHolder(svg, d);
      bats.push(buildBattery(d, false), buildBattery(d, true));
      for (const b of bats) svg.append(b.g);
      // Клеммы держателя поверх батарейки: провода и пружинные контакты прижимают её выводы
      svg.append(clamp(d, POST.minus.x, POST.minus.y, '#0f172a'), clamp(d, POST.plus.x, POST.plus.y, '#b91c1c'));

      svg.append(buildKey(d), buildRheostat(d));

      // Путь зарядов по внешней цепи (через ключ, амперметр, реостат) — перестраивается при смене R
      track = s('path', { fill: 'none', stroke: 'none' });
      svg.append(track);
      charges = Array.from({ length: CHARGES }, () => {
        const c = s('circle', { r: 3.2, fill: '#fcd34d', stroke: '#b45309', 'stroke-width': 0.8, opacity: 0, 'pointer-events': 'none' });
        svg.append(c);
        return c;
      });

      flash = s('circle', { cx: KEY.x + 32, cy: KEY.y - 5, r: 18, fill: d.rad([[0, '#ffffff', 0.95], [0.4, '#fde68a', 0.7], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
      svg.append(flash);
    },

    frame(dt) {
      const I = current(params);
      const U = voltage(params);
      const on = Boolean(params.switch);

      // Нож ключа и искра в момент замыкания
      blade.setAttribute('transform', `rotate(${on ? 0 : -38} -32 -5)`);
      if (on && !prevSwitch) flashT = 0.2;
      prevSwitch = params.switch;
      flashT = Math.max(0, flashT - dt);
      flash.setAttribute('opacity', flashT / 0.2);

      // Реостат: движок и путь тока через включённую часть обмотки
      const sx = -RHEO.half + ((params.R - R_MIN) / (R_MAX - R_MIN)) * RHEO.half * 2;
      slider.setAttribute('transform', `translate(${sx} -26)`);
      contact.setAttribute('x', sx - 3);
      if (trackR !== params.R) {
        trackR = params.R;
        const cx = RHEO.x + sx;
        track.setAttribute('d', [
          W_PLUS_KEY,
          `M${KEY.x - 42} ${KEY.y} H${KEY.x + 42}`,
          W_KEY_AM,
          `M${AM.x - 30} ${TERM_Y} H${AM.x + 30}`,
          W_AM_RH,
          `M${RHEO.x - 114} ${RHEO.y - 24} V${RHEO.y} H${cx} V${RHEO.y - 26} H${RHEO.x + 122}`,
          W_RH_MINUS,
        ].join(' '));
        length = track.getTotalLength();
      }
      phase = (phase + I * dt * 0.12) % 1;
      charges.forEach((c, k) => {
        const pt = track.getPointAtLength(((k / CHARGES + phase) % 1) * length);
        c.setAttribute('cx', pt.x.toFixed(1));
        c.setAttribute('cy', pt.y.toFixed(1));
        c.setAttribute('opacity', I > 0.001 && swapT >= 1 ? 1 : 0);
      });

      // Пока батарейку переносят, её выводы не касаются клемм — цепь без источника, оба прибора на нуле
      const loose = swapT < 1;
      amm.set(loose ? 0 : I / I_MAX, loose ? '0,00 А' : `${fmt(I)} А`);
      volt.set(loose ? 0 : U / U_MAX, loose ? '0,00 В' : `${fmt(U)} В`);

      // Замена батарейки: прежняя уходит на стол, другая встаёт в держатель по дуге
      if (params.source !== prevSource) {
        prevSource = params.source;
        swapT = 0;
      }
      swapT = Math.min(1, swapT + dt / SWAP_TIME);
      const e = swapT * swapT * (3 - 2 * swapT);
      bats.forEach((b, i) => {
        const inHolder = i === params.source;
        const from = inHolder ? SPARE : HOLDER;
        const to = inHolder ? HOLDER : SPARE;
        const x = from.x + (to.x - from.x) * e;
        // Ставим в держатель выше, чем снимаем: дуги не пересекаются, батарейки не проходят друг сквозь друга
        const y = from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * (inHolder ? 90 : 30);
        b.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        b.g.style.cursor = inHolder ? 'default' : 'pointer';
      });
    },
  });

  // Клемма с гайкой: латунное основание и тёмный (или красный) колпачок
  function clamp(d, x, y, cap) {
    return s('g', {}, [
      s('rect', { x: x - 8, y: y - 4, width: 16, height: 10, rx: 2, fill: d.lin(['#a16207', '#fde68a', '#a16207']) }),
      s('circle', { cx: x, cy: y - 3, r: 6.5, fill: d.rad([shade(cap, 0.45), cap]), stroke: shade(cap, -0.4), 'stroke-width': 1 }),
    ]);
  }

  // Небольшая табличка с главной формулой работы: схема и подробности есть в теории, здесь — только то,
  // что ученик проверяет по приборам
  function buildPlate(svg, d) {
    svg.append(
      s('rect', { x: 700, y: 120, width: 200, height: 56, rx: 10, fill: d.lin([[0, '#334155'], [1, '#1e293b']], 'v'), stroke: '#94a3b8', 'stroke-width': 2 }),
      text(800, 149, 'U = ε − I·r', { size: 24, weight: 700, fill: '#f8fafc' }),
    );
  }

  // Держатель: пластмассовое основание и латунные пружинные контакты по бокам
  function buildHolder(svg, d) {
    svg.append(
      floorShadow(HOLDER.x, BENCH + 2, 92, d),
      s('rect', { x: HOLDER.x - 76, y: HOLDER.y, width: 152, height: BENCH - HOLDER.y, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
      s('rect', { x: HOLDER.x - 72, y: HOLDER.y + 2, width: 144, height: 3, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.2 }),
      // пружинные контакты: от клемм вниз к основанию
      s('path', { d: `M${POST.minus.x} ${POST.minus.y} V${HOLDER.y} M${POST.plus.x} ${POST.plus.y} V${HOLDER.y}`, stroke: '#b45309', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('path', { d: `M${POST.minus.x} ${POST.minus.y + 6} V${HOLDER.y - 4} M${POST.plus.x} ${POST.plus.y + 6} V${HOLDER.y - 4}`, stroke: '#fde68a', 'stroke-width': 1.5, 'stroke-opacity': 0.7 }),
    );
  }

  // Плоская батарейка 4,5 В с латунными выводами-пластинками, отогнутыми к контактам держателя.
  // Старая — выцветшая, с налётом окислов на выводах: так её и узнают на столе.
  function buildBattery(d, old) {
    const body = old ? '#64748b' : '#1d4ed8';
    const band = old ? '#9f7a6a' : '#dc2626';
    const hw = BAT_W / 2;
    const parts = [
      floorShadow(0, 2, 62, d, 7),
      s('rect', { x: -hw, y: -BAT_H, width: BAT_W, height: BAT_H, rx: 6, fill: d.lin([[0, shade(body, 0.25)], [0.5, body], [1, shade(body, -0.35)]], 'v'), stroke: shade(body, -0.45), 'stroke-width': 1.2 }),
      s('rect', { x: -hw, y: -BAT_H, width: BAT_W, height: 18, rx: 6, fill: d.lin([[0, shade(band, 0.2)], [1, band]], 'v') }),
      s('rect', { x: -hw + 4, y: -BAT_H + 3, width: BAT_W - 8, height: 4, rx: 2, fill: '#ffffff', 'fill-opacity': 0.3 }),
      text(0, -BAT_H + 33, '4,5 V', { size: 17, weight: 800, fill: '#ffffff' }),
      // наклейка с подписью
      s('rect', { x: -32, y: -24, width: 64, height: 19, rx: 4, fill: old ? '#e7e0d6' : '#f8fafc' }),
      text(0, -14, tr(old ? 'старая' : 'новая'), { size: 13, weight: 700, fill: '#334155' }),
      // выводы: короткий «+» справа, длинный «−» слева
      s('path', { d: `M18 ${-BAT_H} V${-BAT_H - 8} H${hw + 14} V${-BAT_H + 4}`, fill: 'none', stroke: '#ca8a04', 'stroke-width': 4, 'stroke-linejoin': 'round' }),
      s('path', { d: `M-18 ${-BAT_H} V${-BAT_H - 8} H${-hw - 14} V${-BAT_H + 4}`, fill: 'none', stroke: '#ca8a04', 'stroke-width': 4, 'stroke-linejoin': 'round' }),
    ];
    if (old) {
      parts.push(
        s('ellipse', { cx: hw + 12, cy: -BAT_H - 4, rx: 7, ry: 4, fill: '#d1fae5', 'fill-opacity': 0.85 }),
        s('ellipse', { cx: -hw - 10, cy: -BAT_H - 6, rx: 6, ry: 3.5, fill: '#e5e7eb', 'fill-opacity': 0.9 }),
        s('path', { d: `M${-hw + 8} -30 l14 -6 M${hw - 20} -40 l10 5`, stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 1.5 }),
      );
    }
    const g = s('g', {}, parts);
    // Щелчок по батарейке на столе ставит её в держатель
    g.addEventListener('pointerdown', (e) => {
      const i = old ? 1 : 0;
      if (params.source === i || swapT < 1) return;
      e.stopPropagation();
      set('source', i);
    });
    touchTarget(g);
    return { g };
  }

  // Рубильник: эбонитовое основание, шарнир слева, губки справа, медный нож с ручкой
  function buildKey(d) {
    blade = s('g', {}, [
      s('rect', { x: -32, y: -8, width: 66, height: 6, rx: 2, fill: d.lin([[0, '#fcd9a8'], [0.5, '#d97706'], [1, '#92400e']], 'v') }),
      s('rect', { x: 26, y: -22, width: 8, height: 16, rx: 3, fill: '#1f2937' }),
    ]);
    // Зона нажатия на весь ключ: нож тонкий, на телефоне в него не попасть
    const hit = s('rect', { x: -52, y: -60, width: 104, height: 74, fill: '#ffffff', 'fill-opacity': 0 });
    const g = s('g', { transform: `translate(${KEY.x} ${KEY.y})` }, [
      floorShadow(0, 10, 52, d),
      s('rect', { x: -48, y: -2, width: 96, height: 12, rx: 3, fill: d.lin([[0, '#374151'], [1, '#111827']], 'v') }),
      s('rect', { x: -37, y: -10, width: 10, height: 10, rx: 2, fill: '#b45309' }),
      s('rect', { x: 27, y: -12, width: 3, height: 12, fill: '#b45309' }),
      s('rect', { x: 35, y: -12, width: 3, height: 12, fill: '#b45309' }),
      s('circle', { cx: -42, cy: 0, r: 3.5, fill: '#94a3b8' }),
      s('circle', { cx: 42, cy: 0, r: 3.5, fill: '#94a3b8' }),
      blade,
      s('circle', { cx: -32, cy: -5, r: 3, fill: '#78350f' }),
      hit,
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      set('switch', params.switch ? 0 : 1);
    });
    touchTarget(g);
    return g;
  }

  // Ползунковый реостат: керамический цилиндр с обмоткой, стойки по краям, штанга и движок
  function buildRheostat(d) {
    const half = RHEO.half;
    const coil = s('g');
    for (let x = -half + 8; x < half - 6; x += 6) {
      coil.append(s('line', { x1: x, y1: -14, x2: x + 4, y2: 14, stroke: '#b45309', 'stroke-width': 2.2 }));
    }
    contact = s('rect', { x: -3, y: -22, width: 6, height: 10, fill: '#94a3b8' });
    slider = s('g', {}, [
      s('rect', { x: -15, y: -12, width: 30, height: 24, rx: 5, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v'), stroke: '#111827' }),
      s('rect', { x: -10, y: -6, width: 20, height: 3, rx: 1.5, fill: '#9ca3af' }),
      s('rect', { x: -10, y: -1, width: 20, height: 3, rx: 1.5, fill: '#9ca3af' }),
    ]);
    const post = (x) => s('rect', { x, y: -22, width: 16, height: 46, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') });
    const g = s('g', { transform: `translate(${RHEO.x} ${RHEO.y})` }, [
      floorShadow(0, 28, 132, d),
      post(-122),
      post(106),
      s('rect', { x: -half, y: -16, width: half * 2, height: 32, rx: 16, fill: d.lin([[0, '#fffbeb'], [0.4, '#fef3c7'], [1, '#d6c7a1']], 'v') }),
      coil,
      s('rect', { x: -half, y: -16, width: half * 2, height: 32, rx: 16, fill: d.lin([[0, '#ffffff', 0.35], [0.5, '#ffffff', 0], [1, '#000000', 0.15]], 'v') }),
      s('rect', { x: -122, y: -30, width: 244, height: 7, rx: 3.5, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b'], 'v') }),
      clamp(d, -114, -24, '#0f172a'),
      clamp(d, 122, -26, '#0f172a'),
      contact,
      slider,
    ]);
    return g;
  }

  // При перетаскивании не должны выделяться надписи на приборах
  scene.svg.style.userSelect = 'none';
  draggable(scene, slider, {
    onDrag: (x) => set('R', R_MIN + ((x - RHEO.x + RHEO.half) / (RHEO.half * 2)) * (R_MAX - R_MIN)),
  });
  return scene;
}
