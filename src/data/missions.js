// Детективные миссии «неизвестное вещество»: шаблоны заданий и их проверка.
// Модуль без DOM: им пользуются и браузер (ход миссии, оценка), и сервер (/api/mission-check),
// поэтому все химические факты берутся только из движка — ни клиент, ни ИИ их не решают.
//
// Неизвестные вещества — это обычные склянки и чашки полки (SHELF), которые в миссии
// скрыты со стола: движок и анимация стола работают с ними как обычно, а ученик видит
// только «Пробирку A/B/C». Поэтому реактивы миссии никогда не пересекаются с кандидатами —
// иначе на столе стояла бы подписанная склянка с тем же веществом.

import { SUBSTANCES } from './substances.js';
import { SHELF_BY_ID } from './shelf.js';
import { rateFactor, runExperiment } from '../engine.js';

export const MAX_TESTS = 6;
export const MAX_REAGENTS = 3; // больше трёх склянок в стакане движок всё равно не моделирует
export const EXPLANATION_MAX = 400;
export const TUBE_NAMES = ['A', 'B', 'C'];
// Температуры, которые перебирает поиск решающих опытов: без нагрева и «нагреть» (как в разборе запросов).
const SEARCH_TEMPS = [20, 80];

// candidates — склянки полки с неизвестными веществами; при tubes = 1 в пробирке одно из них,
// иначе в пробирках все кандидаты в случайном порядке.
// level: 1 — лёгкая, 2 — средняя, 3 — сложная.
export const MISSIONS = [
  {
    id: 'acid-base',
    grade: 7,
    level: 1,
    tubes: 2,
    candidates: ['hcl', 'naoh'],
    reagents: ['phph', 'zn', 'cuso4'],
    title: { ru: 'Кислота или щёлочь?', kk: 'Қышқыл ма, сілті ме?' },
    task: {
      ru: 'В одной пробирке — соляная кислота, в другой — раствор щёлочи. Оба раствора бесцветные. Определите, где что.',
      kk: 'Бір сынауықта — тұз қышқылы, екіншісінде — сілті ерітіндісі. Екі ерітінді де түссіз. Қайсысы қайда екенін анықтаңыз.',
    },
  },
  {
    id: 'metal-one',
    grade: 8,
    level: 1,
    tubes: 1,
    candidates: ['zn', 'mg', 'cu'],
    reagents: ['hcl', 'cuso4'],
    title: { ru: 'Какой металл в чашке?', kk: 'Шыныаяқта қай металл?' },
    task: {
      ru: 'В чашке — гранулы одного металла: цинка, магния или меди. Определите металл опытом, а не по внешнему виду.',
      kk: 'Шыныаяқта бір металдың түйіршіктері бар: мырыш, магний немесе мыс. Металды сыртқы түріне қарап емес, тәжірибе арқылы анықтаңыз.',
    },
  },
  {
    id: 'chalk-metal',
    grade: 8,
    level: 1,
    tubes: 3,
    candidates: ['caco3', 'zn', 'cu'],
    reagents: ['hcl', 'naoh'],
    title: { ru: 'Мел, цинк или медь', kk: 'Бор, мырыш немесе мыс' },
    task: {
      ru: 'В трёх чашках — мел, цинк и медь. Определите, где что, по тому, какой газ выделяется или не выделяется вовсе.',
      kk: 'Үш шыныаяқта — бор, мырыш және мыс. Қандай газ бөлінетініне немесе мүлде бөлінбейтініне қарап, қайсысы қайда екенін анықтаңыз.',
    },
  },
  {
    id: 'acid-base-salt',
    grade: 8,
    level: 2,
    tubes: 3,
    candidates: ['hcl', 'naoh', 'cuso4'],
    reagents: ['phph', 'fe', 'caco3'],
    title: { ru: 'Кислота, щёлочь и соль', kk: 'Қышқыл, сілті және тұз' },
    task: {
      ru: 'Одна из пробирок — кислота, другая — щёлочь, третья — раствор соли меди. Определите, где что, и докажите каждое вещество опытом.',
      kk: 'Сынауықтардың бірінде — қышқыл, екіншісінде — сілті, үшіншісінде — мыс тұзының ерітіндісі. Қайсысы қайда екенін анықтап, әр затты тәжірибемен дәлелдеңіз.',
    },
  },
  {
    id: 'metals-three',
    grade: 8,
    level: 2,
    tubes: 3,
    candidates: ['fe', 'cu', 'zn'],
    reagents: ['hcl', 'cuso4'],
    title: { ru: 'Три металла', kk: 'Үш металл' },
    task: {
      ru: 'В трёх чашках — железо, медь и цинк. Используйте ряд активности металлов: определите, где какой металл.',
      kk: 'Үш шыныаяқта — темір, мыс және мырыш. Металдардың активтілік қатарын пайдаланып, қай металл қайда екенін анықтаңыз.',
    },
  },
  {
    id: 'two-acids',
    grade: 9,
    level: 2,
    tubes: 2,
    candidates: ['hcl', 'h2so4'],
    reagents: ['zn', 'caco3', 'phph'],
    title: { ru: 'Две кислоты', kk: 'Екі қышқыл' },
    task: {
      ru: 'В пробирках — разбавленные соляная и серная кислоты. Индикатор и металл их не различат. Найдите опыт, который различит.',
      kk: 'Сынауықтарда — сұйытылған тұз қышқылы мен күкірт қышқылы. Индикатор мен металл оларды ажыратпайды. Ажырататын тәжірибені табыңыз.',
    },
  },
  {
    id: 'acids-alkali',
    grade: 9,
    level: 3,
    tubes: 3,
    candidates: ['hcl', 'h2so4', 'naoh'],
    reagents: ['phph', 'caco3', 'cuso4'],
    title: { ru: 'Две кислоты и щёлочь', kk: 'Екі қышқыл және сілті' },
    task: {
      ru: 'Три бесцветных раствора: соляная кислота, серная кислота и гидроксид натрия. Спланируйте опыты так, чтобы уложиться в лимит.',
      kk: 'Үш түссіз ерітінді: тұз қышқылы, күкірт қышқылы және натрий гидроксиді. Шектеуден асырмай тәжірибелерді жоспарлаңыз.',
    },
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const tubesOf = (m) => TUBE_NAMES.slice(0, m.tubes);
// lesson_id в журнале результатов: ^[a-z0-9_-]{1,40}$ (миграция 003)
export const resultId = (m) => `mission-${m.id}`;

// Название варианта ответа. Своё, а не имя вещества: «Железо (гвоздь)» подсказывало бы ответ.
export const OPTION_NAMES = {
  hcl: { ru: 'Соляная кислота (HCl)', kk: 'Тұз қышқылы (HCl)' },
  h2so4: { ru: 'Серная кислота (H₂SO₄)', kk: 'Күкірт қышқылы (H₂SO₄)' },
  naoh: { ru: 'Гидроксид натрия — щёлочь (NaOH)', kk: 'Натрий гидроксиді — сілті (NaOH)' },
  cuso4: { ru: 'Сульфат меди — соль (CuSO₄)', kk: 'Мыс сульфаты — тұз (CuSO₄)' },
  zn: { ru: 'Цинк (Zn)', kk: 'Мырыш (Zn)' },
  mg: { ru: 'Магний (Mg)', kk: 'Магний (Mg)' },
  cu: { ru: 'Медь (Cu)', kk: 'Мыс (Cu)' },
  fe: { ru: 'Железо (Fe)', kk: 'Темір (Fe)' },
  caco3: { ru: 'Мел (CaCO₃)', kk: 'Бор (CaCO₃)' },
};

// Случайная раздача веществ по пробиркам. rand — для воспроизводимых тестов.
export function dealMission(m, rand = Math.random) {
  const pool = [...m.candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Object.fromEntries(tubesOf(m).map((tube, i) => [tube, pool[i]]));
}

// Все раздачи, возможные в этой миссии, — по ним ищем, что ученик мог доказать.
export function allAssignments(m) {
  const tubes = tubesOf(m);
  if (tubes.length === 1) return m.candidates.map((c) => ({ [tubes[0]]: c }));
  const out = [];
  const walk = (i, used, acc) => {
    if (i === tubes.length) return out.push({ ...acc });
    for (const c of m.candidates) {
      if (used.has(c)) continue;
      used.add(c);
      walk(i + 1, used, { ...acc, [tubes[i]]: c });
      used.delete(c);
    }
  };
  walk(0, new Set(), {});
  return out;
}

// Те же параметры опыта, что собирает стол (bench.js): проба из пробирки + реактивы.
export function testParams(sampleId, reagents, temperature) {
  const ids = [sampleId, ...reagents];
  const substances = [...new Set(ids.map((id) => SHELF_BY_ID[id].substance))];
  const concentrated = ids.some((id) => SHELF_BY_ID[id].concentration === 'concentrated');
  return { substances, temperature, concentration: concentrated ? 'concentrated' : 'dilute' };
}

const GAS_CODE = { 'H₂': 'h2', 'CO₂': 'co2', 'SO₂': 'so2' };
const PALE_GREEN = '#b5d99c';
const COLORLESS = '#b5d9f0';

// Код наблюдения: что можно увидеть глазом, без названий веществ. Два опыта различают
// вещества, только если их коды разные. Коды считаются из результата движка — клиенту не верим.
export function observationCode(r) {
  if (r.status === 'need_more') return 'sample';
  if (r.status === 'not_modeled') return 'not_modeled';
  if (r.status === 'no_reaction') return 'no_reaction';
  if (r.status === 'indicator') return r.see === 'color' ? 'crimson' : 'no_color';
  const v = r.visual;
  const parts = [];
  if (v.gas) {
    parts.push(`gas_${GAS_CODE[v.gas] ?? 'other'}`);
    if (v.bubbleDecay) parts.push('fades');
    // «Бурно» — свойство самой реакции (Mg), а не нагрева: делим скорость на вклад условий
    const baseRate = r.rate / rateFactor(r.params.temperature, r.params.concentration);
    if (baseRate >= 1) parts.push('vigorous');
  }
  if (v.precipitate) parts.push(v.precipitateEnd ? 'precipitate_black' : 'precipitate_blue');
  if (v.coating) parts.push('coating');
  if (v.liquidEnd === PALE_GREEN) parts.push('green');
  if (v.liquidStart !== COLORLESS && v.liquidEnd === COLORLESS) parts.push('decolorized');
  if (r.observations.some((o) => o.startsWith('Малиновая окраска'))) parts.push('crimson_fades');
  return parts.length ? parts.sort().join('+') : 'no_visible';
}

// Наблюдение, по которому можно делать вывод: реальная химия, а не «добавьте реактив» или «не моделируется».
export const isModeled = (code) => code !== 'sample' && code !== 'not_modeled';

export function runTest(assignment, test) {
  return runExperiment(testParams(assignment[test.tube], test.reagents, test.temperature));
}

const outcomeFor = (assignment, test) => observationCode(runTest(assignment, test));

// Все опыты, которые имеет смысл перебирать: один реактив или индикатор + реактив, без нагрева и с нагревом.
export function testSpace(m) {
  const combos = m.reagents.map((r) => [r]);
  if (m.reagents.includes('phph')) {
    for (const r of m.reagents) if (r !== 'phph') combos.push(['phph', r]);
  }
  const out = [];
  for (const tube of tubesOf(m)) {
    for (const reagents of combos) for (const temperature of SEARCH_TEMPS) out.push({ tube, reagents, temperature });
  }
  return out;
}

// Разбить раздачи по исходу опыта. null — опыт хотя бы для одной раздачи даёт «не моделируется»:
// такие опыты не считаем доказательством, чтобы решение опиралось только на реальную химию.
export function splitBy(assignments, test) {
  const groups = new Map();
  for (const a of assignments) {
    const code = outcomeFor(a, test);
    if (!isModeled(code)) return null;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(a);
  }
  return groups;
}

// Минимальное число опытов, за которое можно гарантированно определить раздачу (минимакс).
// Используется тестами для доказательства, что каждая миссия решаема в пределах лимита.
export function minTestsToSolve(m, limit = MAX_TESTS) {
  const space = testSpace(m);
  const memo = new Map();
  const key = (set) => set.map((a) => JSON.stringify(a)).sort().join('|');
  function solve(set, depth) {
    if (set.length <= 1) return 0;
    if (depth === 0) return Infinity;
    const k = `${key(set)}#${depth}`;
    if (memo.has(k)) return memo.get(k);
    let best = Infinity;
    for (const test of space) {
      const groups = splitBy(set, test);
      if (!groups || groups.size < 2) continue;
      let worst = 0;
      for (const g of groups.values()) {
        worst = Math.max(worst, 1 + solve(g, Math.min(depth - 1, best - 2)));
        if (worst >= best) break;
      }
      best = Math.min(best, worst);
    }
    memo.set(k, best);
    return best;
  }
  return solve(allAssignments(m), limit);
}

// Тот же опыт с другой температурой подсказкой не считаем: он почти ничего не добавляет
const sameMix = (a, b) => a.tube === b.tube && [...a.reagents].sort().join() === [...b.reagents].sort().join();

// Опыт, который отличил бы truth от другой возможной раздачи, — подсказка «что ещё стоило проверить».
function confirmingTest(m, truth, others, done) {
  let best = null;
  for (const test of testSpace(m)) {
    if (done.some((d) => sameMix(d, test))) continue;
    const mine = outcomeFor(truth, test);
    if (!isModeled(mine)) continue;
    const beaten = others.filter((o) => {
      const code = outcomeFor(o, test);
      return isModeled(code) && code !== mine;
    }).length;
    if (!beaten) continue;
    // Опыт, чей исход бывает только у настоящего вещества этой пробирки, подтверждает его «в одиночку» —
    // такой совет полезнее, чем опыт, который лишь сужает выбор
    const unique = m.candidates.every((c) => c === truth[test.tube]
      || observationCode(runExperiment(testParams(c, test.reagents, test.temperature))) !== mine);
    // Дальше — сколько вариантов опыт опровергает; при равенстве — пробирка, которую ещё не проверяли.
    // Без нагрева опыт проще, поэтому при полном равенстве остаётся 20 °C (они раньше в testSpace)
    const score = (unique ? 1000 : 0) + beaten * 10 + (done.some((d) => d.tube === test.tube) ? 0 : 1);
    if (score > (best?.score ?? 0)) best = { test, score };
  }
  return best?.test ?? null;
}

// Разбор миссии по фактам движка. tests — опыты ученика (проба, реактивы, температура);
// наблюдения пересчитываются здесь, присланные клиентом коды не используются.
export function analyzeMission(m, assignment, tests, answers) {
  const all = allAssignments(m);
  const rows = tests.map((test) => {
    const result = runTest(assignment, test);
    const code = observationCode(result);
    // Решающий — опыт, чей исход был бы другим хотя бы при одном другом веществе в этой пробирке
    const decisive = isModeled(code) && m.candidates.some((c) => {
      if (c === assignment[test.tube]) return false;
      const alt = observationCode(runExperiment(testParams(c, test.reagents, test.temperature)));
      return isModeled(alt) && alt !== code;
    });
    return { ...test, result, code, decisive };
  });
  // Раздачи, которые не противоречат ни одному наблюдению ученика
  const consistent = all.filter((a) => rows.every((row) => outcomeFor(a, row) === row.code));
  const tubes = tubesOf(m);
  const perTube = tubes.map((tube) => ({
    tube,
    truth: assignment[tube],
    answer: answers[tube] ?? null,
    ok: answers[tube] === assignment[tube],
    // Доказано, если все непротиворечащие раздачи сходятся на этой пробирке
    proved: consistent.every((a) => a[tube] === assignment[tube]),
  }));
  const correct = perTube.filter((p) => p.ok).length;
  // Подсказка «какой опыт ещё стоило провести»: если ученик ошибся — опыт, опровергающий
  // именно его ответ; иначе — отсекающий раздачи, которые его опыты ещё не исключили (или любые другие).
  const isTruth = (a) => tubes.every((tube) => a[tube] === assignment[tube]);
  const studentPick = all.find((a) => tubes.every((tube) => a[tube] === answers[tube]));
  const open = consistent.filter((a) => !isTruth(a));
  const rivals = correct < tubes.length && studentPick ? [studentPick]
    : open.length ? open : all.filter((a) => !isTruth(a));
  const extra = confirmingTest(m, assignment, rivals, tests);
  return {
    rows,
    perTube,
    correct,
    total: tubes.length,
    evidenceComplete: consistent.length === 1,
    decisiveCount: rows.filter((r) => r.decisive).length,
    extra,
  };
}

// Баллы в журнал результатов. q_* — верно определённые пробирки: это и есть «ответы» миссии.
// hyp_* — «вывод доказан опытами»: 1/1, если проведённые опыты однозначно определяют раздачу
// и ответ верный. Это ближе всего к смыслу «гипотеза подтверждена опытом» в лабораторных работах,
// а экономию опытов показываем на экране, не смешивая её с доказанностью в журнале.
export function missionStats(a) {
  return {
    qOk: a.correct,
    qTotal: a.total,
    hypOk: a.evidenceComplete && a.correct === a.total ? 1 : 0,
    hypTotal: 1,
  };
}

// Очки на экране результата: верные ответы, бонус за решающий опыт и за сэкономленные опыты.
// От ИИ не зависят — отзыв модели на баллы не влияет.
export function missionScore(a, testsUsed) {
  const base = a.correct * 10;
  const decisive = a.decisiveCount > 0 ? 5 : 0;
  const saved = a.correct === a.total ? Math.max(0, MAX_TESTS - testsUsed) * 2 : 0;
  return { base, decisive, saved, total: base + decisive + saved, max: a.total * 10 + 5 + (MAX_TESTS - 1) * 2 };
}

export const substanceName = (shelfId) => SUBSTANCES[SHELF_BY_ID[shelfId].substance].name;
