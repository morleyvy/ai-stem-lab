// Преломление света на границе двух сред: закон Снеллиуса n₁·sin α = n₂·sin β
// и полное внутреннее отражение. Лазер можно перетаскивать по окружности, меняя угол падения.

import { fmt } from './canvas.js';
import { refractionScene } from '../svg/scenes/refraction.js';

const MEDIA = [
  { name: 'вода', n: 1.33, color: '#38bdf8' },
  { name: 'стекло', n: 1.5, color: '#a5b4fc' },
  { name: 'алмаз', n: 2.42, color: '#e9d5ff' },
];
const DEG = Math.PI / 180;

// Показатели преломления среды падения и среды преломления
export function indices(p) {
  const n = MEDIA[p.medium].n;
  return p.dir === 0 ? [1, n] : [n, 1];
}

// Угол преломления в градусах или null при полном внутреннем отражении
export function refractionAngle(p) {
  const [n1, n2] = indices(p);
  const s = (n1 / n2) * Math.sin(p.alpha * DEG);
  return s > 1 ? null : Math.asin(s) / DEG;
}

export const REFRACTION = {
  id: 'refraction',
  freeTitle: 'Луч света',
  freeSub: 'Угол падения, среда, отражение',
  freeIcon: 'refraction',
  subject: 'physics',
  title: 'Преломление света',
  controls: [
    { id: 'alpha', label: 'Угол падения', min: 0, max: 85, step: 1, unit: '°', value: 30 },
    { id: 'medium', label: 'Среда', min: 0, max: 2, step: 1, unit: '', value: 0, names: MEDIA.map((m) => `${m.name} (n = ${String(m.n).replace('.', ',')})`) },
    { id: 'dir', label: 'Направление луча', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['из воздуха в среду', 'из среды в воздух'] },
    // Действие на сцене: кнопка на корпусе указки. Пока лазер выключен, лучей нет и измерять нечего.
    { id: 'laser', label: 'Лазер', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключен', 'включён'], action: true, actionLabel: 'Включить лазер' },
  ],
  formula: 'n₁ · sin α = n₂ · sin β',
  hint: 'Нажмите кнопку на корпусе лазерной указки, чтобы включить луч, и перетаскивайте указку по дуге, меняя угол падения.',
  chart: { x: 'alpha', y: (p) => refractionAngle(p) ?? 90, xLabel: 'угол падения α, °', yLabel: 'угол преломления β, °', series: (p) => `${MEDIA[p.medium].name}, ${p.dir === 0 ? 'в среду' : 'из среды'}` },
  theory: 'На границе двух сред свет преломляется: n₁·sin α = n₂·sin β. При переходе в оптически более плотную среду луч приближается к перпендикуляру. При выходе из плотной среды под большим углом преломлённого луча нет — это полное внутреннее отражение.',

  readings(p) {
    if (!p.laser) return [{ label: 'Лазер', value: 'выключен — лучей нет' }];
    const beta = refractionAngle(p);
    const [n1, n2] = indices(p);
    const critical = n1 > n2 ? Math.asin(n2 / n1) / DEG : null;
    return [
      { label: 'Угол преломления β', value: beta === null ? 'нет (полное отражение)' : `${fmt(beta, 1)}°` },
      { label: 'n₁ → n₂', value: `${fmt(n1)} → ${fmt(n2)}` },
      { label: 'Предельный угол', value: critical ? `${fmt(critical, 1)}°` : '—' },
    ];
  },

  describe(p) {
    if (!p.laser) return 'Лазер выключен: луча нет';
    const beta = refractionAngle(p);
    return beta === null
      ? 'Полное внутреннее отражение: преломлённого луча нет'
      : `Угол преломления β = ${fmt(beta, 1)}°`;
  },

  create(container, params, set) {
    return refractionScene(container, params, set, { refractionAngle, indices, MEDIA });
  },
};

