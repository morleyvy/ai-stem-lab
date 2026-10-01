// Сцена «Логические элементы»: на столе — светлая учебная доска-стенд. Слева — два больших
// переключателя A и B, посередине — элементы схемы, справа от них — лампы выходов, а в правой
// колонке — простая таблица истинности и кнопка «Перебор». Ученик сам:
//   нажимает кнопку схемы (circuit) вверху доски — собирается другая готовая схема;
//   щёлкает переключатель A или B — ползунок встаёт вверх (1) или вниз (0);
//   нажимает кнопку «Перебор» (scan = 1) — стенд по очереди перебирает наборы входов
//   и вписывает значения выходов в каждую строку таблицы.
// Рисунок нарочно упрощён для школьника: элементы — крупные цветные блоки, подписанные словами
// (И, ИЛИ, НЕ, Искл. ИЛИ), а не значками ГОСТ «&» и «1», которые путают; провода идут только
// по горизонтали и вертикали, а единственное неизбежное пересечение показано «мостиком».
// Провод с сигналом 1 светится оранжевым, с сигналом 0 — серый. Значения ламп и строки таблицы
// берутся из модели (src/sims/it-logic-gates.js).

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';

const BENCH = 506;
const BOARD = { x: 24, y: 16, w: 912, h: 466 };
const PIN_X = 140; // правый край карточки переключателя — отсюда начинается провод
const SW_Y = { A: 210, B: 370 };
const LAMP_X = 568;
const LAMP_R = 26;
const WIRE_END = LAMP_X - LAMP_R - 4;
// Правая колонка — таблица истинности
const CARD = { x: 696, y: 30, w: 224, h: 440 };
const TBL = { y: 80, headH: 40, rowH: 54, colW: 50 };
// Перебор идёт с постоянной скоростью: 2 строки в секунду успевают прочитать, 4 строки проходят за 2 с
const SCAN_RATE = 2;

const ONE = '#f97316';
const ZERO = '#a3aebf';
const INK = '#1e293b';
const MUTED = '#64748b';
const LAMP = '#fde047';

// Элементы — цветные блоки с названием словами. h — высота блока: у двухвходовых входы на ±22 от центра
const GATES = {
  and: { label: 'И', color: '#2563eb', w: 110, h: 84, f: (a, b) => a & b },
  or: { label: 'ИЛИ', color: '#7c3aed', w: 110, h: 84, f: (a, b) => a | b },
  xor: { label: 'Искл. ИЛИ', color: '#0d9488', w: 120, h: 84, f: (a, b) => a ^ b },
  not: { label: 'НЕ', color: '#dc2626', w: 80, h: 56, f: (a) => 1 - a },
};

// Готовые схемы: элементы (в порядке прохождения сигнала; x — левый край, y — центр), провода
// с точками изгиба, точки ветвления и лампы. Точка с третьим элементом 'hop' — «мостик» через
// чужой провод: провода там не соединены. Номер схемы совпадает с номером в CIRCUITS модели.
const pin = (k) => [PIN_X, SW_Y[k]];
const LAYOUTS = [
  twoInput('and'),
  twoInput('or'),
  {
    // Полусумматор: оба входа идут сразу на два элемента — «Искл. ИЛИ» даёт сумму, «И» — перенос.
    // У «И» входы переставлены (B сверху): так провода пересекаются всего один раз
    gates: [{ id: 'x', type: 'xor', x: 300, y: 170, ins: ['A', 'B'] }, { id: 'a', type: 'and', x: 300, y: 392, ins: ['B', 'A'] }],
    wires: [
      ['A', [pin('A'), [190, 210]]],
      ['A', [[190, 210], [190, 148], [300, 148]]],
      ['A', [[190, 210], [190, 414], [300, 414]]],
      ['B', [pin('B'), [190, 370, 'hop'], [300, 370]]],
      ['B', [[250, 370], [250, 192], [300, 192]]],
      ['x', [[420, 170], [WIRE_END, 170]]],
      ['a', [[410, 392], [WIRE_END, 392]]],
    ],
    dots: [['A', 190, 210], ['B', 250, 370]],
    lamps: [{ src: 'x', y: 170 }, { src: 'a', y: 392 }],
  },
  {
    // Закон де Моргана: сверху ¬(A ∧ B) — «И», затем «НЕ»; снизу ¬A ∨ ¬B — два «НЕ», затем «ИЛИ»
    gates: [
      { id: 'g', type: 'and', x: 290, y: 150, ins: ['A', 'B'] },
      { id: 'n1', type: 'not', x: 430, y: 150, ins: ['g'] },
      { id: 'na', type: 'not', x: 290, y: 270, ins: ['A'] },
      { id: 'nb', type: 'not', x: 290, y: 420, ins: ['B'] },
      { id: 'o', type: 'or', x: 420, y: 345, ins: ['na', 'nb'] },
    ],
    wires: [
      ['A', [pin('A'), [190, 210]]],
      ['A', [[190, 210], [190, 128], [290, 128]]],
      ['A', [[190, 210], [190, 270], [250, 270, 'hop'], [290, 270]]],
      ['B', [pin('B'), [250, 370]]],
      ['B', [[250, 370], [250, 172], [290, 172]]],
      ['B', [[250, 370], [250, 420], [290, 420]]],
      ['g', [[400, 150], [430, 150]]],
      ['na', [[370, 270], [395, 270], [395, 323], [420, 323]]],
      ['nb', [[370, 420], [395, 420], [395, 367], [420, 367]]],
      ['n1', [[510, 150], [WIRE_END, 150]]],
      ['o', [[530, 345], [WIRE_END, 345]]],
    ],
    dots: [['A', 190, 210], ['B', 250, 370]],
    lamps: [{ src: 'n1', y: 150 }, { src: 'o', y: 345 }],
  },
];

function twoInput(type) {
  return {
    gates: [{ id: 'g', type, x: 300, y: 290, ins: ['A', 'B'] }],
    wires: [
      ['A', [pin('A'), [220, 210], [220, 268], [300, 268]]],
      ['B', [pin('B'), [220, 370], [220, 312], [300, 312]]],
      ['g', [[410, 290], [WIRE_END, 290]]],
    ],
    dots: [],
    lamps: [{ src: 'g', y: 290 }],
  };
}

// Путь провода: прямые отрезки, а в точке 'hop' — полукруглый мостик (провод идёт слева направо)
function wirePath(pts) {
  const HOP = 9;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (const [x, y, kind] of pts.slice(1)) {
    d += kind === 'hop' ? ` L${x - HOP} ${y} A${HOP} ${HOP} 0 0 1 ${x + HOP} ${y}` : ` L${x} ${y}`;
  }
  return d;
}

// Правая часть выражения выхода: из «F₁ = ¬(A ∧ B);  F₂ = ¬A ∨ ¬B» для выхода F₁ — «= ¬(A ∧ B)»
function exprOf(c, id) {
  const part = c.expr.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${id} =`));
  return part ? part.slice(id.length).trim() : '';
}

export function itLogicGatesScene(container, params, set, { CIRCUITS, rowOf, rowCount, rowInputs, column }) {
  let tabs, diagram, table, btnBody, btnText, btnPulse;
  const switches = {};
  let wires = [];
  let dots = [];
  let lamps = [];
  let rows = [];
  let shown = -1;
  let shownScan = params.scan;
  let lastRow = -1;
  let visited = new Set();
  let scanK = 0;
  let pulse = 0;
  let lampGlow, lampLit;
  const tblCx = CARD.x + CARD.w / 2;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // ── Доска стенда на двух ножках ──
      const { x, y, w, h } = BOARD;
      svg.append(
        floorShadow(x + w / 2, BENCH + 2, w * 0.48, d),
        ...[x + 130, x + w - 130].map((fx) => s('rect', { x: fx - 22, y: y + h - 6, width: 44, height: BENCH - (y + h) + 8, rx: 4, fill: d.lin([[0, '#64748b'], [0.4, '#cbd5e1'], [1, '#475569']]) })),
        s('rect', { x: x - 4, y: y - 4, width: w + 8, height: h + 8, rx: 18, fill: '#94a3b8' }),
        s('rect', { x, y, width: w, height: h, rx: 16, fill: '#ffffff' }),
        // Колонка таблицы — отдельная светло-серая карточка
        s('rect', { x: CARD.x, y: CARD.y, width: CARD.w, height: CARD.h, rx: 14, fill: '#f1f5f9', stroke: '#e2e8f0', 'stroke-width': 1.5 }),
      );

      // Кнопки выбора схемы. Ширина — по длине подписи: казахские названия длиннее русских
      let kx = x + 20;
      tabs = CIRCUITS.map((c, i) => {
        const label = tr(c.name);
        const kw = Math.max(64, label.length * 8.8 + 30);
        const body = s('rect', { x: kx, y: y + 14, width: kw, height: 40, rx: 20, 'stroke-width': 2 });
        const caption = text(kx + kw / 2, y + 35, label, { size: 16, weight: 700 });
        const g = s('g', { style: 'cursor:pointer' }, [body, caption]);
        g.dataset.part = `tab-${i}`;
        g.addEventListener('click', () => set('circuit', i));
        touchTarget(g, 4);
        svg.append(g);
        kx += kw + 10;
        return { body, caption };
      });

      lampGlow = d.rad([[0, LAMP, 0.95], [0.5, '#facc15', 0.45], [1, '#facc15', 0]], 0.5, 0.5);
      lampLit = d.rad([[0, '#fffbeb'], [0.55, LAMP], [1, '#eab308']], 0.4, 0.35);
      diagram = s('g', { 'pointer-events': 'none' });
      svg.append(diagram);
      for (const k of ['A', 'B']) switches[k] = buildSwitch(svg, k);

      // ── Таблица истинности и кнопка «Перебор» ──
      svg.append(text(tblCx, CARD.y + 26, tr('Таблица истинности'), { size: 16, weight: 800, fill: INK }));
      table = s('g');
      svg.append(table);

      const bw = 176;
      const bh = 48;
      const bx = tblCx - bw / 2;
      const by = CARD.y + CARD.h - bh - 22;
      btnPulse = s('rect', { x: bx - 5, y: by - 5, width: bw + 10, height: bh + 10, rx: (bh + 10) / 2, fill: 'none', stroke: '#60a5fa', 'stroke-width': 3, opacity: 0 });
      btnBody = s('rect', { x: bx, y: by, width: bw, height: bh, rx: bh / 2 });
      btnText = text(tblCx, by + bh / 2 + 1, '', { size: 17, weight: 800 });
      const btn = s('g', { style: 'cursor:pointer' }, [btnPulse, btnBody, btnText]);
      btn.dataset.part = 'scan';
      btn.addEventListener('click', () => set('scan', params.scan ? 0 : 1));
      touchTarget(btn, 6);
      svg.append(btn);
    },

    frame(dt) {
      const c = CIRCUITS[params.circuit];
      const row = rowOf(params);
      if (params.circuit !== shown) {
        drawCircuit(params.circuit);
        visited = new Set([row]);
        scanK = 0;
      }
      if (params.scan !== shownScan) {
        shownScan = params.scan;
        scanK = 0;
        // Очистка таблицы: остаётся только строка, которая сейчас набрана переключателями
        if (!params.scan) visited = new Set([row]);
      }
      if (row !== lastRow) visited.add(row);
      lastRow = row;
      const total = rowCount(c);
      if (params.scan && scanK < total) scanK = Math.min(total, scanK + dt * SCAN_RATE);

      // Сигналы во всех узлах схемы: входы — с переключателей, выход элемента — по его операции
      const sig = { A: params.A, B: params.B };
      for (const g of LAYOUTS[params.circuit].gates) sig[g.id] = GATES[g.type].f(...g.ins.map((i) => sig[i]));
      for (const wv of wires) paintWire(wv, sig[wv.src]);
      for (const dot of dots) dot.el.setAttribute('fill', sig[dot.src] ? ONE : ZERO);
      // Лампы горят по выходам модели — тем же, что в показаниях приборов
      c.outs.forEach((o, i) => {
        const on = o.f(params);
        const l = lamps[i];
        l.glow.setAttribute('opacity', on ? 1 : 0);
        l.bulb.setAttribute('fill', on ? lampLit : '#cbd5e1');
        l.digit.textContent = String(on);
        l.digit.setAttribute('fill', on ? '#713f12' : MUTED);
      });

      for (const k of ['A', 'B']) {
        const sw = switches[k];
        const v = params[k];
        // pos: 0 — ползунок вверху (1), 1 — внизу (0)
        const target = v ? 0 : 1;
        sw.pos += (target - sw.pos) * Math.min(1, dt * 14);
        if (Math.abs(target - sw.pos) < 0.002) sw.pos = target;
        sw.knob.setAttribute('transform', `translate(0 ${(sw.pos * 36).toFixed(1)})`);
        sw.track.setAttribute('fill', v ? ONE : '#cbd5e1');
        sw.digit.textContent = String(v);
        sw.digit.setAttribute('fill', v ? '#c2410c' : MUTED);
      }

      tabs.forEach((t, i) => {
        const on = i === params.circuit;
        t.body.setAttribute('fill', on ? '#2563eb' : '#ffffff');
        t.body.setAttribute('stroke', on ? '#2563eb' : '#cbd5e1');
        t.caption.setAttribute('fill', on ? '#ffffff' : '#334155');
      });
      paintTable(c, row);

      btnBody.setAttribute('fill', params.scan ? '#e2e8f0' : '#2563eb');
      btnText.setAttribute('fill', params.scan ? '#334155' : '#ffffff');
      btnText.textContent = params.scan ? `↺ ${tr('Очистить')}` : `▶ ${tr('Перебор')}`;
      // Пока таблица не заполнена, кнопка мягко пульсирует — подсказка, куда нажать
      pulse += dt;
      btnPulse.setAttribute('opacity', params.scan ? 0 : (0.25 + 0.3 * Math.sin(pulse * 4)).toFixed(2));
    },
  });

  // Переключатель: белая карточка с буквой входа и вертикальный ползунок; на ползунке — цифра 1 или 0.
  // Щелчок по любому месту карточки меняет значение входа на противоположное.
  function buildSwitch(parent, k) {
    const cy = SW_Y[k];
    const tx = 108; // центр ползунка
    const track = s('rect', { x: tx - 19, y: cy - 40, width: 38, height: 80, rx: 19 });
    const digit = text(tx, cy - 17, '', { size: 20, weight: 800 });
    const knob = s('g', {}, [
      s('circle', { cx: tx, cy: cy + 1 - 18, r: 16, fill: '#000000', 'fill-opacity': 0.15 }),
      s('circle', { cx: tx, cy: cy - 18, r: 16, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 1 }),
      digit,
    ]);
    const g = s('g', { style: 'cursor:pointer' }, [
      s('rect', { x: 40, y: cy - 54, width: PIN_X - 40, height: 108, rx: 16, fill: '#f8fafc', stroke: '#cbd5e1', 'stroke-width': 2 }),
      text(64, cy + 1, k, { size: 32, weight: 800, fill: INK }),
      track,
      knob,
    ]);
    g.dataset.part = `switch-${k}`;
    g.addEventListener('click', () => set(k, params[k] ? 0 : 1));
    touchTarget(g, 4);
    parent.append(g);
    return { g, knob, track, digit, pos: params[k] ? 0 : 1 };
  }

  // Элемент — цветной блок с названием; длинное название («Искл. ИЛИ») — в две строки
  function gateEl(g) {
    const t = GATES[g.type];
    const label = tr(t.label);
    const words = label.split(' ');
    const two = words.length > 1;
    const parts = [
      s('rect', { x: g.x, y: g.y - t.h / 2 + 4, width: t.w, height: t.h, rx: 14, fill: '#000000', 'fill-opacity': 0.12 }),
      s('rect', { x: g.x, y: g.y - t.h / 2, width: t.w, height: t.h, rx: 14, fill: t.color }),
    ];
    const cx = g.x + t.w / 2;
    if (two) {
      const size = Math.min(19, Math.floor((t.w - 14) / (Math.max(...words.map((wd) => wd.length)) * 0.68)));
      parts.push(text(cx, g.y - 11, words[0], { size, weight: 800, fill: '#ffffff' }), text(cx, g.y + 12, words.slice(1).join(' '), { size, weight: 800, fill: '#ffffff' }));
    } else {
      const size = Math.min(28, Math.floor((t.w - 16) / (label.length * 0.72)));
      parts.push(text(cx, g.y + 1, label, { size, weight: 800, fill: '#ffffff' }));
    }
    return s('g', {}, parts);
  }

  // Лампа: колба с цифрой выхода внутри, справа — имя выхода и его выражение
  function lampEl(y, id, expr) {
    const glow = s('circle', { cx: LAMP_X, cy: y, r: 50, fill: lampGlow, opacity: 0 });
    const bulb = s('circle', { cx: LAMP_X, cy: y, r: LAMP_R, fill: '#cbd5e1' });
    const digit = text(LAMP_X, y + 1, '0', { size: 22, weight: 800 });
    const g = s('g', {}, [
      glow,
      s('circle', { cx: LAMP_X, cy: y, r: LAMP_R + 4, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 2 }),
      bulb,
      digit,
      text(LAMP_X + 38, expr ? y - 11 : y + 1, id, { size: 26, weight: 800, fill: INK, anchor: 'start' }),
      expr && text(LAMP_X + 38, y + 17, expr, { size: 16, weight: 700, fill: '#475569', anchor: 'start' }),
    ]);
    return { g, glow, bulb, digit };
  }

  function drawCircuit(i) {
    shown = i;
    const lay = LAYOUTS[i];
    const c = CIRCUITS[i];
    wires = lay.wires.map(([src, pts]) => {
      const path = wirePath(pts);
      const glow = s('path', { d: path, fill: 'none', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', stroke: '#fed7aa', opacity: 0 });
      const line = s('path', { d: path, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      return { src, glow, line };
    });
    dots = lay.dots.map(([src, cx, cy]) => ({ src, el: s('circle', { cx, cy, r: 7 }) }));
    // Выражение выхода подписано прямо у его лампы: отдельная строка с формулой всей схемы не нужна
    lamps = lay.lamps.map((l, k) => lampEl(l.y, c.outs[k].id, exprOf(c, c.outs[k].id)));
    diagram.replaceChildren(
      ...wires.map((wv) => wv.glow),
      ...wires.map((wv) => wv.line),
      ...dots.map((dot) => dot.el),
      ...lay.gates.map(gateEl),
      ...lamps.map((l) => l.g),
    );
    buildTable(c);
  }

  function paintWire(wv, v) {
    wv.line.setAttribute('stroke', v ? ONE : ZERO);
    wv.line.setAttribute('stroke-width', v ? 6 : 4);
    wv.glow.setAttribute('opacity', v ? 0.8 : 0);
  }

  // Простая таблица: шапка A, B | выходы, строки наборов входов. Входы напечатаны всегда,
  // а клетка выхода заполняется, когда строку проверили переключателями или перебором
  function buildTable(c) {
    const cols = [...c.inputs.map((k) => ({ k, out: false })), ...c.outs.map((o) => ({ k: o.id, out: true }))];
    const tw = cols.length * TBL.colW;
    const x0 = tblCx - tw / 2;
    const n = rowCount(c);
    const top = TBL.y;
    const body = top + TBL.headH;
    const split = x0 + c.inputs.length * TBL.colW;
    const parts = [
      s('rect', { x: x0, y: top, width: tw, height: TBL.headH + n * TBL.rowH, rx: 10, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 }),
      s('rect', { x: split, y: top, width: x0 + tw - split, height: TBL.headH, fill: '#fef9c3' }),
      ...cols.map((col, i) => text(x0 + (i + 0.5) * TBL.colW, top + TBL.headH / 2 + 1, col.k, { size: 19, weight: 800, fill: INK })),
    ];
    rows = [];
    for (let r = 0; r < n; r++) {
      const ry = body + r * TBL.rowH;
      const mid = ry + TBL.rowH / 2;
      const hi = s('rect', { x: x0 + 3, y: ry + 3, width: tw - 6, height: TBL.rowH - 6, rx: 8, 'stroke-width': 3 });
      const ins = rowInputs(c, r);
      parts.push(s('line', { x1: x0, y1: ry, x2: x0 + tw, y2: ry, stroke: '#cbd5e1', 'stroke-width': r ? 1 : 2 }), hi);
      c.inputs.forEach((k, i) => parts.push(text(x0 + (i + 0.5) * TBL.colW, mid + 1, String(ins[k]), { size: 21, weight: 700, fill: '#334155' })));
      const outs = c.outs.map((o, j) => {
        const mx = x0 + (c.inputs.length + j + 0.5) * TBL.colW;
        const cell = s('rect', { x: mx - 17, y: mid - 17, width: 34, height: 34, rx: 8 });
        const t = text(mx, mid + 1, '', { size: 21, weight: 800 });
        parts.push(cell, t);
        return { cell, t, col: column(c, o) };
      });
      rows.push({ hi, outs });
    }
    parts.push(s('line', { x1: split, y1: top, x2: split, y2: body + n * TBL.rowH, stroke: '#94a3b8', 'stroke-width': 2 }));
    table.replaceChildren(...parts);
  }

  function paintTable(c, cur) {
    const n = rowCount(c);
    const cursor = params.scan && scanK < n ? Math.floor(scanK) : -1;
    rows.forEach((r, i) => {
      const open = visited.has(i) || (params.scan && i < Math.floor(scanK));
      // Строка, набранная переключателями, — жёлтая рамка; при переборе бежит голубая
      const mark = i === cursor ? '#38bdf8' : i === cur ? '#f59e0b' : null;
      r.hi.setAttribute('fill', mark === '#38bdf8' ? '#e0f2fe' : mark ? '#fffbeb' : 'none');
      r.hi.setAttribute('stroke', mark ?? 'none');
      for (const o of r.outs) {
        const v = o.col[i];
        o.t.textContent = open ? String(v) : '?';
        o.t.setAttribute('fill', open ? INK : '#cbd5e1');
        o.cell.setAttribute('fill', open && v ? LAMP : 'none');
      }
    });
  }

  // При частых щелчках не должны выделяться цифры на доске
  scene.svg.style.userSelect = 'none';
  return scene;
}
