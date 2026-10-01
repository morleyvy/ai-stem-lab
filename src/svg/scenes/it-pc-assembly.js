// Сцена «Устройство компьютера»: в центре — открытый системный блок, внутри — светлая материнская плата.
// Каждое пустое место обведено пунктиром и подписано: «Процессор», «ОЗУ», «Видеокарта», внизу корпуса —
// «Блок питания» и «Накопитель». Детали лежат на двух полках по бокам, название написано на самой детали.
// Рисунок нарочно плоский и крупный: семикласснику с первого взгляда должно быть ясно, что куда ставить.
// Ученик сам собирает компьютер:
//   деталь перетаскивают в её место или просто щёлкают по ней → она встаёт на место (psu/cpu/ram/ssd/gpu = 1);
//   щелчок по установленной детали или перетаскивание её из корпуса → деталь возвращается на полку;
//   кнопка на передней панели корпуса → питание (power).
// Собирают компьютер только выключенным, поэтому при установке или снятии детали питание выключается.
// Состояние показывает одна табличка над корпусом и цвет кнопки. После нажатия кнопки компьютер,
// как настоящий, по очереди проверяет процессор, память и накопитель («Проверка…»); место детали,
// на которой проверка остановилась, загорается красным, а табличка пишет, чего нет.

import { tr } from '../../i18n.js';
import { createScene, draggable, room, s, text, touchTarget } from '../kit.js';

const BENCH = 452;
// Корпус (вид сбоку): передняя панель с кнопкой справа
const CASE = { x: 246, y: 60, w: 514, h: 392 };
const FRONT = 40; // ширина передней панели
const IN = { l: CASE.x + 12, r: CASE.x + CASE.w - FRONT - 4, t: CASE.y + 12, b: CASE.y + CASE.h - 10 };
const MB = { x: IN.l + 14, y: IN.t + 12, w: IN.r - IN.l - 28, h: 256 };
const BTN = { x: CASE.x + CASE.w - FRONT / 2, y: CASE.y + 56 };
const STATUS = { x: CASE.x + CASE.w / 2, y: 30 };

// Детали: размер, место на полке (центр) и место в корпусе (центр)
const PARTS = {
  psu: { w: 170, h: 84, home: { x: 125, y: 150 }, slot: { x: IN.l + 105, y: IN.b - 48 }, name: 'Блок питания' },
  gpu: { w: 200, h: 62, home: { x: 125, y: 330 }, slot: { x: MB.x + 142, y: MB.y + 212 }, name: 'Видеокарта' },
  cpu: { w: 96, h: 96, home: { x: 822, y: 150 }, slot: { x: MB.x + 84, y: MB.y + 76 }, name: 'Процессор' },
  ram: { w: 38, h: 150, home: { x: 914, y: 150 }, slot: { x: MB.x + 200, y: MB.y + 92 }, name: 'ОЗУ' },
  ssd: { w: 120, h: 76, home: { x: 861, y: 330 }, slot: { x: IN.r - 80, y: IN.b - 48 }, name: 'Накопитель' },
};
const ORDER = ['psu', 'ssd', 'gpu', 'ram', 'cpu']; // порядок рисования: мелкие детали поверх крупных
const NEXT = ['psu', 'cpu', 'ram', 'ssd']; // какую деталь подсказывать следующей
const SNAP = 80; // насколько близко к месту нужно отпустить деталь
const MOVE_S = 0.45;
const POST_S = 0.32; // с на каждую проверку при включении: процессор → ОЗУ → накопитель

// Табличка состояния: текст и цвет точки
const STATE = {
  off: ['Выключен', '#94a3b8'],
  nopower: ['Нет блока питания', '#ef4444'],
  post: ['Проверка…', '#f59e0b'],
  cpu: ['Нет процессора', '#ef4444'],
  ram: ['Нет ОЗУ', '#ef4444'],
  boot: ['Нет накопителя', '#ef4444'],
  ok: ['Работает', '#22c55e'],
};
// На каком месте остановилась проверка
const FAIL_SLOT = { nopower: 'psu', cpu: 'cpu', ram: 'ram', boot: 'ssd' };

const INK = '#1e293b';
const SLOT_EDGE = '#64748b';

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

// Название в одну или две строки: «Блок питания» на узкой детали — в две
function label(cx, cy, name, { size = 14, fill = INK, width = Infinity } = {}) {
  const value = tr(name);
  const words = value.split(' ');
  const oneLine = words.length === 1 || value.length * size * 0.6 <= width;
  const lines = oneLine ? [value] : [words[0], words.slice(1).join(' ')];
  const lh = size * 1.15;
  return s('g', { 'pointer-events': 'none' }, lines.map((ln, i) => text(cx, cy + (i - (lines.length - 1) / 2) * lh, ln, { size, weight: 700, fill })));
}

export function pcAssemblyScene(container, params, set, { stage }) {
  const items = {};
  const slots = {};
  let itemsLayer, btnRing, btnCap, btnGlow, btnHint, nextGlow, statusDot, statusText, statusBox;
  let clock = 0;
  // Время с момента нажатия кнопки: по нему идёт проверка. Сцена, открытая уже включённой
  // (превью, свободный опыт), сразу показывает итог, без проверки
  let postT = params.power ? 10 : 0;
  let fanA = 0;
  let fanV = params.power && params.psu ? 1 : 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'class' });
      shelf(svg, 14, 236);
      shelf(svg, 774, 948);
      buildCase(svg);
      buildBoard(svg);
      buildStatus(svg);

      // Подсказка: какая деталь нужна следующей
      nextGlow = s('rect', { rx: 14, fill: '#fde68a', 'fill-opacity': 0.75, stroke: '#f59e0b', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' });
      svg.append(nextGlow);

      itemsLayer = s('g');
      svg.append(itemsLayer);
      const art = { psu: buildPsu, ssd: buildSsd, gpu: buildGpu, ram: buildRam, cpu: buildCpu };
      for (const id of ORDER) {
        const p = PARTS[id];
        const built = art[id](d);
        const at = params[id] ? p.slot : p.home;
        Object.assign(items[id] = {}, built, { cur: { ...at }, from: { ...at }, to: { ...at }, k: 1, drag: null });
        built.g.setAttribute('filter', d.url('soft'));
        itemsLayer.append(built.g);
      }

      buildButton(svg, d);
    },

    frame(dt, now) {
      // Шаг по часам, а не по урезанному dt kit: на медленном телефоне проверка при включении не растягивается
      const step = clock ? Math.min(1, now - clock) : dt;
      clock = now;
      postT = params.power ? postT + step : 0;
      moveItems(step);
      drawPower(step);
      drawHints(now);
    },
  });

  // ---------- Полки, корпус, плата ----------

  // Полка с деталями: светлая панель на стене, чтобы детали не «висели в воздухе»
  function shelf(svg, x1, x2) {
    svg.append(s('rect', { x: x1, y: 60, width: x2 - x1, height: BENCH - 72, rx: 14, fill: '#ffffff', 'fill-opacity': 0.55, stroke: '#cbd5e1', 'stroke-width': 1.5 }));
  }

  function buildCase(svg) {
    const { x, y, w, h } = CASE;
    svg.append(
      s('rect', { x, y, width: w, height: h, rx: 10, fill: '#cbd5e1', stroke: '#64748b', 'stroke-width': 2 }),
      // Внутренняя стенка
      s('rect', { x: IN.l, y: IN.t, width: IN.r - IN.l, height: IN.b - IN.t, rx: 6, fill: '#eef2f7', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      // Передняя панель
      s('rect', { x: x + w - FRONT, y, width: FRONT, height: h, rx: 10, fill: '#334155' }),
      s('rect', { x: x + w - FRONT, y, width: 10, height: h, fill: '#334155' }),
    );
    // Места для блока питания и накопителя на дне корпуса
    for (const id of ['psu', 'ssd']) svg.append(slotBox(id));
  }

  // Пустое место под деталь: пунктирная рамка с названием внутри. Если проверка остановилась на этой
  // детали, рамка краснеет
  function slotBox(id) {
    const p = PARTS[id];
    const name = { psu: 'Блок питания', ssd: 'Накопитель', cpu: 'Процессор', ram: 'ОЗУ', gpu: 'Видеокарта' }[id];
    const box = s('rect', { x: p.slot.x - p.w / 2 - 4, y: p.slot.y - p.h / 2 - 4, width: p.w + 8, height: p.h + 8, rx: 8, fill: '#ffffff', 'fill-opacity': 0.7, stroke: SLOT_EDGE, 'stroke-width': 2, 'stroke-dasharray': '7 5' });
    const g = s('g', { 'pointer-events': 'none' }, [box, label(p.slot.x, p.slot.y, name, { size: 14, fill: '#475569', width: p.w - 6 })]);
    slots[id] = box;
    return g;
  }

  function buildBoard(svg) {
    const { x, y, w, h } = MB;
    svg.append(
      s('rect', { x, y, width: w, height: h, rx: 8, fill: '#c7ebd0', stroke: '#4d9a66', 'stroke-width': 2 }),
      label(x + 330, y + 120, 'Материнская плата', { size: 16, fill: '#2f6b44', width: 170 }),
      slotBox('cpu'),
      slotBox('ram'),
      slotBox('gpu'),
    );
  }

  // Табличка над корпусом: одно короткое слово о том, что сейчас с компьютером
  function buildStatus(svg) {
    statusBox = s('rect', { x: STATUS.x - 110, y: STATUS.y - 18, width: 220, height: 36, rx: 18, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 });
    statusDot = s('circle', { cx: STATUS.x - 88, cy: STATUS.y, r: 7, fill: STATE.off[1] });
    statusText = text(STATUS.x - 72, STATUS.y + 1, tr(STATE.off[0]), { size: 17, weight: 700, fill: INK, anchor: 'start' });
    svg.append(s('g', { 'pointer-events': 'none' }, [statusBox, statusDot, statusText]));
  }

  // ---------- Детали (в своих координатах: центр детали — 0,0) ----------

  function fan(cx, cy, r) {
    const rotor = s('g', {}, [0, 90, 180, 270].map((a) => s('path', {
      d: `M0 0 C ${r * 0.25} ${-r * 0.3} ${r * 0.2} ${-r * 0.75} 0 ${-r * 0.85} C ${-r * 0.3} ${-r * 0.7} ${-r * 0.2} ${-r * 0.3} 0 0 Z`,
      fill: '#94a3b8', transform: `rotate(${a})`,
    })));
    const g = s('g', { transform: `translate(${cx} ${cy})` }, [
      s('circle', { r, fill: '#1e293b', stroke: '#64748b', 'stroke-width': 2 }),
      rotor,
      s('circle', { r: r * 0.22, fill: '#cbd5e1' }),
    ]);
    return { g, rotor };
  }

  function body(w, h, fill, rx = 8) {
    return s('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx, fill, stroke: '#0f172a', 'stroke-opacity': 0.35, 'stroke-width': 1.5 });
  }

  function buildPsu() {
    const { w, h, name } = PARTS.psu;
    const f = fan(-48, 0, 30);
    const g = s('g', {}, [body(w, h, '#374151'), f.g, label(36, 0, name, { size: 15, fill: '#ffffff', width: 90 })]);
    return { g, fans: [f.rotor] };
  }

  function buildSsd() {
    const { w, h } = PARTS.ssd;
    const g = s('g', {}, [
      body(w, h, '#1d4ed8'),
      s('rect', { x: -w / 2 + 10, y: -h / 2 + 10, width: w - 20, height: h - 20, rx: 6, fill: '#ffffff' }),
      text(0, -9, 'SSD', { size: 20, weight: 800, fill: '#1d4ed8' }),
      label(0, 13, PARTS.ssd.name, { size: 13, fill: INK }),
    ]);
    return { g, fans: [] };
  }

  function buildRam() {
    const { w, h, name } = PARTS.ram;
    const chip = (cy) => s('rect', { x: -w / 2 + 9, y: cy, width: w - 14, height: 26, rx: 3, fill: '#1e293b' });
    const g = s('g', {}, [
      body(w, h, '#16a34a', 4),
      // Золотые контакты по длинной стороне — ими планка входит в слот
      s('rect', { x: -w / 2, y: -h / 2 + 6, width: 5, height: h - 12, fill: '#facc15' }),
      chip(-h / 2 + 10),
      chip(h / 2 - 36),
      label(2, 0, name, { size: 14, fill: '#ffffff' }),
    ]);
    return { g, fans: [] };
  }

  // Видеокарта: кожух с двумя вентиляторами, сверху — золотые контакты для слота
  function buildGpu() {
    const { w, h, name } = PARTS.gpu;
    const fans = [fan(-68, 3, 23), fan(68, 3, 23)];
    const g = s('g', {}, [
      s('rect', { x: -60, y: -h / 2 - 5, width: 110, height: 7, rx: 1.5, fill: '#facc15' }),
      body(w, h, '#475569'),
      ...fans.map((f) => f.g),
      label(0, 3, name, { size: 14, fill: '#ffffff' }),
    ]);
    return { g, fans: fans.map((f) => f.rotor) };
  }

  function buildCpu() {
    const { w, name } = PARTS.cpu;
    const g = s('g', {}, [
      body(w, w, '#15803d', 6),
      s('rect', { x: -w / 2 + 8, y: -w / 2 + 8, width: w - 16, height: w - 16, rx: 6, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      label(0, 1, name, { size: 13, fill: INK }),
    ]);
    return { g, fans: [] };
  }

  // ---------- Кнопка питания ----------

  function buildButton(svg, d) {
    btnGlow = s('circle', { cx: BTN.x, cy: BTN.y, r: 30, fill: d.rad([[0, '#4ade80', 0.9], [1, '#4ade80', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
    btnHint = s('circle', { cx: BTN.x, cy: BTN.y, r: 32, fill: d.rad([[0, '#fde68a', 0.95], [1, '#fde68a', 0]], 0.5, 0.5), opacity: 0, 'pointer-events': 'none' });
    btnRing = s('circle', { cx: BTN.x, cy: BTN.y, r: 17, fill: '#0f172a', stroke: '#94a3b8', 'stroke-width': 3.5 });
    btnCap = s('path', { d: `M${BTN.x - 5.5} ${BTN.y - 4} A 7.5 7.5 0 1 0 ${BTN.x + 5.5} ${BTN.y - 4} M${BTN.x} ${BTN.y - 9} V${BTN.y - 1}`, fill: 'none', stroke: '#e2e8f0', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
    const g = s('g', {}, [btnRing, btnCap]);
    g.style.cursor = 'pointer';
    svg.append(btnHint, btnGlow, g);
    touchTarget(g, 20);
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      g.setAttribute('transform', `translate(${BTN.x} ${BTN.y}) scale(0.88) translate(${-BTN.x} ${-BTN.y})`);
      setTimeout(() => g.setAttribute('transform', ''), 160);
      set('power', params.power ? 0 : 1);
    });
  }

  // ---------- Каждый кадр ----------

  function moveItems(dt) {
    for (const id of ORDER) {
      const it = items[id];
      const p = PARTS[id];
      if (it.drag?.moved) {
        it.cur = { x: it.drag.x, y: it.drag.y };
      } else {
        const target = params[id] ? p.slot : p.home;
        if (target.x !== it.to.x || target.y !== it.to.y) {
          it.from = { ...it.cur };
          it.to = { ...target };
          it.k = 0;
        }
        it.k = Math.min(1, it.k + dt / MOVE_S);
        const e = ease(it.k);
        const lift = Math.min(60, Math.hypot(it.to.x - it.from.x, it.to.y - it.from.y) * 0.2);
        it.cur = { x: lerp(it.from.x, it.to.x, e), y: lerp(it.from.y, it.to.y, e) - Math.sin(e * Math.PI) * lift };
      }
      it.g.setAttribute('transform', `translate(${it.cur.x.toFixed(1)} ${it.cur.y.toFixed(1)})`);
    }
  }

  function drawPower(dt) {
    const st = stage(params);
    const powered = params.power && params.psu;
    // Проверка идёт по шагам: процессор (0), ОЗУ (1), накопитель (2)
    const fail = { cpu: 0, ram: 1, boot: 2 }[st];
    const done = st === 'ok' ? postT >= 3 * POST_S : postT >= (fail ?? 0) * POST_S;
    const shown = st === 'off' || st === 'nopower' || done ? st : 'post';
    const [msg, color] = STATE[shown];
    statusText.textContent = tr(msg);
    statusDot.setAttribute('fill', color);
    statusBox.setAttribute('stroke', shown === 'off' ? '#cbd5e1' : color);

    // Пока деталь несут, её место подсвечено; место, на котором остановилась проверка, — красное
    const failed = done ? FAIL_SLOT[st] : null;
    for (const id of ORDER) {
      const dragging = items[id].drag?.moved && !params[id];
      const near = dragging && Math.hypot(items[id].cur.x - PARTS[id].slot.x, items[id].cur.y - PARTS[id].slot.y) < SNAP;
      const box = slots[id];
      box.setAttribute('stroke', id === failed ? '#ef4444' : dragging ? '#f59e0b' : SLOT_EDGE);
      box.setAttribute('fill', id === failed ? '#fecaca' : dragging ? '#fde68a' : '#ffffff');
      box.setAttribute('fill-opacity', near ? 1 : 0.7);
      box.setAttribute('stroke-width', id === failed || dragging ? 3 : 2);
      // Под стоящей деталью рамку не видно; пока деталь едет на место или с него, рамка не мелькает
      box.setAttribute('opacity', params[id] && items[id].k >= 1 && !items[id].drag?.moved ? 0 : 1);
    }

    const ok = st === 'ok' && done;
    btnRing.setAttribute('stroke', !powered ? '#94a3b8' : ok ? '#4ade80' : '#f59e0b');
    btnGlow.setAttribute('opacity', ok ? 0.8 : 0);

    // Вентиляторы раскручиваются и останавливаются плавно
    fanV = powered ? Math.min(1, fanV + dt * 1.5) : Math.max(0, fanV - dt * 0.8);
    fanA = (fanA + fanV * dt * 900) % 360;
    const spin = (rotors, live) => rotors.forEach((r) => r.setAttribute('transform', live ? `rotate(${fanA.toFixed(1)})` : ''));
    spin(items.psu.fans, params.psu);
    spin(items.gpu.fans, params.gpu && params.psu);
  }

  function drawHints(now) {
    const pulse = 0.55 + 0.35 * Math.sin(now * 4);
    const busy = ORDER.some((id) => items[id].drag?.moved);
    const next = NEXT.find((id) => !params[id]);
    if (!busy && !params.power && next && items[next].k >= 1) {
      const { home, w, h } = PARTS[next];
      nextGlow.setAttribute('x', home.x - w / 2 - 10);
      nextGlow.setAttribute('y', home.y - h / 2 - 10);
      nextGlow.setAttribute('width', w + 20);
      nextGlow.setAttribute('height', h + 20);
      nextGlow.setAttribute('opacity', pulse.toFixed(2));
    } else nextGlow.setAttribute('opacity', 0);
    // Кнопку подсвечиваем, когда есть блок питания, а компьютер выключен
    btnHint.setAttribute('opacity', !busy && !params.power && params.psu ? pulse.toFixed(2) : 0);
  }

  // ---------- Перетаскивание и щелчки ----------

  // Собирают и разбирают компьютер только выключенным
  const place = (id, v) => {
    if (params.power) set('power', 0);
    set(id, v);
  };

  for (const id of ORDER) {
    const it = items[id];
    const p = PARTS[id];
    it.g.addEventListener('pointerdown', () => {
      it.drag = { moved: false, x: it.cur.x, y: it.cur.y, sx: null, sy: null, ox: 0, oy: 0 };
    });
    draggable(scene, it.g, {
      onDrag(x, y) {
        const dr = it.drag;
        if (!dr) return;
        if (dr.sx === null) {
          dr.sx = x;
          dr.sy = y;
          dr.ox = it.cur.x - x;
          dr.oy = it.cur.y - y;
        }
        if (!dr.moved && Math.hypot(x - dr.sx, y - dr.sy) > 6) {
          dr.moved = true;
          itemsLayer.append(it.g); // несомая деталь — поверх остальных
        }
        dr.x = Math.max(20, Math.min(940, x + dr.ox));
        dr.y = Math.max(40, Math.min(BENCH - 10, y + dr.oy));
      },
      onEnd() {
        const dr = it.drag;
        it.drag = null;
        if (!dr) return;
        // Анимация возврата или установки начинается с того места, где деталь отпустили
        it.from = { ...it.cur };
        if (!dr.moved) {
          place(id, params[id] ? 0 : 1);
          return;
        }
        const near = Math.hypot(dr.x - p.slot.x, dr.y - p.slot.y) < SNAP;
        // Отпущенную в стороне деталь возвращаем туда, где она была; к выключению это не ведёт
        if (near && !params[id]) place(id, 1);
        else if (!near && params[id] && Math.hypot(dr.x - p.slot.x, dr.y - p.slot.y) > SNAP * 1.5) place(id, 0);
        it.to = { x: NaN, y: NaN }; // заставит moveItems заново выбрать цель и плавно доехать до неё
      },
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
