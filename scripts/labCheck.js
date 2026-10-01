// Проверка работы на симуляции без браузера: структура, достижимость шагов, показания приборов
// во всех состояниях работы и полнота казахского перевода. Используется тестом tests/labs.test.js
// и командой node scripts/check-lab.mjs <id> при создании новой работы.

import CORE, { patterns as CORE_PATTERNS } from '../src/i18n/kk/content-core.js';
import CHEM, { patterns as CHEM_PATTERNS } from '../src/i18n/kk/content-chem.js';
import SIMS_KK, { patterns as SIM_PATTERNS } from '../src/i18n/kk/content-sims.js';
import ROADMAP_KK from '../src/i18n/kk/content-roadmap.js';

export const SUBJECT_IDS = ['chemistry', 'physics', 'biology', 'informatics'];
const STEP_TYPES = new Set(['set', 'hypothesis', 'question', 'conclusion']);

// Обозначения единиц в казахских учебниках те же, что в русских: строка из числа и единицы перевода не требует
const UNITS = ['А', 'мА', 'В', 'кВ', 'Ом', 'кОм', 'Вт', 'кВт', 'Н', 'кН', 'м', 'см', 'мм', 'км', 'с', 'мс', 'кг', 'г', 'мг', 'т',
  'Дж', 'кДж', 'Па', 'кПа', 'Гц', 'л', 'мл', 'моль', 'мин', 'К', 'Кл', 'Тл', 'Ф', 'Гн', 'эВ', 'МэВ', 'нм', 'мкм', 'бит', 'байт', 'Кбайт', 'Мбайт'];
const UNIT_RE = new RegExp(`(?<![\\p{L}])(${UNITS.sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])`, 'gu');
const CYRILLIC = /[А-Яа-яЁё]/;

export function needsTranslation(text) {
  if (typeof text !== 'string') return false;
  return CYRILLIC.test(text.replace(UNIT_RE, ''));
}

// Тот же порядок, что в src/i18n.js: точное совпадение, затем шаблоны
export function makeTranslator(extraDict = {}, extraPatterns = []) {
  const exact = new Map();
  for (const dict of [CORE, CHEM, SIMS_KK, ROADMAP_KK, extraDict]) for (const [ru, kk] of Object.entries(dict)) exact.set(ru, kk);
  const patterns = [...extraPatterns, ...CORE_PATTERNS, ...CHEM_PATTERNS, ...SIM_PATTERNS];
  return (text) => {
    if (exact.has(text)) return true;
    return patterns.some(([re]) => {
      re.lastIndex = 0;
      return re.test(text);
    });
  };
}

const bad = (v) => typeof v !== 'string' || !v.trim() || /undefined|NaN|Infinity|\[object/.test(v);

// Всё, что пройдёт через tr() при показе работы и свободного опыта
export function collectStrings(sim, lesson, states) {
  const out = new Set();
  const add = (v) => typeof v === 'string' && out.add(v);
  for (const k of ['title', 'short', 'topic', 'goal', 'equipment', 'safety', 'formulaLabel']) add(lesson[k]);
  for (const step of lesson.steps) {
    add(step.text); add(step.after); add(step.record); add(step.explain);
    step.options?.forEach((o) => add(o.text));
    step.points?.forEach(add);
  }
  for (const k of ['title', 'freeTitle', 'freeSub', 'hint', 'theory', 'formula']) add(sim[k]);
  for (const c of sim.controls) {
    add(c.label); add(c.unit); add(c.actionLabel);
    c.names?.forEach(add);
  }
  if (sim.chart) { add(sim.chart.xLabel); add(sim.chart.yLabel); }
  for (const p of states) {
    for (const r of sim.readings(p)) { add(r.label); add(r.value); }
    add(sim.describe(p));
    if (sim.chart) add(sim.chart.series(p));
  }
  return [...out];
}

export function checkLab({ sim, lesson, kk = null, kkPatterns = [], strict = false }) {
  const errors = [];
  const warn = [];
  const err = (m) => errors.push(m);

  // ---------- Модель опыта ----------
  if (!sim || typeof sim !== 'object') return { errors: ['src/sims/<id>.js: нет export default'], warn };
  for (const k of ['id', 'subject', 'title', 'freeTitle', 'freeSub', 'hint', 'theory', 'formula']) if (bad(sim[k])) err(`sim.${k}: пустое значение`);
  if (!SUBJECT_IDS.includes(sim.subject)) err(`sim.subject «${sim.subject}» — нет такого предмета`);
  for (const fn of ['readings', 'describe', 'create']) if (typeof sim[fn] !== 'function') err(`sim.${fn} должна быть функцией`);
  const controls = new Map();
  for (const c of sim.controls ?? []) {
    if (controls.has(c.id)) err(`регулятор ${c.id} повторяется`);
    controls.set(c.id, c);
    if (bad(c.label)) err(`регулятор ${c.id}: нет label`);
    if (!(c.max > c.min) || !(c.step > 0)) err(`регулятор ${c.id}: неверные min/max/step`);
    if (c.value < c.min || c.value > c.max) err(`регулятор ${c.id}: value вне диапазона`);
    if (typeof c.unit !== 'string') err(`регулятор ${c.id}: unit должен быть строкой (можно '')`);
    const count = Math.round((c.max - c.min) / c.step) + 1;
    if (c.names && c.names.length !== count) err(`регулятор ${c.id}: names — ${c.names.length} значений, а положений ${count}`);
    if (c.action && bad(c.actionLabel)) err(`регулятор ${c.id}: action без actionLabel`);
  }
  if (!controls.size) err('у модели нет регуляторов');
  if (sim.chart) {
    if (!controls.has(sim.chart.x)) err(`chart.x «${sim.chart.x}» — нет такого регулятора`);
    if (typeof sim.chart.y !== 'function' || typeof sim.chart.series !== 'function') err('chart.y и chart.series должны быть функциями');
  }
  if (errors.length) return { errors, warn };

  const onGrid = (c, v) => Math.abs((v - c.min) / c.step - Math.round((v - c.min) / c.step)) < 1e-6 && v >= c.min - 1e-9 && v <= c.max + 1e-9;

  // ---------- Работа ----------
  if (!lesson || typeof lesson !== 'object') return { errors: ['src/data/labs/<id>.js: нет export default'], warn };
  if (!/^[a-z0-9_-]{1,40}$/.test(lesson.id ?? '')) err(`lesson.id «${lesson.id}» — только a-z, 0-9, _ и -, до 40 символов`);
  if (lesson.sim !== sim.id) err(`lesson.sim «${lesson.sim}» не совпадает с sim.id «${sim.id}»`);
  if (lesson.subject !== sim.subject) err('lesson.subject не совпадает с sim.subject');
  if (![7, 8, 9, 10, 11].includes(lesson.grade)) err(`lesson.grade ${lesson.grade} — нужен класс 7–11`);
  for (const k of ['title', 'short', 'topic', 'goal', 'equipment', 'safety']) if (bad(lesson[k])) err(`lesson.${k}: пустое значение`);
  const params = Object.fromEntries([...controls.values()].map((c) => [c.id, c.value]));
  for (const [id, v] of Object.entries(lesson.initial ?? {})) {
    const c = controls.get(id);
    if (!c) err(`initial.${id} — нет такого регулятора`);
    else if (!onGrid(c, v)) err(`initial.${id} = ${v} — не на шкале регулятора`);
    else params[id] = v;
  }
  const steps = lesson.steps ?? [];
  if (steps.length < 6) err(`шагов ${steps.length} — слишком мало для работы`);
  if (steps.at(-1)?.type !== 'conclusion') err('последний шаг должен быть conclusion');
  const counts = { set: 0, hypothesis: 0, question: 0 };
  const states = [{ ...params }];
  steps.forEach((step, i) => {
    const at = `шаг ${i + 1} (${step.type})`;
    if (!STEP_TYPES.has(step.type)) return err(`${at}: тип не поддерживается в работе на симуляции`);
    counts[step.type] = (counts[step.type] ?? 0) + 1;
    if (step.type === 'set') {
      const targets = step.targets ?? { [step.param]: step.to };
      if (bad(step.text)) err(`${at}: нет text`);
      if (!step.after) warn.push(`${at}: нет after — наблюдение не покажется`);
      let changes = false;
      for (const [id, to] of Object.entries(targets)) {
        const c = controls.get(id);
        if (!c) { err(`${at}: регулятор «${id}» не найден`); continue; }
        if (!onGrid(c, to)) err(`${at}: значение ${id} = ${to} нельзя выставить регулятором (min ${c.min}, max ${c.max}, step ${c.step})`);
        if (params[id] !== to) changes = true;
        params[id] = to;
      }
      if (!changes) err(`${at}: регулятор уже стоит на нужном значении — шаг выполнится сам`);
      states.push({ ...params });
    }
    if (step.type === 'hypothesis' || step.type === 'question') {
      if (bad(step.text)) err(`${at}: нет text`);
      const opts = step.options ?? [];
      if (opts.length < 2) err(`${at}: меньше двух вариантов`);
      if (opts.filter((o) => o.ok).length !== 1) err(`${at}: верным должен быть ровно один вариант`);
      if (opts.some((o) => bad(o.text))) err(`${at}: пустой вариант`);
      if (step.type === 'question' && bad(step.explain)) err(`${at}: у вопроса нет explain`);
    }
    if (step.type === 'conclusion' && !(step.points?.length >= 2)) err(`${at}: в выводе меньше двух пунктов`);
  });
  if (counts.set < 3) err(`шагов-действий set: ${counts.set} — ученик должен сам провести опыт (нужно ≥ 3)`);
  if (counts.hypothesis < 1) err('нет ни одной гипотезы');
  if (counts.question < 1) err('нет ни одного контрольного вопроса');

  // ---------- Показания во всех состояниях работы ----------
  for (const p of states) {
    try {
      const rs = sim.readings(p);
      if (!Array.isArray(rs) || !rs.length) err(`readings(${JSON.stringify(p)}) — пустой список`);
      for (const r of rs ?? []) if (bad(r.label) || bad(r.value)) err(`readings(${JSON.stringify(p)}): плохое показание ${JSON.stringify(r)}`);
      if (bad(sim.describe(p))) err(`describe(${JSON.stringify(p)}) вернула пустую строку или NaN`);
      if (sim.chart) {
        const y = sim.chart.y(p);
        if (!Number.isFinite(y)) err(`chart.y(${JSON.stringify(p)}) = ${y}`);
      }
    } catch (e) {
      err(`readings/describe упали на ${JSON.stringify(p)}: ${e.message}`);
    }
  }

  // ---------- Ясность (для работ из src/data/labs) ----------
  // Ученики путались в первых версиях новых работ: длинные шаги с несколькими действиями,
  // подсказки на четыре строки, одни и те же числа в трёх местах. Пределы — по старым работам,
  // которые читались легко (pulse, ohm).
  if (strict) {
    const LIMITS = { steps: 10, sliders: 3, readings: 4, hint: 160, text: 240, after: 260, option: 90 };
    if (steps.length > LIMITS.steps) err(`шагов ${steps.length} — не больше ${LIMITS.steps}`);
    const sliders = [...controls.values()].filter((c) => !c.action).length;
    if (sliders > LIMITS.sliders) err(`регуляторов-ползунков ${sliders} — не больше ${LIMITS.sliders}`);
    if (sim.hint.length > LIMITS.hint) err(`подсказка ${sim.hint.length} символов — не больше ${LIMITS.hint}`);
    for (const p of states) {
      const n = sim.readings(p).length;
      if (n > LIMITS.readings) { err(`показаний ${n} — не больше ${LIMITS.readings}`); break; }
    }
    steps.forEach((step, i) => {
      if (step.text?.length > LIMITS.text) err(`шаг ${i + 1}: text ${step.text.length} символов — не больше ${LIMITS.text}`);
      if (step.after?.length > LIMITS.after) err(`шаг ${i + 1}: after ${step.after.length} символов — не больше ${LIMITS.after}`);
      for (const o of step.options ?? []) if (o.text.length > LIMITS.option) err(`шаг ${i + 1}: вариант длиннее ${LIMITS.option} символов`);
    });
  }

  // ---------- Казахский перевод ----------
  if (kk && !errors.length) {
    const translated = makeTranslator(kk, kkPatterns);
    const missing = collectStrings(sim, lesson, states).filter((s) => needsTranslation(s) && !translated(s));
    for (const s of missing) err(`нет казахского перевода: «${s}»`);
  }
  return { errors, warn };
}
