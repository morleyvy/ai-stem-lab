// Сцена «Амины и аминокислоты»: вытяжной шкаф (метиламин пахнет, анилин ядовит, бром едкий).
// Слева — склянки с растворами метиламина, анилина и глицина и две склянки с индикаторами;
// в центре — пробирка в лапке штатива; справа — склянки с капельницами: соляная кислота,
// раствор NaOH и бромная вода. На стене — шкала универсального индикатора, по которой видно,
// какому pH соответствует окраска раствора. Числа (pH, состав) показывает только панель показаний
// под сценой, поэтому pH-метра и бирки на сцене нет — пробирка остаётся единственным центром внимания.
//   щелчок по склянке с веществом → 5 мл раствора наливаются в чистую пробирку (substance);
//   капельницу с индикатором или реактивом переносят к горлышку пробирки или просто нажимают
//   на неё → индикатор капает, реактив добавляется (indicator, reagent).
// Добавление идёт постепенно, и окраска и осадок следуют за моделью на каждом шаге:
// видно, как индикатор меняет цвет по мере того, как в пробирку капает кислота или щёлочь.
// Если новое содержимое нельзя получить добавлением к старому (другое вещество, другой индикатор
// или реактив), опыт повторяют в чистой пробирке: старый раствор выливается, наливается новый.

import { createScene, draggable, floorShadow, mixHex, room, s, text, touchTarget } from '../kit.js';
import { tr } from '../../i18n.js';

const BENCH = 456;
const TUBE = { x: 535, top: 150, bottom: 420, w: 46 };
const INNER_BOTTOM = TUBE.bottom - 3;
const ML = 12; // px на миллилитр раствора в пробирке
const MOUTH = { x: TUBE.x - 9, y: TUBE.top + 8 }; // где капельница держится над горлышком
const ROD = { x: 604, top: 130 };
const ARM_Y = 190;

const SUB_X = [60, 140, 220];
const IND_X = [316, 424];
const REAG_X = [712, 796, 885];
const BOTTLE = { w: 58, h: 86 };

const CLEAR = '#dfe9f2'; // бесцветный раствор: лёгкий голубоватый отлив, чтобы жидкость была видна
const CRIMSON = '#c0166a'; // малиновая форма фенолфталеина
const BROMINE = '#df9a22'; // бромная вода
const IND_COLOR = [null, '#eef2f6', '#e58a2c']; // фенолфталеин бесцветен, универсальный индикатор оранжевый
const REAG_COLOR = [null, '#eef2f6', '#eef2f6', BROMINE];

// Шкала универсального индикатора, pH 1…14 — те же оттенки, что на коробке индикаторной бумаги
const SCALE = ['#d7262b', '#e8462a', '#f07a26', '#f6a12a', '#f4c32c', '#d9cf35', '#86c043', '#3fa95a', '#24908a', '#2a68ad', '#3a4aa3', '#4f3696', '#5e2b86', '#6a2479'];
function universalColor(ph) {
  const k = Math.max(1, Math.min(14, ph)) - 1;
  const i = Math.min(12, Math.floor(k));
  return mixHex(SCALE[i], SCALE[i + 1], k - i);
}

const lerp = (a, b, k) => a + (b - a) * k;
const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function tubePath(x, top, bottom, w) {
  const r = w / 2;
  return `M${x - r} ${top} V${bottom - r} A ${r} ${r} 0 0 0 ${x + r} ${bottom - r} V${top}`;
}

export function aminesScene(container, params, set, { pH, pinkShare, precipitate, bromineLeft, SUBSTANCES }) {
  // Что сейчас в пробирке: вещество, индикатор (ind, доля перемешивания indK),
  // реактив (reag, долю добавленного объёма add) и уровень налитого раствора fill (0…1 от 5 мл)
  const tube = { sub: params.substance, ind: params.indicator, indK: params.indicator ? 1 : 0, reag: 0, add: 0, V: params.V, fill: 0 };
  let phase = 'pour'; // drain → pour → ready
  let liquid, milky, surface, sediment, scaleMarker, pending;
  const flakes = [];
  const drops = [];
  const subMarks = [];
  const indMarks = [];
  const reagMarks = [];
  let topLayer;

  // Капельницы: kind — indicator | reagent, value — что ставится регулятором.
  // rest — в склянке, drag — в руке, fly — летит к пробирке, drip — капает, back — возвращается
  const droppers = [
    ...IND_X.map((x, i) => ({ kind: 'indicator', value: i + 1, x, color: IND_COLOR[i + 1] })),
    ...REAG_X.map((x, i) => ({ kind: 'reagent', value: i + 1, x, color: REAG_COLOR[i + 1] })),
  ].map((dr) => ({ ...dr, state: 'rest', pos: { x: dr.x, y: BENCH - 26 }, rest: { x: dr.x, y: BENCH - 26 }, node: null, home: null, fill: null, dripT: 0, moved: false, grab: { dx: 0, dy: 0 } }));

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'hood' });
      const defs = svg.querySelector('defs');
      const uid = Math.random().toString(36).slice(2);

      buildScale(svg);

      // ── Штатив с лапкой ──
      svg.append(
        floorShadow(ROD.x, BENCH + 2, 50, d),
        s('rect', { x: ROD.x - 46, y: BENCH - 12, width: 92, height: 12, rx: 4, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
        s('rect', { x: ROD.x - 5, y: ROD.top, width: 10, height: BENCH - 12 - ROD.top, rx: 3, fill: d.url('metal') }),
        s('rect', { x: ROD.x - 12, y: ARM_Y - 10, width: 24, height: 20, rx: 4, fill: d.lin([[0, '#475569'], [0.5, '#94a3b8'], [1, '#334155']]) }),
        s('rect', { x: TUBE.x + TUBE.w / 2 + 4, y: ARM_Y - 4, width: ROD.x - 12 - TUBE.x - TUBE.w / 2 - 4, height: 8, rx: 3, fill: d.lin([[0, '#cbd5e1'], [1, '#64748b']], 'v') }),
      );

      // ── Пробирка ──
      const tubeClip = `amtube${uid}`;
      defs.append(s('clipPath', { id: tubeClip }, [s('path', { d: tubePath(TUBE.x, TUBE.top, INNER_BOTTOM, TUBE.w - 5) })]));
      const content = s('g', { 'clip-path': `url(#${tubeClip})` });
      liquid = s('rect', { x: TUBE.x - 24, width: 48, fill: CLEAR, 'fill-opacity': 0.9 });
      milky = s('rect', { x: TUBE.x - 24, width: 48, fill: '#ebe8de', opacity: 0 });
      surface = s('ellipse', { cx: TUBE.x, rx: 19, ry: 2.8, fill: '#ffffff', 'fill-opacity': 0.55, stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 1 });
      sediment = s('path', { d: `M${TUBE.x - 20} ${INNER_BOTTOM - 16} Q ${TUBE.x} ${INNER_BOTTOM - 22} ${TUBE.x + 20} ${INNER_BOTTOM - 16} V${INNER_BOTTOM + 2} H${TUBE.x - 20} Z`, fill: '#f3f1ea', stroke: '#a8a29e', 'stroke-width': 1, opacity: 0 });
      // Взвесь осадка — отдельным слоем поверх блика стекла, чтобы муть была хорошо видна
      const turbid = s('g', { 'clip-path': `url(#${tubeClip})`, 'pointer-events': 'none' });
      content.append(liquid);
      turbid.append(milky, sediment);
      // Хлопья триброманилина: выпадают по всему объёму и оседают на дно
      for (let i = 0; i < 40; i++) {
        const c = s('circle', { cx: TUBE.x - 16 + ((i * 37) % 33), cy: INNER_BOTTOM - 18 - ((i * 23) % 64), r: 1.6 + (i % 3) * 0.8, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 0.6, opacity: 0 });
        flakes.push(c);
        turbid.append(c);
      }
      content.append(
        s('rect', { x: TUBE.x - 24, y: TUBE.top, width: 48, height: TUBE.bottom - TUBE.top, fill: d.lin([[0, '#0f172a', 0.12], [0.35, '#ffffff', 0.22], [1, '#0f172a', 0.15]]) }),
        surface,
      );
      for (let i = 0; i < 5; i++) {
        const c = s('ellipse', { rx: 2.6, ry: 3.4, stroke: '#94a3b8', 'stroke-width': 0.7, opacity: 0, 'pointer-events': 'none' });
        drops.push({ c, y: 0, v: 0, live: false, dr: null });
      }
      svg.append(
        floorShadow(TUBE.x, BENCH + 2, 30, d),
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: '#eef3f7', 'fill-opacity': 0.3 }),
        content,
        ...drops.map((p) => p.c),
      );

      svg.append(turbid);
      svg.append(
        s('path', { d: tubePath(TUBE.x, TUBE.top, TUBE.bottom, TUBE.w), fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 3, y: TUBE.top - 3, width: TUBE.w + 6, height: 5, rx: 2.5, fill: '#dbe3ea', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 + 5, y: TUBE.top + 12, width: 3.5, height: TUBE.bottom - TUBE.top - 40, rx: 1.75, fill: '#ffffff', 'fill-opacity': 0.75 }),
        // Мерные риски пробирки: 5, 10 и 15 мл
        ...[5, 10, 15].flatMap((ml) => {
          const y = INNER_BOTTOM - ml * ML;
          return [
            s('line', { x1: TUBE.x - TUBE.w / 2 + 2, x2: TUBE.x - TUBE.w / 2 + 12, y1: y, y2: y, stroke: '#64748b', 'stroke-width': 1.4 }),
            text(TUBE.x - TUBE.w / 2 - 6, y, String(ml), { size: 13, weight: 600, fill: '#475569', anchor: 'end' }),
          ];
        }),
        text(TUBE.x - TUBE.w / 2 - 6, INNER_BOTTOM - 15 * ML - 18, 'мл', { size: 13, weight: 600, fill: '#475569', anchor: 'end' }),
        // Лапка штатива обжимает пробирку
        s('rect', { x: TUBE.x - TUBE.w / 2 - 6, y: ARM_Y - 9, width: TUBE.w + 12, height: 18, rx: 5, fill: d.lin([[0, '#475569'], [0.5, '#cbd5e1'], [1, '#334155']]), stroke: '#334155', 'stroke-width': 1 }),
        s('rect', { x: TUBE.x - TUBE.w / 2 - 2, y: ARM_Y - 6, width: TUBE.w + 4, height: 12, rx: 3, fill: '#7c5a3a', 'fill-opacity': 0.85 }),
      );

      // ── Склянки с растворами веществ ──
      svg.append(text(SUB_X[1], 302, tr('Растворы'), { size: 15, weight: 700, fill: '#334155' }));
      const labels = [['CH₃NH₂'], ['C₆H₅NH₂'], ['NH₂CH₂', 'COOH']];
      SUBSTANCES.forEach((sub, i) => {
        const x = SUB_X[i];
        const mark = s('rect', { x: x - 37, y: BENCH - 128, width: 74, height: 128, rx: 12, fill: '#bae6fd', 'fill-opacity': 0.45, stroke: '#0ea5e9', 'stroke-width': 2, opacity: 0 });
        subMarks.push(mark);
        const lines = labels[i];
        const g = s('g', {}, [
          floorShadow(x, BENCH + 2, 32, d),
          ...bottle(d, x, CLEAR, 0.4),
          s('rect', { x: x - 8, y: BENCH - BOTTLE.h - 24, width: 16, height: 14, rx: 3, fill: d.lin([[0, '#e2e8f0'], [0.5, '#ffffff'], [1, '#cbd5e1']]), stroke: '#94a3b8', 'stroke-width': 1 }),
          s('rect', { x: x - 26, y: BENCH - 58, width: 52, height: lines.length > 1 ? 34 : 24, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
          ...lines.map((l, k) => text(x, BENCH - 46 + k * 15 + (lines.length > 1 ? -1 : 0), l, { size: 13, weight: 700, fill: '#1e3a8a' })),
        ]);
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          // Новое вещество — новая пробирка: реактив в неё ещё не добавлен, индикатор берут тот же
          if (params.reagent) set('reagent', 0);
          if (params.substance === i) freshTube();
          set('substance', i);
        });
        touchTarget(g, 10);
        svg.append(mark, g, text(x, BENCH + 30, tr(capital(sub.name)), { size: 13, weight: 600, fill: '#e2e8f0' }));
      });

      // ── Индикаторы и реактивы: склянки с капельницами ──
      svg.append(
        text((IND_X[0] + IND_X[1]) / 2, 302, tr('Индикаторы'), { size: 15, weight: 700, fill: '#334155' }),
        text(REAG_X[1], 302, tr('Реактивы'), { size: 15, weight: 700, fill: '#334155' }),
      );
      const bottleLabel = { indicator: ['Ф', 'УИ'], reagent: ['HCl', 'NaOH', 'Br₂'] };
      const captions = { indicator: [[tr('фенолфталеин')], [tr('универсальный'), tr('индикатор')]], reagent: [[tr('кислота')], [tr('щёлочь')], [tr('бромная вода')]] };
      for (const dr of droppers) {
        const x = dr.x;
        const mark = s('rect', { x: x - 37, y: BENCH - 140, width: 74, height: 140, rx: 12, fill: '#ddd6fe', 'fill-opacity': 0.4, stroke: '#7c3aed', 'stroke-width': 2, opacity: 0 });
        (dr.kind === 'indicator' ? indMarks : reagMarks).push(mark);
        dr.fill = s('rect', { x: -1.8, y: -34, width: 3.6, height: 30, fill: dr.color === IND_COLOR[1] ? '#cbd5e1' : dr.color, 'fill-opacity': 0.95 });
        dr.node = s('g', {}, [
          s('rect', { x: -30, y: -110, width: 60, height: 136, fill: '#000', 'fill-opacity': 0 }), // зона захвата: капельница и склянка под ней
          s('path', { d: 'M-1.1 0 L-3 -14 V-70 H3 V-14 L1.1 0 Z', fill: '#f8fafc', 'fill-opacity': 0.55, stroke: '#94a3b8', 'stroke-width': 1.1 }),
          dr.fill,
          s('rect', { x: -11, y: -76, width: 22, height: 8, rx: 2, fill: '#1f2937' }),
          s('path', { d: 'M-7 -76 V-90 Q-9 -100 0 -104 Q9 -100 7 -90 V-76 Z', fill: d.lin([[0, '#7f1d1d'], [0.45, '#b91c1c'], [1, '#7f1d1d']]) }),
        ]);
        dr.home = s('g', {}, [dr.node]);
        const idx = dr.value - 1;
        const caption = captions[dr.kind][idx];
        svg.append(mark, floorShadow(x, BENCH + 2, 32, d), dr.home);
        // Склянка пропускает нажатия к капельнице: взять её можно и за саму склянку
        svg.append(s('g', { 'pointer-events': 'none' }, [
          ...bottle(d, x, dr.color, dr.kind === 'reagent' && dr.value === 3 ? 0.85 : 0.5),
          s('rect', { x: x - 25, y: BENCH - 52, width: 50, height: 24, rx: 4, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
          text(x, BENCH - 39.5, tr(bottleLabel[dr.kind][idx]), { size: 14, weight: 700, fill: '#7c2d12' }),
          ...caption.map((c, k) => text(x, BENCH + 30 + k * 17, c, { size: 13, weight: 600, fill: '#e2e8f0' })),
        ]));
      }

      topLayer = s('g');
      svg.append(topLayer);
    },

    frame(dt) {
      updateTube(dt);
      droppers.forEach((dr) => updateDropper(dr, dt));
      drawTube(dt);
      subMarks.forEach((m, i) => m.setAttribute('opacity', i === params.substance ? 1 : 0));
      indMarks.forEach((m, i) => m.setAttribute('opacity', params.reagent !== 3 && i + 1 === params.indicator ? 1 : 0));
      reagMarks.forEach((m, i) => m.setAttribute('opacity', i + 1 === params.reagent ? 1 : 0));
    },
  });

  // ── Шкала универсального индикатора на стене ──
  function buildScale(svg) {
    const x0 = 52;
    const y0 = 178;
    const cw = 23;
    svg.append(
      s('rect', { x: x0 - 14, y: y0 - 42, width: cw * 14 + 28, height: 100, rx: 8, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.2 }),
      text(x0 + cw * 7, y0 - 25, tr('Шкала универсального индикатора'), { size: 13, weight: 700, fill: '#334155' }),
      ...SCALE.flatMap((c, i) => [
        s('rect', { x: x0 + i * cw, y: y0, width: cw, height: 26, fill: c }),
        text(x0 + i * cw + cw / 2, y0 + 41, String(i + 1), { size: 13, weight: 600, fill: '#334155' }),
      ]),
      s('rect', { x: x0, y: y0, width: cw * 14, height: 26, fill: 'none', stroke: '#64748b', 'stroke-width': 1 }),
    );
    // Указатель: какому pH соответствует окраска раствора в пробирке
    scaleMarker = s('path', { d: `M0 ${y0 - 2} l-6 -9 h12 Z`, fill: '#0f172a', opacity: 0 });
    svg.append(scaleMarker);
  }

  // ── Пробирка ──
  function freshTube() {
    phase = 'drain';
  }

  // Новое содержимое получается добавлением к старому, только если меняется «ничего → что-то»
  const needsFresh = () => params.substance !== tube.sub
    || (tube.ind && params.indicator !== tube.ind && params.reagent !== 3)
    || (tube.reag && params.reagent !== tube.reag)
    || (params.reagent === 3 && tube.ind);

  function updateTube(dt) {
    if (phase === 'ready' && needsFresh()) phase = 'drain';
    if (phase === 'drain') {
      tube.fill = Math.max(0, tube.fill - dt * 3.5);
      tube.add = Math.max(0, tube.add - dt * 3.5);
      if (tube.fill <= 0 && tube.add <= 0) {
        Object.assign(tube, { sub: params.substance, ind: 0, indK: 0, reag: 0, add: 0 });
        phase = 'pour';
      }
    } else if (phase === 'pour') {
      tube.fill = Math.min(1, tube.fill + dt * 2.2);
      if (tube.fill >= 1) phase = 'ready';
    } else {
      // Индикатор — сразу после наливания, реактив — после индикатора (бромная вода — без индикатора)
      const wantInd = params.reagent === 3 ? 0 : params.indicator;
      if (wantInd && !tube.ind) request('indicator', wantInd);
      else if (params.reagent && !tube.reag && (!wantInd || tube.indK >= 1)) request('reagent', params.reagent);
    }
    if (tube.ind) tube.indK = Math.min(1, tube.indK + dt * (tube.indK > 0 ? 1.6 : 0));
    // Объём реактива меняют регулятором — уровень и pH догоняют его плавно
    tube.V += Math.sign(params.V - tube.V) * Math.min(Math.abs(params.V - tube.V), dt * 6);
  }

  // Капельница, которую нужно поднести, если её ещё не несут
  function request(kind, value) {
    const dr = droppers.find((x) => x.kind === kind && x.value === value);
    if (dr && dr.state === 'rest') dr.state = 'fly';
    pending = dr;
  }

  // Капля долетела до раствора: индикатор начинает окрашивать, реактив прибавляет объём
  function dropLanded(dr) {
    if (phase !== 'ready') return;
    if (dr.kind === 'indicator' && dr.value === (params.reagent === 3 ? 0 : params.indicator)) {
      tube.ind = dr.value;
      tube.indK = Math.max(tube.indK, 0.05);
    }
    if (dr.kind === 'reagent' && dr.value === params.reagent) {
      tube.reag = dr.value;
      tube.add = Math.min(1, tube.add + 0.2);
    }
  }

  // Состояние модели для того, что сейчас видно в пробирке
  const shownState = () => ({ substance: tube.sub, indicator: tube.ind, reagent: tube.reag, V: Math.max(0.01, tube.V * tube.add) });

  function drawTube(dt) {
    const p = shownState();
    const ph = pH(p);
    const volume = 5 * tube.fill + (tube.reag ? tube.V * tube.add : 0);
    const top = INNER_BOTTOM - volume * ML;
    let color = CLEAR;
    if (tube.ind === 1) color = mixHex(CLEAR, CRIMSON, pinkShare(ph) * tube.indK);
    if (tube.ind === 2) color = mixHex(CLEAR, universalColor(ph), 0.9 * tube.indK);
    if (tube.reag === 3) {
      // Интенсивность жёлтой окраски — по концентрации оставшегося брома в пробирке
      const k = Math.min(1, (2.4 * bromineLeft(p) * p.V) / (5 + p.V));
      color = mixHex(color, BROMINE, k);
    }
    liquid.setAttribute('y', top.toFixed(1));
    liquid.setAttribute('height', Math.max(0, INNER_BOTTOM - top + 4).toFixed(1));
    liquid.setAttribute('fill', color);
    surface.setAttribute('cy', top.toFixed(1));
    surface.setAttribute('opacity', volume > 0.3 ? 1 : 0);

    // Осадок 2,4,6-триброманилина: муть и хлопья по массе осадка (16,5 мг — весь анилин)
    const solid = Math.min(1, precipitate(p) / 16.5);
    milky.setAttribute('y', top.toFixed(1));
    milky.setAttribute('height', Math.max(0, INNER_BOTTOM - top + 4).toFixed(1));
    milky.setAttribute('opacity', (0.9 * Math.min(1, solid * 1.3)).toFixed(2));
    sediment.setAttribute('opacity', (solid * Math.min(1, volume / 5)).toFixed(2));
    const shown = Math.round(flakes.length * solid);
    flakes.forEach((c, i) => c.setAttribute('opacity', i < shown && Number(c.getAttribute('cy')) > top + 3 ? 1 : 0));

    const onScale = tube.ind === 2 && tube.indK > 0.3 && volume > 2;
    scaleMarker.setAttribute('opacity', onScale ? 1 : 0);
    if (onScale) scaleMarker.setAttribute('transform', `translate(${(52 + (Math.max(1, Math.min(14, ph)) - 0.5) * 23).toFixed(1)} 0)`);

    for (const q of drops) {
      if (!q.live) {
        q.c.setAttribute('opacity', 0);
        continue;
      }
      q.v += 900 * dt;
      q.y += q.v * dt;
      if (q.y >= top - 2) {
        q.live = false;
        dropLanded(q.dr);
      }
      q.c.setAttribute('cx', MOUTH.x);
      q.c.setAttribute('cy', q.y.toFixed(1));
      q.c.setAttribute('fill', q.dr.color);
      q.c.setAttribute('opacity', q.live ? 1 : 0);
    }
  }

  // ── Капельницы ──
  function updateDropper(dr, dt) {
    const target = MOUTH;
    const wanted = dr.kind === 'indicator' ? (params.reagent === 3 ? 0 : params.indicator) === dr.value : params.reagent === dr.value;
    if (dr.state === 'fly' && !wanted) dr.state = 'back';
    if (dr.state === 'fly') {
      // Пока пробирку меняют, капельница ждёт над ней; реактив ждёт, пока капает индикатор
      const k = Math.min(1, dt * 7);
      dr.pos.x = lerp(dr.pos.x, target.x, k);
      dr.pos.y = lerp(dr.pos.y, target.y, k);
      const turn = pending === dr && phase === 'ready';
      if (Math.hypot(dr.pos.x - target.x, dr.pos.y - target.y) < 2 && turn) {
        dr.state = 'drip';
        dr.dripT = 0;
      }
    } else if (dr.state === 'drip') {
      // Индикатор — 3 капли, реактив — 5 порций по 1/5 объёма
      const count = dr.kind === 'indicator' ? 3 : 5;
      const before = Math.floor(dr.dripT / 0.16);
      dr.dripT += dt;
      const after = Math.floor(dr.dripT / 0.16);
      if (after > before && before < count) {
        const free = drops.find((q) => !q.live);
        if (free) Object.assign(free, { y: MOUTH.y + 4, v: 0, live: true, dr });
      }
      if (dr.dripT > count * 0.16 + 0.25) dr.state = 'back';
    } else if (dr.state === 'back') {
      const k = Math.min(1, dt * 6);
      dr.pos.x = lerp(dr.pos.x, dr.rest.x, k);
      dr.pos.y = lerp(dr.pos.y, dr.rest.y, k);
      if (Math.hypot(dr.pos.x - dr.rest.x, dr.pos.y - dr.rest.y) < 1) dr.state = 'rest';
    }
    if (dr.state === 'rest') Object.assign(dr.pos, dr.rest);
    const left = dr.state === 'drip' ? Math.max(0, 30 * (1 - dr.dripT / 1)) : 30;
    dr.fill.setAttribute('height', left.toFixed(1));
    dr.fill.setAttribute('y', (-4 - left).toFixed(1));
    dr.node.style.pointerEvents = dr.state === 'rest' || dr.state === 'drag' ? '' : 'none';
    if (!held.has(dr.node)) place(dr.node, dr.state === 'rest' ? dr.home : topLayer);
    dr.node.setAttribute('transform', `translate(${dr.pos.x.toFixed(1)} ${dr.pos.y.toFixed(1)})`);
  }

  // Перенос между слоями только вне перетаскивания: перемещение узла в DOM сбросило бы захват указателя
  function place(node, parent) {
    if (node.parentNode !== parent) parent.append(node);
  }
  const held = new Set();

  function apply(dr) {
    if (dr.kind === 'indicator') {
      // Бромную воду добавляют без индикатора: выбрали индикатор — опыт с бромом заканчивается
      if (params.reagent === 3) set('reagent', 0);
      if (params.indicator === dr.value && tube.ind === dr.value) freshTube();
      set('indicator', dr.value);
    } else {
      if (dr.value === 3) set('indicator', 0);
      // Тот же реактив ещё раз — повтор опыта в чистой пробирке
      if (params.reagent === dr.value && tube.reag === dr.value) freshTube();
      set('reagent', dr.value);
    }
  }

  for (const dr of droppers) {
    // Взятую капельницу поднимаем над сценой до того, как draggable() захватит указатель
    dr.node.addEventListener('pointerdown', () => {
      if (dr.state !== 'rest') return;
      held.add(dr.node);
      dr.moved = false;
      place(dr.node, topLayer);
    });
    const release = () => held.delete(dr.node);
    dr.node.addEventListener('pointerup', release);
    dr.node.addEventListener('pointercancel', release);

    draggable(scene, dr.node, {
      onDrag(x, y) {
        if (dr.state !== 'rest' && dr.state !== 'drag') return;
        if (dr.state === 'rest') {
          dr.grab.dx = dr.pos.x - x;
          dr.grab.dy = dr.pos.y - y;
          dr.state = 'drag';
        }
        dr.pos.x = Math.max(20, Math.min(940, x + dr.grab.dx));
        dr.pos.y = Math.max(40, Math.min(BENCH - 4, y + dr.grab.dy));
        if (Math.hypot(dr.pos.x - dr.rest.x, dr.pos.y - dr.rest.y) > 6) dr.moved = true;
      },
      onEnd() {
        if (dr.state !== 'rest' && dr.state !== 'drag') return;
        // Кончик у горлышка пробирки — или простое нажатие без переноса (на телефоне так проще)
        const near = Math.abs(dr.pos.x - MOUTH.x) < 70 && dr.pos.y > TUBE.top - 90 && dr.pos.y < TUBE.top + 120;
        if (near || !dr.moved) {
          dr.state = 'fly';
          apply(dr);
        } else {
          dr.state = 'back';
        }
      },
    });
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}

// Склянка для реактивов: стеклянный корпус, плечики, горлышко; жидкость внутри
function bottle(d, x, color, opacity) {
  const b = BENCH - 2;
  const { w, h } = BOTTLE;
  const body = `M${x - w / 2} ${b - 6} V${b - h + 22} Q${x - w / 2} ${b - h + 8} ${x - 12} ${b - h + 2} V${b - h - 10} H${x + 12} V${b - h + 2} Q${x + w / 2} ${b - h + 8} ${x + w / 2} ${b - h + 22} V${b - 6} Q${x + w / 2} ${b} ${x + w / 2 - 6} ${b} H${x - w / 2 + 6} Q${x - w / 2} ${b} ${x - w / 2} ${b - 6} Z`;
  return [
    s('path', { d: body, fill: '#e2e8f0', 'fill-opacity': 0.35 }),
    s('path', { d: `M${x - w / 2 + 2} ${b - 6} V${b - h + 34} H${x + w / 2 - 2} V${b - 6} Q${x + w / 2 - 2} ${b - 2} ${x + w / 2 - 8} ${b - 2} H${x - w / 2 + 8} Q${x - w / 2 + 2} ${b - 2} ${x - w / 2 + 2} ${b - 6} Z`, fill: color, 'fill-opacity': opacity }),
    s('path', { d: body, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.6 }),
    s('rect', { x: x - w / 2 + 6, y: b - h + 26, width: 4, height: h - 40, rx: 2, fill: '#ffffff', 'fill-opacity': 0.6 }),
  ];
}
