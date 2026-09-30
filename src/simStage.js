// Стенд 2D-симуляции: холст, регуляторы параметров, показания приборов и график измерений.
// Один экземпляр на страницу; mount() подключает нужную симуляцию и возвращает контроллер.

import { createChart } from './sims/chart.js';
import { tr } from './i18n.js';

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

export function createSimStage({ canvasBox, controlsBox, readoutBox, chartBox, clearChartBtn }) {
  let current = null;

  // Высота панели регуляторов зависит от симуляции (в «Рычаге» их четыре) — отдаём её в CSS,
  // чтобы сцена ужималась ровно настолько, чтобы не уходить под прилипшую панель
  const panel = controlsBox.parentElement;
  // На телефоне высокая панель, прилипнув, закрыла бы сцену целиком — тогда она остаётся на своём месте
  const fit = () => {
    panel.parentElement.style.setProperty('--panel-h', `${Math.ceil(panel.offsetHeight)}px`);
    panel.classList.toggle('no-stick', panel.offsetHeight > window.innerHeight * 0.45);
  };
  new ResizeObserver(fit).observe(panel);
  window.addEventListener('resize', fit);

  function mount(def, initial = {}) {
    current?.destroy();

    const params = Object.fromEntries(def.controls.map((c) => [c.id, initial[c.id] ?? c.value]));
    const listeners = new Set();
    const rows = new Map();
    const inputs = new Map();
    const values = new Map();
    const chart = def.chart ? createChart(chartBox, {
      xMin: def.controls.find((c) => c.id === def.chart.x).min,
      xMax: def.controls.find((c) => c.id === def.chart.x).max,
      xLabel: tr(def.chart.xLabel),
      yLabel: tr(def.chart.yLabel),
    }) : null;

    // Содержимое симуляции написано по-русски — переводим при показе (src/i18n.js)
    const valueText = (c, v) => (c.names ? tr(c.names[v]) : `${String(v).replace('.', ',')} ${tr(c.unit)}`);
    const recordPoint = () => chart?.add(tr(def.chart.series(params)), params[def.chart.x], def.chart.y(params));

    function renderReadout() {
      readoutBox.replaceChildren(...def.readings(params).map((r) => {
        const item = el('div', 'reading');
        item.append(el('span', 'reading-label', tr(r.label)), el('span', 'reading-value', tr(r.value)));
        return item;
      }));
    }

    // Единая точка изменения параметра — и для регуляторов, и для перетаскивания на холсте.
    // Значение прижимается к шагу и границам регулятора, чтобы данные всегда были «как на приборе».
    function set(id, raw) {
      const c = def.controls.find((x) => x.id === id);
      const digits = (String(c.step).split('.')[1] ?? '').length;
      const snapped = Math.round((raw - c.min) / c.step) * c.step + c.min;
      const v = Number(Math.min(c.max, Math.max(c.min, snapped)).toFixed(digits));
      if (v === params[id]) return;
      params[id] = v;
      if (inputs.get(id)) inputs.get(id).value = v;
      if (values.get(id)) values.get(id).textContent = valueText(c, v);
      renderReadout();
      recordPoint();
      listeners.forEach((fn) => fn(params));
    }

    const view = def.create(canvasBox, params, set);
    // Экранный диктор называет сцену по названию опыта, а не «изображение»
    canvasBox.querySelector('svg')?.setAttribute('aria-label', tr(def.title));

    controlsBox.replaceChildren(...def.controls.filter((c) => !c.action).map((c) => {
      const row = el('label', 'control');
      const head = el('div', 'control-head');
      const value = el('b', '', valueText(c, params[c.id]));
      head.append(el('span', '', tr(c.label)), value);
      const input = Object.assign(document.createElement('input'), {
        type: 'range', min: c.min, max: c.max, step: c.step, value: params[c.id],
      });
      input.setAttribute('aria-label', tr(c.label));
      input.addEventListener('input', () => set(c.id, Number(input.value)));
      row.append(head, input);
      rows.set(c.id, row);
      inputs.set(c.id, input);
      values.set(c.id, value);
      return row;
    }));
    renderReadout();
    recordPoint();
    if (clearChartBtn) clearChartBtn.onclick = () => chart?.clear();

    current = {
      def,
      params,
      set,
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      // Подсветка регулятора, который нужно использовать на текущем шаге работы
      highlight(ids) {
        const list = [ids].flat();
        for (const [cid, row] of rows) row.classList.toggle('active', list.includes(cid));
      },
      destroy() {
        view.destroy();
        chart?.destroy();
        listeners.clear();
        controlsBox.replaceChildren();
        readoutBox.replaceChildren();
      },
    };
    return current;
  }

  return {
    mount,
    unmount() {
      current?.destroy();
      current = null;
    },
  };
}
