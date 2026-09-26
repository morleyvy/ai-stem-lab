// Собирающая линза: формула тонкой линзы 1/F = 1/d + 1/f.
// Свечу можно двигать по оптической скамье мышью — изображение на экране меняется вживую.

import { fmt } from './canvas.js';
import { lensScene } from '../svg/scenes/lens.js';

// Расстояние до изображения (см): отрицательное — мнимое изображение, null — изображения нет (d = F)
export function imageDistance({ F, d }) {
  if (Math.abs(d - F) < 1e-9) return null;
  return 1 / (1 / F - 1 / d);
}

function imageKind(p) {
  const f = imageDistance(p);
  if (f === null) return 'изображения нет (лучи идут параллельно)';
  const g = Math.abs(f / p.d);
  const size = Math.abs(g - 1) < 0.02 ? 'равное' : g > 1 ? 'увеличенное' : 'уменьшенное';
  return f > 0 ? `действительное, перевёрнутое, ${size}` : `мнимое, прямое, ${size}`;
}

export const LENS = {
  id: 'lens',
  subject: 'physics',
  title: 'Собирающая линза',
  freeTitle: 'Линза и свеча',
  freeSub: 'Фокус, расстояние, изображение',
  freeIcon: 'eyeglasses',
  controls: [
    { id: 'F', label: 'Фокусное расстояние F', min: 5, max: 20, step: 1, unit: 'см', value: 10 },
    { id: 'd', label: 'Расстояние до свечи d', min: 5, max: 50, step: 1, unit: 'см', value: 30 },
    // Действия на сцене: зажечь свечу (клик по фитилю) и навести экран на резкость (перетаскивание экрана).
    // sharp пересчитывает сама сцена по положению экрана: после смены d изображение снова может расплыться.
    { id: 'lit', label: 'Свеча', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не горит', 'горит'], action: true, actionLabel: 'Зажечь свечу' },
    { id: 'sharp', label: 'Изображение на экране', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['размыто', 'резкое'], action: true, actionLabel: 'Навести экран на резкость' },
  ],
  formula: '1/F = 1/d + 1/f',
  hint: 'Щёлкните по фитилю, чтобы зажечь свечу. Передвигайте свечу и экран мышью вдоль скамьи: изображение резкое, только когда экран стоит на расстоянии f от линзы.',
  chart: { x: 'd', y: (p) => imageDistance(p) ?? 0, xLabel: 'd, см', yLabel: 'f, см', series: (p) => `F = ${p.F} см` },
  theory: 'Собирающая линза даёт изображение по формуле 1/F = 1/d + 1/f. Если предмет дальше фокуса, изображение действительное и перевёрнутое; если ближе фокуса — мнимое, прямое и увеличенное, как в лупе.',

  readings(p) {
    if (!p.lit) return [{ label: 'Свеча', value: 'не горит — изображения нет' }];
    const f = imageDistance(p);
    return [
      { label: 'Расстояние до изображения f', value: f === null ? '∞' : `${fmt(f, 1)} см` },
      { label: 'Увеличение Γ = |f| / d', value: f === null ? '—' : fmt(Math.abs(f / p.d), 2) },
      { label: 'Изображение', value: imageKind(p) },
      { label: 'На экране', value: f === null || f < 0 ? 'изображения нет' : p.sharp ? 'резкое изображение' : 'размытое пятно — подвиньте экран' },
    ];
  },

  describe(p) {
    if (!p.lit) return 'Свеча не горит: изображения нет';
    const f = imageDistance(p);
    return f === null ? 'Изображения нет: свеча в фокусе' : `Изображение ${imageKind(p)}, f = ${fmt(f, 1)} см`;
  },

  create(container, params, set) {
    return lensScene(container, params, set, { imageDistance });
  },
};
