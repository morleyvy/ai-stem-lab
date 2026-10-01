// Кровь человека под микроскопом и определение группы крови.
// Часть 1. Окрашенный мазок крови на предметном столике микроскопа. Клетки препарата заданы один раз
// координатами в микрометрах (генератор с фиксированным зерном), поэтому число клеток в поле зрения
// не задаётся вручную, а считается: сколько клеток попало в круг поля зрения при данном увеличении.
// Плотность клеток в мазке взята из нормы: эритроцитов ≈ 5 млн, лейкоцитов ≈ 7 тыс., тромбоцитов
// ≈ 250 тыс. в 1 мм³ — то есть на один лейкоцит приходится ≈ 700 эритроцитов и ≈ 35 тромбоцитов.
// Часть 2. Определение группы крови по системе AB0 (модель): капли крови образца смешивают
// с сыворотками анти-A (агглютинин α) и анти-B (агглютинин β). Склеивание эритроцитов (агглютинация)
// показывает, какой агглютиноген (A или B) есть на эритроцитах, а по нему — группу крови.
// Иллюстрация установки — в svg/scenes/blood.js.

import { fmt } from './canvas.js';
import { bloodScene } from '../svg/scenes/blood.js';

// Окуляр ×10 с полем зрения 18 мм: диаметр поля в препарате = 18 мм / увеличение объектива
export const MAGS = [
  { total: 100, objective: 10, fov: 1800 },
  { total: 400, objective: 40, fov: 450 },
  { total: 1000, objective: 100, fov: 180 }, // иммерсионный объектив, с каплей масла
];
export const SLIDE_R = 900; // мкм — препарат генерируется на всё поле зрения при ×100

// Размеры клеток в мазке, мкм (по учебнику: эритроцит 7–8 мкм, лейкоциты 8–20 мкм, тромбоциты 2–4 мкм)
export const SIZE = { rbc: 7.5, neutrophil: 12, lymphocyte: 9, platelet: 2.6 };

// Эритроциты лежат в один слой с промежутками: шаг шестиугольной сетки 12,1 мкм даёт
// ≈ 7860 клеток на 1 мм² — в поле зрения ×1000 около 200 эритроцитов, как в тонкой части мазка
const RBC_STEP = 12.12;
const PLATELET_SHARE = 0.025; // доля промежутков между эритроцитами, где лежит тромбоцит (≈ 1 : 20 к эритроцитам)
const WBC_RANDOM = 26; // ещё 26 лейкоцитов по краям препарата (всего 28 на поле ×100: ≈ 1 на 700 эритроцитов)

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached = null;

// Клетки препарата: { rbc: [[x, y]...], wbc: [{ x, y, type }...], platelets: [[x, y]...] } в мкм от центра
export function smear() {
  if (cached) return cached;
  const rnd = rng(20240817);
  // Препарат уже отцентрован на нейтрофил: так делают перед переходом на большой объектив,
  // иначе при ×1000 в маленьком поле зрения лейкоцита почти никогда не видно.
  const wbc = [
    { x: 0, y: 0, type: 'neutrophil' },
    { x: 150, y: -95, type: 'lymphocyte' },
  ];
  for (let i = 0; i < WBC_RANDOM; i++) {
    const r = 240 + Math.sqrt(rnd()) * (SLIDE_R - 260);
    const a = rnd() * Math.PI * 2;
    wbc.push({ x: r * Math.cos(a), y: r * Math.sin(a), type: rnd() < 0.65 ? 'neutrophil' : 'lymphocyte' });
  }
  const nearWbc = (x, y, pad) => wbc.some((w) => Math.hypot(x - w.x, y - w.y) < SIZE[w.type] / 2 + pad);

  const rbc = [];
  const platelets = [];
  const dy = (RBC_STEP * Math.sqrt(3)) / 2;
  const rows = Math.ceil(SLIDE_R / dy) + 1;
  const cols = Math.ceil(SLIDE_R / RBC_STEP) + 1;
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      const gx = i * RBC_STEP + (j & 1 ? RBC_STEP / 2 : 0);
      const gy = j * dy;
      const x = gx + (rnd() - 0.5) * 4.4;
      const y = gy + (rnd() - 0.5) * 4.4;
      if (Math.hypot(x, y) <= SLIDE_R && !nearWbc(x, y, SIZE.rbc / 2 + 1)) rbc.push([x, y]);
      // Тромбоциты лежат в промежутках между эритроцитами (центр треугольника сетки)
      if (rnd() < PLATELET_SHARE * 2) {
        const px = gx + RBC_STEP / 2 + (rnd() - 0.5) * 2;
        const py = gy + (rnd() < 0.5 ? dy / 3 : -dy / 3) + (rnd() - 0.5) * 2;
        if (Math.hypot(px, py) <= SLIDE_R && !nearWbc(px, py, 2)) platelets.push([px, py]);
      }
    }
  }
  cached = { rbc, wbc, platelets };
  return cached;
}

const inside = (R) => ([x, y]) => x * x + y * y <= R * R;

// Сколько клеток каждого вида попадает в поле зрения при данном увеличении
export function counts(mag) {
  const R = MAGS[mag].fov / 2;
  const sm = smear();
  return {
    rbc: sm.rbc.filter(inside(R)).length,
    wbc: sm.wbc.filter((w) => inside(R)([w.x, w.y])).length,
    platelets: sm.platelets.filter(inside(R)).length,
  };
}

// ── Группы крови (система AB0) ──
// Образцы № 1–4 — «неизвестная» кровь; ученик определяет группу по агглютинации
export const SAMPLES = ['A', 'O', 'AB', 'B'];
export const GROUP_NAME = { O: 'I (0)', A: 'II (A)', B: 'III (B)', AB: 'IV (AB)' };
const antigens = (g) => (g === 'O' ? '' : g);

// Эритроциты склеиваются, если на них есть агглютиноген, против которого направлена сыворотка
export const agglutinates = (sample, serum) => antigens(SAMPLES[sample]).includes(serum);

const reaction = (p, serum) => (agglutinates(p.sample, serum) ? 'агглютинация' : 'нет агглютинации');

const magName = (m) => `×${MAGS[m].total}`;

// Итог пробы одной строкой: группа — когда добавлены обе сыворотки, иначе реакция с той, что уже есть
function groupValue(p) {
  if (p.antiA && p.antiB) return `№ ${p.sample + 1} — ${GROUP_NAME[SAMPLES[p.sample]]}`;
  if (p.antiA) return `анти-A: ${reaction(p, 'A')}`;
  if (p.antiB) return `анти-B: ${reaction(p, 'B')}`;
  return 'капните сыворотки';
}

export default {
  id: 'blood',
  subject: 'biology',
  title: 'Состав крови и группы крови',
  freeTitle: 'Кровь под микроскопом',
  freeSub: 'Эритроциты, лейкоциты, тромбоциты, группы крови',
  controls: [
    { id: 'mag', label: 'Увеличение микроскопа', min: 0, max: 2, step: 1, unit: '', value: 0, names: ['×100', '×400', '×1000'] },
    { id: 'sample', label: 'Образец крови', min: 0, max: 3, step: 1, unit: '', value: 0, names: ['№ 1', '№ 2', '№ 3', '№ 4'] },
    // Действия на сцене: мазок переносят на столик микроскопа, капельницы с сыворотками — к каплям крови
    { id: 'slide', label: 'Мазок крови', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['лежит на столе', 'на столике микроскопа'], action: true, actionLabel: 'Положить мазок крови на столик микроскопа' },
    { id: 'antiA', label: 'Сыворотка анти-A', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не добавлена', 'добавлена'], action: true, actionLabel: 'Капнуть сыворотку анти-A к левой капле крови' },
    { id: 'antiB', label: 'Сыворотка анти-B', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не добавлена', 'добавлена'], action: true, actionLabel: 'Капнуть сыворотку анти-B к правой капле крови' },
  ],
  formula: 'A + α или B + β → агглютинация',
  hint: 'Перетащите стекло под микроскоп и щёлкайте по объективам, потом перетащите капельницы к каплям крови.',
  theory: 'Кровь состоит из плазмы (около 55–60%) и форменных элементов: эритроцитов, лейкоцитов и тромбоцитов. Эритроциты — самые многочисленные клетки крови (4,5–5 млн в 1 мм³): двояковогнутые диски без ядра, заполненные гемоглобином, переносят кислород. Лейкоциты (6–8 тыс. в 1 мм³) крупнее, имеют ядро и защищают организм: фагоцитоз, иммунитет. Тромбоциты — мелкие безъядерные пластинки, участвуют в свёртывании крови. Группа крови по системе AB0 определяется агглютиногенами A и B на эритроцитах: I (0) — нет ни A, ни B; II (A); III (B); IV (AB). В плазме есть агглютинины α и β против отсутствующих агглютиногенов; при встрече A с α или B с β эритроциты склеиваются — агглютинация.',

  // Не больше четырёх строк: тромбоциты и диаметр поля остаются в журнале и в тексте шагов
  readings(p) {
    const out = [];
    if (!p.slide) {
      out.push({ label: 'Мазок крови', value: 'не на столике' });
    } else {
      const c = counts(p.mag);
      out.push(
        { label: 'Увеличение', value: magName(p.mag) },
        { label: 'Эритроцитов в поле', value: p.mag === 0 ? `≈ ${Math.round(c.rbc / 1000)} тыс.` : String(c.rbc) },
        { label: 'Лейкоцитов в поле', value: String(c.wbc) },
      );
    }
    out.push({ label: 'Группа крови', value: groupValue(p) });
    return out;
  },

  describe(p) {
    // В журнале записывается то, что ученик только что сделал: до сывороток — наблюдение в микроскоп
    if (!p.antiA && !p.antiB) {
      if (!p.slide) return 'Мазок крови не положен на столик — в поле зрения только свет';
      const c = counts(p.mag);
      if (p.mag === 0) return `При ×100 эритроциты мелкие и почти сливаются в розовый фон (≈ ${Math.round(c.rbc / 1000)} тыс. в поле зрения), лейкоциты видны как тёмные точки: ${c.wbc} в поле зрения`;
      return `При ${magName(p.mag)} в поле зрения эритроцитов — ${c.rbc}, лейкоцитов — ${c.wbc}, тромбоцитов — ${c.platelets}`;
    }
    const n = p.sample + 1;
    const a = reaction(p, 'A');
    const b = reaction(p, 'B');
    if (!(p.antiA && p.antiB)) return p.antiA ? `Образец № ${n}: с анти-A — ${a}; анти-B ещё не добавлена` : `Образец № ${n}: с анти-B — ${b}; анти-A ещё не добавлена`;
    return `Образец № ${n}: с анти-A — ${a}, с анти-B — ${b} → группа ${GROUP_NAME[SAMPLES[p.sample]]}`;
  },

  create(container, params, set) {
    return bloodScene(container, params, set, { smear, agglutinates, MAGS, SIZE });
  },
};
