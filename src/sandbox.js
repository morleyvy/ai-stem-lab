// Свободный эксперимент: все реактивы на столе, ученик сам решает, что смешивать.
// ИИ-ассистент по описанию идеи составляет план, но опыт ученик проводит сам.

import { SUBSTANCES } from './data/substances.js';
import { SHELF, SHELF_BY_ID, shelfIdsFor } from './data/shelf.js';
import { rateFactor } from './engine.js';
import { isActive } from './bench.js';
import { parseLocally } from './localParser.js';
import { t, tr } from './i18n.js';

const SEE_LABELS = {
  gas: 'sb.seeGas', precipitate: 'sb.seePrecipitate', color: 'sb.seeColor', none: 'sb.seeNone',
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
    if (bench.state.contents.includes(id)) return toast(t('sb.already'));

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
      return el('span', 'chip', item.kind === 'dish' ? tr(item.label) : `${tr(item.label)} ${tr(item.note)}`);
    }));

    const verdict = $('verdict');
    verdict.hidden = guess === null;
    if (guess !== null) {
      const right = guess === r.see;
      verdict.className = `verdict ${right ? 'good' : 'bad'}`;
      verdict.textContent = right
        ? t('sb.hypOk')
        : t('sb.hypNo', { see: t(SEE_LABELS[r.see]) });
    }

    const reactants = r ? r.params.substances.filter((s) => s !== 'indicator_phph') : [];
    let title = t('work.emptyBeaker');
    let observations = [];
    if (r?.status === 'need_more') {
      title = t('sb.needMore');
    } else if (r?.status === 'not_modeled' && reactants.length > 2) {
      title = t('sb.tooMany');
      observations = [t('sb.tooManyNote')];
    } else if (r?.status === 'not_modeled') {
      title = tr(r.title);
      observations = [tr(r.why)];
    } else if (r) {
      title = tr(r.title);
      observations = r.observations.map(tr);
    }

    $('resultTitle').textContent = title;
    $('equation').hidden = !r?.equation;
    $('equation').textContent = tr(r?.equation) ?? '';
    $('observations').replaceChildren(...observations.map((o) => el('li', '', o)));

    $('rate').hidden = !r?.rate;
    if (r?.rate) {
      const f = rateFactor(r.params.temperature, r.params.concentration);
      $('rate').textContent = t('sb.rate', { f: f.toFixed(1) });
    }

    $('safety').hidden = !r?.safety;
    $('safety').textContent = tr(r?.safety) ?? '';

    explainToken++;
    $('explain').hidden = true;
    $('whyBtn').hidden = !(isActive(r) || r?.status === 'no_reaction');
  }

  async function onWhy() {
    const token = ++explainToken;
    $('whyBtn').hidden = true;
    $('explain').hidden = false;
    $('explanation').textContent = t('lesson.explaining');
    const text = await explain(bench.state.result);
    if (token === explainToken) $('explanation').textContent = text;
  }

  async function onAsk(e) {
    e.preventDefault();
    const text = $('prompt').value.trim();
    if (!text) return;
    const btn = $('askBtn');
    btn.disabled = true;
    btn.textContent = t('sb.planning');

    const res = await postJson('/api/parse', { text });
    btn.disabled = false;
    btn.textContent = t('work.makePlan');

    let data = res.data;
    let offline = false;
    if (res.status === 400) return showPlan({ error: res.data.error ?? t('sb.checkRequest') });
    if (!res.ok) {
      data = parseLocally(text);
      offline = true;
    }
    if (data.status === 'rejected') return showPlan({ error: tr(data.reason) || t('sb.rejected') });
    if (data.status === 'unsupported' || !data.substances.length) {
      const unknown = data.unknown_substances?.length ? ` (${data.unknown_substances.join(', ')})` : '';
      return showPlan({ error: t('sb.unsupported', { unknown, reason: tr(data.reason) || '' }) });
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

    const verbs = { bottle: t('sb.pour'), dropper: t('sb.drop'), dish: t('sb.put') };
    const steps = plan.map((id) => {
      const item = SHELF_BY_ID[id];
      return `${verbs[item.kind]}: ${tr(SUBSTANCES[item.substance].name)}${item.concentration ? t('sb.conc') : ''}`;
    });
    if (data.temperature > 20) steps.push(t('sb.heatTo', { t: data.temperature }));

    const ol = el('ol');
    ol.append(...steps.map((s) => el('li', '', s)));
    box.replaceChildren(
      el('p', 'plan-title', t(bench.state.contents.length ? 'sb.planWash' : 'sb.plan')),
      ol,
    );
    if (offline) box.append(el('p', 'muted small', t('sb.offline')));
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
