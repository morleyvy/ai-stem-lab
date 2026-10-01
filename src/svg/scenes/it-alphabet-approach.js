// Сцена «Алфавитный подход»: на доске — карточки семи алфавитов, под ними — один монитор.
// Щелчок по карточке → компьютер заново набирает сообщение этим алфавитом (alphabet).
// Под текстом по очереди показан двоичный код его символов: ровно i клеток, поэтому видно,
// что вес символа задаёт алфавит, а не сам символ. Числа N, i, K и I — только в панели
// показаний под сценой, чтобы на сцене не было второго места с теми же величинами.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, text } from '../kit.js';

const BENCH = 470;
const TEAL = '#0e7490'; // цвет информатики в каталоге — им выделен выбранный алфавит
const MONO = 'Consolas, "Cascadia Mono", "Courier New", monospace';

// Карточки алфавитов на доске
const CARD = { x0: 51, y: 30, w: 114, h: 88, gap: 10 };
// Экран монитора, сетка символов сообщения (до 200 = 40 × 5) и строка кода символа
const SCREEN = { x: 170, y: 160, w: 620, h: 240 };
const GRID = { x: 196, y: 196, cols: 40, rows: 5, cw: 14, lh: 24 };
const CODE = { x: 300, y: 358, cw: 24, gap: 3 };

// Тексты сообщений: буквенные алфавиты без пробела — пробел в них не входит, а в ASCII и
// UTF-16 пробел и знаки препинания — такие же символы со своим кодом
const LATIN = 'abcdefghijklmnopqrstuvwxyz';
const KAZ = 'аәбвгғдеёжзийкқлмнңоөпрстуұүфхһцчшщъыіьэюя';
const SOURCES = [
  { chars: '01', sample: null, code: (c) => Number(c) },
  { chars: '0123456789', sample: null, code: (c) => Number(c) },
  { chars: LATIN, sample: 'shoqanlabinformatics', code: (c) => LATIN.indexOf(c) },
  { chars: LATIN + LATIN.toUpperCase(), sample: 'ShoqanLabBitByte', code: (c) => (LATIN + LATIN.toUpperCase()).indexOf(c) },
  { chars: KAZ, sample: 'қазақшаақпараталфавит', code: (c) => KAZ.indexOf(c) },
  { chars: null, sample: 'Shoqan Lab: I = K*i bit! ', code: (c) => c.charCodeAt(0) },
  { chars: null, sample: 'Сәлем! Hi! π≈3,14 ✓ € ', code: (c) => c.charCodeAt(0) },
];

// Генератор с фиксированным зерном: цифры и биты сообщения одинаковы при каждом открытии
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MESSAGES = SOURCES.map((src, k) => {
  const max = GRID.cols * GRID.rows;
  if (src.sample) return Array.from({ length: max }, (_, j) => [...src.sample][j % [...src.sample].length]);
  const r = rng(11 + k);
  return Array.from({ length: max }, () => src.chars[Math.floor(r() * src.chars.length)]);
});

export function alphabetScene(container, params, set, { ALPHABETS, weight }) {
  let cards = [];
  let cells = [];
  let cursorBox;
  let codeLabel;
  let bitCells = [];

  // Состояние анимации: сколько символов уже «напечатано» и какой символ сейчас кодируется
  let typed = 0;
  let typedAlphabet = -1;
  let codeIdx = 0;
  let codeClock = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      buildCards(svg, d);
      buildMonitor(svg, d);
    },
    frame(dt) {
      draw(dt);
    },
  });

  // ---------- Доска с карточками алфавитов ----------
  function buildCards(svg, d) {
    cards = ALPHABETS.map((a, k) => {
      const x = CARD.x0 + k * (CARD.w + CARD.gap);
      const { y, w, h } = CARD;
      const plate = s('rect', { x, y, width: w, height: h, rx: 10, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 });
      const band = s('rect', { x: x + 1, y: y + 1, width: w - 2, height: 36, rx: 9, fill: '#f1f5f9' });
      const glyph = text(x + w / 2, y + 20, a.glyphs, { size: 17, weight: 700, fill: '#0f172a' });
      glyph.setAttribute('font-family', MONO);
      const name = text(x + w / 2, y + 52, tr(a.short), { size: 13, weight: 600, fill: '#475569' });
      const power = text(x + w / 2, y + 73, `N = ${a.N.toLocaleString('ru-RU').replace(/\s/g, ' ')}`, { size: 15, weight: 800, fill: '#0f172a' });
      const g = s('g', { filter: d.url('soft') }, [plate, band, glyph, name, power]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('alphabet', k);
      });
      svg.append(g);
      return { g, plate, band, glyph, name, power };
    });
  }

  // ---------- Монитор с сообщением и кодом символа ----------
  function buildMonitor(svg, d) {
    const { x, y, w, h } = SCREEN;
    const cx = x + w / 2;
    svg.append(
      floorShadow(cx, BENCH + 2, 130, d),
      s('path', { d: `M${cx - 70} ${BENCH} Q ${cx - 64} ${BENCH - 16} ${cx - 38} ${BENCH - 18} H${cx + 38} Q ${cx + 64} ${BENCH - 16} ${cx + 70} ${BENCH} Z`, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      s('rect', { x: cx - 16, y: y + h + 8, width: 32, height: BENCH - 18 - (y + h + 8), fill: d.lin(['#334155', '#64748b', '#334155']) }),
      s('rect', { x: x - 12, y: y - 12, width: w + 24, height: h + 24, rx: 12, fill: d.lin([[0, '#334155'], [1, '#0f172a']], 'v'), filter: d.url('soft') }),
      s('rect', { x, y, width: w, height: h, rx: 4, fill: d.lin([[0, '#0b1220'], [1, '#111c2e']], 'v') }),
    );

    // Сетка символов: каждый символ — свой элемент, поэтому столбцы ровные при любом шрифте
    cursorBox = s('rect', { x: 0, y: 0, width: GRID.cw + 2, height: GRID.lh - 2, rx: 3, fill: '#f59e0b', 'fill-opacity': 0.35, stroke: '#fbbf24', 'stroke-width': 1 });
    svg.append(cursorBox);
    cells = [];
    for (let r = 0; r < GRID.rows; r++) {
      for (let c = 0; c < GRID.cols; c++) {
        const t = text(GRID.x + c * GRID.cw, GRID.y + r * GRID.lh, '', { size: 17, weight: 500, fill: '#e2e8f0' });
        t.setAttribute('font-family', MONO);
        cells.push(t);
        svg.append(t);
      }
    }
    svg.append(s('line', { x1: x + 16, x2: x + w - 16, y1: y + 160, y2: y + 160, stroke: '#334155', 'stroke-width': 1 }));

    // Двоичный код текущего символа: ровно i клеток
    codeLabel = text(CODE.x - 14, CODE.y, '', { size: 20, weight: 700, fill: '#fbbf24', anchor: 'end' });
    codeLabel.setAttribute('font-family', MONO);
    svg.append(codeLabel);
    bitCells = Array.from({ length: 16 }, () => {
      const box = s('rect', { y: CODE.y - 16, width: CODE.cw, height: 32, rx: 4, fill: '#1e3a5f', stroke: '#38bdf8', 'stroke-width': 1 });
      const t = text(0, CODE.y + 1, '', { size: 17, weight: 700, fill: '#e0f2fe' });
      t.setAttribute('font-family', MONO);
      const g = s('g', {}, [box, t]);
      svg.append(g);
      return { g, box, t };
    });
  }

  // ---------- Кадр ----------
  function draw(dt) {
    const a = ALPHABETS[params.alphabet];
    const src = SOURCES[params.alphabet];
    const msg = MESSAGES[params.alphabet];
    const i = weight(a.N);
    const K = params.K;

    // Карточки: выбранная — бирюзовая и чуть приподнята
    cards.forEach((c, k) => {
      const on = k === params.alphabet;
      c.plate.setAttribute('fill', on ? TEAL : '#ffffff');
      c.plate.setAttribute('stroke', on ? '#155e75' : '#cbd5e1');
      c.band.setAttribute('fill', on ? '#155e75' : '#f1f5f9');
      c.glyph.setAttribute('fill', on ? '#ffffff' : '#0f172a');
      c.name.setAttribute('fill', on ? '#cffafe' : '#475569');
      c.power.setAttribute('fill', on ? '#ffffff' : '#0f172a');
      c.g.setAttribute('transform', on ? 'translate(0 -3)' : '');
    });

    // При смене алфавита сообщение печатается заново, при смене длины — допечатывается
    if (params.alphabet !== typedAlphabet) {
      typedAlphabet = params.alphabet;
      typed = 0;
      codeIdx = 0;
      codeClock = 0;
    }
    typed = Math.min(K, typed + dt * 260);
    const shown = Math.floor(typed);
    cells.forEach((t, j) => {
      const ch = j < shown ? msg[j] : '';
      t.textContent = ch === ' ' ? '·' : ch;
      t.setAttribute('fill', ch === ' ' ? '#475569' : '#e2e8f0');
    });

    // Код символа: перебираем первые символы сообщения, примерно по одному в секунду
    codeClock += dt;
    if (codeClock > 1.1) {
      codeClock = 0;
      codeIdx = (codeIdx + 1) % Math.min(K, 12);
    }
    if (codeIdx >= K) codeIdx = 0;
    const ch = msg[codeIdx];
    const bin = src.code(ch).toString(2).padStart(i, '0');
    codeLabel.textContent = `«${ch === ' ' ? '␣' : ch}» →`;
    const col = codeIdx % GRID.cols;
    const row = Math.floor(codeIdx / GRID.cols);
    cursorBox.setAttribute('x', (GRID.x + col * GRID.cw - GRID.cw / 2 - 1).toFixed(1));
    cursorBox.setAttribute('y', (GRID.y + row * GRID.lh - GRID.lh / 2).toFixed(1));
    cursorBox.setAttribute('opacity', shown > codeIdx ? 1 : 0);
    bitCells.forEach((b, j) => {
      if (j >= i) {
        b.g.setAttribute('opacity', 0);
        return;
      }
      // После каждых 8 бит — небольшой зазор: видно, что 16 бит — это два байта
      const bx = CODE.x + j * (CODE.cw + CODE.gap) + (j >= 8 ? 10 : 0);
      b.box.setAttribute('x', bx);
      b.t.setAttribute('x', bx + CODE.cw / 2);
      b.t.textContent = bin[j];
      b.box.setAttribute('fill', bin[j] === '1' ? '#0369a1' : '#1e3a5f');
      b.g.setAttribute('opacity', shown > codeIdx ? 1 : 0.3);
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
