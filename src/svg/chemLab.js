// Химическая лаборатория в SVG: полка с реактивами и сменная установка (см. chem/rigs.js):
// стакан на плитке, пробирки в штативе, прибор для получения газа, спиртовка, вытяжной шкаф.
// Интерфейс (add / wash / setReaction / setTemperature / highlight / setShelf / isBusy / stage)
// используют bench.js, уроки и свободная лаборатория; setSetup выбирает установку,
// splint / onSplint — проба газа горящей лучинкой.

import { SUBSTANCES } from '../data/substances.js';
import { SHELF, SHELF_BY_ID } from '../data/shelf.js';
import { bubblePool, createScene, INK, mixHex, room, s, shade, text } from './kit.js';
import { buildRig } from './chem/rigs.js';
import { createFx, foamLayer, splintNodes } from './chem/effects.js';

const COLORLESS = '#b5d9f0';
const SHELF_Y = 150; // верх полки — на ней стоят склянки
const BENCH_Y = 494;
const LIFT_TIME = 0.45;
const POUR_TIME = 0.9;
const STOPPER_TIME = 0.3;
export const SETUPS = ['beaker', 'tubes', 'gas', 'burner', 'hood'];

export function createChemLab(container, { onPick, onHover } = {}) {
  let visible = SHELF.map((it) => it.id);
  let temperature = 20;
  let busy = false;
  let reaction = null;
  let action = null; // текущая анимация добавления
  let highlighted = [];
  let arrowId = null;
  let setup = { name: 'beaker', opts: {} };
  let rig = null;
  let cells = []; // сосуды установки и их содержимое
  let cell = null; // сосуд, в котором идёт текущий опыт
  let gasAmount = 0; // сколько газа накопилось у горлышка / в приёмнике (0..1)
  const splintListeners = new Set();

  const items = new Map(); // id → { g, home: {x, y}, ring }
  let defs, roomLayer, rigLayer, fx, arrow, stream, sp;

  const scene = createScene(container, {
    build(svg, d) {
      defs = d;
      roomLayer = s('g');
      rigLayer = s('g');
      svg.append(roomLayer);
      // Полка
      svg.append(
        s('path', { d: `M70 ${SHELF_Y + 14} v34 h28`, fill: 'none', stroke: '#94a3b8', 'stroke-width': 6, 'stroke-linejoin': 'round' }),
        s('path', { d: `M890 ${SHELF_Y + 14} v34 h-28`, fill: 'none', stroke: '#94a3b8', 'stroke-width': 6, 'stroke-linejoin': 'round' }),
        s('rect', { x: 30, y: SHELF_Y, width: 900, height: 16, rx: 3, fill: d.lin([[0, '#e7c9a0'], [1, '#c9a27a']], 'v') }),
        s('rect', { x: 30, y: SHELF_Y, width: 900, height: 4, rx: 2, fill: '#f5e1c4' }),
      );
      svg.append(rigLayer);
      const fxLayer = s('g', { 'pointer-events': 'none' });
      fx = createFx(fxLayer, d);
      stream = s('path', { d: '', stroke: '#93c5fd', 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none', opacity: 0 });
      svg.append(fxLayer, stream);

      for (const item of SHELF) {
        const g = s('g', { class: 'reagent-item' });
        const ring = s('ellipse', { cx: 0, cy: 2, rx: 38, ry: 9, fill: '#1a5cff', opacity: 0 });
        g.append(ring, drawItem(item, d));
        g.addEventListener('click', () => !busy && onPick?.(item.id));
        g.addEventListener('pointerenter', () => !busy && onHover?.(item.id));
        g.addEventListener('pointerleave', () => onHover?.(null));
        g.style.cursor = 'pointer';
        svg.append(g);
        items.set(item.id, { g, ring, home: { x: 0, y: SHELF_Y } });
      }
      arrow = s('path', { d: 'M-12 -14 L12 -14 L0 4 Z', fill: '#1a5cff', opacity: 0 });
      svg.append(arrow);
      sp = createSplint(svg, d);
      mountSetup();
      layoutShelf();
    },

    frame(dt, now) {
      rig.heater?.update(temperature, dt, now);
      rig.receiver?.update(dt);
      animateAction(dt);
      updateReaction(dt);
      for (const c of cells) {
        c.bubbles.update(dt, c.v.surfaceY + 3, c.v.kind === 'tube' ? 0.3 : 0.6);
        c.precip.settle(dt);
      }
      cell.foamK += (cell.foamTarget - cell.foamK) * Math.min(1, dt * 3);
      cell.foam.update(cell.foamK, now);
      if (!rig.closedGas) gasAmount = Math.max(0, gasAmount - dt * 0.04);
      updateVapours(dt);
      sp.frame(dt, now);
      fx.update(dt);

      // Подсветка нужного реактива и прыгающая стрелка
      const pulse = 0.25 + 0.2 * Math.sin(now * 5);
      for (const [itemId, it] of items) it.ring.setAttribute('opacity', highlighted.includes(itemId) ? pulse : 0);
      const target = arrowId && !busy ? items.get(arrowId) : null;
      arrow.setAttribute('opacity', target ? 1 : 0);
      if (target) arrow.setAttribute('transform', `translate(${target.home.x} ${target.home.y - 118 + Math.abs(Math.sin(now * 4)) * 10})`);
    },
  });

  // ---------- Установка ----------

  function mountSetup() {
    roomLayer.replaceChildren();
    rigLayer.replaceChildren();
    fx.clear();
    rig = buildRig(setup.name, defs, rigLayer, setup.opts);
    room(roomLayer, defs, { benchY: BENCH_Y, theme: rig.theme });
    cells = rig.vessels.map(makeCell);
    cell = cells[0];
    reaction = null;
    gasAmount = 0;
    stream.setAttribute('opacity', 0);
    sp.setRig(rig.splint);
  }

  function makeCell(v) {
    const tube = v.kind === 'tube';
    return {
      v,
      bubbles: bubblePool(v.content, tube ? 60 : 90),
      precip: particles(v, tube ? 80 : 160),
      foam: foamLayer(v, tube ? 18 : 34),
      foamK: 0,
      foamTarget: 0,
      solids: [],
      level: 0,
      liquid: COLORLESS,
      fuming: false,
      used: false,
    };
  }

  function clearCell(c) {
    c.level = 0;
    c.v.setLevel(0);
    c.liquid = COLORLESS;
    c.v.setColor(COLORLESS);
    for (const sd of c.solids) sd.g.remove();
    c.solids = [];
    c.bubbles.clear();
    c.precip.clear();
    c.foamK = 0;
    c.foamTarget = 0;
    c.foam.update(0, 0);
    c.fuming = false;
    c.used = false;
  }

  function layoutShelf() {
    const shown = SHELF.filter((it) => visible.includes(it.id));
    const gap = Math.min(96, 840 / Math.max(shown.length, 1));
    const start = 480 - (gap * (shown.length - 1)) / 2;
    for (const [itemId, it] of items) {
      const k = shown.findIndex((x) => x.id === itemId);
      it.g.style.display = k < 0 ? 'none' : '';
      if (k < 0) continue;
      it.home = { x: start + gap * k, y: SHELF_Y };
      place(it.g, it.home.x, it.home.y, 0);
    }
  }

  // ---------- Добавление реактива: подъём → наклон и струя → возврат ----------

  function animateAction(dt) {
    if (!action) return;
    action.t += dt;
    const { item, it } = action;
    const v = cell.v;
    const t = action.t;
    // Пробку вынимают, пока реактив добавляют, и сразу возвращают на место
    rig.stopper?.set(clamp01(t / STOPPER_TIME) * clamp01((action.end - t) / STOPPER_TIME));

    if (item.kind === 'dish') {
      // Щипцами переносим кусочек: чашка на месте, падает кусочек
      const p = Math.min(1, t / (LIFT_TIME + POUR_TIME));
      const piece = action.piece;
      if (piece) {
        const x = lerp(it.home.x, v.x, ease(Math.min(1, p * 1.6)));
        const y = p < 0.6 ? lerp(it.home.y - 30, v.top - 30, ease(p / 0.6)) : lerp(v.top - 30, v.solid.y - 4, ((p - 0.6) / 0.4) ** 2);
        place(piece, x, y, p * 200, lerp(1, v.solid.scale, ease(Math.min(1, p * 1.4))));
        if (p >= 1) {
          piece.remove();
          action.piece = null;
          addSolid(item);
        }
      }
      if (t >= action.end) finish();
      return;
    }
    // Склянку держим сбоку над сосудом; поворачиваем вокруг дна, горлышком к сосуду
    const L = (item.kind === 'dropper' ? 54 : 78) + 12;
    const above = v.pourAt(L);
    if (t < LIFT_TIME) {
      const p = ease(t / LIFT_TIME);
      place(it.g, lerp(it.home.x, above.x, p), lerp(it.home.y, above.y, p) - Math.sin(p * Math.PI) * 40, 0);
    } else if (t < LIFT_TIME + POUR_TIME) {
      const p = (t - LIFT_TIME) / POUR_TIME;
      const tilt = -Math.min(1, p * 3) * 105;
      place(it.g, above.x, above.y, tilt);
      // Положение горлышка после поворота на tilt вокруг дна склянки
      const rad = (tilt * Math.PI) / 180;
      const mouthX = above.x + L * Math.sin(rad);
      const mouthY = above.y - L * Math.cos(rad);
      if (item.kind === 'dropper') {
        stream.setAttribute('opacity', 0);
      } else {
        stream.setAttribute('d', `M${mouthX} ${mouthY} Q${mouthX - 14} ${mouthY + 10} ${mouthX - 16} ${v.surfaceY}`);
        stream.setAttribute('stroke', item.liquid === '#f4f4f4' ? '#cbd5e1' : shade(item.liquid, -0.1));
        stream.setAttribute('stroke-width', v.kind === 'tube' ? 5 : 7);
        stream.setAttribute('opacity', p > 0.2 && p < 0.9 ? 0.85 : 0);
        cell.level = Math.min(0.62, action.startLevel + 0.4 * Math.max(0, (p - 0.2) / 0.7));
        v.setLevel(cell.level);
      }
      if (action.color) v.setColor(mixHex(action.startColor, action.color, Math.min(1, p * 1.3)));
    } else if (t < LIFT_TIME * 2 + POUR_TIME) {
      stream.setAttribute('opacity', 0);
      const p = ease((t - LIFT_TIME - POUR_TIME) / LIFT_TIME);
      place(it.g, lerp(above.x, it.home.x, p), lerp(above.y, it.home.y, p), 0);
    } else {
      place(it.g, it.home.x, it.home.y, 0);
      if (t >= action.end) finish();
    }
  }

  function finish() {
    const done = action.resolve;
    if (action.color) cell.liquid = action.color;
    if (action.item.concentration === 'concentrated') cell.fuming = true;
    rig.stopper?.set(0);
    action = null;
    busy = false;
    done();
  }

  function addSolid(item) {
    const color = SUBSTANCES[item.substance].color;
    const k = cell.solids.length;
    const sc = cell.v.solid;
    const g = s('g', {}, [pieceShape(item, color)]);
    const sd = { g, substance: item.substance, color, x: cell.v.x + sc.offset + k * sc.spread, rot: k * 30, scale: 1, shape: g.firstChild };
    placeSolid(sd);
    cell.v.content.append(g);
    cell.solids.push(sd);
    cell.used = true;
  }

  function placeSolid(sd) {
    place(sd.g, sd.x, cell.v.solid.y, sd.rot, sd.scale * cell.v.solid.scale);
  }

  // ---------- Реакция ----------

  function updateReaction(dt) {
    cell.foamTarget = 0;
    const r = reaction?.result;
    // Пока реактив добавляют, реакция «ждёт»; лучинка же реакцию не останавливает
    if (!r || action) return;
    const v = r.visual;
    if (r.status === 'indicator') {
      cell.liquid = v.liquidEnd;
      cell.v.setColor(cell.liquid);
      return;
    }
    if (r.status !== 'reaction') return;
    const duration = Math.min(25, Math.max(1.2, 8 / r.rate));
    reaction.progress = Math.min(1, reaction.progress + dt / duration);
    const p = reaction.progress;
    cell.liquid = mixHex(reaction.fromColor, v.liquidEnd, p);
    cell.v.setColor(cell.liquid);

    for (const sd of cell.solids) {
      if (!r.params.substances.includes(sd.substance)) continue;
      if (v.solidDissolves) sd.scale = Math.max(0.3, 1 - 0.7 * p);
      placeSolid(sd);
      if (v.coating) paint(sd.shape, mixHex(sd.color, v.coating, p));
    }
    if (v.bubbles && cell.level > 0) {
      const fade = v.bubbleDecay ? Math.max(0, 1 - p * 5) : 1 - p * 0.8;
      const intensity = v.bubbles * Math.min(r.rate, 4) * fade;
      // Бурная реакция (магний, нагретая кислота): пузырей больше, они крупнее, у поверхности пена
      const vigorous = intensity > 0.9;
      const src = cell.solids.find((sd) => r.params.substances.includes(sd.substance));
      const tube = cell.v.kind === 'tube';
      let n = 30 * intensity * (vigorous ? 1.8 : 1) * dt;
      while (n > 0) {
        if (Math.random() < Math.min(1, n)) {
          const size = vigorous ? 3.5 + Math.random() * 5 : 3 + Math.random() * 3;
          cell.bubbles.spawn((src?.x ?? cell.v.x) + (Math.random() - 0.5) * (tube ? 14 : 30), cell.v.solid.y - 6, tube ? size * 0.75 : size);
        }
        n -= 1;
      }
      cell.foamTarget = vigorous ? Math.min(1, 0.5 + (intensity - 0.9) * 0.6) : 0;
      gasAmount = Math.min(1, gasAmount + intensity * dt * 0.25);
    }
    if (v.precipitate && cell.level > 0) {
      const target = Math.floor(cell.precip.max * p);
      while (cell.precip.count() < target) {
        const x = cell.v.x + (Math.random() - 0.5) * 2 * cell.v.inner;
        cell.precip.spawn(x, cell.v.surfaceY + Math.random() * (cell.v.floorAt(x) - cell.v.surfaceY - 6), v.precipitate);
      }
      if (v.precipitateEnd) {
        reaction.heat = Math.min(1, reaction.heat + dt / 4);
        cell.precip.recolor(mixHex(v.precipitate, v.precipitateEnd, reaction.heat));
      }
    }
  }

  // Пар при кипении и дымок над концентрированной серной кислотой
  function updateVapours(dt) {
    const v = cell.v;
    if (cell.level <= 0.01) return;
    const tube = v.kind === 'tube';
    if (temperature >= 70 && Math.random() < dt * 4) {
      fx.wisp(v.mouth.x + (Math.random() - 0.5) * v.w * 0.6, v.mouth.y, { r0: tube ? 6 : 10, r1: tube ? 22 : 32 });
    }
    if (cell.fuming) {
      // Концентрированная кислота почти не летуча: дымок появляется при нагревании,
      // а при реакции с медью густеет — выделяется SO₂ вместе с парами
      const r = reaction?.result;
      const so2 = r?.status === 'reaction' && r.visual.gas === 'SO₂';
      const hood = rig.theme === 'hood';
      const rate = (so2 ? 5 : 0) + (temperature >= 50 ? 1.5 + (temperature - 50) / 15 : 0);
      if (Math.random() < rate * dt) {
        fx.wisp(v.mouth.x + (Math.random() - 0.5) * v.w * 0.5, v.mouth.y + 8, {
          r0: tube ? 5 : 9, r1: so2 ? 42 : 30, rise: hood ? 75 : 40, life: 2.8,
          // Тяга вытяжного шкафа уносит дымок вверх быстрее
          color: so2 ? '#8b8f97' : '#a3aab5', opacity: so2 ? 0.6 : 0.45, drift: hood ? -4 : 6,
        });
      }
    }
  }

  // ---------- Лучинка ----------

  function gasHere() {
    const r = reaction?.result;
    if (r?.status !== 'reaction' || !r.visual.gas) return null;
    return gasAmount > 0.03 ? r.visual.gas : null;
  }

  // Лучинка лежит на столе; её можно перетащить к отверстию приёмника или просто нажать на неё
  function createSplint(svg, d) {
    const { stick, ember, flame } = splintNodes(d);
    svg.append(stick, ember, flame);
    const st = { conf: null, x: 0, y: 0, angle: 0, lit: false, mode: 'idle', emberK: 0, smoke: 0, resolve: null, result: null };
    let tween = null;

    function moveTo(to, angle, dur, then) {
      tween = { from: { x: st.x, y: st.y, angle: st.angle }, to: { ...to, angle }, t: 0, dur, then };
      st.mode = 'move';
    }

    function goHome() {
      moveTo(st.conf.home, 0, 0.6, () => {
        st.mode = 'idle';
        st.lit = false;
        busy = false;
        st.resolve?.(st.result);
        st.resolve = null;
      });
    }

    function test() {
      const gas = gasHere();
      const outcome = !gas ? 'burn' : gas === 'H₂' ? 'pop' : 'out';
      const tip = st.conf.target;
      if (outcome === 'pop') {
        // Водород сгорает с хлопком — в приёмнике его больше нет
        fx.flash(tip.x, tip.y - 6);
        fx.shock(tip.x, tip.y - 6);
        rig.receiver?.kick();
        gasAmount = 0;
      } else if (outcome === 'out') {
        st.lit = false;
        st.emberK = 1;
        st.smoke = 1.4;
      }
      st.result = { gas, outcome };
      st.mode = 'hold';
      st.hold = outcome === 'out' ? 1.6 : 1.1;
      splintListeners.forEach((fn) => fn(st.result));
    }

    function approach(dur) {
      st.lit = true;
      moveTo(st.conf.target, st.conf.angle, dur, test);
    }

    let moved = false;
    let start = null;
    stick.addEventListener('pointerdown', (e) => {
      if (busy || !st.conf || st.mode !== 'idle') return;
      e.preventDefault();
      try {
        stick.setPointerCapture(e.pointerId);
      } catch {
        // Указатель уже отпущен (или событие синтетическое) — перетаскивание просто не захватит мышь
      }
      busy = true;
      st.mode = 'drag';
      st.lit = true;
      st.result = null;
      moved = false;
      start = scene.point(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (st.mode !== 'drag') return;
      const p = scene.point(e);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
      moved = true;
      st.x = p.x;
      st.y = p.y;
      st.angle = st.conf.angle;
    });
    const release = () => {
      if (st.mode !== 'drag') return;
      const tgt = st.conf.target;
      if (!moved) approach(0.8);
      else if (Math.hypot(st.x - tgt.x, st.y - tgt.y) < 60) approach(0.2);
      else goHome();
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    return {
      setRig(conf) {
        st.conf = conf;
        tween = null;
        st.mode = 'idle';
        st.lit = false;
        st.smoke = 0;
        st.emberK = 0;
        stick.style.display = conf ? '' : 'none';
        if (conf) Object.assign(st, { x: conf.home.x, y: conf.home.y, angle: 0 });
      },
      run() {
        if (busy || !st.conf || st.mode !== 'idle') return Promise.resolve(null);
        busy = true;
        st.result = null;
        return new Promise((resolve) => {
          st.resolve = resolve;
          approach(0.8);
        });
      },
      frame(dt, now) {
        if (!st.conf) {
          flame.setAttribute('opacity', 0);
          ember.setAttribute('opacity', 0);
          return;
        }
        if (st.mode === 'move' && tween) {
          tween.t += dt;
          const p = ease(Math.min(1, tween.t / tween.dur));
          st.x = lerp(tween.from.x, tween.to.x, p);
          st.y = lerp(tween.from.y, tween.to.y, p);
          st.angle = lerp(tween.from.angle, tween.to.angle, p);
          if (tween.t >= tween.dur) {
            const then = tween.then;
            tween = null;
            then();
          }
        } else if (st.mode === 'hold') {
          st.hold -= dt;
          if (st.hold <= 0) goHome();
        }
        stick.setAttribute('transform', `translate(${st.x} ${st.y}) rotate(${st.angle})`);
        flame.setAttribute('opacity', st.lit ? 1 : 0);
        if (st.lit) {
          const sy = 1 + 0.12 * Math.sin(now * 19) + 0.06 * Math.sin(now * 33);
          flame.setAttribute('transform', `translate(${st.x - 1} ${st.y - 1}) scale(${(1 + 0.06 * Math.sin(now * 23)).toFixed(3)} ${sy.toFixed(3)})`);
        }
        // Погасшая лучинка: тлеющий кончик и струйка дыма
        st.emberK = Math.max(0, st.emberK - dt * 0.5);
        ember.setAttribute('opacity', st.emberK);
        ember.setAttribute('cx', st.x + 2);
        ember.setAttribute('cy', st.y);
        if (st.smoke > 0) {
          st.smoke -= dt;
          if (Math.random() < dt * 12) fx.wisp(st.x + 2, st.y - 4, { r0: 2.5, r1: 13, rise: 34, life: 1.8, color: '#78716c', opacity: 0.45, drift: 5 });
        }
      },
    };
  }

  const wait = () => new Promise((resolve) => { action.resolve = resolve; });

  return {
    async add(itemId, colorAfter) {
      const item = SHELF_BY_ID[itemId];
      const it = items.get(itemId);
      busy = true;
      onHover?.(null);
      cell.used = true;
      const level = cell.level;
      const extra = rig.stopper ? STOPPER_TIME : 0;
      action = {
        item, it, t: 0, startLevel: level,
        end: (item.kind === 'dish' ? LIFT_TIME + POUR_TIME : LIFT_TIME * 2 + POUR_TIME) + extra,
        startColor: level > 0.01 ? cell.liquid : (colorAfter ?? item.liquid),
        color: item.kind === 'dish' ? null : (colorAfter ?? (level > 0.01 ? null : item.liquid)),
      };
      if (item.kind === 'dish') {
        action.piece = s('g', {}, [pieceShape(item, SUBSTANCES[item.substance].color)]);
        scene.svg.append(action.piece);
      }
      await wait();
    },
    // В штативе с пробирками новый опыт ставят в чистую пробирку, а прежняя остаётся для сравнения
    async wash() {
      busy = true;
      if (rig.rotate && cell.used) {
        // Прежняя пробирка остаётся в штативе для сравнения — показываем в ней итог опыта,
        // а не момент, на котором ученик перешёл дальше (медленные реакции идут до 25 с)
        if (reaction?.result?.status === 'reaction') {
          reaction.progress = 1;
          reaction.heat = 1;
          updateReaction(0);
        }
        cell.bubbles.clear();
        cell.foamK = 0;
        cell.foamTarget = 0;
        cell.foam.update(0, 0);
        cell = cells[(cells.indexOf(cell) + 1) % cells.length];
      }
      clearCell(cell);
      reaction = null;
      gasAmount = 0;
      await new Promise((r) => setTimeout(r, 250));
      busy = false;
    },
    setReaction(result) {
      const key = result.params.substances.filter((x) => x !== 'indicator_phph').sort().join('+');
      const same = reaction && reaction.key === key && reaction.status === result.status;
      reaction = { key, status: result.status, result, progress: same ? reaction.progress : 0, heat: same ? reaction.heat : 0, fromColor: cell.liquid };
      if (result.params.concentration === 'concentrated') cell.fuming = true;
    },
    setTemperature(t) {
      temperature = t;
    },
    highlight(ids, { arrow: withArrow = false } = {}) {
      highlighted = ids;
      arrowId = withArrow && ids.length ? ids[0] : null;
    },
    setShelf(ids) {
      visible = ids;
      layoutShelf();
    },
    // Сменить установку: оборудование собирается заново, сосуды пустые.
    // opts.receiver: 'down' | 'up' — как стоит пробирка-приёмник в установке 'gas'
    setSetup(name = 'beaker', opts = {}) {
      if (action) return;
      setup = { name: SETUPS.includes(name) ? name : 'beaker', opts };
      mountSetup();
      busy = false;
    },
    // Поднести горящую лучинку к отверстию сосуда/приёмника (то же, что нажать на лучинку).
    // Возвращает { gas, outcome: 'pop' | 'out' | 'burn' } или null, если лучинки нет или сцена занята.
    splint: () => sp.run(),
    hasSplint: () => Boolean(rig?.splint),
    onSplint(fn) {
      splintListeners.add(fn);
      return () => splintListeners.delete(fn);
    },
    // Мгновенно показать итог опыта без анимации — для превью на плитках
    stage(itemIds, result) {
      const v = cell.v;
      const liquids = itemIds.filter((id) => SHELF_BY_ID[id].kind === 'bottle');
      cell.level = Math.min(0.62, 0.4 * liquids.length);
      v.setLevel(cell.level);
      cell.liquid = result.visual.liquidEnd ?? result.visual.liquidStart ?? COLORLESS;
      v.setColor(cell.liquid);
      for (const id of itemIds) if (SHELF_BY_ID[id].kind === 'dish') addSolid(SHELF_BY_ID[id]);
      const vis = result.visual;
      if (vis.coating) for (const sd of cell.solids) paint(sd.shape, vis.coating);
      if (vis.precipitate) {
        for (let i = 0; i < cell.precip.max * 0.75; i++) {
          const x = v.x + (Math.random() - 0.5) * 2 * v.inner;
          cell.precip.spawn(x, v.floorAt(x) - Math.random() * v.pile, vis.precipitate);
        }
      }
      if (vis.bubbles) for (let i = 0; i < 14; i++) cell.bubbles.spawn(v.x + (Math.random() - 0.5) * v.inner, v.surfaceY + 10 + Math.random() * (v.bottom - v.surfaceY - 30));
    },
    isBusy: () => busy,
    destroy: () => scene.destroy(),
  };
}

// ---------- Иллюстрации реактивов ----------

function drawItem(item, d) {
  if (item.kind === 'dish') {
    const color = SUBSTANCES[item.substance].color;
    // Чашка Петри с кусочками вещества и табличкой перед ней
    return s('g', {}, [
      floorShadowSimple(48),
      s('path', { d: 'M-42 -10 v8 a42 10 0 0 0 84 0 v-8', fill: d.lin([[0, '#cbd5e1'], [0.3, '#f8fafc'], [1, '#cbd5e1']]), stroke: '#94a3b8', 'stroke-width': 1.5 }),
      s('ellipse', { cx: 0, cy: -10, rx: 42, ry: 10, fill: '#f1f5f9', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      ...[-18, 0, 18].map((dx, i) => s('g', { transform: `translate(${dx} ${-14 - (i % 2) * 3})` }, [pieceShape(item, color)])),
      s('rect', { x: -22, y: 6, width: 44, height: 18, rx: 4, fill: '#ffffff', stroke: '#cbd5e1' }),
      text(0, 15, item.label, { size: 11, weight: 700, fill: INK }),
    ]);
  }
  const small = item.kind === 'dropper';
  const w = small ? 34 : 52;
  const h = small ? 56 : 80;
  const liquidColor = item.liquid === '#f4f4f4' ? '#e2e8f0' : item.liquid;
  return s('g', {}, [
    floorShadowSimple(w * 0.8),
    // стеклянный корпус и жидкость с объёмом
    s('rect', { x: -w / 2, y: -h, width: w, height: h, rx: 11, fill: d.lin([[0, '#e2e8f0', 0.9], [0.35, '#ffffff', 0.7], [1, '#cbd5e1', 0.9]]), stroke: '#94a3b8', 'stroke-width': 1.5 }),
    s('rect', { x: -w / 2 + 4, y: -h * 0.74, width: w - 8, height: h * 0.74 - 4, rx: 8, fill: liquidColor, 'fill-opacity': 0.8 }),
    s('rect', { x: -w / 2 + 4, y: -h * 0.74, width: w - 8, height: h * 0.74 - 4, rx: 8, fill: d.lin([[0, '#0f172a', 0.18], [0.35, '#ffffff', 0.2], [1, '#0f172a', 0.25]]) }),
    // бумажная этикетка: формула и концентрация
    s('rect', { x: -w / 2 + 3, y: -h * 0.6, width: w - 6, height: small ? 22 : 32, rx: 3, fill: '#ffffff', stroke: '#e2e8f0' }),
    text(0, -h * 0.6 + (small ? 8 : 11), item.label, { size: small ? 9 : 12, weight: 800, fill: INK }),
    text(0, -h * 0.6 + (small ? 16 : 24), item.note, { size: small ? 7 : 9, weight: 500, fill: '#64748b' }),
    // блик
    s('rect', { x: -w / 2 + 5, y: -h + 8, width: 4, height: h - 22, rx: 2, fill: '#ffffff', 'fill-opacity': 0.8 }),
    // горлышко и крышка / груша пипетки
    s('rect', { x: -w * 0.2, y: -h - 10, width: w * 0.4, height: 12, fill: d.lin(['#cbd5e1', '#f8fafc', '#cbd5e1']), stroke: '#94a3b8', 'stroke-width': 1.5 }),
    small
      ? s('ellipse', { cx: 0, cy: -h - 20, rx: 11, ry: 13, fill: d.rad([shade(item.cap, 0.35), item.cap, shade(item.cap, -0.35)]) })
      : s('rect', { x: -w * 0.3, y: -h - 26, width: w * 0.6, height: 18, rx: 5, fill: d.lin([shade(item.cap, -0.25), shade(item.cap, 0.3), shade(item.cap, -0.3)]) }),
  ]);
}

function floorShadowSimple(rx) {
  return s('ellipse', { cx: 0, cy: 2, rx, ry: 6, fill: '#0f172a', 'fill-opacity': 0.12 });
}

function pieceShape(item, color) {
  const dark = shade(color, -0.35);
  if (item.shape === 'nail') {
    return s('g', { transform: 'rotate(-12)' }, [
      s('rect', { x: -26, y: -3, width: 48, height: 6, rx: 3, fill: color, stroke: dark, 'stroke-width': 1.5 }),
      s('rect', { x: 20, y: -8, width: 5, height: 16, rx: 2, fill: color, stroke: dark, 'stroke-width': 1.5 }),
    ]);
  }
  if (item.shape === 'ribbon') {
    return s('path', { d: 'M-16 4 q8 -16 16 0 t16 0', stroke: color, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
  }
  if (item.shape === 'chunk') {
    return s('path', { d: 'M-14 6 L-10 -8 L6 -10 L14 -2 L10 8 Z', fill: color, stroke: '#cbd5e1', 'stroke-width': 1.5 });
  }
  return s('path', { d: 'M-9 5 L-7 -6 L4 -8 L10 0 L5 7 Z', fill: color, stroke: dark, 'stroke-width': 1.5 });
}

function paint(node, color) {
  const shapes = node.matches?.('path,rect,circle') ? [node] : [...node.querySelectorAll('path,rect,circle')];
  for (const n of shapes) {
    if (n.getAttribute('fill') && n.getAttribute('fill') !== 'none') n.setAttribute('fill', color);
    else n.setAttribute('stroke', color);
  }
}

// Частицы осадка: появляются в объёме раствора и оседают на дно сосуда
function particles(vessel, max) {
  const list = [];
  const r = vessel.kind === 'tube' ? 2.4 : 3.2;
  return {
    max,
    count: () => list.length,
    spawn(x, y, color) {
      if (list.length >= max) return;
      const c = s('circle', { r, fill: color, cx: x, cy: y });
      vessel.content.append(c);
      list.push({ c, y, floor: vessel.floorAt(x) - Math.random() * vessel.pile, v: 0 });
    },
    settle(dt) {
      for (const p of list) {
        if (p.y >= p.floor) continue;
        p.v = Math.min(p.v + dt * 60, 60);
        p.y = Math.min(p.floor, p.y + p.v * dt);
        p.c.setAttribute('cy', p.y);
      }
    },
    recolor(color) {
      for (const p of list) p.c.setAttribute('fill', color);
    },
    clear() {
      for (const p of list) p.c.remove();
      list.length = 0;
    },
  };
}

function place(node, x, y, rot, scale = 1) {
  node.setAttribute('transform', `translate(${x} ${y}) rotate(${rot})${scale === 1 ? '' : ` scale(${scale})`}`);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
