// Условия прорастания семян. В чашке Петри на фильтровальной бумаге лежат 20 семян фасоли или пшеницы.
// Семя прорастает, только когда есть вода (набухание), воздух (дыхание зародыша) и тепло.
// Скорость прорастания задаёт «сумма тепла»: за сутки зародыш продвигается тем дальше, чем выше
// температура над минимальной (у фасоли ≈ 10 °C, у пшеницы ≈ 1 °C — как в учебнике), до оптимума;
// выше оптимума развитие тормозится, у максимума прекращается. Семена в партии неодинаковы:
// каждому нужна своя сумма тепла (логнормальный разброс), а часть семян невсхожая.
// Под слоем воды зародышу не хватает кислорода — семена набухают, но не прорастают.
// Иллюстрация установки — в svg/scenes/plant-reproduction.js.

import { fmt } from './canvas.js';
import { plantReproductionScene } from '../svg/scenes/plant-reproduction.js';

export const N = 20; // семян в чашке Петри

// Tb — минимальная температура прорастания, To — оптимальная, Tm — максимальная (°C);
// sum50 — сумма тепла (°C·сут), за которую прорастает половина всхожих семян;
// spread — разброс семян по этой сумме; dead — номера невсхожих семян (всхожесть 95% и 90%)
export const SPECIES = [
  { name: 'фасоль', gen: 'фасоли', Tb: 10, To: 30, Tm: 40, sum50: 40, spread: 0.2, dead: [13] },
  { name: 'пшеница', gen: 'пшеницы', Tb: 1, To: 25, Tm: 35, sum50: 25, spread: 0.25, dead: [6, 15] },
];

// Обратная функция нормального распределения (приближение Акклама, точность ~1e-9):
// нужна, чтобы раздать семенам «типичные» значения разброса без случайных чисел
function probit(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771720, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(p, 1 - p);
  let x;
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
    return p < 0.5 ? x : -x;
  }
  const r = (p - 0.5) ** 2;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * (p - 0.5)) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Сумма тепла, нужная каждому семени (Infinity — невсхожее). Порядок перемешан фиксированно,
// чтобы первые проростки появлялись в разных местах чашки, а не подряд в одном ряду.
export function seedNeeds(seed) {
  const sp = SPECIES[seed];
  const alive = Array.from({ length: N }, (_, i) => i).filter((i) => !sp.dead.includes(i));
  const order = alive.map((i) => [i, (i * 7 + 3) % N]).sort((u, v) => u[1] - v[1]).map(([i]) => i);
  const needs = new Array(N).fill(Infinity);
  order.forEach((i, k) => {
    needs[i] = sp.sum50 * Math.exp(sp.spread * probit((k + 0.5) / order.length));
  });
  return needs;
}
const NEEDS = [seedNeeds(0), seedNeeds(1)];

// Скорость накопления тепла, °C·сут за сутки: от минимума до оптимума растёт, к максимуму падает до нуля
export function heatRate(seed, T) {
  const { Tb, To, Tm } = SPECIES[seed];
  if (T <= Tb || T >= Tm) return 0;
  return T <= To ? T - Tb : ((To - Tb) * (Tm - T)) / (Tm - To);
}

// Могут ли семена прорастать при этих условиях: вода есть, воздух есть, температура подходит
const canGrow = (p) => p.water === 1 && heatRate(p.seed, p.T) > 0;

// Насколько продвинулось развитие каждого проростка (в долях sum50; < 0 — семя ещё не проросло)
export function development(p, days = p.days) {
  const sp = SPECIES[p.seed];
  const sum = canGrow(p) ? heatRate(p.seed, p.T) * days : 0;
  return NEEDS[p.seed].map((need) => (need === Infinity || !canGrow(p) ? -1 : (sum - need) / sp.sum50));
}

export const sprouted = (p, days = p.days) => development(p, days).filter((v) => v >= 0).length;

// Через сколько суток проросла бы половина всех семян (10 из 20); Infinity — не прорастут
export function halfTime(p) {
  if (!canGrow(p)) return Infinity;
  const sorted = NEEDS[p.seed].filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[N / 2 - 1] / heatRate(p.seed, p.T);
}

// Стадия проростка по развитию: те же пороги рисует сцена
export function stageOf(seed, dev) {
  if (dev < 0) return null;
  if (dev < 0.5) return seed ? 'появились корешки' : 'появился корешок';
  if (dev < 1.5) return seed ? 'корешки и росток' : 'корешок и стебелёк';
  if (seed) return 'появился первый лист';
  return dev < 2.5 ? 'семядоли поднялись над бумагой' : 'раскрылись первые листья';
}

const WATER = ['нет, бумага сухая', 'бумага влажная', 'семена залиты водой'];

function seedState(p) {
  if (p.water === 0) return 'сухие, в состоянии покоя';
  if (p.days === 0) return 'только что смочены';
  if (p.water === 2) return 'набухли, без воздуха не прорастают';
  const n = sprouted(p);
  if (n === 0) return heatRate(p.seed, p.T) > 0 ? 'набухли, ещё не проросли' : p.T >= SPECIES[p.seed].Tm ? 'набухли, слишком жарко' : 'набухли, слишком холодно';
  return n === N - SPECIES[p.seed].dead.length ? 'проросли все всхожие семена' : 'набухли, часть проросла';
}

export default {
  id: 'plant-reproduction',
  subject: 'biology',
  title: 'Прорастание семян',
  freeTitle: 'Прорастание семян',
  freeSub: 'Вода, воздух, тепло и всхожесть',
  controls: [
    { id: 'T', label: 'Температура в термостате', min: 0, max: 40, step: 1, unit: '°C', value: 22 },
    { id: 'days', label: 'Прошло суток', min: 0, max: 14, step: 1, unit: 'сут', value: 0 },
    // Действия на сцене: пакет с семенами выбирают щелчком, воду наливают промывалкой или из стакана
    { id: 'seed', label: 'Семена', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['фасоль', 'пшеница'], action: true, actionLabel: 'Высыпать в чашку семена из другого пакета' },
    { id: 'water', label: 'Вода в чашке', min: 0, max: 2, step: 1, unit: '', value: 0, names: WATER, action: true, actionLabel: 'Налить воду в чашку Петри' },
  ],
  formula: 'всхожесть = проросшие семена : все семена · 100%',
  hint: 'Перетащите промывалку или стакан с водой к чашке Петри, щёлкните по пакету с семенами, ручку термостата ведите мышью.',
  chart: { x: 'T', y: (p) => Math.round((sprouted(p) / N) * 100), xLabel: 'T, °C', yLabel: 'всхожесть, %', series: (p) => (p.water === 1 ? `${SPECIES[p.seed].name}, ${p.days} сут` : `${SPECIES[p.seed].name}: ${p.water ? 'под водой' : 'сухие'}`) },
  theory: 'Семя прорастает, когда зародыш выходит из состояния покоя. Для этого нужны вода, воздух и тепло. Вода нужна, чтобы семя набухло и запасные вещества растворились; воздух (кислород) — для дыхания зародыша; тепло — чтобы шли процессы жизнедеятельности. Холодостойкие растения (пшеница, рожь) прорастают уже при 1–2 °C, теплолюбивые (фасоль, кукуруза) — не ниже 10–12 °C. Первым из семени выходит корешок, затем стебелёк с семядолями или почечкой. Всхожесть — доля проросших семян в процентах.',

  readings(p) {
    const n = sprouted(p);
    const t = halfTime(p);
    // Стадию самого развитого проростка показывает плакат на сцене, воду — сама чашка
    return [
      { label: 'Проросло семян', value: `${n} из ${N}` },
      { label: 'Всхожесть', value: `${Math.round((n / N) * 100)}%` },
      { label: 'Половина прорастёт за', value: t === Infinity ? 'не прорастают' : `≈ ${fmt(t, 1)} сут` },
      { label: 'Состояние семян', value: seedState(p) },
    ];
  },

  describe(p) {
    const gen = SPECIES[p.seed].gen;
    if (p.days === 0) return `Опыт заложен: 20 семян ${gen} в чашке Петри при ${p.T} °C`;
    if (p.water === 0) return `Через ${p.days} сут при ${p.T} °C сухие семена ${gen} не проросли: без воды семя остаётся в покое`;
    if (p.water === 2) return `Через ${p.days} сут при ${p.T} °C семена ${gen} под водой набухли, но не проросли: зародышу не хватает воздуха`;
    const n = sprouted(p);
    if (n === 0) {
      if (heatRate(p.seed, p.T) === 0) return `Через ${p.days} сут при ${p.T} °C семена ${gen} набухли, но не проросли: ${p.T >= SPECIES[p.seed].Tm ? 'слишком жарко' : 'слишком холодно'}`;
      return `Через ${p.days} сут при ${p.T} °C семена ${gen} набухли, но ещё не проросли`;
    }
    return `Через ${p.days} сут при ${p.T} °C на влажной бумаге проросло ${n} из 20 семян ${gen} (${Math.round((n / N) * 100)}%)`;
  },

  create(container, params, set) {
    return plantReproductionScene(container, params, set, { development, stageOf, N });
  },
};
