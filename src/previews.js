// Мини-превью опытов для плиток: сцена собирается в невидимом контейнере, после первых кадров
// её SVG копируется как статичная картинка, а сама сцена (с анимацией и обработчиками) удаляется.
// Результат кэшируется — каждая сцена строится один раз за сеанс.

const cache = new Map();
let queue = Promise.resolve();

function host() {
  let h = document.getElementById('preview-host');
  if (!h) {
    // Контейнер должен быть в документе: SVG считает размеры и длины путей только в DOM
    h = Object.assign(document.createElement('div'), { id: 'preview-host' });
    h.setAttribute('aria-hidden', 'true');
    h.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:270px;pointer-events:none;';
    document.body.append(h);
  }
  return h;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// mount(container) создаёт сцену и возвращает объект с destroy()
// viewBox — необязательная «рамка» кадра, чтобы приблизить главное на маленькой плитке
export function preview(key, mount, { viewBox } = {}) {
  if (!cache.has(key)) {
    // Сцены строятся по очереди, чтобы не нагружать страницу разом
    const job = queue.then(async () => {
      const box = document.createElement('div');
      box.style.cssText = 'width:480px;height:270px;';
      host().append(box);
      let markup = '';
      try {
        const scene = mount(box);
        // Ждём, пока сцена отрисует первые кадры (при фоновой вкладке кадры не идут — ограничиваем время)
        for (let i = 0; i < 4; i++) await Promise.race([nextFrame(), new Promise((r) => setTimeout(r, 60))]);
        const svg = box.querySelector('svg');
        if (svg && viewBox) svg.setAttribute('viewBox', viewBox);
        markup = svg?.outerHTML ?? '';
        scene?.destroy?.();
      } catch (err) {
        console.warn('[preview]', key, err);
      }
      box.remove();
      return markup;
    });
    queue = job.catch(() => {});
    // Пустой результат не кэшируем — попробуем построить превью снова при следующем показе
    job.then((svg) => { if (!svg) cache.delete(key); });
    cache.set(key, job);
  }
  return cache.get(key);
}
