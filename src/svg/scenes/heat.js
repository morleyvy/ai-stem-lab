// Сцена «Удельная теплоёмкость»: физический стенд с перфопанелью, деревянный стол.
// Электроплитка нагревает стакан с жидкостью или алюминиевый брусок; плитку включают тумблером
// на корпусе (рядом загорается сигнальная лампа). Термометр закреплён в штативе и опущен
// в вещество; жидкость можно перемешивать стеклянной палочкой. Цифровой термометр и таймер —
// на приборной панели, без подписей поверх сцены. Кипение воды — бурное: много пузырей, пар клубами.

import { beaker, bubblePool, createScene, cylinderShade, draggable, floorShadow, hotplate, mixHex, readout, room, s } from '../kit.js';

const HOT = { x: 400, y: 372, w: 220 };
const benchY = 440;
const START_T = 20;
const ALU_COLOR = '#cbd5e1';
const ROD = { min: HOT.x - 44, max: HOT.x + 12, lean: -26 }; // палочка ходит левее термометра и опирается на левый край
let filterUid = 0;

export function heatScene(container, params, set, { temperature, substanceOf }) {
  let plate, vessel, block, blockRect, blockSteps, bubbles, thermoCol, thermoBulb, tempRead, timeRead;
  let rocker, lamp, lampGlow, rod, rodGroup, steam;
  let shownT = START_T;
  let rodX = HOT.x - 40;
  let stirSpeed = 0; // скорость перемешивания (px/с), затухает, когда палочку отпустили

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY, theme: 'stand' });
      const uid = ++filterUid;
      svg.querySelector('defs').append(s('filter', { id: `heat-steam-${uid}`, x: '-60%', y: '-60%', width: '220%', height: '220%' }, [s('feGaussianBlur', { stdDeviation: 4 })]));

      // Электроплитка (готовый узел из набора оборудования) + тумблер питания и сигнальная лампа
      plate = hotplate(d, HOT);
      svg.append(plate.g);
      const sx = HOT.x + 22;
      const sy = HOT.y + 13;
      rocker = s('rect', { x: sx - 11, y: sy + 2, width: 22, height: 9, rx: 2, fill: d.lin([[0, '#e5e7eb'], [1, '#9ca3af']], 'v') });
      lampGlow = s('circle', { cx: sx + 28, cy: sy + 12, r: 13, fill: d.rad([[0, '#fecaca', 0.9], [1, '#ef4444', 0]], 0.5, 0.5), opacity: 0 });
      lamp = s('circle', { cx: sx + 28, cy: sy + 12, r: 4.5, fill: '#4c0519', stroke: '#1e293b', 'stroke-width': 1 });
      const toggle = s('g', {}, [
        s('rect', { x: sx - 15, y: sy, width: 30, height: 24, rx: 4, fill: '#0f172a', stroke: '#475569', 'stroke-width': 1 }),
        rocker,
        s('rect', { x: sx - 15, y: sy - 6, width: 30, height: 36, fill: 'transparent' }), // увеличенная зона нажатия
      ]);
      toggle.style.cursor = 'pointer';
      toggle.addEventListener('pointerdown', () => set('power', params.power ? 0 : 1));
      svg.append(toggle, lampGlow, lamp);

      // Стакан с жидкостью — стоит на конфорке
      vessel = beaker(d, { x: HOT.x, bottom: HOT.y - 8, w: 150, h: 190 });
      svg.append(vessel.g);
      bubbles = bubblePool(vessel.content, 110);

      // Пар над кипящей водой: пул клубов с размытием, каждый живёт своей жизнью
      const steamGroup = s('g', { filter: `url(#heat-steam-${uid})` });
      steam = Array.from({ length: 16 }, () => {
        const e = s('ellipse', { rx: 10, ry: 12, fill: '#94a3b8', 'fill-opacity': 0 });
        steamGroup.append(e);
        return { e, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, peak: 0, alive: false };
      });
      svg.append(steamGroup);

      // Алюминиевый брусок на конфорке — показывается вместо стакана для твёрдого вещества.
      // Ступени цвета от «холодного» металла к раскалённому подготовлены заранее (см. hotplate).
      blockRect = s('rect', { rx: 6 });
      block = s('g', { opacity: 0 }, [floorShadow(HOT.x, HOT.y + 4, 60, d), blockRect]);
      svg.append(block);
      blockSteps = [0, 0.25, 0.5, 0.75, 1].map((k) => cylinderShade(d, mixHex(ALU_COLOR, '#f87171', k)));

      // Стеклянная палочка-мешалка: наклонена и опирается на край стакана; её можно водить мышью
      rod = s('g', {}, [
        s('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#e2e8f0', 'stroke-opacity': 0.75, 'stroke-width': 7, 'stroke-linecap': 'round' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#ffffff', 'stroke-opacity': 0.9, 'stroke-width': 2, 'stroke-linecap': 'round' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: 'transparent', 'stroke-width': 26 }), // зона захвата
      ]);
      rodGroup = s('g', {}, [rod]);
      svg.append(rodGroup);

      // Штатив с термометром: стойка, зажим и стеклянная трубка со шкалой
      const thermoX = HOT.x + 40;
      const standX = HOT.x + 118;
      svg.append(
        floorShadow(standX, benchY + 6, 30, d),
        s('rect', { x: standX - 34, y: benchY - 6, width: 68, height: 10, rx: 3, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: standX - 5, y: 96, width: 10, height: benchY - 96, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
        s('rect', { x: thermoX - 5, y: 108, width: standX - thermoX + 10, height: 10, fill: d.lin([[0, '#94a3b8'], [1, '#64748b']], 'v') }),
        s('rect', { x: HOT.x + 32, y: 100, width: 16, height: 22, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      );
      svg.append(s('rect', { x: thermoX - 7, y: 118, width: 14, height: 220, rx: 7, fill: '#f1f5f9', 'fill-opacity': 0.6, stroke: '#94a3b8', 'stroke-width': 1.5 }));
      thermoCol = s('rect', { x: thermoX - 3, y: 118, width: 6, height: 0, rx: 3, fill: '#ef4444' });
      thermoBulb = s('circle', { cx: thermoX, cy: 340, r: 10, fill: '#ef4444' });
      svg.append(thermoCol, thermoBulb);
      for (let i = 0; i < 6; i++) {
        svg.append(s('line', { x1: thermoX + 7, x2: thermoX + 11, y1: 130 + i * 30, y2: 130 + i * 30, stroke: '#64748b', 'stroke-width': 1.5 }));
      }

      // Приборная панель: цифровой термометр и таймер
      tempRead = readout(d, { x: 730, y: 130, w: 170, caption: 'термометр, °C', color: '#fb7185' });
      timeRead = readout(d, { x: 730, y: 214, w: 170, caption: 'таймер, с', color: '#67e8f9' });
      svg.append(tempRead.g, timeRead.g);
    },

    frame(dt, now) {
      const sub = substanceOf(params);
      const T = temperature(params);
      shownT += (T - shownT) * Math.min(1, dt * 2);
      const on = Boolean(params.power);
      const heat = on ? Math.min(1, params.t / 40) : 0;

      plate.setHeat(on ? Math.min(1, 0.3 + heat * 0.7) : 0);
      plate.setTemp(shownT);
      rocker.setAttribute('y', HOT.y + 13 + (on ? 2 : 13));
      lamp.setAttribute('fill', on ? '#f87171' : '#4c0519');
      lampGlow.setAttribute('opacity', on ? 0.9 : 0);

      const boiling = on && Boolean(sub.boil) && shownT >= sub.boil - 0.4;
      stirSpeed *= Math.max(0, 1 - dt * 3);

      if (sub.liquid) {
        vessel.g.setAttribute('opacity', 1);
        block.setAttribute('opacity', 0);
        vessel.setColor(sub.color);
        // При кипении поверхность «ходит» — пузыри лопаются и вспучивают её
        const baseLevel = 0.35 + params.m * 0.45;
        vessel.setLevel(boiling ? baseLevel + 0.006 * Math.sin(now * 17) + (Math.random() - 0.5) * 0.006 : baseLevel);

        const bottom = HOT.y - 20;
        if (boiling) {
          // Бурное кипение: крупные пузыри пара рождаются по всему дну, по несколько за кадр
          const n = Math.floor(dt * 85 + Math.random());
          for (let i = 0; i < n; i++) bubbles.spawn(HOT.x + (Math.random() - 0.5) * 120, bottom - Math.random() * 10, 2.5 + Math.random() * 5);
        } else if (on && shownT > 45) {
          // Перед кипением — мелкие пузырьки растворённого воздуха у дна
          if (Math.random() < dt * (shownT - 40) * 0.5) bubbles.spawn(HOT.x + (Math.random() - 0.5) * 110, bottom, 1.5 + Math.random() * 2);
        }
        // Перемешивание палочкой гонит мелкие пузырьки от её конца
        if (stirSpeed > 60 && Math.random() < dt * 12) bubbles.spawn(rodX + (Math.random() - 0.5) * 16, bottom - 6, 1.5 + Math.random() * 1.5);
        bubbles.update(dt, vessel.surfaceY + 4, boiling ? 1.6 : 0.5);

        updateSteam(dt, boiling ? 14 : on && shownT > 60 ? (shownT - 60) * 0.06 : 0, boiling ? 0.42 : 0.16);

        rodGroup.setAttribute('visibility', 'visible');
        const y1 = vessel.top - 46;
        const y2 = vessel.bottom - 14;
        const wobble = boiling ? Math.sin(now * 23) * 1.2 : 0; // кипящая вода подталкивает палочку
        for (const line of rod.children) {
          line.setAttribute('x1', rodX + ROD.lean + wobble);
          line.setAttribute('y1', y1);
          line.setAttribute('x2', rodX);
          line.setAttribute('y2', y2);
        }
      } else {
        vessel.g.setAttribute('opacity', 0);
        bubbles.clear();
        updateSteam(dt, 0, 0);
        rodGroup.setAttribute('visibility', 'hidden'); // скрыта и не ловит указатель
        block.setAttribute('opacity', 1);
        const size = 58 + params.m * 68;
        const glowing = Math.min(1, (shownT - START_T) / 220);
        blockRect.setAttribute('x', HOT.x - size / 2);
        blockRect.setAttribute('y', HOT.y - 8 - size * 0.62);
        blockRect.setAttribute('width', size);
        blockRect.setAttribute('height', size * 0.62);
        blockRect.setAttribute('fill', blockSteps[Math.min(4, Math.round(glowing * 4))]);
      }

      // Термометр: столбик поднимается пропорционально температуре (шкала 0…120 °C)
      const colH = Math.max(0, Math.min(210, (shownT / 120) * 210));
      thermoCol.setAttribute('y', 118 + (220 - colH));
      thermoCol.setAttribute('height', colH);
      thermoBulb.setAttribute('fill', shownT > 55 ? '#ef4444' : '#f97316');

      tempRead.set(shownT.toFixed(1));
      // Выключенная плитка — секундомер стоит на нуле: нагрев ещё не начался
      timeRead.set(on ? String(params.t) : '0');
    },
  });

  // Клубы пара: рождаются над поверхностью, поднимаются, расплываются и тают
  function updateSteam(dt, rate, peak) {
    const n = Math.floor(dt * rate + Math.random());
    for (let i = 0; i < n && rate > 0; i++) {
      const p = steam.find((q) => !q.alive);
      if (!p) break;
      Object.assign(p, {
        x: HOT.x + (Math.random() - 0.5) * 100, y: vessel.surfaceY - 6,
        vx: (Math.random() - 0.5) * 14, vy: -(45 + Math.random() * 35),
        age: 0, life: 1.6 + Math.random() * 1.2, peak: peak * (0.6 + Math.random() * 0.4), alive: true,
      });
    }
    for (const p of steam) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        p.e.setAttribute('fill-opacity', 0);
        continue;
      }
      const k = p.age / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.e.setAttribute('cx', p.x);
      p.e.setAttribute('cy', p.y);
      p.e.setAttribute('rx', 9 + k * 26);
      p.e.setAttribute('ry', 11 + k * 20);
      p.e.setAttribute('fill-opacity', p.peak * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.3));
    }
  }

  // Палочку можно водить вдоль стакана — декоративное перемешивание
  draggable(scene, rodGroup, {
    onDrag: (x) => {
      const nx = Math.max(ROD.min, Math.min(ROD.max, x - ROD.lean / 2));
      stirSpeed = Math.min(400, stirSpeed * 0.5 + Math.abs(nx - rodX) * 30);
      rodX = nx;
    },
  });

  return scene;
}
