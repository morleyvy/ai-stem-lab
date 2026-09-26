// «Лабораторный стол»: что сейчас в стакане, температура и результат движка.
// Общий для урока и свободной лаборатории — они различаются только тем, кто решает, что можно взять.

import { SHELF_BY_ID } from './data/shelf.js';
import { runExperiment } from './engine.js';

export const isActive = (r) => Boolean(r) && (r.status === 'reaction' || r.status === 'indicator');

export function createBench(lab) {
  const state = { contents: [], temperature: 20, result: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  function paramsFor(ids, temperature) {
    const substances = [...new Set(ids.map((id) => SHELF_BY_ID[id].substance))];
    const concentrated = ids.some((id) => SHELF_BY_ID[id].concentration === 'concentrated');
    return { substances, temperature, concentration: concentrated ? 'concentrated' : 'dilute' };
  }

  function apply(result) {
    state.result = result;
    lab.setReaction(result);
    emit();
  }

  // Что получится, если добавить эту склянку, — нужно, чтобы спросить предсказание заранее.
  const preview = (id) => runExperiment(paramsFor([...state.contents, id], state.temperature));

  async function add(id) {
    const next = preview(id);
    const item = SHELF_BY_ID[id];
    const hasLiquid = state.contents.some((c) => SHELF_BY_ID[c].kind !== 'dish');
    // null = смесь не реагирует: цвет раствора в стакане не меняем.
    const colorAfter = isActive(next) || !hasLiquid ? next.visual.liquidStart : null;
    await lab.add(id, item.kind === 'dish' ? null : colorAfter);
    state.contents.push(id);
    apply(next);
    return next;
  }

  async function wash() {
    await lab.wash();
    state.contents = [];
    state.result = null;
    emit();
  }

  function setTemperature(t) {
    state.temperature = t;
    lab.setTemperature(t);
    if (state.contents.length) apply(runExperiment(paramsFor(state.contents, t)));
    else emit();
  }

  return {
    state,
    preview,
    add,
    wash,
    setTemperature,
    isBusy: () => lab.isBusy(),
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
