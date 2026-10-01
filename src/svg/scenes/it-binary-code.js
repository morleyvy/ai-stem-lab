// Сцена «Двоичный код»: на столе — учебный стенд «Регистр» (плата с восемью тумблерами-битами)
// и экран символа ASCII. Над тумблером — цифра 0/1, под ним — вес разряда (128 … 1).
// Щелчок по столбцу бита переключает его. Само число, сумма весов и число кодов показаны
// только в панели показаний под сценой, чтобы на стенде не было повторов.
// Когда в регистре меньше 8 битов, лишние старшие разряды закрыты шторкой и в число не входят.

import { createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 470;
const BOARD = { x: 40, y: 70, w: 600, h: 320 };
const COL_W = 66;
const COL0 = BOARD.x + (BOARD.w - 8 * COL_W) / 2; // левый край столбца старшего бита
const colX = (k) => COL0 + COL_W / 2 + (7 - k) * COL_W; // центр столбца бита k (бит 7 — слева)
const COL_TOP = 118;
const COL_BOTTOM = 370;
const DIGIT_Y = 160;
const SW = { top: 196, h: 104 }; // корпус тумблера
const LEVER_H = 38;
const WEIGHT_Y = 336;
const SCREEN = { x: 676, y: 110, w: 248, h: 240 };
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';

const ON = '#fbbf24';
const PCB = '#14532d';

export function itBinaryScene(container, params, set, { value, asciiOf, WEIGHTS }) {
  const cols = [];
  let header, glyph, caption;
  let flash = 0;
  let prevValue = value(params);

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      const { x, y, w, h } = BOARD;
      svg.append(
        floorShadow(x + w / 2, BENCH + 2, w * 0.55, d),
        ...[x + 70, x + w - 70].map((fx) => s('rect', { x: fx - 22, y: y + h - 6, width: 44, height: BENCH - (y + h) + 8, rx: 4, fill: d.lin([[0, '#64748b'], [0.4, '#cbd5e1'], [1, '#475569']]) })),
        s('rect', { x: x - 3, y: y - 3, width: w + 6, height: h + 6, rx: 16, fill: '#0b3b1f' }),
        s('rect', { x, y, width: w, height: h, rx: 14, fill: d.lin([[0, '#1d6b3a'], [0.5, PCB], [1, '#0f3f22']], 'v') }),
      );
      header = text(x + w / 2, y + 26, '', { size: 17, weight: 700, fill: '#e8f5ec' });
      svg.append(header);

      for (let k = 7; k >= 0; k--) cols[k] = buildColumn(svg, d, k);

      // Экран символа: код из регистра, прочитанный по таблице ASCII
      const sc = SCREEN;
      svg.append(
        floorShadow(sc.x + sc.w / 2, BENCH + 2, sc.w * 0.4, d),
        s('rect', { x: sc.x + sc.w / 2 - 16, y: sc.y + sc.h - 4, width: 32, height: BENCH - (sc.y + sc.h) + 6, fill: '#475569' }),
        s('rect', { x: sc.x, y: sc.y, width: sc.w, height: sc.h, rx: 14, fill: d.lin([[0, '#475569'], [0.5, '#1e293b'], [1, '#0f172a']], 'v') }),
        s('rect', { x: sc.x + 12, y: sc.y + 34, width: sc.w - 24, height: sc.h - 46, rx: 8, fill: '#04190f' }),
        text(sc.x + sc.w / 2, sc.y + 18, tr('Символ ASCII'), { size: 15, weight: 600, fill: '#cbd5e1' }),
      );
      glyph = text(sc.x + sc.w / 2, sc.y + 128, '', { size: 120, weight: 700, fill: '#6ee7b7' });
      glyph.setAttribute('font-family', MONO);
      caption = text(sc.x + sc.w / 2, sc.y + sc.h - 34, '', { size: 16, weight: 600, fill: '#a7f3d0' });
      svg.append(glyph, caption);
    },

    frame(dt) {
      const v = value(params);
      const N = params.N;
      if (v !== prevValue) flash = 1;
      prevValue = v;
      flash = Math.max(0, flash - dt * 2.5);

      for (let k = 0; k < 8; k++) {
        const c = cols[k];
        const active = k < N;
        const on = active && Boolean(params[`b${k}`]);
        // Рычажок едет к положению «1» (вверх) или «0» (вниз), а не прыгает
        const target = params[`b${k}`] ? 0 : 1;
        c.pos += (target - c.pos) * Math.min(1, dt * 14);
        if (Math.abs(target - c.pos) < 0.002) c.pos = target;
        c.lever.setAttribute('transform', `translate(0 ${(c.pos * (SW.h - LEVER_H - 16)).toFixed(1)})`);
        // Включённый бит подсвечен целиком: ученик сразу видит, какие веса входят в сумму
        c.bg.setAttribute('fill', on ? '#3f5d1f' : '#0c3a1d');
        c.bg.setAttribute('stroke', on ? ON : '#2f7a4a');
        c.digit.textContent = params[`b${k}`] ? '1' : '0';
        c.digit.setAttribute('fill', on ? '#ffffff' : '#7fa88d');
        c.weight.setAttribute('fill', on ? ON : '#cfe3d5');
        c.cover += ((active ? 0 : 1) - c.cover) * Math.min(1, dt * 10);
        c.shutter.setAttribute('opacity', c.cover.toFixed(3));
        c.g.style.cursor = active ? 'pointer' : 'default';
      }

      header.textContent = tr(N === 8 ? 'Регистр: 1 байт = 8 бит' : `Регистр: ${N} бит`);

      const a = asciiOf(v);
      if (a.kind === 'char') {
        glyph.textContent = a.ch;
        glyph.setAttribute('font-size', 120);
        caption.textContent = '';
      } else {
        // Невидимых символов на экране нет — показываем условный знак и короткое пояснение
        glyph.textContent = a.kind === 'space' ? '␣' : '—';
        glyph.setAttribute('font-size', 72);
        caption.textContent = tr(a.text);
      }
      glyph.setAttribute('opacity', (1 - flash * 0.5).toFixed(3));
    },
  });

  // Весь столбец бита — одна большая кнопка: на телефоне тумблер маленький, а столбец попадает под палец
  function buildColumn(svg, d, k) {
    const cx = colX(k);
    const lever = s('rect', { x: cx - 15, y: SW.top + 8, width: 30, height: LEVER_H, rx: 6, fill: d.lin([[0, '#f8fafc'], [0.5, '#cbd5e1'], [1, '#94a3b8']]), stroke: '#475569', 'stroke-width': 1 });
    const bg = s('rect', { x: cx - 29, y: COL_TOP, width: 58, height: COL_BOTTOM - COL_TOP, rx: 9, fill: '#0c3a1d', stroke: '#2f7a4a', 'stroke-width': 1.5 });
    const digit = text(cx, DIGIT_Y, '0', { size: 36, weight: 800, fill: '#7fa88d' });
    digit.setAttribute('font-family', MONO);
    const weight = text(cx, WEIGHT_Y, String(WEIGHTS[k]), { size: 22, weight: 800, fill: '#cfe3d5' });
    const shutter = s('g', { opacity: 0, 'pointer-events': 'none' }, [
      s('rect', { x: cx - 30, y: COL_TOP, width: 60, height: COL_BOTTOM - COL_TOP, rx: 9, fill: '#1f2937', 'fill-opacity': 0.97 }),
      text(cx, (COL_TOP + COL_BOTTOM) / 2, '×', { size: 34, weight: 700, fill: '#64748b' }),
    ]);
    const g = s('g', {}, [
      bg,
      digit,
      s('rect', { x: cx - 20, y: SW.top, width: 40, height: SW.h, rx: 9, fill: '#020617' }),
      s('rect', { x: cx - 4, y: SW.top + 12, width: 8, height: SW.h - 24, rx: 4, fill: '#1e293b' }),
      lever,
      weight,
      shutter,
    ]);
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (k >= params.N) return;
      set(`b${k}`, params[`b${k}`] ? 0 : 1);
    });
    touchTarget(g, 3);
    svg.append(g);
    return { g, bg, lever, digit, weight, shutter, pos: params[`b${k}`] ? 0 : 1, cover: k < params.N ? 0 : 1 };
  }

  // При частых щелчках не должны выделяться цифры на плате
  scene.svg.style.userSelect = 'none';
  return scene;
}
