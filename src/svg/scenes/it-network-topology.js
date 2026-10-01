// Сцена «Топологии компьютерной сети»: учебный сетевой стенд. На панели — шесть компьютеров A–F,
// соединённых кабелями по выбранной схеме; над схемой — переключатель топологии и строка «доставлен / нет».
// Числа (переходы, кабели, потеря связи) показывает только панель показаний под сценой.
//   щелчок по вкладке «Шина / Звезда / Кольцо» → компьютеры переезжают на новые места, кабели
//     прокладываются заново, обрывы и отказ сбрасываются (topo, cut = 0, hub = 0);
//   щелчок по компьютеру B–F → он становится получателем пакета (dst);
//   щелчок по кабелю → кабель обрывается у ближайшего компьютера, повторный щелчок соединяет (cut);
//   щелчок по коммутатору (только в звезде) → он отказывает и гаснет, повторный — работает (hub).
// Пакет-конверт непрерывно бегает от A к получателю по настоящему пути: через коммутатор, по общему
// кабелю шины (сигнал расходится по нему в обе стороны) или по кругу через соседей в кольце.
// Если путь оборван, конверт краснеет и гаснет в месте неисправности.
// Схема для семиклассника, поэтому значков минимум: роль компьютера — цвет экрана и плашка снаружи
// схемы, потеря связи — серый полупрозрачный компьютер, обрыв — разрезанный кабель с красным крестиком.

import { tr } from '../../i18n.js';
import { createScene, floorShadow, room, s, text, touchTarget } from '../kit.js';

const BENCH = 470;
const BUS = 0;
const STAR = 1;
const RING = 2;
const ACCENT = '#0e7490'; // цвет информатики в каталоге
const BLUE = ['#3b82f6', '#1e40af']; // витая пара
const COAX = ['#475569', '#0f172a']; // коаксиальный кабель шины
const SENDER = '#0891b2';
const RECEIVER = '#16a34a';
const CUT_RED = '#dc2626';
const CENTER = { x: 480, y: 285 };
const RX = 300;
// Эллипс ниже, чем был: плашки «отправитель/получатель» над верхними и под нижними компьютерами
// должны помещаться между строкой состояния и краем панели
const RY = 112;
const TRUNK_Y = 285; // магистраль шины
const TRUNK = [104, 856];
const SPEED = 300; // px/с — пакет должен успевать пройти кольцо из шести узлов за несколько секунд
const HOLD = 0.9; // с — пауза в конце пути, чтобы было видно, дошёл пакет или нет
const MOVE = 0.6; // с — переезд компьютеров при смене топологии
// Обрыв кольца — посередине дуги: у боковых дуг только середина не закрыта мониторами
const RING_CUT = 0.5;
const LABEL_GAP = 50; // от центра компьютера до центра плашки по вертикали

const deg = (a) => (a * Math.PI) / 180;
const onEllipse = (a) => ({ x: CENTER.x + RX * Math.cos(deg(a)), y: CENTER.y + RY * Math.sin(deg(a)) });
// В кольце и звезде компьютеры стоят по эллипсу; угол растёт по часовой стрелке (ось y вниз),
// поэтому A → B → … → F → A — это обход кольца по часовой стрелке
const ringAngle = (i) => 180 + 60 * i;
const POS = {
  [BUS]: Array.from({ length: 6 }, (_, i) => ({ x: 170 + 120 * i, y: i % 2 ? 374 : 198 })),
  [STAR]: Array.from({ length: 6 }, (_, i) => onEllipse(ringAngle(i))),
  [RING]: Array.from({ length: 6 }, (_, i) => onEllipse(ringAngle(i))),
};

// С какой стороны от компьютера плашка роли — всегда снаружи схемы, чтобы не лечь на кабель
function labelSide(topo, i) {
  if (topo === BUS) return i % 2 ? 'down' : 'up';
  if (i === 0) return 'left';
  if (i === 3) return 'right';
  return i < 3 ? 'up' : 'down';
}

const clamp01 =(v) => Math.max(0, Math.min(1, v));
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;

// Дуга эллипса кольца, разбитая на точки: так её можно и нарисовать, и разрезать, и провести по ней пакет
function arcPoints(a1, a2, n = 24) {
  return Array.from({ length: n + 1 }, (_, i) => onEllipse(lerp(a1, a2, i / n)));
}

function lengthOf(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

// Точка на ломаной на расстоянии dist от начала
function along(pts, dist) {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= l || i === pts.length - 1) {
      const k = l ? clamp01(left / l) : 0;
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
    }
    left -= l;
  }
  return { ...pts[0] };
}

// Часть ломаной от доли t1 до доли t2 её длины
function slice(pts, t1, t2) {
  const L = lengthOf(pts);
  const out = [along(pts, t1 * L)];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc > t1 * L && acc < t2 * L) out.push(pts[i]);
  }
  out.push(along(pts, t2 * L));
  return out;
}

const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

export function networkTopologyScene(container, params, set, { lostNodes, delivered, dstIndex, NODES }) {
  let screens, pcs, tabs, nets, sw, swBody, swLeds, swStatus, packet, packetBody, signal, pill, pillText, pillBg;
  // Текущие места компьютеров: при смене топологии они плавно переезжают
  let shownTopo = params.topo;
  let fromPos = POS[params.topo].map((p) => ({ ...p }));
  let move = 1;
  let cycle = 0;
  let key = '';
  let clock = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'stand' });

      // Сетевые кабели каждой топологии — отдельные слои; показывается слой выбранной
      nets = { [BUS]: buildBus(svg, d), [STAR]: buildStar(svg), [RING]: buildRing(svg) };

      // Сигнал шины расходится по общему кабелю от A в обе стороны — его получают все компьютеры
      signal = s('path', { fill: 'none', stroke: '#38bdf8', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-opacity': 0.45, opacity: 0, 'pointer-events': 'none' });
      svg.append(signal);

      sw = buildSwitch(svg, d);
      // Цвет экрана — роль компьютера: тёмный — обычный, бирюзовый — отправитель, зелёный — получатель
      screens = {
        idle: d.lin([[0, '#1e3a5f'], [1, '#0f2942']], 'v'),
        off: d.lin([[0, '#cbd5e1'], [1, '#94a3b8']], 'v'),
        sender: d.lin([[0, '#22d3ee'], [1, SENDER]], 'v'),
        receiver: d.lin([[0, '#4ade80'], [1, RECEIVER]], 'v'),
      };
      pcs = NODES.map((name, i) => buildPc(svg, d, name, i));

      // Пакет — конверт со свечением
      packetBody = s('g', {}, [
        s('rect', { x: -14, y: -10, width: 28, height: 20, rx: 3, fill: '#ffffff', stroke: ACCENT, 'stroke-width': 2 }),
        s('path', { d: 'M-13 -8 L0 2 L13 -8', fill: 'none', stroke: ACCENT, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      ]);
      packet = s('g', { opacity: 0, 'pointer-events': 'none' }, [
        s('circle', { r: 22, fill: d.rad([[0, '#67e8f9', 0.75], [1, '#67e8f9', 0]], 0.5, 0.5) }),
        packetBody,
      ]);
      svg.append(packet);

      tabs = buildTabs(svg, d);

      // Строка состояния под переключателем: дошёл ли пакет
      pillBg = s('rect', { x: 360, y: 74, width: 240, height: 28, rx: 14, fill: '#ecfdf5', stroke: '#86efac', 'stroke-width': 1.5 });
      pillText = text(480, 88.5, '', { size: 14, weight: 700, fill: '#166534' });
      pill = s('g', { 'pointer-events': 'none' }, [pillBg, pillText]);
      svg.append(pill);
    },

    frame(dt, now) {
      clock = now;
      // Топологию сменили — компьютеры едут на новые места, кабели появляются, когда они приехали
      if (params.topo !== shownTopo) {
        fromPos = currentPos();
        shownTopo = params.topo;
        move = 0;
      }
      move = Math.min(1, move + dt / MOVE);
      const pos = currentPos();
      pcs.forEach((pc, i) => pc.g.setAttribute('transform', `translate(${pos[i].x.toFixed(1)} ${pos[i].y.toFixed(1)})`));
      for (const t of [BUS, STAR, RING]) {
        const on = t === params.topo;
        nets[t].g.setAttribute('opacity', on ? ease(move).toFixed(2) : 0);
        // Невидимые слои убираем совсем: у полос-мишеней кабелей свой pointer-events, и через
        // pointer-events: none у слоя кабель скрытой звезды перехватывал щелчки по магистрали шины
        nets[t].g.setAttribute('display', on ? 'inline' : 'none');
        nets[t].g.style.pointerEvents = on && move >= 1 ? '' : 'none';
        for (const c of nets[t].cables) {
          const cut = on && params.cut === c.owner;
          c.whole.setAttribute('visibility', cut ? 'hidden' : 'visible');
          c.broken.setAttribute('visibility', cut ? 'visible' : 'hidden');
        }
      }
      drawArrows();
      drawSwitch();
      drawPcs();
      drawTabs();
      drawPacket(dt);

      const ok = delivered(params);
      pillText.textContent = `A → ${NODES[dstIndex(params)]}: ${tr(ok ? 'пакет доставлен' : 'пакет не доставлен')}`;
      pillBg.setAttribute('fill', ok ? '#ecfdf5' : '#fef2f2');
      pillBg.setAttribute('stroke', ok ? '#86efac' : '#fca5a5');
      pillText.setAttribute('fill', ok ? '#166534' : '#b91c1c');
      // Ширина плашки — по тексту: казахская строка длиннее русской
      const w = Math.max(200, pillText.getComputedTextLength?.() + 36 || 240);
      pillBg.setAttribute('x', (480 - w / 2).toFixed(1));
      pillBg.setAttribute('width', w.toFixed(1));
    },
  });

  function currentPos() {
    const k = ease(move);
    return POS[shownTopo].map((p, i) => ({ x: lerp(fromPos[i].x, p.x, k), y: lerp(fromPos[i].y, p.y, k) }));
  }

  // ---------- Кабели ----------

  // Кабель: целый вид и вид с обрывом — два конца с заметной щелью и маленький красный крестик в ней.
  // Обрыв — на доле cutAt длины кабеля.
  function cable(pts, { topo, owner, color, cutAt }) {
    const L = lengthOf(pts);
    // Щель шире толщины кабеля в несколько раз — иначе на телефоне разрез не виден
    const gap = 15 / L;
    const a = slice(pts, 0, cutAt - gap);
    const b = slice(pts, cutAt + gap, 1);
    const at = along(pts, cutAt * L);
    const stroke = (p) => [
      s('path', { d: pathD(p), fill: 'none', stroke: '#0f172a', 'stroke-opacity': 0.25, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(0 3)' }),
      s('path', { d: pathD(p), fill: 'none', stroke: color[1], 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { d: pathD(p), fill: 'none', stroke: color[0], 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { d: pathD(p), fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 1.4, 'stroke-linecap': 'round', transform: 'translate(-0.8 -1.2)' }),
    ];
    const whole = s('g', {}, stroke(pts));
    const broken = s('g', { visibility: 'hidden' }, [
      ...stroke(a), ...stroke(b),
      s('path', { d: `M${at.x - 5} ${at.y - 5} L${at.x + 5} ${at.y + 5} M${at.x + 5} ${at.y - 5} L${at.x - 5} ${at.y + 5}`, stroke: CUT_RED, 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
    ]);
    // Широкая невидимая полоса — по тонкому кабелю пальцем на телефоне не попасть
    const hit = s('path', { d: pathD(pts), fill: 'none', stroke: 'transparent', 'stroke-width': 26, 'stroke-linecap': 'round', 'pointer-events': 'stroke' });
    const hover = s('path', { d: pathD(pts), fill: 'none', stroke: '#fde68a', 'stroke-opacity': 0, 'stroke-width': 14, 'stroke-linecap': 'round', 'pointer-events': 'none' });
    const g = s('g', {}, [hover, whole, broken, hit]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerenter', () => hover.setAttribute('stroke-opacity', 0.55));
    g.addEventListener('pointerleave', () => hover.setAttribute('stroke-opacity', 0));
    g.addEventListener('pointerdown', (e) => {
      if (params.topo !== topo || move < 1) return;
      e.stopPropagation();
      set('cut', params.cut === owner ? 0 : owner);
    });
    return { g, whole, broken, owner, at };
  }

  function buildStar(svg) {
    const g = s('g', { opacity: 0 });
    const list = POS[STAR].map((p, i) => cable([CENTER, p], { topo: STAR, owner: i + 1, color: BLUE, cutAt: 0.58 }));
    g.append(...list.map((c) => c.g));
    svg.append(g);
    return { g, cables: list };
  }

  function buildRing(svg) {
    const g = s('g', { opacity: 0 });
    // Кабель k идёт от компьютера k к следующему по кругу — обрыв «у компьютера k» рядом с ним
    const list = POS[RING].map((_, i) => cable(arcPoints(ringAngle(i), ringAngle(i) + 60), { topo: RING, owner: i + 1, color: BLUE, cutAt: RING_CUT }));
    g.append(...list.map((c) => c.g));
    // Стрелки направления — по одной на серединах дуг, но видны только на пути пакета (см. drawArrows):
    // шесть стрелок сразу читались как узор, а стрелки вдоль пути показывают «по кругу, в одну сторону»
    const arrows = list.map((_, i) => {
      const a = ringAngle(i) + 30;
      const p = onEllipse(a);
      const q = onEllipse(a + 1);
      const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      const arrow = s('path', { d: 'M-8 -8 L9 0 L-8 8 Z', fill: '#facc15', stroke: '#854d0e', 'stroke-width': 1.6, 'stroke-linejoin': 'round', transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`, 'pointer-events': 'none' });
      g.append(arrow);
      return arrow;
    });
    svg.append(g);
    return { g, cables: list, arrows };
  }

  function buildBus(svg, d) {
    const g = s('g', { opacity: 0 });
    const xs = POS[BUS].map((p) => p.x);
    // Ответвления (T-коннекторы) к компьютерам — под магистралью
    POS[BUS].forEach((p) => {
      g.append(
        s('line', { x1: p.x, y1: TRUNK_Y, x2: p.x, y2: p.y, stroke: '#0f172a', 'stroke-width': 6, 'stroke-linecap': 'round' }),
        s('line', { x1: p.x, y1: TRUNK_Y, x2: p.x, y2: p.y, stroke: '#475569', 'stroke-width': 3.5 }),
      );
    });
    // Магистраль — один общий кабель; участок k — от компьютера k до следующего
    const list = xs.map((x, i) => {
      const x1 = i === 0 ? TRUNK[0] : x;
      const x2 = i === 5 ? TRUNK[1] : xs[i + 1];
      // Обрыв — между ответвлениями, чтобы крестик не лёг на Т-коннектор
      const cutX = x + 52;
      return cable([{ x: x1, y: TRUNK_Y }, { x: x2, y: TRUNK_Y }], { topo: BUS, owner: i + 1, color: COAX, cutAt: (cutX - x1) / (x2 - x1) });
    });
    g.append(...list.map((c) => c.g));
    // Т-коннекторы и заглушки-терминаторы на концах магистрали
    xs.forEach((x) => g.append(s('rect', { x: x - 8, y: TRUNK_Y - 7, width: 16, height: 14, rx: 3, fill: d.lin(['#cbd5e1', '#f8fafc', '#94a3b8']), stroke: '#64748b', 'stroke-width': 1, 'pointer-events': 'none' })));
    for (const [x, dir] of [[TRUNK[0], -1], [TRUNK[1], 1]]) {
      g.append(
        s('rect', { x: dir < 0 ? x - 16 : x, y: TRUNK_Y - 8, width: 16, height: 16, rx: 3, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']), stroke: '#475569', 'stroke-width': 1 }),
        s('rect', { x: dir < 0 ? x - 22 : x + 14, y: TRUNK_Y - 6, width: 8, height: 12, rx: 2, fill: '#1e293b' }),
      );
    }
    g.append(text(TRUNK[0] - 6, TRUNK_Y + 26, tr('терминатор'), { size: 13, weight: 500, fill: '#64748b', anchor: 'start' }));
    svg.append(g);
    return { g, cables: list };
  }

  // ---------- Коммутатор ----------

  function buildSwitch(svg, d) {
    const { x, y } = CENTER;
    const w = 176;
    const h = 50;
    swLeds = [];
    // Корпус — отдельная группа: при отказе коммутатор сереет, как отключённые компьютеры
    swBody = s('g', {}, [
      s('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 7, fill: d.lin([[0, '#475569'], [0.15, '#334155'], [1, '#1e293b']], 'v'), stroke: '#0f172a', 'stroke-width': 1.2 }),
      s('rect', { x: x - w / 2 + 3, y: y - h / 2 + 2, width: w - 6, height: 6, rx: 3, fill: '#ffffff', 'fill-opacity': 0.14 }),
      text(x - w / 2 + 10, y - 9, tr('коммутатор'), { size: 13, weight: 600, fill: '#e2e8f0', anchor: 'start' }),
    ]);
    // Шесть портов RJ-45 с индикаторами
    for (let i = 0; i < 6; i++) {
      const px = x - w / 2 + 14 + i * 22;
      swBody.append(
        s('rect', { x: px, y: y + 2, width: 16, height: 13, rx: 2, fill: '#0b1017', stroke: '#64748b', 'stroke-width': 1 }),
        s('rect', { x: px + 4, y: y + 11, width: 8, height: 4, fill: '#1f2937' }),
      );
      const led = s('circle', { cx: px + 8, cy: y + 20, r: 2.4, fill: '#22c55e' });
      swLeds.push(led);
      swBody.append(led);
    }
    swStatus = s('circle', { cx: x + w / 2 - 16, cy: y - 9, r: 4.5, fill: '#22c55e', stroke: '#0f172a', 'stroke-width': 1 });
    swBody.append(swStatus);
    // Подложка, чтобы сквозь посеревший корпус не просвечивали кабели
    const backing = s('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 7, fill: '#eef2f6' });
    const g = s('g', { opacity: 0 }, [floorShadow(x, y + h / 2 + 4, w * 0.55, d, 8), backing, swBody]);
    g.style.cursor = 'pointer';
    g.addEventListener('pointerdown', (e) => {
      if (params.topo !== STAR) return;
      e.stopPropagation();
      set('hub', params.hub ? 0 : 1);
    });
    touchTarget(g, 16);
    svg.append(g);
    return g;
  }

  function drawSwitch() {
    const on = params.topo === STAR;
    sw.setAttribute('opacity', on ? ease(move).toFixed(2) : 0);
    sw.style.pointerEvents = on ? '' : 'none';
    const down = Boolean(params.hub);
    // Индикаторы портов мигают, пока коммутатор передаёт кадры; порт с оборванным кабелем гаснет
    swLeds.forEach((led, i) => {
      const linked = !down && params.cut !== i + 1;
      const blink = Math.sin(clock * 9 + i * 1.7) > -0.3;
      led.setAttribute('fill', linked ? (blink ? '#4ade80' : '#166534') : '#334155');
    });
    swStatus.setAttribute('fill', down ? '#ef4444' : '#22c55e');
    swBody.setAttribute('opacity', down ? 0.45 : 1);
  }

  // ---------- Компьютеры ----------

  function buildPc(svg, d, name, i) {
    const screen = s('rect', { x: -39, y: -33, width: 78, height: 50, rx: 4 });
    const flash = s('rect', { x: -39, y: -33, width: 78, height: 50, rx: 4, fill: '#bbf7d0', opacity: 0 });
    const letter = text(0, -7, name, { size: 28, weight: 800, fill: '#ffffff' });
    // Монитор крупный и без системного блока: на схеме важны буква и цвет экрана, а не детали
    const body = s('g', {}, [
      s('rect', { x: -6, y: 22, width: 12, height: 9, fill: d.lin(['#475569', '#94a3b8', '#475569']) }),
      s('rect', { x: -24, y: 30, width: 48, height: 6, rx: 3, fill: d.lin([[0, '#64748b'], [1, '#334155']], 'v') }),
      s('rect', { x: -44, y: -38, width: 88, height: 60, rx: 7, fill: d.lin([[0, '#334155'], [1, '#111827']], 'v'), stroke: '#0f172a', 'stroke-width': 1 }),
      screen,
      flash,
      s('path', { d: 'M-39 -33 H20 L-20 17 H-39 Z', fill: '#ffffff', 'fill-opacity': 0.07 }),
      letter,
    ]);
    // Плашка роли: цвет плашки = цвет экрана, поэтому связь «плашка — компьютер» видна сразу
    const tagBg = s('rect', { x: -45, y: -11, width: 90, height: 22, rx: 11 });
    const tagText = text(0, 0.5, '', { size: 13, weight: 700, fill: '#ffffff' });
    const tag = s('g', { opacity: 0, 'pointer-events': 'none' }, [tagBg, tagText]);
    // Непрозрачная подложка под монитором: компьютер без связи полупрозрачный, и без неё сквозь
    // него просвечивали бы кабели
    const backing = s('g', { fill: '#eef2f6' }, [
      s('rect', { x: -6, y: 22, width: 12, height: 9 }),
      s('rect', { x: -24, y: 30, width: 48, height: 6, rx: 3 }),
      s('rect', { x: -44, y: -38, width: 88, height: 60, rx: 7 }),
    ]);
    const g = s('g', {}, [floorShadow(0, 36, 44, d, 5), backing, body, tag]);
    // A всегда отправитель; остальные компьютеры по щелчку становятся получателем
    if (i > 0) {
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('dst', i - 1);
      });
      touchTarget(g, 10);
    }
    svg.append(g);
    return { g, body, screen, letter, flash, tag, tagBg, tagText, arrived: 0 };
  }

  function drawPcs() {
    const lost = lostNodes(params);
    const dst = dstIndex(params);
    pcs.forEach((pc, i) => {
      const role = i === 0 ? 'sender' : i === dst ? 'receiver' : '';
      const off = lost.includes(NODES[i]);
      // Без связи — серый полупрозрачный компьютер; отправитель и получатель сохраняют свой цвет,
      // чтобы было видно, кому пакет не дошёл
      pc.screen.setAttribute('fill', screens[role || (off ? 'off' : 'idle')]);
      pc.letter.setAttribute('fill', !role && off ? '#64748b' : '#ffffff');
      pc.body.setAttribute('opacity', off ? 0.4 : 1);
      pc.flash.setAttribute('opacity', (pc.arrived * 0.8).toFixed(2));
      pc.tag.setAttribute('opacity', role ? (off ? 0.55 : 1) : 0);
      if (!role) return;
      pc.tagText.textContent = tr(role === 'sender' ? 'отправитель' : 'получатель');
      pc.tagBg.setAttribute('fill', role === 'sender' ? SENDER : RECEIVER);
      const w = Math.max(80, (pc.tagText.getComputedTextLength?.() || 70) + 24);
      pc.tagBg.setAttribute('x', (-w / 2).toFixed(1));
      pc.tagBg.setAttribute('width', w.toFixed(1));
      const side = labelSide(shownTopo, i);
      const dx = side === 'left' ? -(50 + w / 2) : side === 'right' ? 50 + w / 2 : 0;
      const dy = side === 'up' ? -LABEL_GAP : side === 'down' ? LABEL_GAP : 0;
      pc.tag.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy})`);
    });
  }

  // Стрелки кольца — только на дугах, по которым идёт пакет, и не на оборванной
  function drawArrows() {
    const upTo = params.cut ? params.cut - 1 : dstIndex(params);
    nets[RING].arrows.forEach((a, i) => a.setAttribute('visibility', i < upTo ? 'visible' : 'hidden'));
  }

  // ---------- Переключатель топологии ----------

  function buildTabs(svg, d) {
    const names = ['Шина', 'Звезда', 'Кольцо'];
    return names.map((name, t) => {
      const x = 295 + t * 126;
      const bg = s('rect', { x, y: 20, width: 118, height: 44, rx: 10, 'stroke-width': 1.5 });
      const label = text(x + 72, 42.5, tr(name), { size: 15, weight: 700 });
      const icon = s('g', { transform: `translate(${x + 24} 42)`, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }, miniIcon(t));
      const g = s('g', { filter: d.url('soft') }, [bg, icon, label]);
      g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        // Новая сеть собирается целой: обрывы и отказ коммутатора относятся к старой схеме
        set('cut', 0);
        set('hub', 0);
        set('topo', t);
      });
      touchTarget(g, 6);
      svg.append(g);
      return { bg, label, icon };
    });
  }

  // Значки топологий: точки-компьютеры и линии-кабели
  function miniIcon(t) {
    const dot = (cx, cy) => s('circle', { cx, cy, r: 3, 'stroke-width': 0 });
    if (t === BUS) return [s('path', { d: 'M-13 0 H13 M-8 0 V-7 M0 0 V7 M8 0 V-7' }), dot(-8, -8), dot(0, 8), dot(8, -8)];
    if (t === STAR) {
      const pts = [0, 72, 144, 216, 288].map((a) => [Math.cos(deg(a - 90)) * 10, Math.sin(deg(a - 90)) * 10]);
      return [...pts.map(([px, py]) => s('path', { d: `M0 0 L${px.toFixed(1)} ${py.toFixed(1)}` })), s('rect', { x: -3.5, y: -3.5, width: 7, height: 7, rx: 1.5, 'stroke-width': 0 }), ...pts.map(([px, py]) => dot(px, py))];
    }
    const pts = [0, 60, 120, 180, 240, 300].map((a) => [Math.cos(deg(a)) * 10, Math.sin(deg(a)) * 10]);
    return [s('circle', { cx: 0, cy: 0, r: 10 }), ...pts.map(([px, py]) => dot(px, py))];
  }

  function drawTabs() {
    tabs.forEach((tab, t) => {
      const on = t === params.topo;
      tab.bg.setAttribute('fill', on ? ACCENT : '#ffffff');
      tab.bg.setAttribute('stroke', on ? '#155e75' : '#cbd5e1');
      tab.label.setAttribute('fill', on ? '#ffffff' : '#334155');
      tab.icon.setAttribute('stroke', on ? '#ffffff' : '#475569');
      [...tab.icon.querySelectorAll('circle, rect')].forEach((el) => {
        if (el.getAttribute('stroke-width') === '0') el.setAttribute('fill', on ? '#ffffff' : '#475569');
      });
    });
  }

  // ---------- Пакет ----------

  // Путь пакета по текущей схеме и место, где он гибнет, если сеть неисправна
  function plan() {
    const p = POS[params.topo];
    const dst = dstIndex(params);
    const ok = delivered(params);
    if (params.topo === STAR) {
      const full = [p[0], CENTER, p[dst]];
      if (ok) return { pts: full, ok };
      if (params.hub) return { pts: [p[0], CENTER], ok };
      // Оборван кабель отправителя или получателя: пакет доходит до места обрыва
      const c = nets[STAR].cables[params.cut - 1];
      return { pts: params.cut === 1 ? [p[0], c.at] : [p[0], CENTER, c.at], ok };
    }
    if (params.topo === RING) {
      const end = ringAngle(dst);
      if (ok) return { pts: arcPoints(ringAngle(0), end, 24 * dst), ok };
      // Кольцо разорвано: пакет идёт по кругу, пока не упрётся в обрыв
      const cutA = ringAngle(params.cut - 1) + 60 * RING_CUT;
      return { pts: arcPoints(ringAngle(0), cutA, Math.max(2, Math.round((cutA - 180) / 2.5))), ok };
    }
    const tap = (i) => ({ x: p[i].x, y: TRUNK_Y });
    if (ok) return { pts: [p[0], tap(0), tap(dst), p[dst]], ok };
    // Магистраль оборвана: сигнал отражается от оборванного конца и искажается — гибнет у обрыва
    // или у ответвления получателя, смотря что ближе к отправителю
    const cutX = nets[BUS].cables[params.cut - 1].at.x;
    const endX = cutX < p[dst].x ? cutX : p[dst].x;
    return { pts: [p[0], tap(0), { x: endX, y: TRUNK_Y }], ok };
  }

  function drawPacket(dt) {
    const k = `${params.topo}|${params.dst}|${params.cut}|${params.hub}`;
    if (k !== key) {
      key = k;
      cycle = 0;
      pcs.forEach((pc) => { pc.arrived = 0; });
    }
    pcs.forEach((pc) => { pc.arrived = Math.max(0, pc.arrived - dt * 1.4); });
    // Пока компьютеры переезжают, пакет не отправляется
    if (move < 1) {
      packet.setAttribute('opacity', 0);
      signal.setAttribute('opacity', 0);
      return;
    }
    const { pts, ok } = plan();
    const L = lengthOf(pts);
    const travel = L / SPEED;
    const prev = cycle;
    cycle += dt;
    if (cycle > travel + HOLD) cycle = 0;
    const dist = Math.min(L, cycle * SPEED);
    const at = along(pts, dist);
    const arrivedNow = prev < travel && cycle >= travel;
    if (ok && arrivedNow) pcs[dstIndex(params)].arrived = 1;

    // Доставленный пакет исчезает в получателе (вспыхивает его экран); недоставленный —
    // красный конверт замирает у неисправности и гаснет
    const fadeIn = clamp01(cycle / 0.15);
    const fadeOut = ok ? 0 : clamp01(1 - (cycle - travel) / HOLD);
    packet.setAttribute('opacity', (cycle < travel ? fadeIn : fadeOut).toFixed(2));
    packet.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
    // Неисправная сеть искажает пакет: конверт краснеет ещё в пути
    packetBody.firstChild.setAttribute('stroke', ok ? ACCENT : '#dc2626');
    packetBody.lastChild.setAttribute('stroke', ok ? ACCENT : '#dc2626');

    // Шина: сигнал от ответвления A расходится по магистрали в обе стороны до концов или до обрыва
    if (params.topo === BUS) {
      const p = POS[BUS];
      const startD = Math.abs(TRUNK_Y - p[0].y);
      const spread = Math.max(0, dist - startD) + (cycle >= travel ? (cycle - travel) * SPEED : 0);
      let lo = TRUNK[0];
      let hi = TRUNK[1];
      if (params.cut) {
        const cx = nets[BUS].cables[params.cut - 1].at.x;
        if (cx > p[0].x) hi = cx; else lo = cx;
      }
      const x1 = Math.max(lo, p[0].x - spread);
      const x2 = Math.min(hi, p[0].x + spread);
      signal.setAttribute('d', `M${x1.toFixed(1)} ${TRUNK_Y} H${x2.toFixed(1)}`);
      signal.setAttribute('stroke', ok ? '#38bdf8' : '#f87171');
      signal.setAttribute('opacity', spread > 0 ? (cycle < travel ? 1 : clamp01(1 - (cycle - travel) / HOLD)).toFixed(2) : 0);
    } else {
      signal.setAttribute('opacity', 0);
    }
  }

  scene.svg.style.userSelect = 'none';
  return scene;
}
