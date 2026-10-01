// Сцена «Утомление мышц»: кабинет биологии, кистевой эргограф. Предплечье лежит на мягкой подставке
// и пристёгнуто ремнём, к ремешку на кисти привязан шнур: через два блока на кронштейне он идёт
// к грузу с дисками по 1 кг. Сгибая кисть вниз, ученик поднимает груз.
// Справа — регистратор: на экране рисуется эргограмма (высота каждого подъёма по времени),
// под экраном — кнопка «Пуск» и переключатель вида работы «подъёмы / удержание».
// Опыт до утомления длится до 2 минут, поэтому запись на экране ускорена: любой опыт проходит
// примерно за 2 секунды, а показания и эргограмма — те же, что посчитала модель.
// Числа (подъёмы, время, работа) показывает только панель показаний под сценой — на сцене их не дублируем.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const BENCH = 470;
const WRIST = { x: 262, y: 284 }; // ось лучезапястного сустава
const ATTACH = { x: 45, y: -28 }; // кольцо ремешка на кисти (относительно запястья)
const FLEX = 45; // ° — сгибание кисти при полном подъёме груза
const PULLEY_A = { x: WRIST.x + ATTACH.x + 12, y: 150, r: 12 };
const PULLEY_B = { x: 432, y: 150, r: 12 };
const HANG_X = PULLEY_B.x + PULLEY_B.r;
const DISC_H = 11;
const HOOK_REST = BENCH - 92; // верх крючка, когда груз стоит на столе: подвес высотой 92 px
const SCREEN = { x1: 576, x2: 924, top: 198, bottom: 414 };
const PLOT = { x1: 620, x2: 900, top: 262, base: 368 }; // поле графика: 0…120 с по горизонтали, 0…h по вертикали
const START = { x: 584, y: 444, w: 120 };
const SWITCH = { x: 722, y: 444, w: 98 }; // две клавиши «Подъёмы» и «Удержание»
const PLAY = 2.2; // с — сколько длится ускоренная запись любого опыта

const SKIN = '#e8b896';

// Точка крепления шнура на кисти при сгибании на угол a (в градусах, вниз — положительный)
function attachAt(a) {
  const r = (a * Math.PI) / 180;
  return { x: WRIST.x + ATTACH.x * Math.cos(r) - ATTACH.y * Math.sin(r), y: WRIST.y + ATTACH.x * Math.sin(r) + ATTACH.y * Math.cos(r) };
}
// Длина шнура от кольца до блока A: насколько она выросла, настолько поднялся груз — шнур нерастяжим
const cordToA = (a) => {
  const p = attachAt(a);
  return Math.hypot(p.x - (PULLEY_A.x - PULLEY_A.r), p.y - PULLEY_A.y);
};
const L0 = cordToA(0);

export function musculoskeletalScene(container, params, set, { liftRun, holdTime, LIMIT }) {
  let hand, cord, weightG, discs, weightLabel, trace, traceClip, fatigueG, fatigueLine, fatigueText;
  let modeKeys, startLed;
  // Ход опыта: idle — кисть расслаблена; play — идёт ускоренная запись; done — запись окончена
  let phase = 'idle';
  let tp = 0; // время опыта, с (ускоренное)
  let tEnd = 0;
  let run = null; // результат модели для текущего опыта
  let hold = 0;
  let key = '';
  let angle = 0;
  let wobble = 0;

  const X = (t) => PLOT.x1 + (t / LIMIT) * (PLOT.x2 - PLOT.x1);
  const Y = (a) => PLOT.base - a * (PLOT.base - PLOT.top);

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);


      // ── Кронштейн эргографа: стойка, перекладина и два блока ──
      const rodX = 500;
      svg.append(
        floorShadow(rodX, BENCH + 2, 30, d),
        s('rect', { x: rodX - 22, y: BENCH - 10, width: 44, height: 12, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
        s('rect', { x: rodX - 5, y: 128, width: 10, height: BENCH - 136, rx: 3, fill: d.url('metal') }),
        s('rect', { x: 292, y: 122, width: rodX - 284, height: 10, rx: 4, fill: d.lin([[0, '#cbd5e1'], [0.5, '#94a3b8'], [1, '#64748b']], 'v') }),
        s('rect', { x: rodX - 10, y: 116, width: 20, height: 22, rx: 4, fill: d.lin([[0, '#475569'], [0.5, '#94a3b8'], [1, '#334155']]) }),
      );
      // Шнур рисуем под блоками: он огибает их сверху
      cord = s('path', { fill: 'none', stroke: '#7c5a3a', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      svg.append(cord);
      for (const p of [PULLEY_A, PULLEY_B]) {
        svg.append(
          s('path', { d: `M${p.x - 6} 132 L${p.x - 4} ${p.y} M${p.x + 6} 132 L${p.x + 4} ${p.y}`, stroke: '#475569', 'stroke-width': 3, 'stroke-linecap': 'round' }),
          s('circle', { cx: p.x, cy: p.y, r: p.r + 1, fill: d.rad(['#e2e8f0', '#64748b']), stroke: '#334155', 'stroke-width': 1.2 }),
          s('circle', { cx: p.x, cy: p.y, r: p.r - 4, fill: 'none', stroke: '#475569', 'stroke-width': 1 }),
          s('circle', { cx: p.x, cy: p.y, r: 2.6, fill: '#1e293b' }),
        );
      }

      // ── Груз: подвес с дисками по 1 кг ──
      discs = [];
      weightLabel = text(0, 0, '', { size: 13, weight: 700, fill: '#f8fafc' });
      weightG = s('g');
      weightG.append(
        s('path', { d: 'M0 0 V10 Q0 16 -5 16 Q-10 16 -10 11', fill: 'none', stroke: '#475569', 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
        s('rect', { x: -2, y: 12, width: 4, height: 80, fill: '#64748b' }),
      );
      for (let i = 0; i < 6; i++) {
        const disc = s('g', {}, [
          s('rect', { x: -27, y: 0, width: 54, height: DISC_H - 1, rx: 3, fill: d.lin([[0, '#1f2937'], [0.3, '#6b7280'], [0.6, '#374151'], [1, '#111827']]) }),
          s('rect', { x: -27, y: 0, width: 54, height: 2, rx: 1, fill: '#ffffff', 'fill-opacity': 0.22 }),
        ]);
        discs.push(disc);
        weightG.append(disc);
      }
      weightG.append(
        s('rect', { x: -30, y: 0, width: 60, height: 14, rx: 3, fill: d.lin([[0, '#334155'], [0.35, '#94a3b8'], [1, '#1e293b']]), class: 'base' }),
        weightLabel,
      );
      svg.append(weightG);

      // ── Подставка для предплечья: деревянная тумба с мягкой подушкой ──
      svg.append(
        floorShadow(140, BENCH + 2, 130, d),
        s('rect', { x: 30, y: 312, width: 220, height: BENCH - 312, rx: 6, fill: d.lin([[0, '#c08b5c'], [1, '#8a5a35']], 'v') }),
        s('rect', { x: 30, y: 312, width: 220, height: 6, rx: 3, fill: '#ffffff', 'fill-opacity': 0.25 }),
        s('rect', { x: 44, y: 340, width: 192, height: 110, rx: 4, fill: 'none', stroke: '#6b4226', 'stroke-opacity': 0.35, 'stroke-width': 2 }),
        s('rect', { x: 24, y: 298, width: 232, height: 18, rx: 9, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
      );

      // ── Рука: рукав, предплечье, ремень, кисть ──
      svg.append(
        // предплечье сужается к запястью
        s('path', { d: `M60 262 C 140 258, 210 266, ${WRIST.x} 270 L ${WRIST.x} 299 C 210 302, 140 304, 60 302 Z`, fill: d.lin([[0, shade(SKIN, 0.12)], [0.55, SKIN], [1, shade(SKIN, -0.22)]], 'v'), stroke: shade(SKIN, -0.35), 'stroke-width': 1 }),
        s('path', { d: 'M110 272 C 160 270, 210 274, 250 276', fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 3, 'stroke-linecap': 'round' }),
        // рукав рубашки с манжетой
        s('path', { d: 'M0 248 H86 Q96 282 86 316 H0 Z', fill: d.lin([[0, '#60a5fa'], [1, '#1d4ed8']], 'v') }),
        s('rect', { x: 76, y: 250, width: 14, height: 64, rx: 5, fill: d.lin([[0, '#93c5fd'], [1, '#2563eb']], 'v') }),
        // ремень, который прижимает предплечье к подставке: работает только кисть
        s('rect', { x: 182, y: 260, width: 18, height: 52, rx: 4, fill: d.lin([[0, '#1e293b'], [0.5, '#475569'], [1, '#1e293b']]) }),
        s('rect', { x: 184, y: 280, width: 14, height: 10, rx: 2, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1.6 }),
      );
      hand = s('g', {}, [
        s('rect', { x: -6, y: -40, width: 90, height: 84, fill: '#000', 'fill-opacity': 0 }), // зона щелчка
        // запястье: скруглённый сустав закрывает стык предплечья и кисти при сгибании
        s('circle', { cx: 0, cy: 0.5, r: 14.5, fill: d.lin([[0, shade(SKIN, 0.1)], [0.55, SKIN], [1, shade(SKIN, -0.22)]], 'v') }),
        // кисть, сжатая в кулак (вид сбоку, ладонь вниз): тыльная сторона, костяшки, подогнутые пальцы
        s('path', { d: 'M-4 -15 C 14 -19, 38 -22, 56 -20 C 66 -18, 72 -10, 73 -1 C 74 9, 70 17, 62 20 C 50 23, 30 22, 14 20 C 6 19, 0 18, -4 15 Z', fill: d.lin([[0, shade(SKIN, 0.12)], [0.55, SKIN], [1, shade(SKIN, -0.25)]], 'v'), stroke: shade(SKIN, -0.38), 'stroke-width': 1.1 }),
        // средние фаланги согнутых пальцев и кончики, подогнутые к ладони
        s('path', { d: 'M56 -20 C 60 -10, 60 2, 56 12 M56 12 C 50 17, 42 19, 34 20 M66 -16 C 69 -8, 70 2, 67 11', fill: 'none', stroke: shade(SKIN, -0.4), 'stroke-width': 1.1, 'stroke-linecap': 'round' }),
        s('path', { d: 'M44 -21 C 50 -22, 56 -21, 58 -19', fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': 2, 'stroke-linecap': 'round' }),
        // большой палец лежит вдоль указательного, с ногтем на конце
        s('path', { d: 'M8 2 C 22 1, 38 4, 50 7 C 56 8, 57 14, 51 15 C 38 16, 20 14, 6 12 Z', fill: shade(SKIN, 0.05), stroke: shade(SKIN, -0.35), 'stroke-width': 1 }),
        s('ellipse', { cx: 52, cy: 10.5, rx: 3.6, ry: 2.6, fill: '#f6d5c3', stroke: shade(SKIN, -0.3), 'stroke-width': 0.8 }),
        // ремешок эргографа с кольцом для шнура
        s('rect', { x: 39, y: -22, width: 11, height: 44, rx: 3, fill: d.lin([[0, '#7f1d1d'], [0.5, '#b91c1c'], [1, '#7f1d1d']]) }),
        s('circle', { cx: ATTACH.x, cy: ATTACH.y + 1, r: 4.5, fill: 'none', stroke: '#64748b', 'stroke-width': 2 }),
      ]);
      hand.style.cursor = 'pointer';
      hand.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        start();
      });
      touchTarget(hand, 10);
      svg.append(hand);


      // ── Регистратор: экран с эргограммой и пульт ──
      const sw = SCREEN.x2 - SCREEN.x1;
      svg.append(
        floorShadow((SCREEN.x1 + SCREEN.x2) / 2, BENCH + 2, 180, d),
        s('rect', { x: SCREEN.x1 - 8, y: SCREEN.top - 10, width: sw + 16, height: BENCH - SCREEN.top + 6, rx: 14, fill: d.lin([[0, '#475569'], [0.4, '#334155'], [1, '#1e293b']], 'v'), stroke: '#0f172a', 'stroke-width': 1 }),
        s('rect', { x: SCREEN.x1 - 6, y: SCREEN.top - 8, width: sw + 12, height: 10, rx: 8, fill: '#ffffff', 'fill-opacity': 0.12 }),
        s('rect', { x: SCREEN.x1, y: SCREEN.top, width: sw, height: SCREEN.bottom - SCREEN.top, rx: 8, fill: d.lin([[0, '#0b1220'], [1, '#111b2e']], 'v') }),
        text(SCREEN.x1 + 14, SCREEN.top + 20, tr('Эргограмма'), { size: 15, weight: 700, fill: '#e2e8f0', anchor: 'start' }),
      );
      // Оси графика без сетки: по горизонтали время 0…120 с, по вертикали высота подъёма 0…5 см
      svg.append(
        s('line', { x1: PLOT.x1, x2: PLOT.x2 + 4, y1: PLOT.base, y2: PLOT.base, stroke: '#64748b', 'stroke-width': 1.5 }),
        s('line', { x1: PLOT.x1 - 4, x2: PLOT.x2, y1: PLOT.top, y2: PLOT.top, stroke: '#334155', 'stroke-width': 1, 'stroke-dasharray': '3 4' }),
        text(PLOT.x1 - 8, PLOT.top, tr('5 см'), { size: 13, weight: 600, fill: '#94a3b8', anchor: 'end' }),
        text(PLOT.x1 - 8, PLOT.base, '0', { size: 13, weight: 600, fill: '#94a3b8', anchor: 'end' }),
        text(PLOT.x2, PLOT.base + 20, tr('120 с'), { size: 13, weight: 600, fill: '#94a3b8', anchor: 'end' }),
      );
      // Эргограмма целиком строится сразу, а «пишется» за счёт растущей маски слева направо
      traceClip = s('rect', { x: PLOT.x1 - 2, y: PLOT.top - 20, width: 0, height: PLOT.base - PLOT.top + 24 });
      defs.append(s('clipPath', { id: `erg${uid}` }, [traceClip]));
      trace = s('path', { fill: 'none', stroke: '#34d399', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'clip-path': `url(#erg${uid})` });
      svg.append(trace);
      fatigueLine = s('line', { y1: PLOT.top - 6, y2: PLOT.base, stroke: '#f87171', 'stroke-width': 1.6, 'stroke-dasharray': '5 4' });
      fatigueText = text(0, PLOT.top - 16, tr('утомление'), { size: 13, weight: 700, fill: '#fca5a5' });
      fatigueG = s('g', { opacity: 0 }, [fatigueLine, fatigueText]);
      svg.append(fatigueG);

      // Пульт под экраном: кнопка «Пуск» и переключатель вида работы из двух клавиш
      startLed = s('rect', { x: START.x, y: START.y - 16, width: START.w, height: 32, rx: 16, fill: d.lin([[0, '#4ade80'], [1, '#15803d']], 'v'), stroke: '#14532d', 'stroke-width': 1.5 });
      const startBtn = s('g', {}, [
        startLed,
        s('path', { d: `M${START.x + 16} ${START.y - 6} L${START.x + 26} ${START.y} L${START.x + 16} ${START.y + 6} Z`, fill: '#f0fdf4' }),
        text(START.x + 34, START.y + 1, tr('Пуск'), { size: 14, weight: 700, fill: '#f0fdf4', anchor: 'start' }),
      ]);
      startBtn.style.cursor = 'pointer';
      startBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        start();
      });
      touchTarget(startBtn, 8);
      svg.append(startBtn);

      svg.append(s('rect', { x: SWITCH.x - 3, y: SWITCH.y - 19, width: SWITCH.w * 2 + 6, height: 38, rx: 10, fill: '#0f172a', stroke: '#475569', 'stroke-width': 1 }));
      modeKeys = ['Подъёмы', 'Удержание'].map((label, i) => {
        const bg = s('rect', { x: SWITCH.x + i * SWITCH.w, y: SWITCH.y - 16, width: SWITCH.w, height: 32, rx: 8 });
        const caption = text(SWITCH.x + i * SWITCH.w + SWITCH.w / 2, SWITCH.y + 1, tr(label), { size: 13, weight: 700 });
        const key = s('g', {}, [bg, caption]);
        key.style.cursor = 'pointer';
        key.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          set('mode', i);
        });
        touchTarget(key, 6);
        svg.append(key);
        return { bg, caption };
      });
    },

    frame(dt, now) {
      const k = `${params.run}|${params.m}|${params.rate}|${params.mode}`;
      if (k !== key) {
        key = k;
        layoutDiscs();
        // Новые условия — опыт проводится заново: запись стирается и начинается с нуля
        if (params.run) begin();
        else phase = 'idle';
      }

      let target = 0;
      let shake = 0;
      if (phase === 'play') {
        tp = Math.min(tEnd, tp + (dt * tEnd) / PLAY);
        if (tp >= tEnd) phase = 'done';
      }
      if (phase !== 'idle' && run) {
        if (params.mode) {
          // Удержание: кисть согнута всё время; к концу мышца дрожит, затем груз опускается
          const left = hold - tp;
          if (left > 0) {
            target = 1;
            shake = Math.max(0, 1 - left / (hold * 0.3));
          } else target = Math.max(0, 1 + left / 3);
        } else if (phase === 'play') {
          // Подъёмы показаны в удобном для глаза темпе; высота — как у текущего подъёма на эргограмме
          const cur = run.trace.filter((p) => p.t <= tp).at(-1);
          const amp = cur && tp - cur.t < run.cycle * 1.5 ? cur.a : 0;
          target = amp * Math.max(0, Math.sin((now * Math.PI) / 0.32)) ** 0.6;
          shake = run.tired ? Math.max(0, (tp - run.time * 0.75) / (run.time * 0.25)) : 0;
        }
      }
      if (phase === 'done' && !params.mode) target = 0;
      angle += (target * FLEX - angle) * Math.min(1, dt * 18);
      wobble = shake > 0 ? Math.sin(now * 55) * 1.6 * Math.min(1, shake) : 0;
      const a = angle + wobble;
      hand.setAttribute('transform', `translate(${WRIST.x} ${WRIST.y}) rotate(${a.toFixed(2)})`);

      // Шнур нерастяжим: груз поднимается ровно на столько, на сколько кисть вытянула шнур
      const lift = Math.max(0, cordToA(a) - L0);
      const hookY = HOOK_REST - lift;
      const p = attachAt(a);
      const ax = PULLEY_A.x - PULLEY_A.r;
      cord.setAttribute('d', `M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${ax} ${PULLEY_A.y} A ${PULLEY_A.r} ${PULLEY_A.r} 0 0 1 ${PULLEY_A.x} ${PULLEY_A.y - PULLEY_A.r} L${PULLEY_B.x} ${PULLEY_B.y - PULLEY_B.r} A ${PULLEY_B.r} ${PULLEY_B.r} 0 0 1 ${HANG_X} ${PULLEY_B.y} L${HANG_X} ${hookY.toFixed(1)}`);
      weightG.setAttribute('transform', `translate(${HANG_X} ${hookY.toFixed(1)})`);

      // Эргограмма «пишется» слева направо; линия утомления появляется, когда до неё дошла запись
      const shown = phase === 'idle' ? 0 : tp;
      traceClip.setAttribute('width', phase === 'idle' ? 0 : (X(shown) - PLOT.x1 + 3).toFixed(1));
      const tFat = !run ? null : params.mode ? hold : run.tired ? run.time : null;
      fatigueG.setAttribute('opacity', phase !== 'idle' && tFat !== null && shown >= tFat ? 1 : 0);
      modeKeys.forEach((k, i) => {
        const on = params.mode === i;
        k.bg.setAttribute('fill', on ? '#f59e0b' : '#1e293b');
        k.caption.setAttribute('fill', on ? '#1c1917' : '#94a3b8');
      });
      startLed.setAttribute('fill-opacity', phase === 'play' ? 0.55 + 0.45 * Math.abs(Math.sin(now * 6)) : 1);
    },
  });

  // Число дисков на подвесе и подпись массы
  function layoutDiscs() {
    discs.forEach((g, i) => {
      g.setAttribute('transform', `translate(0 ${78 - (i + 1) * DISC_H})`);
      g.setAttribute('opacity', i < params.m ? 1 : 0);
    });
    weightG.querySelector('.base').setAttribute('y', 78);
    weightLabel.setAttribute('x', 0);
    weightLabel.setAttribute('y', 85.5);
    weightLabel.textContent = `${params.m} ${tr('кг')}`;
  }

  // Начать опыт заново с текущими условиями: запись стирается, эргограмма строится по модели
  function begin() {
    run = liftRun(params);
    hold = holdTime(params);
    tp = 0;
    phase = 'play';
    if (params.mode) {
      tEnd = Math.min(LIMIT, hold + 4);
      trace.setAttribute('stroke', '#fbbf24');
      // Ровная линия удержания; к концу появляется дрожание, затем груз опускается за 3 с
      let d = `M${X(0)} ${Y(1)}`;
      for (let t = 0.5; t <= tEnd; t += 0.5) {
        const left = hold - t;
        const tremor = left > 0 ? Math.max(0, 1 - left / (hold * 0.3)) * Math.sin(t * 9) * 0.05 : 0;
        const a = left > 0 ? 1 : Math.max(0, 1 + left / 3);
        d += ` L${X(t).toFixed(1)} ${Y(Math.min(1, a - Math.abs(tremor))).toFixed(1)}`;
      }
      trace.setAttribute('d', d);
    } else {
      tEnd = run.tired ? run.trace.at(-1).t + run.cycle : LIMIT;
      trace.setAttribute('stroke', '#34d399');
      // Каждый подъём — вертикальный штрих высотой, на которую подняли груз
      trace.setAttribute('d', run.trace.map((p) => `M${X(p.t).toFixed(1)} ${PLOT.base} V${Y(p.a).toFixed(1)}`).join(' '));
    }
    const tFat = params.mode ? hold : run.tired ? run.time : null;
    if (tFat !== null) {
      const x = X(tFat);
      fatigueLine.setAttribute('x1', x);
      fatigueLine.setAttribute('x2', x);
      // Подпись — с той стороны линии, где больше места, чтобы не уходила за край экрана
      const right = x < (PLOT.x1 + PLOT.x2) / 2;
      fatigueText.setAttribute('x', right ? x + 6 : x - 6);
      fatigueText.setAttribute('text-anchor', right ? 'start' : 'end');
    }
  }

  // «Пуск» и щелчок по кисти: первый раз начинают опыт, потом — повторяют его с начала
  function start() {
    if (!params.run) set('run', 1);
    else begin();
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
