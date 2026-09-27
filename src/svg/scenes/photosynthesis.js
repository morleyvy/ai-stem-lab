// Сцена «Фотосинтез»: кабинет биологии, веточка элодеи в сосуде с водой под стеклянной воронкой,
// на трубке воронки — перевёрнутая пробирка-приёмник, заполненная водой. Пузырьки кислорода
// поднимаются в пробирку и вытесняют воду — её уровень опускается пропорционально числу пузырьков.
// Лампу можно двигать мышью. В конце опыта тлеющую лучинку подносят к крану пробирки:
// собранный газ открывается на лучинку, и она ярко вспыхивает — это кислород.

import { beaker, createScene, cylinderShade, draggable, floorShadow, readout, room, s } from '../kit.js';
import { tr } from '../../i18n.js';
import { sillPlants } from '../bioDecor.js';

const BENCH = 470;
const JAR = { x: 700, bottom: 460, w: 170, h: 280 };
const NEAR_X = 590; // положение лампы при 10 см
const FAR_X = 170; // при 50 см
const FUNNEL = { mouthY: 418, mouthR: 64, neckY: 332, neckR: 7, stemTop: 292 };
const TUBE = { x: JAR.x, top: 104, bottom: 304, r: 14 }; // пробирка-приёмник, открытым концом вниз
const NOZZLE = { x: TUBE.x, y: 66 }; // выход крана над пробиркой
const GAS_MAX = 150; // столько «пикселей» газа помещается в пробирке
const GAS_PER_BUBBLE = 1.2;
const GAS_FOR_TEST = 8; // меньше этого — лучинке нечего поджигать
const ROD_X = 866;
const SPLINT_REST = { x: 834, y: 366 }; // кончик лучинки, стоящей в стаканчике
const SPLINT_LEN = 118;
const SPLINT_ANGLE = 112; // лучинка наклонена: кончик вверху справа, основание внизу слева

export function photosynthesisScene(container, params, set, { bubbleRate }) {
  let lamp, beam, glowEl, jar, counter, rulerBar, rulerTicks, lampHead;
  let tubeWater, tubeMeniscus, tapHandle, splint, ember, flame, flash, smoke;
  const bubbles = [];
  let acc = 0;
  let gas = 0;
  // Лучинка: rest — в стаканчике, drag — в руке, test — у крана (вспышка), done — догорела и возвращена
  let splintState = 'rest';
  const splintPos = { ...SPLINT_REST };
  let testT = 0;
  let flared = false;
  let tested = false; // проба уже запускалась (перетаскиванием или кнопкой шага)
  const lampX = () => FAR_X + ((50 - params.d) / 40) * (NEAR_X - FAR_X);

  // Допустимая полуширина пути пузырька на высоте y: под воронкой — свободно, в конусе сужается к трубке
  const funnelHalf = (y) => {
    if (y > FUNNEL.mouthY) return 70;
    if (y > FUNNEL.neckY) return FUNNEL.neckR + ((y - FUNNEL.neckY) / (FUNNEL.mouthY - FUNNEL.neckY)) * (FUNNEL.mouthR - FUNNEL.neckR);
    return FUNNEL.neckR - 2;
  };
  const gasBottom = () => TUBE.top + 6 + gas;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: BENCH, theme: 'bio' });
      sillPlants(svg, d, [{ x: 906, kind: 'leafy', scale: 0.75 }]);
      const defs = svg.querySelector('defs');
      const beamId = `beam${Math.random().toString(36).slice(2)}`;
      defs.append(s('linearGradient', { id: beamId, x1: 0, x2: 1 }, [
        s('stop', { offset: 0, 'stop-color': '#fef3c7', 'stop-opacity': 0.7 }),
        s('stop', { offset: 1, 'stop-color': '#fef3c7', 'stop-opacity': 0.04 }),
      ]));

      beam = s('path', { fill: `url(#${beamId})` });
      glowEl = s('circle', { r: 70, fill: d.url('glow') });
      svg.append(beam);

      // Штатив с лапкой держит пробирку-приёмник над воронкой
      svg.append(
        floorShadow(ROD_X, BENCH + 2, 52, d),
        s('rect', { x: ROD_X - 36, y: BENCH - 12, width: 72, height: 12, rx: 3, fill: d.lin([[0, '#4b5563'], [1, '#1f2937']], 'v') }),
        s('rect', { x: ROD_X - 4, y: 58, width: 8, height: BENCH - 70, rx: 3, fill: cylinderShade(d, '#9ca3af') }),
        s('rect', { x: TUBE.x + 16, y: 150, width: ROD_X - TUBE.x - 22, height: 7, rx: 3, fill: d.lin(['#d1d5db', '#6b7280'], 'v') }),
        s('rect', { x: ROD_X - 10, y: 142, width: 20, height: 24, rx: 4, fill: d.lin([[0, '#6b7280'], [0.4, '#d1d5db'], [1, '#4b5563']]) }),
      );

      // Сосуд с водой, элодея и воронка
      jar = beaker(d, JAR);
      jar.setLevel(0.82);
      jar.setColor('#bae6fd');
      const plant = s('g');
      const stemBottom = JAR.bottom - 6;
      const stemTop = FUNNEL.mouthY - 58;
      for (const [dx, lean] of [[-8, -14], [8, 12]]) {
        const x0 = JAR.x + dx;
        const tip = JAR.x + dx + lean;
        plant.append(s('path', { d: `M${x0} ${stemBottom} C ${x0 - lean * 0.2} ${stemBottom - 40}, ${tip} ${stemTop + 30}, ${tip} ${stemTop}`, stroke: '#15803d', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
        for (let i = 0; i < 7; i++) {
          const k = i / 7;
          const y = stemTop + 6 + k * (stemBottom - stemTop - 16);
          const cx = tip + (x0 - tip) * k;
          for (const side of [-1, 1]) {
            plant.append(s('ellipse', { cx: cx + side * 13, cy: y, rx: 14, ry: 5, fill: d.lin([[0, '#15803d'], [0.5, i % 2 ? '#4ade80' : '#22c55e'], [1, '#166534']], 'v'), transform: `rotate(${side * -24} ${cx + side * 13} ${y})` }));
          }
        }
      }
      jar.content.append(plant);

      // Стеклянная воронка, опрокинутая над веточкой; на её трубку надета пробирка-приёмник
      const f = FUNNEL;
      const funnelPath = `M${JAR.x - f.mouthR} ${f.mouthY} L${JAR.x - f.neckR} ${f.neckY} V${f.stemTop} H${JAR.x + f.neckR} V${f.neckY} L${JAR.x + f.mouthR} ${f.mouthY}`;
      const bubbleLayer = s('g');
      jar.content.append(bubbleLayer);
      for (let i = 0; i < 50; i++) {
        const c = s('circle', { r: 3, fill: '#ffffff', 'fill-opacity': 0.9, stroke: '#93c5fd', 'stroke-width': 1, opacity: 0 });
        bubbleLayer.append(c);
        bubbles.push({ c, x: 0, y: 0, v: 0, r: 3, alive: false });
      }
      jar.content.append(
        s('path', { d: funnelPath, fill: '#e0f2fe', 'fill-opacity': 0.25, stroke: '#94a3b8', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
        s('ellipse', { cx: JAR.x, cy: f.mouthY, rx: f.mouthR, ry: 5, fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.5 }),
        s('path', { d: `M${JAR.x - f.mouthR + 10} ${f.mouthY - 6} L${JAR.x - f.neckR + 2} ${f.neckY + 6}`, stroke: '#ffffff', 'stroke-opacity': 0.8, 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
      );
      svg.append(jar.g);

      // Пробирка-приёмник: вода внутри удерживается атмосферным давлением, газ собирается сверху
      const clip = `rcv${Math.random().toString(36).slice(2)}`;
      const t = TUBE;
      const tubePath = `M${t.x - t.r} ${t.bottom} V${t.top + t.r} A ${t.r} ${t.r} 0 0 1 ${t.x + t.r} ${t.top + t.r} V${t.bottom}`;
      defs.append(s('clipPath', { id: clip }, [s('path', { d: `${tubePath} Z` })]));
      tubeWater = s('rect', { x: t.x - t.r, width: t.r * 2, fill: '#bae6fd', 'fill-opacity': 0.75, 'clip-path': `url(#${clip})` });
      tubeMeniscus = s('path', { fill: 'none', stroke: '#7dd3fc', 'stroke-width': 1.6 });
      svg.append(
        s('path', { d: `${tubePath} Z`, fill: '#f8fafc', 'fill-opacity': 0.35 }),
        tubeWater,
        tubeMeniscus,
        s('path', { d: tubePath, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 2 }),
        s('rect', { x: t.x - t.r + 4, y: t.top + 14, width: 3.5, height: t.bottom - t.top - 30, rx: 1.75, fill: '#ffffff', 'fill-opacity': 0.8 }),
        // губки лапки
        s('rect', { x: t.x - t.r - 5, y: 144, width: 6, height: 20, rx: 2, fill: d.lin(['#6b7280', '#d1d5db', '#4b5563']) }),
        s('rect', { x: t.x + t.r - 1, y: 144, width: 6, height: 20, rx: 2, fill: d.lin(['#6b7280', '#d1d5db', '#4b5563']) }),
        // стеклянный кран на запаянном конце: через него газ выпускают на лучинку
        s('rect', { x: t.x - 2.5, y: NOZZLE.y, width: 5, height: t.top - NOZZLE.y + 2, fill: '#e2e8f0', stroke: '#94a3b8', 'stroke-width': 1 }),
        s('ellipse', { cx: t.x, cy: 84, rx: 6, ry: 5, fill: d.rad(['#f8fafc', '#94a3b8']), stroke: '#64748b', 'stroke-width': 1 }),
      );
      tapHandle = s('rect', { x: t.x - 12, y: 82.5, width: 24, height: 3, rx: 1.5, fill: '#475569' });
      svg.append(tapHandle);

      // Настольная лампа: основание, стойка, абажур
      lampHead = s('g', {}, [
        s('path', { d: 'M-34 -30 L 26 -46 L 26 46 L -34 30 Z', fill: d.lin([[0, '#6b7280'], [0.45, '#374151'], [1, '#111827']], 'v') }),
        s('rect', { x: -42, y: -14, width: 12, height: 28, rx: 4, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b'], 'v') }),
        s('ellipse', { cx: 26, cy: 0, rx: 9, ry: 46, fill: '#fef9c3' }),
      ]);
      lamp = s('g', {}, [
        floorShadow(0, 472, 70, d),
        s('ellipse', { cx: 0, cy: 458, rx: 62, ry: 14, fill: d.lin([[0, '#475569'], [1, '#0f172a']], 'v') }),
        s('rect', { x: -5, y: 250, width: 10, height: 206, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
        s('rect', { x: -5, y: 238, width: 10, height: 30, fill: d.lin(['#64748b', '#e2e8f0', '#475569']), transform: 'rotate(40 0 250)' }),
        s('circle', { cx: 0, cy: 250, r: 8, fill: d.rad(['#e2e8f0', '#475569']) }),
        glowEl,
        s('g', { transform: 'translate(20 230)' }, [lampHead]),
      ]);
      svg.append(lamp);

      // Линейка на столе между лампой и сосудом: элементы создаются один раз, в кадре меняется только геометрия
      rulerBar = s('rect', { y: 478, height: 12, rx: 3, fill: '#fde68a', stroke: '#eab308', 'stroke-width': 1.5 });
      rulerTicks = Array.from({ length: 11 }, (_, i) => s('line', { y1: 478, y2: i % 5 ? 484 : 488, stroke: '#a16207', 'stroke-width': 1.5 }));
      svg.append(rulerBar, ...rulerTicks);

      // Счётчик пузырьков висит на стене
      counter = readout(d, { x: 330, y: 40, w: 150, caption: tr('O₂, пузырьков/мин') });
      svg.append(counter.g);

      // Стаканчик с лучинкой справа от сосуда
      svg.append(
        floorShadow(808, BENCH + 1, 22, d),
        s('path', { d: `M791 ${BENCH - 40} L794 ${BENCH - 2} Q808 ${BENCH + 2} 822 ${BENCH - 2} L825 ${BENCH - 40} Z`, fill: '#e2e8f0', 'fill-opacity': 0.5, stroke: '#94a3b8', 'stroke-width': 1.5 }),
      );
      // Лучинка рисуется в собственных координатах: кончик в (0, 0), древко уходит вниз-влево
      ember = s('ellipse', { cx: 0, cy: 0, rx: 4.5, ry: 3.2, fill: '#f97316' });
      flame = s('path', { d: 'M0 4 C -9 -2, -6 -16, 0 -30 C 6 -16, 9 -2, 0 4 Z', fill: d.lin([[0, '#fde68a'], [0.5, '#fb923c'], [1, '#fef9c3']], 'v'), opacity: 0 });
      flash = s('circle', { cx: 0, cy: -8, r: 40, fill: d.rad([[0, '#fffbeb', 1], [0.4, '#fde68a', 0.8], [1, '#fb923c', 0]], 0.5, 0.5), opacity: 0 });
      smoke = Array.from({ length: 4 }, (_, i) => s('circle', { r: 3 + i, fill: '#94a3b8', opacity: 0 }));
      const a = (SPLINT_ANGLE * Math.PI) / 180;
      splint = s('g', {}, [
        s('circle', { cx: 0, cy: 0, r: 18, fill: '#000', 'fill-opacity': 0 }), // удобная зона захвата
        s('line', { x1: 0, y1: 0, x2: Math.cos(a) * SPLINT_LEN, y2: Math.sin(a) * SPLINT_LEN, stroke: '#d6b17a', 'stroke-width': 4, 'stroke-linecap': 'round' }),
        s('line', { x1: 0, y1: 0, x2: Math.cos(a) * 12, y2: Math.sin(a) * 12, stroke: '#3f2a1c', 'stroke-width': 4.4, 'stroke-linecap': 'round' }),
        flash, flame, ember,
      ]);
      svg.append(splint, ...smoke);
      // Передняя стенка стаканчика перекрывает основание лучинки
      svg.append(s('path', { d: `M791 ${BENCH - 22} L794 ${BENCH - 2} Q808 ${BENCH + 2} 822 ${BENCH - 2} L825 ${BENCH - 22}`, fill: d.url('glass'), stroke: '#94a3b8', 'stroke-width': 1.2 }));
    },

    frame(dt, now) {
      const x = lampX();
      lamp.setAttribute('transform', `translate(${x} 0)`);
      const on = Boolean(params.lamp);
      const rate = bubbleRate(params);
      const head = { x: x + 46, y: 230 };
      glowEl.setAttribute('cx', 46);
      glowEl.setAttribute('cy', 230);
      glowEl.setAttribute('opacity', on ? 1 : 0);
      lampHead.lastChild.setAttribute('fill', on ? '#fef9c3' : '#e2e8f0');
      beam.setAttribute('d', `M${head.x} ${head.y - 40} L ${JAR.x + JAR.w / 2} ${JAR.bottom - JAR.h + 10} L ${JAR.x + JAR.w / 2} ${JAR.bottom} L ${head.x} ${head.y + 40} Z`);
      beam.setAttribute('opacity', on ? Math.min(1, 0.35 + rate / 40) : 0);

      // Пузырьки (анимация ускорена, чтобы разница была видна) отрываются от листьев под воронкой
      acc += (rate / 60) * dt * 6;
      while (acc >= 1) {
        acc -= 1;
        const b = bubbles.find((i) => !i.alive);
        if (b) {
          Object.assign(b, { x: JAR.x + (Math.random() - 0.5) * 50, y: JAR.bottom - 20 - Math.random() * 70, v: 55 + Math.random() * 40, r: 2.5 + Math.random() * 2, alive: true });
          b.c.setAttribute('r', b.r);
          b.c.setAttribute('opacity', 1);
        }
      }
      const top = gasBottom();
      for (const b of bubbles) {
        if (!b.alive) continue;
        b.y -= b.v * dt;
        // Конус воронки направляет пузырьки к трубке
        const half = funnelHalf(b.y);
        const dx = b.x - JAR.x;
        if (Math.abs(dx) > half) b.x = JAR.x + Math.sign(dx) * half;
        if (b.y <= top) {
          // Пузырёк влился в газ над водой пробирки
          b.alive = false;
          b.c.setAttribute('opacity', 0);
          gas = Math.min(GAS_MAX, gas + GAS_PER_BUBBLE);
          continue;
        }
        b.c.setAttribute('cx', b.x);
        b.c.setAttribute('cy', b.y);
      }
      counter.set(String(Math.round(rate)));

      // Уровень воды в пробирке опускается по мере накопления газа
      const wy = gasBottom();
      tubeWater.setAttribute('y', wy);
      tubeWater.setAttribute('height', TUBE.bottom - wy + 2);
      tubeMeniscus.setAttribute('d', `M${TUBE.x - TUBE.r + 1} ${wy - 2} Q ${TUBE.x} ${wy + 3} ${TUBE.x + TUBE.r - 1} ${wy - 2}`);

      // Линейка
      const from = head.x - 20;
      const to = JAR.x - JAR.w / 2;
      rulerBar.setAttribute('x', from);
      rulerBar.setAttribute('width', to - from);
      rulerTicks.forEach((l, i) => {
        const tx = from + ((to - from) * i) / 10;
        l.setAttribute('x1', tx);
        l.setAttribute('x2', tx);
      });

      updateSplint(dt, now);
    },
  });

  // Проба лучинкой: вызвана либо перетаскиванием к крану, либо кнопкой шага работы
  function startTest() {
    splintState = 'test';
    tested = true;
    testT = 0;
    flared = gas >= GAS_FOR_TEST;
    splintPos.x = NOZZLE.x + 6;
    splintPos.y = NOZZLE.y - 4;
    if (flared) set('splint', 1);
  }

  function updateSplint(dt, now) {
    // Кнопка шага работы выставила splint = 1 — сами подносим лучинку к крану
    if (params.splint === 1 && splintState === 'rest' && !tested) startTest();

    let flameK = 0;
    let flashK = 0;
    if (splintState === 'test') {
      testT += dt;
      if (flared) {
        // Кран открыт: газ выходит, вода в пробирке поднимается, лучинка вспыхивает и горит пламенем
        gas = Math.max(0, gas - dt * 60);
        flashK = Math.max(0, 1 - Math.abs(testT - 0.35) / 0.45);
        flameK = testT < 4 ? 1 : 0;
      }
      tapHandle.setAttribute('transform', `rotate(${flared && testT < 3 ? 90 : 0} ${TUBE.x} 84)`);
      if (testT > (flared ? 4.5 : 1.2)) {
        splintState = flared ? 'done' : 'rest';
        testT = 0;
        Object.assign(splintPos, SPLINT_REST);
      }
    } else if (splintState === 'done') {
      // Погасшую лучинку через несколько секунд заменяем новой тлеющей — пробу можно повторить
      testT += dt;
      if (testT > 4) splintState = 'rest';
    }

    splint.setAttribute('transform', `translate(${splintPos.x} ${splintPos.y})`);
    const flicker = 0.85 + 0.15 * Math.sin(now * 23) * Math.sin(now * 7);
    flame.setAttribute('opacity', flameK * flicker);
    flame.setAttribute('transform', `scale(${1 + flashK * 0.8} ${(1 + flashK * 1.2) * flicker})`);
    flash.setAttribute('opacity', flashK);
    flash.setAttribute('r', 20 + flashK * 55);
    // Тлеющий уголёк мерцает; после пробы лучинка потушена — уголёк погас
    const glowing = splintState !== 'done';
    ember.setAttribute('fill', glowing ? (Math.sin(now * 5) > 0 ? '#f97316' : '#ea580c') : '#3f2a1c');
    ember.setAttribute('opacity', flameK ? 0 : 1);
    // Тонкая струйка дыма над тлеющей лучинкой
    smoke.forEach((c, i) => {
      const k = (now * 0.5 + i / smoke.length) % 1;
      c.setAttribute('cx', splintPos.x + Math.sin(now * 2 + i) * 4 + k * 6);
      c.setAttribute('cy', splintPos.y - 8 - k * 46);
      c.setAttribute('opacity', glowing && !flameK ? 0.28 * (1 - k) : 0);
    });
  }

  draggable(scene, lamp, {
    onDrag: (x) => set('d', 50 - ((x - 46 - FAR_X) / (NEAR_X - FAR_X)) * 40),
  });
  draggable(scene, splint, {
    onDrag: (x, y) => {
      if (splintState === 'test' || splintState === 'done') return;
      splintState = 'drag';
      splintPos.x = x;
      splintPos.y = y;
    },
    onEnd: () => {
      if (splintState !== 'drag') return;
      // Отпустили у крана пробирки — проба; иначе лучинка возвращается в стаканчик
      if (Math.hypot(splintPos.x - NOZZLE.x, splintPos.y - NOZZLE.y) < 45) startTest();
      else {
        splintState = 'rest';
        Object.assign(splintPos, SPLINT_REST);
      }
    },
  });
  return scene;
}
