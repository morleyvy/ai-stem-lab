// Сцена «Работа нефрона»: одна схема нефрона, как рисунок в учебнике, крупно на весь экран.
// Почечная артерия с зажимом приносит кровь в клубочек капилляров внутри капсулы; из капсулы
// выходит извитой каналец, петля Генле и дистальный каналец, впадающий в собирательную трубочку,
// из которой конечная моча капает в мерный цилиндр. Вдоль канальцев идёт капилляр, уходящий в вену.
// В канальцах движутся частицы веществ: часть по пути возвращается в капилляр (реабсорбция) — вода,
// глюкоза, половина мочевины; белки в каналец не попадают совсем.
// Ученик сам снимает зажим (щелчок по зажиму) и берёт пробы: пробирка 1 под краном артерии — плазма,
// пробирка 2 под капсулой — первичная моча, цилиндр 3 — конечная моча. Состав пробы — в панели
// показаний под сценой, поэтому на схеме нет таблиц: только объём мочи на цилиндре и уровень АДГ.

import { createScene, floorShadow, mixHex, s, text, touchTarget, W, H } from '../kit.js';
import { tr } from '../../i18n.js';
import { fmt } from '../../sims/canvas.js';

// Схема рисуется в своих координатах и масштабируется группой, чтобы занять весь кадр 960×540
const VIEW = { k: 1.15, x: 66, y: -15 };
const BOARD = { x1: 20, x2: 700, y1: 22, y2: 470 };
const ART_Y = 150; // почечная артерия
const CLAMP_X = 122;
const TAP1 = { x: 76 }; // кран для пробы крови
const CAPS = { x: 215, y: 165, r: 50, ri: 34 }; // капсула и клубочек
const TUBE1 = { x: TAP1.x, top: 186, bottom: 266, w: 22 };
const TUBE2 = { x: CAPS.x, top: 248, bottom: 328, w: 22 };
const CAP_TOP = 104; // капилляр над извитым канальцем
const LOOP = { d: 380, a: 430, bottom: 368 }; // нисходящая и восходящая части петли
const CAP_LEFT = 362;
const CAP_RIGHT = 448;
const CAP_MID = 240; // капилляр между петлёй и собирательной трубочкой
const VEIN_X = 512;
const DUCT = { x: 556, top: 60, bottom: 336 };
const CYL = { x: DUCT.x, bottom: 462, h: 112, w: 46, maxL: 6 }; // мерный цилиндр, шкала 0…6 л
const ADH = { x: 584, y: 176, w: 104, h: 56 }; // табличка АДГ рядом с собирательной трубочкой

// Частицы: только то, о чём спрашивает работа, — иначе схема пестрит
const KINDS = {
  water: { color: '#3b82f6', r: 2.8, label: 'вода' },
  glucose: { color: '#f59e0b', r: 3.4, label: 'глюкоза' },
  urea: { color: '#16a34a', r: 3, label: 'мочевина' },
  protein: { color: '#7c3aed', r: 4.4, label: 'белки' },
};

// Сегменты канальца: где частица может вернуться в кровь и куда (точка на капилляре)
const SEGMENTS = [
  { d: `M${CAPS.x + CAPS.r} ${CAPS.y} C 282 134, 304 134, 314 160 S 346 196, ${LOOP.d} 178`, to: (x) => [x, CAP_TOP] }, // извитой каналец
  { d: `M${LOOP.d} 178 V${LOOP.bottom}`, to: (x, y) => [CAP_LEFT, y] }, // нисходящая часть петли
  { d: `M${LOOP.d} ${LOOP.bottom} A 25 25 0 0 0 ${LOOP.a} ${LOOP.bottom} V200`, to: (x, y) => [CAP_RIGHT, y] }, // восходящая часть
  { d: `M${LOOP.a} 200 C 444 160, 470 150, 486 172 S 520 182, 528 150 Q 532 140, ${DUCT.x} 140`, to: (x) => [Math.min(VEIN_X, Math.max(CAP_RIGHT, x)), CAP_MID] }, // дистальный каналец
  { d: `M${DUCT.x} 140 V${DUCT.bottom}`, to: (x, y) => [VEIN_X, Math.max(CAP_MID + 10, y)] }, // собирательная трубочка
];

// Где частица каждого вида возвращается в кровь: номера сегментов
const BACK_AT = { water: [0, 1, 4], glucose: [0], urea: [0, 4] };

const BLOOD = `M${BOARD.x1} ${ART_Y} H150 C 166 ${ART_Y}, 172 160, 184 160 ` +
  'C 190 132, 228 128, 234 152 C 240 178, 200 192, 196 170 C 192 148, 236 142, 242 168 C 248 192, 204 198, 200 182 ' +
  `C 196 166, 214 146, ${CAPS.x} ${CAPS.y - CAPS.r} V${CAP_TOP} H${CAP_LEFT} V${LOOP.bottom} ` +
  `A 43 43 0 0 0 ${CAP_RIGHT} ${LOOP.bottom} V${CAP_MID} H${VEIN_X} V${BOARD.y2}`;

// Цвет мочи: чем концентрированнее, тем темнее — от почти бесцветной до тёмно-янтарной
const urineColor = (conc) => mixHex('#fbf7d4', '#d18a16', Math.max(0, Math.min(1, (conc - 0.8) / 5.5)));
const ADH_COLOR = { высокий: '#4f46e5', средний: '#6366f1', низкий: '#94a3b8' };

export function excretionScene(container, params, set, { composition, urineVolume, adhLevel, adhName, glucoseLost }) {
  let bloodPath, tubulePaths, segLen, jaws, pinch, capsFill, tubeFill, ductFill;
  let tube1Fill, tube2Fill, tube1Ring, tube2Ring, cylRing, cylLiquid, cylTag, adhText, adhBar;
  let bloodLen, drips, layer;
  const taken = new Set(params.sample ? [params.sample] : []);
  let level = params.flow ? urineVolume(params) / CYL.maxL : 0;
  let dripAcc = 0;
  const spawnAcc = { water: 0, glucose: 0, urea: 0 };
  const parts = []; // частицы в канальце
  const blood = []; // белки в сосудах

  const scene = createScene(container, {
    build(svg, d) {
      svg.append(s('rect', { x: 0, y: 0, width: W, height: H, fill: d.lin([[0, '#f7f4ee'], [1, '#ece6da']], 'v') }));
      const g = s('g', { transform: `translate(${VIEW.x} ${VIEW.y}) scale(${VIEW.k})` });
      svg.append(g);

      // ── Лист со схемой ──
      g.append(
        s('rect', { x: BOARD.x1, y: BOARD.y1, width: BOARD.x2 - BOARD.x1, height: BOARD.y2 - BOARD.y1, rx: 12, fill: '#fffdf8', stroke: '#ddd2bf', 'stroke-width': 1.5 }),
        text(BOARD.x1 + 18, 44, tr('Модель нефрона'), { size: 16, weight: 700, fill: '#7c2d12', anchor: 'start' }),
      );

      // ── Кровеносные сосуды: артерия → клубочек → капилляр вдоль канальцев → вена ──
      bloodPath = s('path', { d: BLOOD, fill: 'none', stroke: 'none' });
      g.append(
        bloodPath,
        // После клубочка кровь отдаёт кислород — цвет от алого к тёмно-вишнёвому, вена синяя
        s('path', { d: `M${CAPS.x} ${CAPS.y - CAPS.r} V${CAP_TOP} H${CAP_LEFT} V${LOOP.bottom} A 43 43 0 0 0 ${CAP_RIGHT} ${LOOP.bottom} V${CAP_MID} H${VEIN_X}`, fill: 'none', stroke: '#b4375a', 'stroke-width': 8, 'stroke-linejoin': 'round', 'stroke-opacity': 0.85 }),
        s('path', { d: `M${VEIN_X} ${CAP_MID - 4} V${BOARD.y2}`, fill: 'none', stroke: '#3b4fc4', 'stroke-width': 11 }),
        s('path', { d: `M${BOARD.x1} ${ART_Y} H150 C 166 ${ART_Y}, 172 160, 184 160`, fill: 'none', stroke: '#c81e1e', 'stroke-width': 13, 'stroke-linecap': 'round' }),
        // Подпись в две строки: над артерией слева от зажима места мало
        ...tr('Почечная артерия').split(' ').map((w, i) => text(BOARD.x1 + 12, ART_Y - 40 + i * 16, w, { size: 13, weight: 600, fill: '#991b1b', anchor: 'start' })),
        text(VEIN_X - 14, 426, tr('Почечная вена'), { size: 13, weight: 600, fill: '#3730a3', anchor: 'end' }),
      );

      // ── Капсула с клубочком ──
      capsFill = s('circle', { cx: CAPS.x, cy: CAPS.y, r: CAPS.r, fill: '#fdf6c3', 'fill-opacity': 0 });
      g.append(
        s('circle', { cx: CAPS.x, cy: CAPS.y, r: CAPS.r, fill: '#eef2f7' }),
        capsFill,
        s('circle', { cx: CAPS.x, cy: CAPS.y, r: CAPS.ri, fill: '#fde8e8', stroke: '#e5a3a3', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }),
        // Клубочек: петли капилляров
        s('path', { d: 'M184 160 C 190 132, 228 128, 234 152 C 240 178, 200 192, 196 170 C 192 148, 236 142, 242 168 C 248 192, 204 198, 200 182 C 196 166, 214 146, 215 115', fill: 'none', stroke: '#d62f3a', 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('circle', { cx: CAPS.x, cy: CAPS.y, r: CAPS.r, fill: 'none', stroke: '#8aa0b6', 'stroke-width': 2.5 }),
      );

      // ── Каналец: полупрозрачная трубка; внутри — первичная моча, когда идёт фильтрация ──
      tubulePaths = SEGMENTS.map((sg) => s('path', { d: sg.d, fill: 'none', stroke: 'none' }));
      const tubeD = SEGMENTS.slice(0, 4).map((sg) => sg.d).join(' ');
      tubeFill = s('path', { d: tubeD, fill: 'none', stroke: '#f6eda0', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 });
      ductFill = s('path', { d: `M${DUCT.x} ${DUCT.top} V${DUCT.bottom}`, fill: 'none', stroke: '#f2df7a', 'stroke-width': 14, opacity: 0 });
      g.append(
        ...tubulePaths,
        s('path', { d: tubeD, fill: 'none', stroke: '#9fb0c2', 'stroke-width': 15, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        s('path', { d: tubeD, fill: 'none', stroke: '#f4f7fa', 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        tubeFill,
        // Собирательная трубочка шире канальца: в неё впадают канальцы многих нефронов
        s('path', { d: `M${DUCT.x} ${DUCT.top} V${DUCT.bottom}`, fill: 'none', stroke: '#9fb0c2', 'stroke-width': 19 }),
        s('path', { d: `M${DUCT.x} ${DUCT.top + 1} V${DUCT.bottom - 1}`, fill: 'none', stroke: '#f4f7fa', 'stroke-width': 15 }),
        ductFill,
        s('path', { d: `M${DUCT.x - 9} ${DUCT.bottom - 2} L${DUCT.x - 3} ${DUCT.bottom + 8} H${DUCT.x + 3} L${DUCT.x + 9} ${DUCT.bottom - 2} Z`, fill: '#cbd5e1', stroke: '#8aa0b6', 'stroke-width': 1.2 }),
        text(DUCT.x - 90, 46, tr('Собирательная трубочка'), { size: 13, weight: 600, fill: '#475569' }),
        // В две строки: между капсулой и петлёй узко, а казахская подпись длиннее
        ...tr('Извитой каналец').split(' ').map((w, i) => text(272, 208 + i * 15, w, { size: 13, weight: 600, fill: '#475569', anchor: 'start' })),
        text(346, 268, tr('Петля Генле'), { size: 13, weight: 600, fill: '#475569', anchor: 'end' }),
        text(CAPS.x - 14, 236, tr('Капсула'), { size: 13, weight: 600, fill: '#475569', anchor: 'end' }),
      );

      // ── Зажим на артерии (щелчок — снять / надеть) ──
      pinch = s('rect', { x: CLAMP_X - 7, y: ART_Y - 7, width: 14, height: 14, fill: '#fffdf8' });
      jaws = s('g', {}, [
        s('rect', { x: CLAMP_X - 9, y: ART_Y - 26, width: 18, height: 16, rx: 3, fill: d.lin([[0, '#64748b'], [0.5, '#e2e8f0'], [1, '#475569']]), stroke: '#334155', 'stroke-width': 1 }),
        s('rect', { x: CLAMP_X - 9, y: ART_Y + 10, width: 18, height: 16, rx: 3, fill: d.lin([[0, '#64748b'], [0.5, '#e2e8f0'], [1, '#475569']]), stroke: '#334155', 'stroke-width': 1 }),
        s('rect', { x: CLAMP_X + 7, y: ART_Y - 26, width: 5, height: 52, rx: 2, fill: '#475569' }),
        s('circle', { cx: CLAMP_X + 9.5, cy: ART_Y - 32, r: 6, fill: d.rad(['#fca5a5', '#b91c1c']), stroke: '#7f1d1d', 'stroke-width': 1 }),
      ]);
      const clamp = s('g', { cursor: 'pointer' }, [
        s('rect', { x: CLAMP_X - 18, y: ART_Y - 44, width: 40, height: 76, fill: '#000', 'fill-opacity': 0 }),
        pinch,
        jaws,
      ]);
      g.append(clamp);
      touchTarget(clamp, 16);
      clamp.addEventListener('click', () => set('flow', params.flow ? 0 : 1));

      // ── Пробирка 1 под краном артерии и пробирка 2 под капсулой ──
      const tube = (t, tap, tag) => {
        const fill = s('rect', { x: t.x - t.w / 2 + 2, y: t.bottom - 34, width: t.w - 4, height: 34, rx: 9, fill: '#fff', opacity: 0 });
        const ring = s('rect', { x: t.x - t.w / 2 - 6, y: t.top - 6, width: t.w + 12, height: t.bottom - t.top + 12, rx: 14, fill: 'none', stroke: '#0d9488', 'stroke-width': 3, opacity: 0 });
        const glass = `M${t.x - t.w / 2} ${t.top} V${t.bottom - t.w / 2} A ${t.w / 2} ${t.w / 2} 0 0 0 ${t.x + t.w / 2} ${t.bottom - t.w / 2} V${t.top}`;
        const el = s('g', { cursor: 'pointer' }, [
          s('rect', { x: t.x - 22, y: tap, width: 44, height: t.bottom - tap + 8, fill: '#000', 'fill-opacity': 0 }),
          s('rect', { x: t.x - 3, y: tap, width: 6, height: t.top - tap + 8, fill: '#9fb0c2' }),
          s('rect', { x: t.x - 10, y: t.top - 18, width: 20, height: 8, rx: 3, fill: '#475569' }),
          s('path', { d: glass, fill: '#eef3f7', 'fill-opacity': 0.5 }),
          fill,
          s('path', { d: glass, fill: d.url('glass'), stroke: '#8aa0b6', 'stroke-width': 1.8 }),
          ring,
          s('circle', { cx: t.x + t.w / 2 + 14, cy: t.top + 16, r: 10, fill: '#0f766e' }),
          text(t.x + t.w / 2 + 14, t.top + 16.5, tag, { size: 13, weight: 700, fill: '#ffffff' }),
        ]);
        g.append(el);
        touchTarget(el, 14);
        return { el, fill, ring };
      };
      // Кран крови стоит на артерии до зажима — кровь можно взять и при перекрытом кровотоке
      const t1 = tube(TUBE1, ART_Y + 4, '1');
      const t2 = tube(TUBE2, CAPS.y + CAPS.r - 2, '2');
      t1.el.addEventListener('click', () => set('sample', 1));
      t2.el.addEventListener('click', () => set('sample', 2));
      ({ fill: tube1Fill, ring: tube1Ring } = t1);
      ({ fill: tube2Fill, ring: tube2Ring } = t2);
      tube1Fill.setAttribute('fill', '#f2cf7c'); // плазма — соломенно-жёлтая
      tube2Fill.setAttribute('fill', '#f7f3d0'); // первичная моча — почти бесцветная

      // ── Легенда частиц: одна строка внизу листа ──
      Object.values(KINDS).forEach((k, i) => {
        const x = 46 + i * 104;
        g.append(
          s('circle', { cx: x, cy: 446, r: k.r + 1.5, fill: k.color }),
          text(x + 12, 446.5, tr(k.label), { size: 13, weight: 500, fill: '#334155', anchor: 'start' }),
        );
      });

      // ── Частицы: белки в сосудах и вещества в канальце ──
      layer = s('g', { 'pointer-events': 'none' });
      g.append(layer);
      bloodLen = bloodPath.getTotalLength();
      for (let i = 0; i < 16; i++) {
        const c = s('circle', { r: KINDS.protein.r, fill: KINDS.protein.color, stroke: '#4c1d95', 'stroke-width': 0.6 });
        layer.append(c);
        blood.push({ c, at: (i / 16) * bloodLen });
      }
      segLen = tubulePaths.map((p) => p.getTotalLength());

      // ── Мерный цилиндр для конечной мочи (щелчок — проба 3); на нём — суточный объём ──
      const cTop = CYL.bottom - CYL.h;
      const cx1 = CYL.x - CYL.w / 2;
      cylLiquid = s('rect', { x: cx1 + 2, y: CYL.bottom - 4, width: CYL.w - 4, height: 0, fill: '#f2df7a' });
      cylTag = text(CYL.x, cTop + 22, '', { size: 14, weight: 700, fill: '#7c2d12' });
      cylRing = s('rect', { x: cx1 - 7, y: cTop - 8, width: CYL.w + 14, height: CYL.h + 14, rx: 10, fill: 'none', stroke: '#0d9488', 'stroke-width': 3, opacity: 0 });
      const ticks = [];
      for (let l = 1; l < CYL.maxL; l++) {
        const y = CYL.bottom - 4 - (l / CYL.maxL) * (CYL.h - 8);
        ticks.push(s('line', { x1: cx1 + 3, x2: cx1 + (l % 2 ? 9 : 14), y1: y, y2: y, stroke: '#64748b', 'stroke-width': 1.2 }));
      }
      const cyl = s('g', { cursor: 'pointer' }, [
        s('rect', { x: cx1 - 10, y: cTop - 30, width: CYL.w + 20, height: CYL.h + 32, fill: '#000', 'fill-opacity': 0 }),
        floorShadow(CYL.x, CYL.bottom + 2, 30, d),
        s('rect', { x: cx1 - 8, y: CYL.bottom - 6, width: CYL.w + 16, height: 6, rx: 3, fill: '#cbd5e1', stroke: '#8aa0b6', 'stroke-width': 1 }),
        s('rect', { x: cx1, y: cTop, width: CYL.w, height: CYL.h - 4, rx: 4, fill: '#eef3f7', 'fill-opacity': 0.45 }),
        cylLiquid,
        ...ticks,
        s('rect', { x: cx1, y: cTop, width: CYL.w, height: CYL.h - 4, rx: 4, fill: d.url('glass'), stroke: '#8aa0b6', 'stroke-width': 1.8 }),
        s('rect', { x: cx1 + 3, y: cTop + 12, width: CYL.w - 6, height: 20, rx: 3, fill: '#ffffff', stroke: '#d6c7a1', 'stroke-width': 1 }),
        cylTag,
        cylRing,
        s('circle', { cx: cx1 + CYL.w + 14, cy: cTop + 40, r: 10, fill: '#0f766e' }),
        text(cx1 + CYL.w + 14, cTop + 40.5, '3', { size: 13, weight: 700, fill: '#ffffff' }),
      ]);
      g.append(cyl);
      touchTarget(cyl, 12);
      cyl.addEventListener('click', () => set('sample', 3));
      drips = Array.from({ length: 4 }, () => {
        const c = s('ellipse', { cx: CYL.x, rx: 2.2, ry: 3, fill: '#f2df7a', opacity: 0, 'pointer-events': 'none' });
        g.append(c);
        return { c, y: 0, v: 0 };
      });

      // ── Уровень АДГ: гормон действует на собирательную трубочку, поэтому табличка рядом с ней ──
      adhBar = s('rect', { x: ADH.x + 12, y: ADH.y + 36, width: 0, height: 8, rx: 4, fill: '#6366f1' });
      adhText = text(ADH.x + ADH.w / 2, ADH.y + 21, '', { size: 14, weight: 700, fill: '#3730a3' });
      g.append(
        s('line', { x1: DUCT.x + 12, y1: ADH.y + ADH.h / 2, x2: ADH.x, y2: ADH.y + ADH.h / 2, stroke: '#a5b4fc', 'stroke-width': 2, 'stroke-dasharray': '4 3' }),
        s('rect', { x: ADH.x, y: ADH.y, width: ADH.w, height: ADH.h, rx: 10, fill: '#eef2ff', stroke: '#c7d2fe', 'stroke-width': 1.5 }),
        s('rect', { x: ADH.x + 12, y: ADH.y + 36, width: ADH.w - 24, height: 8, rx: 4, fill: '#ffffff', stroke: '#c7d2fe', 'stroke-width': 1 }),
        adhBar,
        adhText,
      );
    },

    frame(dt) {
      const p = params;
      const flow = p.flow === 1;
      const adh = adhLevel(p);
      const V = urineVolume(p);
      const fin = composition(p, 3);
      const color = urineColor(fin.urea + fin.salts + fin.glucose);

      // Зажим: сомкнутые губки пережимают артерию, снятый — отведён вверх
      jaws.setAttribute('transform', flow ? 'translate(0 -30)' : '');
      pinch.setAttribute('opacity', flow ? 0 : 1);
      capsFill.setAttribute('fill-opacity', flow ? 0.9 : 0);
      tubeFill.setAttribute('opacity', flow ? 0.85 : 0);
      ductFill.setAttribute('opacity', flow ? 0.85 : 0);
      ductFill.setAttribute('stroke', color);

      // Кровь движется только при снятом зажиме; белки не выходят из сосудов
      for (const b of blood) {
        if (flow) b.at = (b.at + dt * 70) % bloodLen;
        const pt = bloodPath.getPointAtLength(b.at);
        b.c.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      }

      // Вещества фильтруются в капсулу; глюкозы — пропорционально её уровню в крови
      if (flow) {
        const rate = { water: 8, glucose: 1.1 * (p.glucose / 5), urea: 1.6 };
        for (const k of Object.keys(rate)) {
          spawnAcc[k] += dt * rate[k];
          while (spawnAcc[k] >= 1) {
            spawnAcc[k] -= 1;
            spawn(k, p, V, adh);
          }
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        if (q.back) {
          // Возврат в капилляр: частица уходит к сосуду и растворяется в крови
          q.t += dt * 2.2;
          const x = q.bx + (q.tx - q.bx) * Math.min(1, q.t);
          const y = q.by + (q.ty - q.by) * Math.min(1, q.t);
          q.c.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
          q.c.setAttribute('opacity', q.t < 0.7 ? 1 : Math.max(0, (1.2 - q.t) / 0.5));
          if (q.t >= 1.2) kill(i);
          continue;
        }
        if (flow) q.at += dt * (q.seg === 4 ? 46 : 60);
        while (q.seg < SEGMENTS.length && q.at > segLen[q.seg]) {
          q.at -= segLen[q.seg];
          q.seg++;
        }
        if (q.seg >= SEGMENTS.length) {
          kill(i);
          continue;
        }
        const pt = tubulePaths[q.seg].getPointAtLength(q.at);
        if (q.exit && q.exit[0] === q.seg && q.at >= q.exit[1] * segLen[q.seg]) {
          const [tx, ty] = SEGMENTS[q.seg].to(pt.x, pt.y);
          Object.assign(q, { back: true, t: 0, bx: pt.x, by: pt.y, tx, ty });
        }
        q.c.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      }

      // Цилиндр наполняется до суточного объёма мочи; капли — чаще при большом объёме
      const target = flow ? V / CYL.maxL : level;
      level += (target - level) * Math.min(1, dt * 2.5);
      const lh = Math.max(0, Math.min(1, level)) * (CYL.h - 8);
      cylLiquid.setAttribute('y', CYL.bottom - 4 - lh);
      cylLiquid.setAttribute('height', lh);
      cylLiquid.setAttribute('fill', color);
      cylTag.textContent = flow || level > 0.01 ? `${fmt(V, 1)} ${tr('л')}` : '0';
      if (flow) {
        dripAcc += dt * (0.6 + V * 0.6);
        if (dripAcc >= 1) {
          dripAcc = 0;
          const free = drips.find((x) => !x.live);
          if (free) Object.assign(free, { y: DUCT.bottom + 10, v: 0, live: true });
        }
      }
      const surf = CYL.bottom - 4 - lh;
      for (const dr of drips) {
        if (dr.live) {
          dr.v += 700 * dt;
          dr.y += dr.v * dt;
          if (dr.y >= surf - 2) dr.live = false;
        }
        dr.c.setAttribute('cy', dr.y.toFixed(1));
        dr.c.setAttribute('fill', color);
        dr.c.setAttribute('opacity', dr.live ? 1 : 0);
      }

      // Пробы: взятые пробирки остаются заполненными, выбранная — в рамке
      if (p.sample) taken.add(p.sample);
      tube1Fill.setAttribute('opacity', taken.has(1) ? 1 : 0);
      tube2Fill.setAttribute('opacity', taken.has(2) && flow ? 1 : 0);
      tube1Ring.setAttribute('opacity', p.sample === 1 ? 1 : 0);
      tube2Ring.setAttribute('opacity', p.sample === 2 ? 1 : 0);
      cylRing.setAttribute('opacity', p.sample === 3 ? 1 : 0);

      const name = adhName(p);
      adhText.textContent = `${tr('АДГ')}: ${tr(name)}`;
      adhBar.setAttribute('width', ((ADH.w - 24) * adh).toFixed(1));
      adhBar.setAttribute('fill', ADH_COLOR[name]);
    },
  });

  // Новая частица в начале канальца. Судьба решается сразу: вернётся ли она в кровь и в каком месте.
  // Доли нарочно преувеличены, чтобы до цилиндра доходило видимое число частиц (в жизни — < 1% воды)
  function spawn(kind, p, V, adh) {
    let stay;
    if (kind === 'water') stay = Math.min(0.5, V / 7);
    else if (kind === 'glucose') stay = p.glucose > 0 ? glucoseLost(p) / (p.glucose * 180) : 0;
    else stay = 0.5;
    const k = KINDS[kind];
    const c = s('circle', { r: k.r, fill: k.color, stroke: '#ffffff', 'stroke-width': 0.6 });
    layer.append(c);
    const q = { c, seg: 0, at: 0, back: false, exit: null };
    if (Math.random() >= stay) {
      // Где вернётся: вода — больше всего в извитом канальце, остальное в петле и (при АДГ) в трубочке
      const sites = BACK_AT[kind];
      let seg = sites[0];
      if (kind === 'water') seg = Math.random() < 0.65 ? 0 : Math.random() < 1 - adh * 0.6 ? 1 : 4;
      else if (sites.length > 1 && Math.random() < 0.35) seg = sites[1];
      q.exit = [seg, 0.2 + Math.random() * 0.6];
    }
    parts.push(q);
  }

  function kill(i) {
    parts[i].c.remove();
    parts.splice(i, 1);
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
