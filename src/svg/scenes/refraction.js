// Сцена «Преломление света»: затемнённая оптическая комната, прозрачный блок среды
// (вода/стекло/алмаз) в металлической оправе. Лазерную указку включают кнопкой на корпусе
// и тянут по дуге над блоком (луч из воздуха в среду) или под границей (из среды в воздух).
// В темноте луч виден по рассеянию на пылинках и дымке — как в настоящем кабинете с задёрнутыми
// шторами. Углы отмечены дугами без подписей, значения — на табло приборов.

import { createScene, draggable, floorShadow, readout, room, s } from '../kit.js';
import { tr } from '../../i18n.js';

const DEG = Math.PI / 180;
const cx = 480; // точка падения луча на границу сред
const cy = 290; // высота границы (верхняя грань блока)
const R = 120; // радиус дуги, по которой ходит лазер
const benchY = 440;
const BODY = 66; // длина корпуса указки; апертура — на переднем торце, обращённом к точке падения
const BEAM = '#ef4444';
let filterUid = 0;

export function refractionScene(container, params, set, { refractionAngle, MEDIA }) {
  let laser, aperture, apertureGlow, led, incidentRay, reflectedRay, refractedRay, alphaArc, betaArc, blockFill, alphaRead, betaRead, tirGlow, spotGlow, dust;
  // Плавное включение: луч «разгорается» за доли секунды, а не вспыхивает мгновенно.
  // Сцена, собранная с уже включённым лазером (превью, возврат к работе), сразу светит.
  let power = params.laser ? 1 : 0;
  const segments = []; // видимые отрезки лучей текущего кадра — вдоль них вспыхивают пылинки

  // Точка на дуге радиуса r под углом deg от нормали, на стороне away (−1 — вверх/воздух, +1 — вниз/среда)
  const arcPoint = (deg, r, away) => ({ x: cx - Math.sin(deg * DEG) * r, y: cy + away * Math.cos(deg * DEG) * r });

  const scene = createScene(container, {
    build(svg, d) {
      room(svg, d, { benchY, theme: 'dark' });

      // Размытие для дымки вокруг луча — один фильтр на сцену, не пересоздаётся в кадре
      const haze = `refr-haze-${++filterUid}`;
      svg.querySelector('defs').append(s('filter', { id: haze, x: '-50%', y: '-50%', width: '200%', height: '200%' }, [s('feGaussianBlur', { stdDeviation: 5 })]));

      // Прозрачный блок среды в металлической оправе — как кювета на оптическом столе
      const bw = 460;
      blockFill = s('rect', { x: cx - bw / 2, y: cy, width: bw, height: benchY - cy, fill: '#bae6fd', 'fill-opacity': 0.16 });
      svg.append(s('g', {}, [
        floorShadow(cx, benchY + 6, bw * 0.56, d),
        s('rect', { x: cx - bw / 2 - 10, y: cy - 6, width: bw + 20, height: benchY - cy + 16, rx: 10, fill: d.lin([[0, '#3b4452'], [1, '#161b23']], 'v') }),
        s('rect', { x: cx - bw / 2, y: cy, width: bw, height: benchY - cy, fill: '#05070a', 'fill-opacity': 0.55 }),
        blockFill,
        s('rect', { x: cx - bw / 2, y: cy, width: bw, height: benchY - cy, fill: d.lin([[0, '#ffffff', 0.08], [1, '#000000', 0.2]], 'v') }),
        s('rect', { x: cx - bw / 2, y: cy, width: bw, height: benchY - cy, fill: d.url('glass'), 'fill-opacity': 0.35, stroke: '#4b5563', 'stroke-width': 2 }),
        s('rect', { x: cx - bw / 2 + 14, y: cy + 8, width: 8, height: benchY - cy - 24, rx: 4, fill: '#ffffff', 'fill-opacity': 0.12 }),
        // верхняя грань — граница раздела сред: тонкая светлая линия
        s('rect', { x: cx - bw / 2, y: cy - 2, width: bw, height: 3, fill: '#94a3b8', 'fill-opacity': 0.6 }),
      ]));

      // Нормаль к границе (пунктир) — в темноте едва заметна, как нарисованная на планшете
      svg.append(s('line', { x1: cx, y1: cy - R - 30, x2: cx, y2: cy + R + 30, stroke: '#64748b', 'stroke-width': 1.5, 'stroke-dasharray': '6 6' }));

      // Дуги углов падения и преломления (без подписей — значения на табло)
      alphaArc = s('path', { fill: 'none', stroke: '#f87171', 'stroke-width': 2.5 });
      betaArc = s('path', { fill: 'none', stroke: '#4ade80', 'stroke-width': 2.5 });
      svg.append(alphaArc, betaArc);

      // Лучи: дымка (размытая широкая полоса), ореол и яркая сердцевина
      incidentRay = beamPath(haze);
      reflectedRay = beamPath(haze);
      refractedRay = beamPath(haze);
      for (const r of [reflectedRay, incidentRay, refractedRay]) svg.append(r.haze, r.wide, r.core);

      // Пылинки, вспыхивающие в луче (пул, без создания элементов в кадре)
      const dustGroup = s('g');
      svg.append(dustGroup);
      dust = Array.from({ length: 60 }, () => {
        const c = s('circle', { r: 1, fill: '#fecaca', opacity: 0 });
        dustGroup.append(c);
        return { c, age: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, alive: false };
      });

      // Пятно в точке падения и свечение при полном внутреннем отражении
      spotGlow = s('circle', { cx, cy, r: 22, fill: d.rad([[0, '#fff1f2', 0.95], [0.3, '#f87171', 0.6], [1, '#ef4444', 0]], 0.5, 0.5), opacity: 0 });
      tirGlow = s('circle', { cx, cy, r: 30, fill: d.rad([[0, '#fecaca', 0.8], [1, '#ef4444', 0]], 0.5, 0.5), opacity: 0 });
      svg.append(spotGlow, tirGlow);

      // Лазерная указка: апертура на переднем торце, кнопка питания и индикатор на корпусе
      aperture = s('circle', { cx: 0, cy: -BODY, r: 5, fill: '#450a0a' });
      apertureGlow = s('circle', { cx: 0, cy: -BODY, r: 16, fill: d.rad([[0, '#fff1f2', 0.95], [0.35, '#f87171', 0.6], [1, '#ef4444', 0]], 0.5, 0.5), opacity: 0 });
      led = s('circle', { cx: 0, cy: -12, r: 2.6, fill: '#3f1d1d' });
      const button = s('rect', { x: -5, y: -38, width: 10, height: 14, rx: 3, fill: '#7f1d1d', stroke: '#1e293b', 'stroke-width': 1.5 });
      const body = s('g', {}, [
        s('rect', { x: -14, y: -BODY, width: 28, height: BODY, rx: 9, fill: d.lin([[0, '#1f2937'], [0.35, '#9ca3af'], [1, '#111827']], 'h') }),
        s('rect', { x: -14, y: -BODY, width: 28, height: 11, rx: 5, fill: '#0b0f14' }),
        s('rect', { x: -14, y: -8, width: 28, height: 8, rx: 4, fill: '#0b0f14' }),
        aperture,
        button,
        led,
      ]);
      laser = s('g', {}, [body, s('circle', { r: 34, cy: -BODY / 2, fill: 'transparent' }), apertureGlow]);
      // Отдельная зона нажатия на кнопку — поверх зоны перетаскивания; нажатие не запускает перетаскивание
      const hit = s('circle', { cx: 0, cy: -31, r: 11, fill: 'transparent' });
      hit.style.cursor = 'pointer';
      hit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        set('laser', params.laser ? 0 : 1);
      });
      laser.append(hit);
      svg.append(laser);

      // Табло углов на стойках по краям стола
      alphaRead = readout(d, { x: 90, y: 150, w: 130, caption: tr('угол падения α'), color: '#f87171' });
      betaRead = readout(d, { x: 740, y: 150, w: 130, caption: tr('угол преломления β'), color: '#4ade80' });
      svg.append(alphaRead.g, betaRead.g);
    },

    frame(dt) {
      const away = params.dir === 0 ? -1 : 1; // сторона, где находится лазер: −1 воздух сверху, +1 среда снизу
      const medium = MEDIA[params.medium];
      const beta = refractionAngle(params);
      power += ((params.laser ? 1 : 0) - power) * Math.min(1, dt * 10);
      const on = power > 0.02;

      blockFill.setAttribute('fill', medium.color);
      // Среда слегка «подсвечивается» изнутри рассеянным светом лазера
      blockFill.setAttribute('fill-opacity', 0.12 + 0.1 * power);

      const p0 = arcPoint(params.alpha, R, away);
      laser.setAttribute('transform', `translate(${p0.x} ${p0.y}) rotate(${Math.atan2(cy - p0.y, cx - p0.x) / DEG + 90})`);
      // Передний торец указки: отсюда выходит луч
      const ax = p0.x + (cx - p0.x) * (BODY / R);
      const ay = p0.y + (cy - p0.y) * (BODY / R);

      aperture.setAttribute('fill', on ? '#fecaca' : '#450a0a');
      apertureGlow.setAttribute('opacity', power);
      led.setAttribute('fill', on ? '#4ade80' : '#3f1d1d');

      segments.length = 0;
      setBeam(incidentRay, ax, ay, cx, cy, power, 1);
      const pr = arcPoint(-params.alpha, R * 1.25, away); // отражённый луч — зеркально по другую сторону нормали
      const reflI = beta === null ? 1 : 0.25;
      setBeam(reflectedRay, cx, cy, pr.x, pr.y, power * reflI, 1);

      if (beta !== null) {
        const p2 = arcPoint(-beta, R * 1.25, -away);
        // В среде (вода/стекло) дымка гуще — луч там виден лучше, чем в воздухе
        setBeam(refractedRay, cx, cy, p2.x, p2.y, power, away < 0 ? 1.5 : 1);
        tirGlow.setAttribute('opacity', 0);
      } else {
        setBeam(refractedRay, cx, cy, cx, cy, 0, 1);
        tirGlow.setAttribute('opacity', 0.9 * power);
      }
      spotGlow.setAttribute('opacity', power);
      if (on) {
        segments.push([ax, ay, cx, cy, 1]);
        segments.push([cx, cy, pr.x, pr.y, reflI]);
        if (beta !== null) {
          const p2 = arcPoint(-beta, R * 1.25, -away);
          segments.push([cx, cy, p2.x, p2.y, 1]);
        }
      }
      updateDust(dt);

      alphaArc.setAttribute('d', on ? arcSector(params.alpha, R * 0.4, away) : '');
      betaArc.setAttribute('d', on && beta !== null ? arcSector(-beta, R * 0.4, -away) : '');

      alphaRead.set(`${Math.round(params.alpha)}°`);
      betaRead.set(!params.laser ? '—' : beta === null ? tr('п.в.о.') : `${Math.round(beta)}°`);
    },
  });

  // Пылинки рождаются в случайной точке случайного луча, медленно дрейфуют и гаснут
  function updateDust(dt) {
    if (segments.length) {
      const n = Math.floor(dt * 70 + Math.random());
      for (let i = 0; i < n; i++) {
        const seg = segments[Math.floor(Math.random() * segments.length)];
        if (Math.random() > seg[4] + 0.1) continue;
        const p = dust.find((q) => !q.alive);
        if (!p) break;
        const t = Math.random();
        const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) || 1;
        const off = (Math.random() - 0.5) * 8;
        Object.assign(p, {
          x: seg[0] + (seg[2] - seg[0]) * t - ((seg[3] - seg[1]) / len) * off,
          y: seg[1] + (seg[3] - seg[1]) * t + ((seg[2] - seg[0]) / len) * off,
          vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 2,
          age: 0, life: 0.5 + Math.random() * 1.1, alive: true,
        });
        p.c.setAttribute('r', 0.6 + Math.random() * 1.3);
      }
    }
    for (const p of dust) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life || !segments.length) {
        p.alive = false;
        p.c.setAttribute('opacity', 0);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.c.setAttribute('cx', p.x);
      p.c.setAttribute('cy', p.y);
      p.c.setAttribute('opacity', Math.sin((Math.PI * p.age) / p.life) * 0.85);
    }
  }

  draggable(scene, laser, {
    onDrag: (x, y) => {
      const away = params.dir === 0 ? -1 : 1;
      const v = { x: x - cx, y: (y - cy) * away };
      const deg = Math.atan2(-v.x, v.y) / DEG;
      set('alpha', Math.max(0, Math.min(85, deg)));
    },
  });
  return scene;
}

// Луч: размытая дымка вокруг, широкий ореол и яркая сердцевина (как настоящий лазерный луч в темноте)
function beamPath(haze) {
  return {
    haze: s('line', { stroke: BEAM, 'stroke-opacity': 0.35, 'stroke-width': 18, 'stroke-linecap': 'round', filter: `url(#${haze})` }),
    wide: s('line', { stroke: BEAM, 'stroke-opacity': 0.3, 'stroke-width': 7, 'stroke-linecap': 'round' }),
    core: s('line', { stroke: '#fecaca', 'stroke-width': 2, 'stroke-linecap': 'round' }),
  };
}

function setBeam(ray, x1, y1, x2, y2, intensity, hazeK) {
  for (const line of [ray.haze, ray.wide, ray.core]) {
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
  }
  ray.haze.setAttribute('opacity', Math.min(1, intensity * 0.6 * hazeK));
  ray.wide.setAttribute('opacity', intensity);
  ray.core.setAttribute('opacity', intensity);
}

// Дуга угла у точки падения (декоративная, без подписи)
function arcSector(deg, r, away) {
  const p0 = { x: cx, y: cy + away * r };
  const a = deg * DEG;
  const p1 = { x: cx - Math.sin(a) * r, y: cy + away * Math.cos(a) * r };
  const sweep = away * (deg < 0 ? -1 : 1) > 0 ? 1 : 0;
  return `M${p0.x} ${p0.y} A${r} ${r} 0 0 ${sweep} ${p1.x} ${p1.y}`;
}
