// Сцена «Транспирация»: потометр — побег в стеклянной трубке с водой, подключённый резиновой
// трубкой к горизонтальному капилляру со шкалой. Пузырёк воздуха в капилляре ползёт тем быстрее,
// чем сильнее испарение. Рядом — настольный вентилятор с вращающимися лопастями и лампа сверху.

import { beaker, bubblePool, createScene, floorShadow, readout, room, s, text } from '../kit.js';
import { sillPlants } from '../bioDecor.js';

const PLANT_X = 500;
const VESSEL = { x: PLANT_X, bottom: 440, w: 108, h: 200 };
const CAP = { left: 636, right: 890, y: 404 }; // капилляр со шкалой
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');

export function transpirationScene(container, params, set, { transpirationRate }) {
  let vessel, plant, stemPath, bubble, capLen, evapReadout, humReadout, fanBlades, lampGlow, lampBulb, vapor;
  let bubblePos = 0;

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY: 440, theme: 'bio' });
      sillPlants(svg, d, [{ x: 640, kind: 'geranium', scale: 0.9 }, { x: 700, kind: 'leafy', scale: 0.85 }, { x: 885, kind: 'leafy' }]);

      // Стеклянная трубка потометра с водой — используем «стакан» как узкий сосуд
      vessel = beaker(d, VESSEL);
      vessel.setLevel(0.72);
      vessel.setColor('#bae6fd');
      svg.append(vessel.g);

      // Резиновая пробка в горлышке трубки, через которую проходит стебель
      const bungY = vessel.top + 6;
      svg.append(s('rect', { x: PLANT_X - VESSEL.w / 2 + 6, y: bungY, width: VESSEL.w - 12, height: 22, rx: 5, fill: d.lin([[0, '#57534e'], [0.5, '#78716c'], [1, '#44403c']], 'v') }));

      // Побег: стебель со встречными листьями, слегка раскачивается на ветру
      plant = s('g');
      stemPath = s('path', { stroke: '#166534', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
      plant.append(stemPath);
      const leaves = [];
      for (let i = 0; i < 6; i++) {
        for (const side of [-1, 1]) {
          const leaf = s('ellipse', { rx: 28, ry: 10, fill: d.lin([[0, '#4ade80'], [1, '#15803d']], 'v') });
          leaves.push({ leaf, i, side });
          plant.append(leaf);
        }
      }
      svg.append(plant);

      // Резиновая трубка-переходник от нижней части сосуда к капилляру
      svg.append(s('path', {
        d: `M${VESSEL.x + VESSEL.w / 2 - 4} ${VESSEL.bottom - 26} C ${CAP.left - 40} ${VESSEL.bottom - 26}, ${CAP.left - 10} ${CAP.y}, ${CAP.left} ${CAP.y}`,
        fill: 'none', stroke: '#334155', 'stroke-width': 10, 'stroke-linecap': 'round',
      }));

      // Капилляр: стеклянный горизонтальный канал со шкалой делений
      svg.append(
        floorShadow((CAP.left + CAP.right) / 2, 456, (CAP.right - CAP.left) / 2 + 10, d, 8),
        s('rect', { x: CAP.left, y: CAP.y - 7, width: CAP.right - CAP.left, height: 14, rx: 7, fill: d.lin([[0, '#e2e8f0'], [0.5, '#f8fafc'], [1, '#94a3b8']], 'v'), stroke: '#94a3b8' }),
      );
      const ticks = s('g');
      for (let i = 0; i <= 10; i++) {
        const x = CAP.left + ((CAP.right - CAP.left) * i) / 10;
        ticks.append(
          s('line', { x1: x, x2: x, y1: CAP.y + 8, y2: CAP.y + (i % 5 === 0 ? 18 : 13), stroke: '#64748b', 'stroke-width': 1.5 }),
          i % 5 === 0 ? text(x, CAP.y + 30, String(i * 10), { size: 10, fill: '#64748b' }) : null,
        );
      }
      svg.append(ticks);
      bubble = s('circle', { cy: CAP.y, r: 5, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 1.2 });
      svg.append(bubble);
      capLen = CAP.right - CAP.left - 24;

      // Настольный вентилятор: основание, стойка, лопасти за защитной решёткой
      const fanX = 165;
      const fanHubY = 300;
      const fanR = 62;
      svg.append(
        floorShadow(fanX, 458, 54, d),
        s('ellipse', { cx: fanX, cy: 452, rx: 46, ry: 10, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: fanX - 5, y: fanHubY + 18, width: 10, height: 434 - fanHubY, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      );
      // Лопасти — изогнутые, как у настоящего пропеллера, а не симметричный «цветок»
      fanBlades = s('g');
      const bladePath = `M0 0 C ${fanR * 0.15} ${-fanR * 0.28}, ${fanR * 0.62} ${-fanR * 0.42}, ${fanR * 0.82} ${-fanR * 0.1} C ${fanR * 0.6} ${fanR * 0.04}, ${fanR * 0.22} ${-fanR * 0.02}, 0 0 Z`;
      for (let i = 0; i < 3; i++) {
        fanBlades.append(s('path', { d: bladePath, transform: `rotate(${i * 120})`, fill: d.lin([[0, '#e2e8f0'], [1, '#94a3b8']], 'h'), stroke: '#64748b', 'stroke-width': 1 }));
      }
      // Защитная решётка поверх лопастей: обод и радиальные спицы, как у настоящего корпуса
      const cage = s('g', {}, [
        s('circle', { cx: 0, cy: 0, r: fanR, fill: 'none', stroke: '#94a3b8', 'stroke-width': 4 }),
        s('circle', { cx: 0, cy: 0, r: fanR * 0.6, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1.6 }),
        ...Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return s('line', { x1: 0, y1: 0, x2: Math.cos(a) * fanR, y2: Math.sin(a) * fanR, stroke: '#cbd5e1', 'stroke-width': 1.6 });
        }),
      ]);
      svg.append(
        fanBlades,
        s('g', { transform: `translate(${fanX} ${fanHubY})` }, [cage, s('circle', { r: 8, fill: '#475569' })]),
      );
      // Центр вращения лопастей запоминаем в data-атрибутах, чтобы использовать в frame()
      fanBlades.setAttribute('data-x', fanX);
      fanBlades.setAttribute('data-y', fanHubY);

      // Лампа под потолком: провод, плафон, лампочка со свечением
      lampGlow = s('ellipse', { cx: PLANT_X, cy: 56, rx: 130, ry: 90, fill: d.rad([[0, '#fde68a', 0.55], [1, '#fde68a', 0]], 0.5, 0.4), opacity: 0 });
      lampBulb = s('circle', { cx: PLANT_X, cy: 58, r: 11, fill: '#fef08a' });
      svg.append(
        lampGlow,
        s('line', { x1: PLANT_X, y1: 0, x2: PLANT_X, y2: 26, stroke: '#334155', 'stroke-width': 3 }),
        s('path', { d: `M${PLANT_X - 44} 26 L${PLANT_X + 44} 26 L${PLANT_X + 24} 52 L${PLANT_X - 24} 52 Z`, fill: d.lin([[0, '#94a3b8'], [1, '#475569']], 'v') }),
        lampBulb,
      );

      // Мелкие капли пара, поднимающиеся от листьев — переиспользуемый пул
      vapor = bubblePool(svg, 24, { color: '#38bdf8' });

      // Табло на стене под окном: скорость испарения и влажность воздуха
      evapReadout = readout(d, { x: 626, y: 282, w: 140, caption: 'испарение, мл/ч', color: '#38bdf8' });
      humReadout = readout(d, { x: 780, y: 282, w: 140, caption: 'влажность воздуха', color: '#a5f3fc' });
      svg.append(evapReadout.g, humReadout.g);
    },

    frame(dt, now) {
      const rate = transpirationRate(params);
      const sway = Math.sin(now * (1 + params.wind)) * params.wind * 3.5;

      // Стебель и листья раскачиваются от ветра
      const stemBottom = VESSEL.x + 0;
      const topY = 90;
      const bottomY = vessel.top + 8;
      stemPath.setAttribute('d', `M${stemBottom} ${bottomY} Q ${PLANT_X + sway} ${(topY + bottomY) / 2} ${PLANT_X + sway * 1.4} ${topY}`);
      const leaves = plant.querySelectorAll('ellipse');
      leaves.forEach((leaf, k) => {
        const i = Math.floor(k / 2);
        const side = k % 2 === 0 ? -1 : 1;
        const ly = topY + 16 + i * ((bottomY - topY - 30) / 6);
        const lx = PLANT_X + sway * (1.3 - i * 0.15) + side * 30;
        leaf.setAttribute('cx', lx);
        leaf.setAttribute('cy', ly);
        leaf.setAttribute('transform', `rotate(${side * (24 + sway * 1.5)} ${lx} ${ly})`);
        if (Math.random() < rate * dt * 1.2) vapor.spawn(lx, ly, 2.5 + Math.random() * 2);
      });
      vapor.update(dt, topY - 60, 8 * (params.wind + 0.3));

      // Пузырёк капилляра ползёт слева направо пропорционально скорости испарения, затем возвращается
      bubblePos = (bubblePos + rate * dt * 26) % capLen;
      bubble.setAttribute('cx', CAP.right - 12 - bubblePos);

      // Лопасти вентилятора вращаются тем быстрее, чем сильнее ветер
      const fanX = Number(fanBlades.getAttribute('data-x'));
      const fanHubY = Number(fanBlades.getAttribute('data-y'));
      const angle = (now * params.wind * 260) % 360;
      fanBlades.setAttribute('transform', `translate(${fanX} ${fanHubY}) rotate(${angle})`);
      Array.from(fanBlades.children).forEach((b, i) => b.setAttribute('transform', `rotate(${i * 120})`));

      const on = Boolean(params.light);
      lampGlow.setAttribute('opacity', on ? 1 : 0);
      lampBulb.setAttribute('fill', on ? '#fef08a' : '#e2e8f0');

      evapReadout.set(`${fmt(rate)} мл/ч`);
      humReadout.set(`${params.humidity}%`);
    },
  });

  return scene;
}
