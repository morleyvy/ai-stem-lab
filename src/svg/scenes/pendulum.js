// Сцена «Маятник»: лабораторный штатив с муфтой на стенде физкабинета, груз на нити
// и ручной секундомер на столе. Пока ученик не отведёт груз мышью и не отпустит его,
// маятник висит неподвижно (released = 0). Время колебаний ученик засекает сам:
// верхняя кнопка секундомера — старт/стоп, боковая — сброс.

import { createScene, draggable, floorShadow, room, s, shade, text, touchTarget } from '../kit.js';

const STAND_X = 230;
const PIVOT = { x: 560, y: 96 };
const ATTACH_Y = PIVOT.y + 20; // точка схода нити чуть ниже зажима муфты
const AMPLITUDE = 0.26; // рад (~15°) — отклонение по кнопке «Отвести и отпустить»
const MAX_ANGLE = 0.35; // рад (~20°) — дальше формула малых колебаний заметно врёт
const MIN_ANGLE = 0.05; // слишком малое отклонение не считаем запуском
const LEAD_IN = 0.6; // с — плавное отведение груза, когда запуск идёт кнопкой
const DAMPING = 0.015; // лёгкое затухание: амплитуда медленно уменьшается, период — нет
const WATCH = { x: 800, y: 392, r: 56 };

export function pendulumScene(container, params, set, { period }) {
  let benchY = 460;
  let thread, sphereBody, sphereShine, ballShadow, lcdTime, lcdCount, crown, resetBtn;
  // Колебания: фаза (рад), амплитуда, текущий угол; held — груз в руке ученика
  let phase = 0;
  let amp = 0;
  let angle = 0;
  let held = false;
  let heldAngle = 0;
  let swinging = false;
  let leadIn = 0;
  // Секундомер: идёт ли, показание и число полных колебаний с момента запуска
  const watch = { running: false, t: 0, n: 0, press: 0, pressReset: 0 };
  const geo = { attachX: PIVOT.x, attachY: ATTACH_Y };

  const scene = createScene(container, {
    build(svg, d) {
      benchY = room(svg, d, { benchY: 460, theme: 'stand' });

      // Штатив: тяжёлое основание, вертикальная стойка, лапка с муфтой в точке подвеса
      svg.append(
        floorShadow(STAND_X, benchY + 6, 90, d),
        s('rect', { x: STAND_X - 80, y: benchY - 14, width: 160, height: 14, rx: 4, fill: d.lin(['#94a3b8', '#e2e8f0', '#64748b']) }),
        s('rect', { x: STAND_X - 6, y: PIVOT.y - 30, width: 12, height: benchY - 14 - (PIVOT.y - 30), fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
        s('rect', { x: STAND_X - 14, y: PIVOT.y - 12, width: 28, height: 22, rx: 4, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('rect', { x: STAND_X, y: PIVOT.y - 6, width: PIVOT.x - STAND_X + 24, height: 10, rx: 4, fill: d.lin(['#94a3b8', '#f1f5f9', '#64748b']) }),
        s('rect', { x: PIVOT.x - 13, y: PIVOT.y - 14, width: 26, height: 26, rx: 5, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
        s('circle', { cx: PIVOT.x, cy: PIVOT.y - 1, r: 3.5, fill: '#0f172a' }),
        // транспортир-шкала у точки подвеса: по ней видно отклонение
        s('path', { d: arcPath(PIVOT.x, ATTACH_Y, 70, -0.45, 0.45), fill: 'none', stroke: '#94a3b8', 'stroke-width': 1.5 }),
      );
      for (let i = -4; i <= 4; i++) {
        const a = i * 0.1;
        const r1 = i % 2 ? 64 : 60;
        svg.append(s('line', { x1: PIVOT.x + Math.sin(a) * r1, y1: ATTACH_Y + Math.cos(a) * r1, x2: PIVOT.x + Math.sin(a) * 70, y2: ATTACH_Y + Math.cos(a) * 70, stroke: '#94a3b8', 'stroke-width': 1.2 }));
      }

      thread = s('line', { x1: PIVOT.x, y1: ATTACH_Y, x2: PIVOT.x, y2: ATTACH_Y + 200, stroke: '#334155', 'stroke-width': 1.6 });
      svg.append(thread);

      ballShadow = floorShadow(PIVOT.x, benchY + 6, 26, d);
      sphereBody = s('circle', { r: 22, fill: d.rad([[0, shade('#c2410c', 0.55)], [0.45, '#c2410c'], [1, shade('#c2410c', -0.4)]], 0.32, 0.28) });
      sphereShine = s('ellipse', { rx: 7, ry: 4, fill: '#ffffff', 'fill-opacity': 0.5, 'pointer-events': 'none' });
      svg.append(ballShadow, sphereBody, sphereShine);

      svg.append(buildWatch(d, benchY));
    },

    frame(dt) {
      const T = period(params.L);

      // Запуск кнопкой работы: груз сам плавно отводится и отпускается
      if (params.released && !swinging && !held) {
        swinging = true;
        amp = AMPLITUDE;
        phase = 0;
        leadIn = LEAD_IN;
      }
      if (!params.released && swinging && !held) swinging = false;

      if (held) {
        angle = heldAngle;
      } else if (swinging && leadIn > 0) {
        leadIn = Math.max(0, leadIn - dt);
        const k = 1 - leadIn / LEAD_IN;
        angle = amp * k * k * (3 - 2 * k);
      } else if (swinging) {
        const before = phase;
        phase += (2 * Math.PI * dt) / T;
        // Полное колебание — каждый раз, когда груз возвращается в крайнее положение
        if (watch.running && Math.floor(phase / (2 * Math.PI)) > Math.floor(before / (2 * Math.PI))) watch.n++;
        amp *= Math.exp(-DAMPING * dt);
        angle = amp * Math.cos(phase);
      } else {
        angle *= Math.pow(0.02, dt); // остановленный маятник успокаивается
      }

      if (watch.running) watch.t += dt;
      watch.press = Math.max(0, watch.press - dt);
      watch.pressReset = Math.max(0, watch.pressReset - dt);
      lcdTime.textContent = watch.t.toFixed(2).replace('.', ',');
      lcdCount.textContent = `N ${watch.n}`;
      lcdTime.setAttribute('fill', watch.running ? '#0f172a' : '#334155');
      crown.setAttribute('transform', `translate(0 ${watch.press > 0 ? 3 : 0})`);
      resetBtn.setAttribute('transform', `rotate(40 ${WATCH.x} ${WATCH.y}) translate(0 ${watch.pressReset > 0 ? 3 : 0})`);

      // 2 м нити (максимум по контролу) должны помещаться между муфтой и столом
      const scale = (benchY - 4 - ATTACH_Y) / 2;
      const len = params.L * scale;
      const bx = PIVOT.x + Math.sin(angle) * len;
      const by = ATTACH_Y + Math.cos(angle) * len;
      const r = 14 + params.m * 16;
      geo.scale = scale;

      thread.setAttribute('x2', bx);
      thread.setAttribute('y2', by);
      sphereBody.setAttribute('cx', bx);
      sphereBody.setAttribute('cy', by);
      sphereBody.setAttribute('r', r);
      sphereShine.setAttribute('cx', bx - r * 0.32);
      sphereShine.setAttribute('cy', by - r * 0.35);
      sphereShine.setAttribute('rx', r * 0.3);
      sphereShine.setAttribute('ry', r * 0.17);

      // Тень груза на столе: чем выше груз, тем она крупнее и бледнее
      const height = benchY - by;
      ballShadow.setAttribute('cx', bx);
      ballShadow.setAttribute('rx', r * (1.3 + height / 320));
      ballShadow.setAttribute('opacity', Math.max(0.15, 1 - height / 460));
    },
  });

  // Ручной секундомер: корпус с ушком, заводная головка-кнопка сверху, кнопка сброса сбоку,
  // ЖК-табло с временем и счётчиком полных колебаний
  function buildWatch(d, benchY) {
    const { x, y, r } = WATCH;
    crown = s('g', {}, [
      s('rect', { x: x - 5, y: y - r - 16, width: 10, height: 12, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      s('rect', { x: x - 12, y: y - r - 26, width: 24, height: 11, rx: 4, fill: d.lin(['#475569', '#cbd5e1', '#334155']) }),
      // увеличенная зона нажатия
      s('rect', { x: x - 20, y: y - r - 32, width: 40, height: 30, fill: '#ffffff', 'fill-opacity': 0 }),
    ]);
    resetBtn = s('g', {}, [
      s('rect', { x: x - 4, y: y - r - 12, width: 8, height: 10, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      s('rect', { x: x - 8, y: y - r - 19, width: 16, height: 8, rx: 3, fill: d.lin(['#991b1b', '#f87171', '#7f1d1d']) }),
      s('rect', { x: x - 14, y: y - r - 26, width: 28, height: 24, fill: '#ffffff', 'fill-opacity': 0 }),
    ]);
    for (const [btn, fn] of [[crown, toggleWatch], [resetBtn, resetWatch]]) {
      btn.style.cursor = 'pointer';
      touchTarget(btn);
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        fn();
      });
    }
    lcdTime = text(x + 2, y - 2, '0,00', { size: 22, weight: 700, fill: '#334155' });
    lcdCount = text(x, y + 22, 'N 0', { size: 11, weight: 600, fill: '#475569' });
    const ticks = s('g');
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r1 = i % 5 === 0 ? r - 13 : r - 10;
      ticks.append(s('line', { x1: x + Math.sin(a) * r1, y1: y - Math.cos(a) * r1, x2: x + Math.sin(a) * (r - 6), y2: y - Math.cos(a) * (r - 6), stroke: '#64748b', 'stroke-width': i % 5 === 0 ? 1.5 : 0.8 }));
    }
    return s('g', {}, [
      floorShadow(x, benchY + 4, 60, d),
      // подставка, чтобы секундомер стоял на ребре
      s('path', { d: `M${x - 34} ${benchY} L${x - 22} ${y + r - 12} H${x + 22} L${x + 34} ${benchY} Z`, fill: d.lin([[0, '#475569'], [1, '#1e293b']], 'v') }),
      resetBtn,
      crown,
      s('circle', { cx: x, cy: y, r: r + 4, fill: d.lin(['#64748b', '#e2e8f0', '#475569']) }),
      s('circle', { cx: x, cy: y, r, fill: d.rad([[0, '#ffffff'], [1, '#e2e8f0']], 0.4, 0.3), stroke: '#94a3b8' }),
      ticks,
      s('rect', { x: x - 38, y: y - 18, width: 76, height: 50, rx: 7, fill: d.lin([[0, '#c7d2b8'], [1, '#aab897']], 'v'), stroke: '#64748b' }),
      lcdTime,
      lcdCount,
      s('path', { d: `M${x - r + 10} ${y - 18} A ${r - 8} ${r - 8} 0 0 1 ${x + 6} ${y - r + 8}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 4, 'stroke-opacity': 0.5, 'stroke-linecap': 'round' }),
    ]);
  }

  function toggleWatch() {
    watch.running = !watch.running;
    watch.press = 0.12;
  }

  function resetWatch() {
    watch.pressReset = 0.12;
    // Как у настоящего секундомера: сброс работает только на остановленном
    if (watch.running) return;
    watch.t = 0;
    watch.n = 0;
  }

  // Ученик отводит груз: угол задаётся положением курсора, длина нити не меняется
  draggable(scene, sphereBody, {
    onDrag(x, y) {
      if (!held) {
        held = true;
        swinging = false;
        if (params.released) set('released', 0);
      }
      heldAngle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(x - geo.attachX, Math.max(1, y - geo.attachY))));
    },
    onEnd() {
      if (!held) return;
      held = false;
      if (Math.abs(heldAngle) < MIN_ANGLE) {
        angle = heldAngle;
        return;
      }
      // Отпустили: колебания начинаются из крайнего положения с этой амплитудой
      swinging = true;
      leadIn = 0;
      amp = Math.abs(heldAngle);
      phase = heldAngle > 0 ? 0 : Math.PI;
      set('released', 1);
    },
  });

  scene.svg.style.userSelect = 'none';
  return scene;
}

function arcPath(cx, cy, r, a1, a2) {
  const p = (a) => `${cx + Math.sin(a) * r} ${cy + Math.cos(a) * r}`;
  return `M${p(a1)} A ${r} ${r} 0 0 0 ${p(a2)}`;
}
