// Обучение для первого визита: затемняем экран, подсвечиваем один элемент и рядом объясняем,
// зачем на него нажимать. Статичный список «1-2-3» над работами ученики пролистывали,
// не понимая, где на экране «предмет» и где «шаги».
//
// Шаг — { target: () => Element | null, title, text }. Шаг без видимой цели пропускается:
// набор кнопок разный у гостя и ученика, на телефоне и компьютере.

const KEY = (name) => `ai-stem-lab:tour:${name}`;

const visible = (node) => Boolean(node?.getClientRects().length);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createTour({ t }) {
  let active = null; // { name, steps, index, target, returnFocus }

  const root = document.createElement('div');
  root.className = 'tour';
  root.hidden = true;
  const spot = document.createElement('div');
  spot.className = 'tour-spot';
  const pop = document.createElement('div');
  pop.className = 'tour-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-modal', 'true');
  pop.setAttribute('aria-labelledby', 'tourTitle');
  pop.setAttribute('aria-describedby', 'tourText');
  pop.innerHTML = `
    <p class="tour-count"></p>
    <h2 id="tourTitle" class="tour-title"></h2>
    <p id="tourText" class="tour-text"></p>
    <div class="tour-actions">
      <button type="button" class="ghost small tour-skip"></button>
      <span class="tour-nav">
        <button type="button" class="ghost small tour-back"></button>
        <button type="button" class="primary small tour-next"></button>
      </span>
    </div>`;
  root.append(spot, pop);
  document.body.append(root);

  const q = (sel) => pop.querySelector(sel);
  q('.tour-skip').textContent = t('tour.skip');
  q('.tour-back').textContent = t('tour.back');
  q('.tour-skip').addEventListener('click', () => finish());
  q('.tour-back').addEventListener('click', () => go(active.index - 1, -1));
  q('.tour-next').addEventListener('click', () => go(active.index + 1, 1));

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
      return;
    }
    // Фокус не уходит за пределы подсказки, пока она открыта: aria-modal сам этого не делает
    if (e.key !== 'Tab') return;
    const items = [...pop.querySelectorAll('button:not([hidden])')];
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Шапка липкая, а сцена опыта меняет размер — подсказка должна идти за элементом
  const reposition = () => active && place();
  addEventListener('resize', reposition);
  addEventListener('scroll', reposition, { passive: true });

  function isDone(name) {
    try {
      return localStorage.getItem(KEY(name)) === '1';
    } catch {
      // Без хранилища показывали бы обучение при каждом заходе — это хуже, чем не показать
      return true;
    }
  }

  function markDone(name) {
    try {
      localStorage.setItem(KEY(name), '1');
    } catch {
      // Не запомнится — не страшно
    }
  }

  function go(index, dir) {
    let i = index;
    while (i >= 0 && i < active.steps.length && !visible(active.steps[i].target())) i += dir;
    if (i < 0) return;
    if (i >= active.steps.length) return finish();
    active.index = i;
    const step = active.steps[i];
    active.target = step.target();
    const total = active.steps.filter((s) => visible(s.target())).length;
    const number = active.steps.slice(0, i + 1).filter((s) => visible(s.target())).length;
    q('.tour-count').textContent = t('tour.count', { n: number, total });
    q('#tourTitle').textContent = step.title;
    q('#tourText').textContent = step.text;
    q('.tour-back').hidden = number === 1;
    q('.tour-next').textContent = number === total ? t('tour.done') : t('tour.next');
    active.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    place();
    // После плавной прокрутки координаты меняются — пересчитываем, когда она закончится
    if (!reducedMotion()) setTimeout(reposition, 400);
    q('.tour-next').focus({ preventScroll: true });
  }

  function place() {
    const r = active.target.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {
      top: `${r.top - pad}px`,
      left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    // На телефоне подсказка — панель у края экрана (стили): у нижнего, а если элемент
    // в нижней половине (кнопка чата) — у верхнего, чтобы его не закрыть
    if (matchMedia('(max-width: 720px)').matches) {
      pop.style.top = pop.style.left = '';
      pop.classList.toggle('at-top', r.top + r.height / 2 > innerHeight / 2);
      return;
    }
    pop.classList.remove('at-top');
    const gap = 14;
    const ph = pop.offsetHeight;
    const pw = pop.offsetWidth;
    const below = r.bottom + gap + ph <= innerHeight;
    const top = below ? r.bottom + gap : Math.max(8, r.top - gap - ph);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), innerWidth - pw - 8);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }

  function start(name, steps) {
    if (active) return;
    if (!steps.some((s) => visible(s.target()))) return;
    active = { name, steps, index: 0, target: null, returnFocus: document.activeElement };
    root.hidden = false;
    document.body.classList.add('tour-open');
    go(0, 1);
  }

  function finish() {
    if (!active) return;
    markDone(active.name);
    const { returnFocus } = active;
    active = null;
    root.hidden = true;
    document.body.classList.remove('tour-open');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  return {
    // Первый визит на экран: показываем один раз
    maybeStart(name, steps) {
      if (!isDone(name)) start(name, steps);
    },
    // Повтор по кнопке «Как пользоваться» в подвале
    start,
    get isOpen() { return Boolean(active); },
  };
}
