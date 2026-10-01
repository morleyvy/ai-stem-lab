// Сцена «Ёмкость носителей информации»: на столе только то, что участвует в опыте. Слева — четыре
// папки с файлами (документы, фото, песни, видео), справа — SD-карта, флешка и внешний SSD-диск.
// Над выбранным носителем — шкала заполнения его ёмкости. Компьютер не рисуем: ученик и так сидит
// за ним, а единицы измерения — в описании опыта. Ученик сам проводит опыт:
//   щелчок по носителю → он приподнимается, над ним появляется шкала (device = 1…3), повторный — отключает;
//   щелчок по папке → выбран тип файлов (kind);
//   папку перетаскивают на носитель → идёт копирование (copy = 1), файлы летят в носитель, шкала растёт
//   до того числа файлов, которое помещается; лишние остаются в папке, и это видно по надписи.
// При смене носителя, папки или числа файлов копирование повторяется на пустой носитель —
// так каждое сочетание проверяется заново, как в настоящем опыте с форматированием носителя.

import { tr } from '../../i18n.js';
import { createScene, draggable, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';
import { fmt } from '../../sims/canvas.js';

const BENCH = 420;
// Папки стоят на столе корешком вниз; цвет папки совпадает с цветом значка типа файлов
const FOLDER = { w: 124, h: 180 };
const FX = [94, 232, 370, 508];
const KIND_COLOR = ['#2563eb', '#16a34a', '#9333ea', '#dc2626'];
// Носители на столе; выбранный приподнимается, над ним — шкала заполнения
const DX = [null, 652, 774, 886];
const DEV_SCALE = 1.8;
const LIFT = 14;
const CALL = { w: 312, h: 132, y: 66 };

const COLORS = { blue: '#2563eb', amber: '#d97706', red: '#dc2626', green: '#16a34a' };
const PICK_S = 0.35; // с — носитель приподнимается
const COPY_S = 1.1; // с — копирование: счётчик успевают увидеть, а наблюдение в работе (через 1,8 с) приходит уже после записи
const FLY_S = 0.5; // с — полёт одного файла от папки к носителю

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
// Название носителя в модели — со строчной буквы (оно стоит внутри фраз), на подписи — с заглавной
const capital = (str) => str.charAt(0).toUpperCase() + str.slice(1);
// Шкала держится над носителем, но не выходит за край сцены
const callX = (i) => Math.min(940 - CALL.w / 2, Math.max(20 + CALL.w / 2, DX[i]));

export function itMemoryScene(container, params, set, { DEVICES, KINDS, copied, size, capacityText }) {
  let devices, devGlow, folders, ghost, call, hintBox, warn, flyers;
  const devT = [0, 0, 0, 0];
  devT[params.device] = params.device ? 1 : 0;
  let callCx = params.device ? callX(params.device) : DX[2];
  let progress = 0;
  let copyKey = '';
  let warnUntil = 0;
  let clock = 0;
  let drag = null;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'class' });

      folders = KINDS.map((k, i) => buildFolder(svg, d, i));

      // Подписи носителей — на торце стола, светлым по тёмному
      DEVICES.forEach((dev, i) => {
        if (!dev) return;
        svg.append(
          text(DX[i], BENCH + 34, capital(tr(dev.name)), { size: 15, weight: 700, fill: '#e2e8f0' }),
          text(DX[i], BENCH + 55, capacityText(dev), { size: 14, weight: 500, fill: '#94a3b8' }),
        );
      });

      // Пока носитель не выбран, носители мягко светятся — зовут нажать
      devGlow = s('g', { 'pointer-events': 'none' }, DX.filter(Boolean).map((x) => s('ellipse', { cx: x, cy: BENCH - 60, rx: 56, ry: 84, fill: d.rad([[0, '#fde68a', 0.7], [1, '#fde68a', 0]], 0.5, 0.5) })));
      svg.append(devGlow);

      devices = [null, buildSd(d), buildFlash(d), buildSsd(d)];
      devices.forEach((g, i) => {
        if (!g) return;
        svg.append(g.shadow, g.g);
        touchTarget(g.g, 16);
        g.g.style.cursor = 'pointer';
        g.g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (params.device === i) {
            // Во время записи носитель не убирают — файлы на нём повредились бы
            if (!copying()) set('device', 0);
          } else set('device', i);
        });
      });

      // Файлы, летящие из папки в носитель во время копирования
      flyers = s('g', { 'pointer-events': 'none' });

      hintBox = s('g', { 'pointer-events': 'none' }, [
        s('rect', { x: DX[2] - 150, y: CALL.y + 40, width: 300, height: 56, rx: 14, fill: '#ffffff', 'fill-opacity': 0.7, stroke: '#94a3b8', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }),
        text(DX[2], CALL.y + 68, tr('Нажмите на носитель на столе'), { size: 15, weight: 600, fill: '#475569' }),
      ]);
      svg.append(hintBox);
      call = buildCall(svg, d);
      svg.append(flyers);

      warn = text(FX[0] - FOLDER.w / 2, 40, tr('Сначала выберите носитель'), { size: 16, weight: 700, fill: COLORS.red, anchor: 'start' });
      warn.setAttribute('pointer-events', 'none');
      ghost = s('g', { opacity: 0, 'pointer-events': 'none' });
      svg.append(warn, ghost);
    },

    frame(dt, now) {
      // Шаг считаем по часам, а не по dt из kit (он урезан до 0,1 с): на медленном телефоне
      // копирование иначе растянулось бы, и наблюдение в работе появлялось бы раньше конца записи
      const step = clock ? Math.min(3, now - clock) : dt;
      clock = now;
      advance(step);
      drawDevices();
      drawFolders(now);
      drawCall(now, step);
      drawFlyers();
    },
  });

  const copying = () => params.copy && params.device && progress < 1;

  function advance(dt) {
    for (let i = 1; i < devT.length; i++) {
      const target = params.device === i ? 1 : 0;
      devT[i] = target ? Math.min(1, devT[i] + dt / PICK_S) : Math.max(0, devT[i] - dt / PICK_S);
    }
    // Новое сочетание носителя, папки и числа файлов — копирование начинается заново на пустой носитель
    const key = `${params.device}|${params.kind}|${params.count}|${params.copy}`;
    if (key !== copyKey) {
      copyKey = key;
      progress = 0;
    }
    // Копировать можно, только когда носитель уже выбран и шкала над ним появилась
    if (params.copy && params.device && devT[params.device] >= 1) progress = Math.min(1, progress + dt / COPY_S);
  }

  // ---------- Носители ----------

  function deviceBody(d, { w, h, color, rx = 4 }) {
    return [
      s('rect', { x: -w / 2, y: -h, width: w, height: h, rx, fill: d.lin([[0, shade(color, -0.25)], [0.35, shade(color, 0.2)], [1, shade(color, -0.35)]]), stroke: shade(color, -0.5), 'stroke-width': 1.2 }),
      s('rect', { x: -w / 2 + 3, y: -h + 3, width: 3, height: h - 6, rx: 1.5, fill: '#ffffff', 'fill-opacity': 0.35 }),
    ];
  }

  function led(cx, cy) {
    return s('circle', { cx, cy, r: 3, fill: '#22c55e', opacity: 0.25 });
  }

  // Носитель рисуется в своих координатах (низ по центру — точка 0,0) и увеличивается целиком;
  // тень лежит на столе отдельно и не поднимается вместе с ним
  function device(d, rx, top, parts, l) {
    const g = s('g', {}, parts);
    return { g, shadow: floorShadow(0, BENCH + 2, rx * DEV_SCALE, d), led: l, top: top * DEV_SCALE };
  }

  // SD-карта: синяя пластинка со срезанным углом и золотыми контактами снизу
  function buildSd(d) {
    const l = led(9, -36);
    return device(d, 22, 44, [
      s('path', { d: 'M-17 0 V-44 H8 L17 -35 V0 Z', fill: d.lin([[0, '#1e3a8a'], [0.4, '#3b82f6'], [1, '#1e3a8a']]), stroke: '#172554', 'stroke-width': 1.2 }),
      s('rect', { x: -12, y: -37, width: 22, height: 19, rx: 2, fill: '#e0f2fe' }),
      text(-1, -27, 'SD', { size: 13, weight: 800, fill: '#1e3a8a' }),
      ...[-11, -5.5, 0, 5.5, 11].map((x) => s('rect', { x: x - 1.7, y: -10, width: 3.4, height: 7, rx: 0.8, fill: '#facc15' })),
      l,
    ], l);
  }

  // Флешка: корпус с петлёй, металлический USB-разъём сверху и индикатор записи
  function buildFlash(d) {
    const l = led(0, -14);
    return device(d, 20, 92, [
      s('rect', { x: -8, y: -92, width: 16, height: 20, rx: 1, fill: d.lin(['#64748b', '#e2e8f0', '#64748b']), stroke: '#475569', 'stroke-width': 1 }),
      s('rect', { x: -4, y: -88, width: 3, height: 4, fill: '#334155' }),
      s('rect', { x: 1, y: -88, width: 3, height: 4, fill: '#334155' }),
      ...deviceBody(d, { w: 26, h: 74, color: '#0e7490', rx: 6 }),
      s('circle', { cx: 0, cy: -6, r: 3.5, fill: 'none', stroke: '#164e63', 'stroke-width': 1.6 }),
      l,
    ], l);
  }

  // Внешний SSD-диск: тёмный корпус с наклейкой и индикатором
  function buildSsd(d) {
    const l = led(16, -10);
    return device(d, 32, 74, [
      ...deviceBody(d, { w: 48, h: 74, color: '#334155', rx: 7 }),
      s('rect', { x: -16, y: -60, width: 32, height: 22, rx: 3, fill: '#f8fafc' }),
      text(0, -49, 'SSD', { size: 13, weight: 800, fill: '#0f172a' }),
      s('rect', { x: -8, y: -6, width: 16, height: 6, rx: 2, fill: '#0f172a' }),
      l,
    ], l);
  }

  const devTop = (i) => BENCH - LIFT * ease(devT[i]) - devices[i].top;

  function drawDevices() {
    devGlow.setAttribute('opacity', params.device ? 0 : (0.5 + 0.3 * Math.sin(clock * 4)).toFixed(2));
    for (let i = 1; i < devices.length; i++) {
      const dev = devices[i];
      const e = ease(devT[i]);
      dev.g.setAttribute('transform', `translate(${DX[i]} ${(BENCH - LIFT * e).toFixed(1)}) scale(${DEV_SCALE})`);
      dev.shadow.setAttribute('opacity', (1 - 0.45 * e).toFixed(2));
      // Индикатор мигает во время записи и горит ровно у выбранного носителя
      const on = params.device === i && devT[i] >= 1;
      dev.led.setAttribute('opacity', on && copying() ? (Math.sin(clock * 22) > 0 ? 1 : 0.3) : on ? 1 : 0.25);
    }
  }

  // ---------- Папки ----------

  // Значок типа файлов: страница, снимок, нота, кадр видео
  function glyph(i, cx, cy, k = 1) {
    const c = KIND_COLOR[i];
    const parts = [
      [s('path', { d: 'M-7 -5 H7 M-7 0 H7 M-7 5 H3', stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round' })],
      [s('path', { d: 'M-9 7 L-3 -1 L1 3 L4 0 L9 7 Z', fill: c }), s('circle', { cx: 5, cy: -5, r: 2.6, fill: '#f59e0b' })],
      [s('path', { d: 'M-2 5 V-7 L7 -9 V3', fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round' }), s('circle', { cx: -4.5, cy: 5, r: 3, fill: c }), s('circle', { cx: 4.5, cy: 3, r: 3, fill: c })],
      [s('path', { d: 'M-4 -6 L6 0 L-4 6 Z', fill: c })],
    ][i];
    return s('g', { transform: `translate(${cx} ${cy}) scale(${k})`, 'pointer-events': 'none' }, parts);
  }

  // Папка в своих координатах: низ по центру — точка 0,0
  function folderShape(d, i, { w, h }) {
    const c = KIND_COLOR[i];
    const back = shade(c, -0.15);
    const x0 = -w / 2;
    const sheets = [0, 1, 2].map((k) => s('rect', { x: x0 + 10 + k * 5, y: -h + 8 - k * 5, width: w - 26, height: 40, rx: 2, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }));
    const parts = [
      s('path', { d: `M${x0} 0 V${-h + 8} Q${x0} ${-h} ${x0 + 8} ${-h} H${x0 + 42} L${x0 + 50} ${-h + 10} H${-x0 - 6} Q${-x0} ${-h + 10} ${-x0} ${-h + 16} V0 Z`, fill: back }),
      ...sheets,
      s('rect', { x: x0, y: -h + 26, width: w, height: h - 26, rx: 6, fill: d.lin([[0, shade(c, 0.35)], [1, shade(c, 0.1)]], 'v') }),
      s('rect', { x: x0 + 4, y: -h + 29, width: w - 8, height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.35 }),
      s('circle', { cx: 0, cy: -h / 2 + 4, r: 28, fill: '#ffffff', 'fill-opacity': 0.94 }),
      glyph(i, 0, -h / 2 + 4, 2),
    ];
    return { parts, sheets };
  }

  function buildFolder(svg, d, i) {
    const { parts, sheets } = folderShape(d, i, FOLDER);
    const outline = s('rect', { x: -FOLDER.w / 2 - 5, y: -FOLDER.h - 5, width: FOLDER.w + 10, height: FOLDER.h + 10, rx: 10, fill: 'none', stroke: COLORS.blue, 'stroke-width': 3 });
    const g = s('g', {}, [outline, ...parts]);
    const caption = text(FX[i], BENCH + 55, '', { size: 14, weight: 500, fill: '#94a3b8' });
    svg.append(
      floorShadow(FX[i], BENCH + 2, FOLDER.w * 0.55, d),
      g,
      text(FX[i], BENCH + 34, tr(KINDS[i].folder), { size: 15, weight: 700, fill: '#e2e8f0' }),
      caption,
    );
    g.addEventListener('pointerdown', () => {
      set('kind', i);
      drag = { i, moved: false, x: 0, y: 0 };
    });
    // Сцена ещё строится (scene не присвоена) — точку указателя берём у неё позже, при перетаскивании
    draggable({ point: (e) => scene.point(e) }, g, {
      onDrag(px, py) {
        if (!drag) return;
        drag.moved = true;
        drag.x = px;
        drag.y = py;
        ghost.setAttribute('transform', `translate(${px.toFixed(1)} ${(py + 40).toFixed(1)}) scale(0.5)`);
        ghost.setAttribute('opacity', 0.9);
      },
      onEnd() {
        ghost.setAttribute('opacity', 0);
        if (drag?.moved && overTarget(drag.x, drag.y)) {
          if (params.device) {
            // Повторное перетаскивание той же папки — копирование заново
            if (params.copy) copyKey = '';
            set('copy', 1);
          } else warnUntil = clock + 2.5;
        }
        drag = null;
      },
    });
    return { g, outline, sheets, caption, ghost: folderShape(d, i, FOLDER).parts };
  }

  // Папку можно бросить на выбранный носитель или на шкалу над ним
  const overTarget = (px, py) => {
    const i = params.device;
    if (!i) return px > DX[1] - 70 && py > CALL.y;
    const inCall = Math.abs(px - callCx) <= CALL.w / 2 + 10 && py >= CALL.y - 10 && py <= CALL.y + CALL.h + 24;
    const onDevice = Math.abs(px - DX[i]) < 70 && py >= devTop(i) - 30 && py <= BENCH + 20;
    return inCall || onDevice;
  };

  let ghostKind = -1;
  function drawFolders(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);
    folders.forEach((f, i) => {
      const on = params.kind === i;
      f.g.setAttribute('transform', `translate(${FX[i]} ${BENCH - (on ? 8 : 0)})`);
      // Выбранная папка обведена; пока файлы не скопированы — рамка пульсирует, зовёт перетащить
      f.outline.setAttribute('opacity', on ? (params.device && !params.copy ? (0.35 + 0.65 * pulse).toFixed(2) : 1) : 0);
      f.caption.textContent = `${params.count} × ${tr(size(KINDS[i].size))}`;
      // Толщина пачки листов в папке растёт с числом файлов
      const n = params.count >= 200 ? 3 : params.count >= 20 ? 2 : 1;
      f.sheets.forEach((sh, k) => sh.setAttribute('opacity', k < n ? 1 : 0));
    });
    if (ghostKind !== params.kind) {
      ghostKind = params.kind;
      ghost.replaceChildren(...folders[params.kind].ghost);
    }
    warn.setAttribute('opacity', !params.device && now < warnUntil ? 1 : 0);
  }

  // Во время копирования листки-файлы по дуге летят из выбранной папки в носитель
  function drawFlyers() {
    const on = copying() && devT[params.device] >= 1;
    if (!on) {
      flyers.setAttribute('opacity', 0);
      return;
    }
    if (flyers.dataset.kind !== String(params.kind)) {
      flyers.dataset.kind = String(params.kind);
      flyers.replaceChildren(...[0, 1, 2].map(() => s('g', {}, [
        s('rect', { x: -11, y: -14, width: 22, height: 28, rx: 3, fill: '#ffffff', stroke: KIND_COLOR[params.kind], 'stroke-width': 1.6 }),
        glyph(params.kind, 0, 0, 0.9),
      ])));
    }
    flyers.setAttribute('opacity', 1);
    const x0 = FX[params.kind];
    const y0 = BENCH - FOLDER.h - 8;
    const x1 = DX[params.device];
    const y1 = devTop(params.device) + 10;
    [...flyers.children].forEach((g, k) => {
      const t = ((clock / FLY_S + k / 3) % 1);
      const e = ease(t);
      const x = lerp(x0, x1, e);
      const y = lerp(y0, y1, e) - Math.sin(t * Math.PI) * 50;
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(1 - 0.4 * t).toFixed(2)})`);
      g.setAttribute('opacity', Math.min(1, 4 * (1 - t)).toFixed(2));
    });
  }

  // ---------- Шкала заполнения над носителем ----------

  function buildCall(svg, d) {
    const { w, h, y } = CALL;
    const x = -w / 2;
    // Справа от шкалы оставлено место под проценты: подпись не налезает на заливку при любом заполнении
    const bar = { x: x + 18, y: y + 44, w: w - 36 - 78, h: 24 };
    const card = s('rect', { x, y, width: w, height: h, rx: 14, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5, filter: d.url('soft') });
    const drop = s('rect', { x: x + 3, y: y + 3, width: w - 6, height: h - 6, rx: 12, fill: 'none', stroke: COLORS.blue, 'stroke-width': 2, 'stroke-dasharray': '7 5' });
    // Хвостик-указатель на носитель; его сдвигают, когда шкала прижата к краю сцены
    const tail = s('path', { d: '', fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.5, 'stroke-linejoin': 'round' });
    const tailCover = s('rect', { x: -12, y: y + h - 2, width: 24, height: 3, fill: '#ffffff' });
    // Заголовок: название носителя жирным, ёмкость — обычным
    const name = text(x + 18, y + 24, '', { size: 16, weight: 700, fill: '#0f172a', anchor: 'start' });
    const nameText = s('tspan', {});
    const cap = s('tspan', { 'font-weight': 500, fill: '#475569' });
    name.append(nameText, cap);
    const fill = s('rect', { x: bar.x, y: bar.y, width: 0, height: bar.h, rx: 7, fill: COLORS.blue });
    const pct = text(x + w - 18, bar.y + bar.h / 2 + 1, '', { size: 17, weight: 800, fill: '#0f172a', anchor: 'end' });
    const line1 = text(x + 18, y + 92, '', { size: 14, weight: 600, fill: '#334155', anchor: 'start' });
    const line2 = text(x + 18, y + 113, '', { size: 14, weight: 700, fill: COLORS.red, anchor: 'start' });
    const dropText = text(0, y + 102, tr('Перетащите папку на носитель'), { size: 14, weight: 600, fill: '#1d4ed8' });
    // Кнопка очистки носителя: в свободном опыте копирование можно повторять сколько угодно раз.
    // Стоит в правом верхнем углу, на строке заголовка, — не спорит со строками результата
    const clear = s('g', {}, [
      s('rect', { x: x + w - 98, y: y + 11, width: 80, height: 26, rx: 7, fill: '#f1f5f9', stroke: '#94a3b8', 'stroke-width': 1.2 }),
      text(x + w - 58, y + 24.5, tr('Очистить'), { size: 13, weight: 600, fill: '#334155' }),
    ]);
    clear.style.cursor = 'pointer';
    clear.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (clear.getAttribute('opacity') !== '0' && !copying()) set('copy', 0);
    });
    const g = s('g', {}, [
      tail, card, tailCover, drop, name,
      s('rect', { x: bar.x, y: bar.y, width: bar.w, height: bar.h, rx: 7, fill: '#e2e8f0' }),
      fill, pct, line1, line2, dropText, clear,
    ]);
    svg.append(g);
    return { g, tail, tailCover, drop, nameText, cap, bar, fill, pct, line1, line2, dropText, clear };
  }

  function drawCall(now, dt) {
    const c = call;
    const i = params.device;
    const dev = DEVICES[i];
    const ready = dev && devT[i] >= 1;
    hintBox.setAttribute('opacity', i ? 0 : 1);
    c.g.setAttribute('opacity', i ? clamp01(devT[i] * 1.5).toFixed(2) : 0);
    c.g.style.pointerEvents = i ? '' : 'none';
    if (!i) return;
    // Шкала переезжает к новому носителю плавно
    callCx = lerp(callCx, callX(i), clamp01(dt * 10));
    c.g.setAttribute('transform', `translate(${callCx.toFixed(1)} 0)`);
    const tx = DX[i] - callCx;
    const ty = CALL.y + CALL.h;
    c.tail.setAttribute('d', `M${(tx - 11).toFixed(1)} ${ty - 1} L${tx.toFixed(1)} ${devTop(i) - 12} L${(tx + 11).toFixed(1)} ${ty - 1}`);
    c.tailCover.setAttribute('x', (tx - 11).toFixed(1));
    c.nameText.textContent = capital(tr(dev.name));
    c.cap.textContent = ` ${tr(capacityText(dev))}`;

    const k = KINDS[params.kind];
    const total = params.copy && ready ? copied(params) : 0;
    // Счётчик идёт файл за файлом: занятое место всегда кратно размеру файла
    const shown = Math.floor(total * clamp01(progress) + 1e-9);
    const share = (shown * k.size) / dev.capacity;
    const done = params.copy && progress >= 1;
    const short = done && total < params.count;

    c.fill.setAttribute('width', (c.bar.w * share).toFixed(1));
    c.fill.setAttribute('fill', short ? COLORS.red : share > 0.9 ? COLORS.amber : COLORS.blue);
    // Тот же формат, что в показаниях модели: меньше 1 % — с двумя знаками
    c.pct.textContent = `${fmt(100 * share, share > 0 && share < 0.01 ? 2 : 1)} %`;

    const copyOn = Boolean(params.copy);
    c.drop.setAttribute('opacity', copyOn ? 0 : (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now * 4))).toFixed(2));
    c.dropText.setAttribute('opacity', copyOn ? 0 : 1);
    c.clear.setAttribute('opacity', done ? 1 : 0);
    c.clear.style.pointerEvents = done ? '' : 'none';
    c.line1.textContent = copyOn ? `${tr(done ? 'Скопировано:' : 'Копирование:')} ${tr(`${shown} из ${params.count}`)}` : '';
    c.line1.setAttribute('fill', done && !short ? COLORS.green : '#334155');
    c.line2.textContent = short ? `${tr('Не поместилось:')} ${params.count - total} ${tr('шт.')}` : '';
  }

  return {
    destroy() {
      scene.destroy();
    },
  };
}
