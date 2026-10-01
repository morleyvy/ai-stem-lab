// Сцена «Системы счисления»: на столе — монитор с учебной программой-конвертером.
// Слева — четыре строки одного числа (основания 10, 2, 8, 16): щелчок по верхней половине цифры
// прибавляет единицу этого разряда, по нижней — вычитает, двоичные разряды переключаются щелчком.
// Под двоичной строкой — веса разрядов или скобки троек/четвёрок битов с цифрами 8-й и 16-й систем.
// Справа — перевод из десятичной системы делением на выбранное основание, остатки читаются снизу вверх.

import { createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 500;
const MON = { x: 14, y: 8, w: 932, h: 458 };
const SCR = { x: 28, y: 22, w: 904, h: 430 };
const CONV = { x: 42, y: 34, w: 490, h: 406 };
const DIV = { x: 546, y: 34, w: 372, h: 406 };
const RIGHT = 516; // правый край цифр: разряды всех строк выровнены по младшей цифре
const ROW_Y = { 10: 122, 2: 202, 8: 312, 16: 392 };
const CELL_H = 48;
const BIT_W = 36;
const BIT_STEP = 41;
const DIG_W = 46;
const DIG_STEP = 52;
const LINE_Y0 = 164;
const LINE_DY = 30;
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';

const BIT_ON = '#60a5fa';
const ACCENT = '#fbbf24';
const BAD = '#ef4444';
const NAMES = { 10: 'десятичная', 2: 'двоичная', 8: 'восьмеричная', 16: 'шестнадцатеричная' };
// Группы битов от старшего к младшему: тройки и четвёрки отсчитывают справа, поэтому старшая тройка неполная
const GROUPS = { 8: [[7, 6], [5, 4, 3], [2, 1, 0]], 16: [[7, 6, 5, 4], [3, 2, 1, 0]] };

const bitX = (k) => RIGHT - BIT_W / 2 - k * BIT_STEP;
const digX = (i) => RIGHT - DIG_W / 2 - i * DIG_STEP;

export function itNumberSystemsScene(container, params, set, m) {
  const { BASES, WIDTH, digitChar, padded, toBase, divisor, divisionChain } = m;
  const cells = []; // { base, i, rect, digit, glow, flash, bad, last }
  const rowFrames = {};
  const groupSets = {};
  let weights, tabs, lines, arrow;

  // Ячейку не перерисовываем вслепую: вспышка нужна только у разрядов, которые действительно изменились
  const flashCell = (c, kind) => { c[kind] = 1; };

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // ── Монитор: подставка, рамка, экран ──
      svg.append(
        floorShadow(480, BENCH + 3, 170, d),
        s('path', { d: `M452 ${MON.y + MON.h - 2} L508 ${MON.y + MON.h - 2} L522 ${BENCH - 6} L438 ${BENCH - 6} Z`, fill: d.lin([[0, '#475569'], [0.45, '#94a3b8'], [1, '#334155']]) }),
        s('rect', { x: 370, y: BENCH - 8, width: 220, height: 9, rx: 4.5, fill: d.lin([[0, '#64748b'], [0.5, '#cbd5e1'], [1, '#475569']]) }),
        s('rect', { x: MON.x, y: MON.y, width: MON.w, height: MON.h, rx: 18, fill: d.lin([[0, '#334155'], [0.5, '#1e293b'], [1, '#0f172a']], 'v'), filter: d.url('soft') }),
        s('rect', { x: MON.x + 2, y: MON.y + 2, width: MON.w - 4, height: 10, rx: 8, fill: '#ffffff', 'fill-opacity': 0.1 }),
        s('rect', { x: SCR.x, y: SCR.y, width: SCR.w, height: SCR.h, rx: 6, fill: d.lin([[0, '#0b1220'], [1, '#0f172a']], 'v'), stroke: '#020617', 'stroke-width': 2 }),
      );

      buildConverter(svg, d);
      buildDivision(svg);
    },

    frame(dt) {
      const v = params.N;
      const b = divisor(params);

      // ── Конвертер ──
      for (const base of [10, 2, 8, 16]) {
        const active = base === b;
        rowFrames[base].setAttribute('stroke', active ? ACCENT : '#1e293b');
        rowFrames[base].setAttribute('fill', active ? '#1c1a10' : '#0d1526');
      }
      for (const c of cells) {
        const str = padded(v, c.base);
        const ch = str[str.length - 1 - c.i];
        if (c.last !== null && ch !== c.last) flashCell(c, 'flash');
        c.last = ch;
        c.flash = Math.max(0, c.flash - dt * 2.2);
        c.bad = Math.max(0, c.bad - dt * 3);
        // Незначащие нули слева тусклые: число 13 в байте — 00001101, но пишут его 1101
        const lead = str.slice(0, str.length - 1 - c.i).split('').every((x) => x === '0') && ch === '0' && c.i !== 0;
        let fill = lead ? '#475569' : '#f1f5f9';
        if (c.base === 2) fill = ch === '1' ? '#ffffff' : '#64748b';
        // Цифры 8-й или 16-й строки подсвечены, когда под двоичным кодом показаны их тройки/четвёрки
        if (c.base === b && b !== 2 && !lead) fill = ACCENT;
        c.digit.textContent = ch;
        c.digit.setAttribute('fill', fill);
        if (c.base === 2) {
          c.rect.setAttribute('fill', ch === '1' ? '#1e293b' : '#0f172a');
          c.rect.setAttribute('stroke', c.bad > 0 ? BAD : ch === '1' ? BIT_ON : '#334155');
        } else {
          c.rect.setAttribute('stroke', c.bad > 0 ? BAD : '#334155');
        }
        c.glow.setAttribute('opacity', (c.flash * 0.45).toFixed(3));
      }
      weights.setAttribute('visibility', b === 2 ? 'visible' : 'hidden');
      for (const base of [8, 16]) {
        const g = groupSets[base];
        g.root.setAttribute('visibility', b === base ? 'visible' : 'hidden');
        if (b !== base) continue;
        GROUPS[base].forEach((bits, gi) => {
          const val = bits.reduce((sum, k) => sum + (((v >> k) & 1) << (k - bits.at(-1))), 0);
          g.digits[gi].textContent = digitChar(val);
        });
      }

      // ── Деление на основание ──
      tabs.forEach((t, i) => {
        const on = BASES[i] === b;
        t.rect.setAttribute('fill', on ? ACCENT : '#1e293b');
        t.rect.setAttribute('stroke', on ? ACCENT : '#334155');
        t.label.setAttribute('fill', on ? '#1c1917' : '#cbd5e1');
      });
      const rows = divisionChain(v, b);
      lines.forEach((ln, i) => {
        const r = rows[i];
        ln.g.setAttribute('visibility', r ? 'visible' : 'hidden');
        if (!r) return;
        ln.expr.textContent = `${r.n} : ${b} = ${r.q}`;
        ln.rem.textContent = r.r >= 10 ? `${r.r} = ${digitChar(r.r)}` : digitChar(r.r);
      });
      const last = rows.length - 1;
      arrow.setAttribute('visibility', rows.length > 1 ? 'visible' : 'hidden');
      arrow.setAttribute('d', `M904 ${LINE_Y0 + last * LINE_DY + 6} V${LINE_Y0 - 6} M898 ${LINE_Y0 + 2} L904 ${LINE_Y0 - 8} L910 ${LINE_Y0 + 2}`);
    },
  });

  function panel(svg, { x, y, w, h }) {
    svg.append(s('rect', { x, y, width: w, height: h, rx: 12, fill: '#111a2b', stroke: '#1f2a3d', 'stroke-width': 1.5 }));
  }

  function buildConverter(svg, d) {
    panel(svg, CONV);
    svg.append(text(CONV.x + 16, 62, tr('Одно число — четыре записи'), { size: 17, weight: 700, fill: '#e2e8f0', anchor: 'start' }));

    for (const base of [10, 2, 8, 16]) {
      const cy = ROW_Y[base];
      rowFrames[base] = s('rect', { x: CONV.x + 8, y: cy - CELL_H / 2 - 5, width: CONV.w - 16, height: CELL_H + 10, rx: 10, fill: '#0d1526', 'stroke-width': 1.5 });
      svg.append(
        rowFrames[base],
        text(CONV.x + 18, cy - 8, `${base}`, { size: 24, weight: 800, fill: base === 10 ? '#e2e8f0' : '#93c5fd', anchor: 'start' }),
        text(CONV.x + 18, cy + 15, tr(NAMES[base]), { size: 13, weight: 600, fill: '#94a3b8', anchor: 'start' }),
      );
      for (let i = 0; i < WIDTH[base]; i++) svg.append(buildCell(d, base, i));
    }

    // Веса двоичных разрядов: 2⁷ … 2⁰ — показаны, когда выбран делитель 2
    weights = s('g', {});
    for (let k = 0; k < 8; k++) weights.append(text(bitX(k), 244, String(2 ** k), { size: 13, weight: 600, fill: '#94a3b8' }));
    svg.append(weights);

    // Тройки и четвёрки битов: скобка под группой и цифра 8-й или 16-й системы, которую она даёт
    for (const base of [8, 16]) {
      const root = s('g', { visibility: 'hidden' });
      const digits = GROUPS[base].map((bits) => {
        const x1 = bitX(bits[0]) - BIT_W / 2 + 2;
        const x2 = bitX(bits.at(-1)) + BIT_W / 2 - 2;
        const mid = (x1 + x2) / 2;
        const digit = text(mid, 260, '', { size: 18, weight: 800, fill: ACCENT });
        digit.setAttribute('font-family', MONO);
        root.append(s('path', { d: `M${x1} 231 V237 H${mid - 6} L${mid} 243 L${mid + 6} 237 H${x2} V231`, fill: 'none', stroke: ACCENT, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }), digit);
        return digit;
      });
      root.append(text(CONV.x + 18, 252, tr(base === 8 ? 'по 3 бита' : 'по 4 бита'), { size: 13, weight: 700, fill: ACCENT, anchor: 'start' }));
      groupSets[base] = { root, digits };
      svg.append(root);
    }
  }

  // Ячейка одного разряда. Двоичная переключается щелчком; остальные — счётчик: верхняя половина +1, нижняя −1
  function buildCell(d, base, i) {
    const bin = base === 2;
    const cx = bin ? bitX(i) : digX(i);
    const cy = ROW_Y[base];
    const w = bin ? BIT_W : DIG_W;
    const rect = s('rect', { x: cx - w / 2, y: cy - CELL_H / 2, width: w, height: CELL_H, rx: 7, fill: '#0f172a', stroke: '#334155', 'stroke-width': 1.5 });
    const glow = s('rect', { x: cx - w / 2, y: cy - CELL_H / 2, width: w, height: CELL_H, rx: 7, fill: ACCENT, opacity: 0, 'pointer-events': 'none' });
    const digit = text(cx, cy + 1, '0', { size: bin ? 24 : 27, weight: 700, fill: '#f1f5f9' });
    digit.setAttribute('font-family', MONO);
    const kids = [rect, glow, digit];
    if (!bin) {
      kids.push(
        s('path', { d: `M${cx - 6} ${cy - 15} L${cx} ${cy - 21} L${cx + 6} ${cy - 15} Z`, fill: '#64748b' }),
        s('path', { d: `M${cx - 6} ${cy + 15} L${cx} ${cy + 21} L${cx + 6} ${cy + 15} Z`, fill: '#64748b' }),
      );
    }
    const g = s('g', { style: 'cursor: pointer' }, kids);
    const cell = { base, i, rect, digit, glow, flash: 0, bad: 0, last: null };
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const v = params.N;
      let next;
      if (bin) next = v ^ (1 << i);
      else next = v + (scene.point(e).y < cy ? 1 : -1) * base ** i;
      // Байт не выходит за 0…255: вместо незаметного обрезания ячейка вспыхивает красным
      if (next < 0 || next > 255) return flashCell(cell, 'bad');
      set('N', next);
    });
    touchTarget(g, 2);
    cells.push(cell);
    return g;
  }

  function buildDivision(svg) {
    panel(svg, DIV);
    const x0 = DIV.x + 16;
    svg.append(text(x0, 62, tr('Перевод делением на основание'), { size: 16, weight: 700, fill: '#e2e8f0', anchor: 'start' }));
    tabs = BASES.map((b, i) => {
      const x = x0 + i * 114;
      const rect = s('rect', { x, y: 76, width: 104, height: 34, rx: 9, 'stroke-width': 1.5 });
      const label = text(x + 52, 94, `÷ ${b}`, { size: 18, weight: 800 });
      const g = s('g', { style: 'cursor: pointer' }, [rect, label]);
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('base', i);
      });
      touchTarget(g, 4);
      svg.append(g);
      return { rect, label };
    });
    svg.append(text(858, 136, tr('остаток'), { size: 13, weight: 600, fill: '#94a3b8' }));
    lines = Array.from({ length: 8 }, (_, i) => {
      const y = LINE_Y0 + i * LINE_DY;
      const expr = text(x0 + 4, y, '', { size: 19, weight: 600, fill: '#e2e8f0', anchor: 'start' });
      expr.setAttribute('font-family', MONO);
      const rem = text(858, y, '', { size: 19, weight: 800, fill: ACCENT });
      rem.setAttribute('font-family', MONO);
      const g = s('g', {}, [s('rect', { x: 824, y: y - 12, width: 68, height: 25, rx: 5, fill: '#1c1a10', stroke: '#3f3a1e' }), expr, rem]);
      svg.append(g);
      return { g, expr, rem };
    });
    arrow = s('path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.append(arrow, text(904, 422, tr('остатки читаем снизу вверх'), { size: 14, weight: 600, fill: ACCENT, anchor: 'end' }));
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
