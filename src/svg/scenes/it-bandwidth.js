// Сцена «Скорость передачи данных»: только то, о чём опыт, — отправитель, получатель и канал между ними.
// Слева ноутбук с файлом video.mp4, справа сервер, между ними — линия связи. По линии бегут части файла
// (значки документов): по быстрому каналу — часто и быстро, по медленному — редко и не спеша.
// Радиоканалы (2G, 4G, Wi-Fi) — пунктир «по воздуху», оптоволокно — сплошной кабель.
// Под линией — крупная полоса «сколько файла уже на сервере» с процентами.
//   щелчок по вкладке канала наверху → выбирает канал (channel);
//   щелчок по файлу на ноутбуке → отправляет файл (send = 1), по уже полученному — сбрасывает (send = 0).
// Секундомер над каналом считает время модели t = V / v. Долгая передача идёт в ускоренной съёмке
// (×5, ×25 …), чтобы любой опыт занимал на экране не больше 1,6 с и закончился до того, как работа
// покажет наблюдение; множитель ускорения написан одной строкой под секундомером — показания честные.
// Формулу и расчёт показывает панель показаний под сценой — в самой сцене их нет.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 430;
const CY = 272; // ось линии связи
const X1 = 276; // линия начинается у экрана ноутбука…
const X2 = 720; // …и заканчивается у сервера
const SERVER = { x: 720, y: 196, w: 136, h: 232 };
const BAR = { x: 330, y: 318, w: 340, h: 26 };
const REAL_MAX = 1.6; // с — дольше на экране передача не идёт
const FACTORS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
// Наглядность канала: за сколько секунд экрана часть файла пробегает линию и как часто уходит следующая.
// Время передачи считает модель; здесь только «на глаз» видно, что быстрый канал несёт больше данных за секунду.
const LOOK = [
  { trip: 1.2, every: 0.4 },
  { trip: 0.8, every: 0.22 },
  { trip: 0.5, every: 0.11 },
  { trip: 0.3, every: 0.055 },
];
const CHUNKS = 40;
const TAB = { y: 18, w: 170, h: 54, gap: 10 };
const TAB_X0 = (960 - (4 * TAB.w + 3 * TAB.gap)) / 2;

export function itBandwidthScene(container, params, set, { CHANNELS, channel, seconds, num }) {
  let tabs, wire, clockText, note, fileGlow;
  let barFill, barText, serverFile, serverEmpty, serverLed;
  const chunks = [];
  // Ход опыта: idle — файл не отправлен, run — идёт передача, done — сервер получил весь файл
  let phase = 'idle';
  let simT = 0;
  let realT = 0; // секунды экрана с начала передачи
  let spawnAcc = 0;
  let clock = 0;
  let prevKey = '';

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });
      tabs = buildTabs(svg, d);
      buildStopwatch(svg, d);
      buildChannel(svg);
      buildProgress(svg, d);
      buildLaptop(svg, d);
      buildServer(svg, d);
    },

    frame(dt) {
      clock += dt;
      const key = `${params.size}|${params.channel}`;
      if (key !== prevKey) {
        prevKey = key;
        restyle();
        // Новый файл или канал во время опыта: файл отправляется заново, чтобы время было измерено для него
        if (params.send) start();
      }
      const T = seconds(params);
      const factor = FACTORS.find((f) => T / f <= REAL_MAX) ?? FACTORS.at(-1);
      if (!params.send) {
        phase = 'idle';
        simT = 0;
      } else if (phase === 'idle') {
        start();
      }
      if (phase === 'run') {
        simT += dt * factor;
        realT += dt;
        if (simT >= T) {
          simT = T;
          phase = 'done';
        }
      }
      const progress = T > 0 ? simT / T : 0;

      // Секундомер: во время передачи — текущее время, в конце — точный результат модели
      const dec = T < 10 ? 2 : T < 100 ? 1 : 0;
      clockText.textContent = `${phase === 'done' ? num(T) : fmt(simT, phase === 'idle' ? 0 : dec)} с`;
      note.textContent = phase === 'idle' ? tr('нажмите на файл, чтобы отправить') : factor === 1 ? '' : tr(`ускорено ×${factor}`);

      const pct = phase === 'done' ? 100 : Math.floor(progress * 100);
      barFill.setAttribute('width', (BAR.w * progress).toFixed(1));
      barFill.setAttribute('fill', phase === 'done' ? '#16a34a' : channel(params).color);
      barText.textContent = phase === 'done' ? '100 % ✓' : `${pct} %`;
      barText.setAttribute('fill', phase === 'done' ? '#15803d' : '#0f172a');
      serverFile.setAttribute('opacity', phase === 'done' ? 1 : 0);
      serverEmpty.setAttribute('opacity', phase === 'done' ? 0 : 1);
      serverLed.setAttribute('fill', phase === 'run' ? (Math.sin(clock * 24) > 0 ? '#22c55e' : '#14532d') : phase === 'done' ? '#22c55e' : '#14532d');
      // Файл зовёт нажать на себя, пока передача не начата
      fileGlow.setAttribute('opacity', phase === 'idle' ? (0.35 + 0.35 * Math.sin(clock * 4)).toFixed(2) : 0);

      updateChunks(dt, T / factor);
    },
  });

  function start() {
    phase = 'run';
    simT = 0;
    realT = 0;
    spawnAcc = LOOK[params.channel].every;
    for (const c of chunks) hide(c);
  }

  // ---------- Переключатель каналов ----------

  function buildTabs(svg, d) {
    return CHANNELS.map((c, i) => {
      const x = TAB_X0 + i * (TAB.w + TAB.gap);
      const bg = s('rect', { x, y: TAB.y, width: TAB.w, height: TAB.h, rx: 11, 'stroke-width': 1.5 });
      const ic = icon(i, x + 30, TAB.y + TAB.h / 2);
      const label = tr(c.name);
      const name = text(x + 56, TAB.y + 19, label, { size: Math.min(15, 106 / (label.length * 0.56)), weight: 700, anchor: 'start' });
      const speed = text(x + 56, TAB.y + 38, c.unit === 'Кбит/с' ? `${c.kbit} Кбит/с` : `${c.kbit / 1024} Мбит/с`, { size: 13, weight: 600, anchor: 'start' });
      const g = s('g', { filter: d.url('soft') }, [bg, ic, name, speed]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('channel', i);
      });
      touchTarget(g, 4);
      svg.append(g);
      return { bg, ic, name, speed };
    });
  }

  // Значок канала: мачта для 2G/4G, веер Wi-Fi, кабель со световым импульсом для оптоволокна
  function icon(i, cx, cy) {
    const st = { fill: 'none', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (i <= 1) {
      return s('g', st, [
        s('path', { d: `M${cx - 8} ${cy + 14} L${cx} ${cy - 8} L${cx + 8} ${cy + 14} M${cx - 4.5} ${cy + 5} H${cx + 4.5}` }),
        s('path', { d: `M${cx - 10} ${cy - 15} Q${cx - 15} ${cy - 8} ${cx - 10} ${cy - 1} M${cx + 10} ${cy - 15} Q${cx + 15} ${cy - 8} ${cx + 10} ${cy - 1}` }),
      ]);
    }
    if (i === 2) {
      return s('g', st, [
        s('path', { d: `M${cx - 15} ${cy - 4} Q${cx} ${cy - 17} ${cx + 15} ${cy - 4} M${cx - 9} ${cy + 3} Q${cx} ${cy - 5} ${cx + 9} ${cy + 3} M${cx - 4} ${cy + 9} Q${cx} ${cy + 6} ${cx + 4} ${cy + 9}` }),
        s('circle', { cx, cy: cy + 14, r: 2.6, 'stroke-width': 0, 'data-dot': 1 }),
      ]);
    }
    return s('g', st, [
      s('path', { d: `M${cx - 16} ${cy + 9} C ${cx - 5} ${cy + 9}, ${cx - 7} ${cy - 8}, ${cx + 6} ${cy - 8} H${cx + 10}`, 'stroke-width': 4 }),
      s('rect', { x: cx + 9, y: cy - 13, width: 8, height: 10, rx: 2, 'stroke-width': 0, 'data-dot': 1 }),
    ]);
  }

  // ---------- Секундомер ----------

  // Одно крупное значение; под ним одна строка — подсказка до опыта или множитель ускорения во время него
  function buildStopwatch(svg, d) {
    const cx = 480;
    const y = 92;
    clockText = text(cx + 14, y + 25, '', { size: 28, weight: 700, fill: '#0f172a' });
    clockText.style.fontVariantNumeric = 'tabular-nums';
    note = text(cx, y + 72, '', { size: 16, weight: 600, fill: '#334155' });
    svg.append(
      s('g', { filter: d.url('soft') }, [
        s('rect', { x: cx - 100, y, width: 200, height: 50, rx: 25, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5 }),
        // Значок секундомера
        s('circle', { cx: cx - 68, cy: y + 27, r: 11, fill: 'none', stroke: '#475569', 'stroke-width': 2.4 }),
        s('path', { d: `M${cx - 68} ${y + 27} V${y + 20} M${cx - 72} ${y + 12} H${cx - 64}`, stroke: '#475569', 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
        clockText,
      ]),
      note,
    );
  }

  // ---------- Линия связи и части файла ----------

  function buildChannel(svg) {
    wire = s('line', { x1: X1, y1: CY, x2: X2, y2: CY, 'stroke-linecap': 'round' });
    // Части файла — значки документов; лишние ждут в пуле невидимыми
    const layer = s('g', { 'pointer-events': 'none' });
    for (let i = 0; i < CHUNKS; i++) {
      const fold = s('path', { d: 'M4 -13 V-6 H11', fill: 'none', 'stroke-width': 1.8, 'stroke-linejoin': 'round' });
      const lines = s('path', { d: 'M-6 -1 H6 M-6 4 H6 M-6 9 H3', 'stroke-width': 2, 'stroke-linecap': 'round' });
      const page = s('path', { d: 'M-11 -13 H4 L11 -6 V13 H-11 Z', fill: '#ffffff', 'stroke-width': 2, 'stroke-linejoin': 'round' });
      const g = s('g', { opacity: 0 }, [page, fold, lines]);
      layer.append(g);
      chunks.push({ g, page, fold, lines, dist: 0, alive: false });
    }
    svg.append(wire, layer);
  }

  function hide(c) {
    c.alive = false;
    c.g.setAttribute('opacity', 0);
  }

  // Части уходят, только пока успевают долететь до конца передачи: когда полоса дошла до 100 %,
  // на линии ничего не остаётся «в пути»
  function updateChunks(dt, realTotal) {
    const look = LOOK[params.channel];
    const L = X2 - X1;
    const trip = Math.max(0.05, Math.min(look.trip, realTotal * 0.85));
    const v = L / trip;
    if (phase === 'run') {
      spawnAcc += dt;
      while (spawnAcc >= look.every) {
        spawnAcc -= look.every;
        const sentAt = realT - spawnAcc;
        if (sentAt + trip > realTotal + 0.02) continue;
        const c = chunks.find((x) => !x.alive);
        if (c) Object.assign(c, { alive: true, dist: spawnAcc * v });
      }
    }
    for (const c of chunks) {
      if (!c.alive) continue;
      if (phase === 'idle') {
        hide(c);
        continue;
      }
      c.dist += v * dt;
      if (c.dist >= L) {
        hide(c);
        continue;
      }
      c.g.setAttribute('transform', `translate(${(X1 + c.dist).toFixed(1)} ${CY}) scale(1.4)`);
      c.g.setAttribute('opacity', Math.min(1, c.dist / 14, (L - c.dist) / 14).toFixed(2));
    }
  }

  // ---------- Полоса приёма ----------

  function buildProgress(svg, d) {
    barFill = s('rect', { x: BAR.x, y: BAR.y, width: 0, height: BAR.h, rx: BAR.h / 2 });
    barText = text(BAR.x + BAR.w / 2, BAR.y + BAR.h + 26, '', { size: 26, weight: 700, fill: '#0f172a' });
    barText.style.fontVariantNumeric = 'tabular-nums';
    svg.append(
      s('rect', { x: BAR.x, y: BAR.y, width: BAR.w, height: BAR.h, rx: BAR.h / 2, fill: '#e2e8f0', stroke: '#cbd5e1', 'stroke-width': 1.5, filter: d.url('soft') }),
      barFill,
      barText,
    );
  }

  // Канал выбран: перерисовать линию и части файла, подсветить вкладку
  function restyle() {
    const c = channel(params);
    const radio = params.channel <= 2;
    wire.setAttribute('stroke', c.color);
    wire.setAttribute('stroke-width', radio ? 4 : 9);
    wire.setAttribute('stroke-dasharray', radio ? '2 12' : 'none');
    wire.setAttribute('stroke-opacity', radio ? 0.9 : 0.75);
    for (const k of chunks) {
      k.page.setAttribute('stroke', c.color);
      k.fold.setAttribute('stroke', c.color);
      k.lines.setAttribute('stroke', c.color);
    }
    tabs.forEach((t, i) => {
      const on = i === params.channel;
      const col = CHANNELS[i].color;
      t.bg.setAttribute('fill', on ? col : '#ffffff');
      t.bg.setAttribute('stroke', on ? col : '#cbd5e1');
      t.name.setAttribute('fill', on ? '#ffffff' : '#334155');
      t.speed.setAttribute('fill', on ? '#ffffff' : col);
      t.ic.setAttribute('stroke', on ? '#ffffff' : col);
      for (const el of t.ic.querySelectorAll('[data-dot]')) el.setAttribute('fill', on ? '#ffffff' : col);
    });
  }

  // ---------- Ноутбук ----------

  // Ноутбук без окон программы: на экране только сам файл — на него и нажимают, чтобы отправить
  function buildLaptop(svg, d) {
    const cx = 170;
    fileGlow = s('rect', { x: cx - 50, y: 214, width: 100, height: 106, rx: 12, fill: '#fde68a', 'fill-opacity': 0.18, stroke: '#fde68a', 'stroke-width': 2.5, opacity: 0 });
    const g = s('g', {}, [
      floorShadow(cx, BENCH + 1, 150, d, 7),
      // Крышка и экран
      s('rect', { x: 64, y: 194, width: 212, height: 156, rx: 11, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v'), stroke: '#0f172a', 'stroke-width': 1.5 }),
      s('rect', { x: 75, y: 205, width: 190, height: 134, rx: 4, fill: d.lin([[0, '#1e3a8a'], [1, '#0f172a']], 'v') }),
      fileGlow,
      videoFile(cx, 226, 1),
      text(cx, 306, 'video.mp4', { size: 15, weight: 700, fill: '#ffffff' }),
      // Корпус: тонкая клавиатурная часть в перспективе
      s('path', { d: 'M58 350 H282 L304 414 H36 Z', fill: d.lin([[0, '#cbd5e1'], [1, '#94a3b8']], 'v'), stroke: '#64748b', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
      s('path', { d: 'M74 358 H266 L278 392 H62 Z', fill: '#1e293b', 'fill-opacity': 0.18 }),
      s('rect', { x: 136, y: 397, width: 68, height: 11, rx: 3, fill: '#cbd5e1', stroke: '#94a3b8' }),
      s('rect', { x: 36, y: 414, width: 268, height: 12, rx: 4, fill: d.lin([[0, '#94a3b8'], [1, '#64748b']], 'v') }),
    ]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!params.send) set('send', 1);
      else if (phase === 'done') set('send', 0);
    });
    touchTarget(g);
    svg.append(g);
  }

  // Значок видеофайла с загнутым уголком; top — верх листа, k — масштаб
  function videoFile(cx, top, k) {
    const p = (x, y) => `${(cx + x * k).toFixed(1)} ${(top + y * k).toFixed(1)}`;
    return s('g', {}, [
      s('path', { d: `M${p(-24, 0)} H${cx + 10 * k} L${p(24, 14)} V${top + 62 * k} H${cx - 24 * k} Z`, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
      s('path', { d: `M${p(10, 0)} V${top + 14 * k} H${cx + 24 * k}`, fill: '#e2e8f0', stroke: '#cbd5e1', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
      s('rect', { x: cx - 16 * k, y: top + 28 * k, width: 32 * k, height: 22 * k, rx: 4 * k, fill: '#dc2626' }),
      s('path', { d: `M${p(-4, 33)} L${p(7, 39)} L${p(-4, 45)} Z`, fill: '#ffffff' }),
    ]);
  }

  // ---------- Сервер ----------

  // Сервер — простая башня: на экране пустая рамка файла, пока он не принят, и сам файл с галочкой в конце
  function buildServer(svg, d) {
    const { x, y, w, h } = SERVER;
    const cx = x + w / 2;
    const sy = y + 22;
    serverLed = s('circle', { cx, cy: y + h - 34, r: 6, fill: '#14532d' });
    serverEmpty = s('path', { d: `M${cx - 24} ${sy + 22} H${cx + 10} L${cx + 24} ${sy + 36} V${sy + 84} H${cx - 24} Z`, fill: 'none', stroke: '#64748b', 'stroke-width': 2, 'stroke-dasharray': '6 5', 'stroke-linejoin': 'round' });
    serverFile = s('g', { opacity: 0 }, [
      videoFile(cx, sy + 22, 1),
      s('circle', { cx: cx + 26, cy: sy + 84, r: 14, fill: '#16a34a', stroke: '#0b1220', 'stroke-width': 2 }),
      s('path', { d: `M${cx + 19} ${sy + 84} L${cx + 24} ${sy + 89} L${cx + 33} ${sy + 78}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    ]);
    svg.append(
      floorShadow(cx, BENCH + 1, w * 0.7, d, 7),
      s('rect', { x, y, width: w, height: h, rx: 10, fill: d.lin([[0, '#475569'], [0.5, '#334155'], [1, '#1e293b']]), stroke: '#0f172a', 'stroke-width': 1.5 }),
      s('rect', { x: x + 12, y: sy, width: w - 24, height: 128, rx: 6, fill: '#0b1220', stroke: '#0f172a' }),
      serverEmpty,
      serverFile,
      ...[0, 1].map((i) => s('rect', { x: x + 22, y: y + 168 + i * 10, width: w - 44, height: 3, rx: 1.5, fill: '#0f172a', 'fill-opacity': 0.6 })),
      serverLed,
    );
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
