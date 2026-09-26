// Свободный эксперимент: все реактивы на столе, ученик сам решает, что смешивать.
// ИИ-ассистент по описанию идеи составляет план, но опыт ученик проводит сам.

import { SUBSTANCES } from './data/substances.js';
import { SHELF, SHELF_BY_ID, shelfIdsFor } from './data/shelf.js';
import { rateFactor } from './engine.js';
import { isActive } from './bench.js';
import { parseLocally } from './localParser.js';

const SEE_LABELS = {
  gas: 'выделение газа', precipitate: 'выпадение осадка', color: 'изменение окраски', none: 'отсутствие видимых изменений',
};

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

export function createSandbox({ bench, lab, $, toast, postJson, explain }) {
  let plan = [];
  let explainToken = 0;

  bench.onChange(() => {
    if (active) render(null);
  });
  let active = false;

  async function handlePick(id) {
    if (bench.state.contents.includes(id)) return toast('Этот реактив уже в стакане.');

    const next = bench.preview(id);
    // Гипотезу спрашиваем только перед началом новой реакции.
    let guess = null;
    if ($('hypothesisMode').checked && next.status === 'reaction' && !isActive(bench.state.result)) {
      guess = await askHypothesis();
    }
    await bench.add(id);
    lab.highlight(plan.filter((p) => !bench.state.contents.includes(p)));
    render(guess);
  }

  function askHypothesis() {
    return new Promise((resolve) => {
      const box = $('predict');
      box.hidden = false;
      box.onclick = (e) => {
        const btn = e.target.closest('button[data-see]');
        if (!btn) return;
        box.hidden = true;
        box.onclick = null;
        resolve(btn.dataset.see);
      };
    });
  }

  function render(guess) {
    const { contents, result: r } = bench.state;
    $('contents').replaceChildren(...contents.map((id) => {
      const item = SHELF_BY_ID[id];
      return el('span', 'chip', item.kind === 'dish' ? item.label : `${item.label} ${item.note}`);
    }));

    const verdict = $('verdict');
    verdict.hidden = guess === null;
    if (guess !== null) {
      const right = guess === r.see;
      verdict.className = `verdict ${right ? 'good' : 'bad'}`;
      verdict.textContent = right
        ? 'Гипотеза подтвердилась.'
        : `Гипотеза не подтвердилась: наблюдается ${SEE_LABELS[r.see]}.`;
    }

    const reactants = r ? r.params.substances.filter((s) => s !== 'indicator_phph') : [];
    let title = 'Стакан пуст';
    let observations = [];
    if (r?.status === 'need_more') {
      title = 'Добавьте второй реактив';
    } else if (r?.status === 'not_modeled' && reactants.length > 2) {
      title = 'Слишком много реактивов';
      observations = ['Вымойте стакан и проведите опыт заново с двумя реактивами.'];
    } else if (r?.status === 'not_modeled') {
      title = r.title;
      observations = [r.why];
    } else if (r) {
      title = r.title;
      observations = r.observations;
    }

    $('resultTitle').textContent = title;
    $('equation').hidden = !r?.equation;
    $('equation').textContent = r?.equation ?? '';
    $('observations').replaceChildren(...observations.map((o) => el('li', '', o)));

    $('rate').hidden = !r?.rate;
    if (r?.rate) {
      const f = rateFactor(r.params.temperature, r.params.concentration);
      $('rate').textContent = `Скорость реакции: ×${f.toFixed(1)} относительно 20 °C (правило Вант-Гоффа: +10 °C — примерно ×2).`;
    }

    $('safety').hidden = !r?.safety;
    $('safety').textContent = r?.safety ?? '';

    explainToken++;
    $('explain').hidden = true;
    $('whyBtn').hidden = !(isActive(r) || r?.status === 'no_reaction');
  }

  async function onWhy() {
    const token = ++explainToken;
    $('whyBtn').hidden = true;
    $('explain').hidden = false;
    $('explanation').textContent = 'Формируется объяснение…';
    const text = await explain(bench.state.result);
    if (token === explainToken) $('explanation').textContent = text;
  }

  async function onAsk(e) {
    e.preventDefault();
    const text = $('prompt').value.trim();
    if (!text) return;
    const btn = $('askBtn');
    btn.disabled = true;
    btn.textContent = 'Составляется план…';

    const res = await postJson('/api/parse', { text });
    btn.disabled = false;
    btn.textContent = 'Составить план';

    let data = res.data;
    let offline = false;
    if (res.status === 400) return showPlan({ error: res.data.error ?? 'Проверьте запрос.' });
    if (!res.ok) {
      data = parseLocally(text);
      offline = true;
    }
    if (data.status === 'rejected') return showPlan({ error: data.reason || 'Такой опыт в лаборатории не проводится.' });
    if (data.status === 'unsupported' || !data.substances.length) {
      const unknown = data.unknown_substances?.length ? ` (${data.unknown_substances.join(', ')})` : '';
      return showPlan({ error: `Нужных реактивов нет в лаборатории${unknown}. ${data.reason || ''}` });
    }
    showPlan({ data, offline });
  }

  function showPlan({ data, offline, error }) {
    const box = $('plan');
    box.hidden = false;
    if (error) {
      plan = [];
      lab.highlight([]);
      box.replaceChildren(el('p', 'plan-error', error));
      return;
    }

    // Сначала растворы, затем индикатор, затем твёрдые вещества — как в реальном практикуме.
    const order = { bottle: 0, dropper: 1, dish: 2 };
    plan = shelfIdsFor(data.substances, data.concentration)
      .sort((a, b) => order[SHELF_BY_ID[a].kind] - order[SHELF_BY_ID[b].kind]);
    lab.highlight(plan.filter((id) => !bench.state.contents.includes(id)));

    const verbs = { bottle: 'Налейте', dropper: 'Добавьте', dish: 'Поместите в стакан' };
    const steps = plan.map((id) => {
      const item = SHELF_BY_ID[id];
      return `${verbs[item.kind]}: ${SUBSTANCES[item.substance].name}${item.concentration ? ' (конц.)' : ''}`;
    });
    if (data.temperature > 20) steps.push(`Нагрейте раствор до ${data.temperature} °C`);

    const ol = el('ol');
    ol.append(...steps.map((s) => el('li', '', s)));
    box.replaceChildren(
      el('p', 'plan-title', bench.state.contents.length ? 'План опыта (предварительно вымойте стакан):' : 'План опыта — реактивы отмечены на столе:'),
      ol,
    );
    if (offline) box.append(el('p', 'muted small', 'ИИ-ассистент недоступен — план составлен по ключевым словам.'));
  }

  $('ask').addEventListener('submit', onAsk);
  $('whyBtn').addEventListener('click', onWhy);

  return {
    handlePick,
    enter() {
      active = true;
      lab.setShelf(SHELF.map((s) => s.id));
      lab.highlight(plan);
      render(null);
    },
    leave() {
      active = false;
    },
  };
}
