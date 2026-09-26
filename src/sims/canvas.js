// Общие мелочи для описаний симуляций и графика измерений.
// Сами сцены рисуются в SVG (src/svg), здесь остались только форматирование чисел и подписи для canvas-графика.

export function label(ctx, text, x, y, { size = 14, color = '#0f172a', align = 'center', weight = 500 } = {}) {
  ctx.font = `${weight} ${size}px Geologica, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export const fmt = (value, digits = 2) => value.toFixed(digits).replace('.', ',');
