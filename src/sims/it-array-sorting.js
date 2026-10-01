// Сортировка и поиск в массиве: пузырьковая сортировка и сортировка выбором, линейный и бинарный поиск.
// Массив — первые n чисел из постоянного набора POOL, поэтому опыт повторяем: при n = 8 и n = 16 ученик
// получает одни и те же счётчики, что и в тексте работы. Все счётчики (сравнения, перестановки, проверки)
// считает трассировка trace() — та же, что анимирует сцену, — ничего не задано вручную.
// Обе сортировки сделаны «как в учебнике», без досрочного выхода: число сравнений всегда n(n − 1)/2,
// а перестановок у пузырька столько, сколько пар стоит не по порядку. Поиск идёт в уже отсортированном
// массиве: бинарному поиску это необходимо, а линейному не мешает и делает сравнение честным.
// Иллюстрация — в svg/scenes/it-array-sorting.js.

import { itArraySortingScene } from '../svg/scenes/it-array-sorting.js';

// Различные двузначные числа; наибольшее (91) стоит среди первых восьми — при удвоении массива
// с 8 до 16 оно остаётся наибольшим, и поиск «самого дальнего» числа сравним при обоих n
export const POOL = [47, 15, 82, 33, 91, 26, 64, 58, 12, 75, 39, 88, 21, 53, 70, 44];

export const ALGOS = ['Пузырьковая сортировка', 'Сортировка выбором', 'Линейный поиск', 'Бинарный поиск'];
export const isSearch = (p) => p.algo >= 2;

// Исходный массив: для сортировки — как есть, для поиска — уже упорядоченный по возрастанию
export const arrayOf = (p) => {
  const a = POOL.slice(0, p.n);
  return isSearch(p) ? a.sort((x, y) => x - y) : a;
};

// Python-код алгоритмов строка к строке; номера строк в событиях трассировки ссылаются на них
export const CODE = [
  [
    'for i in range(n - 1):',
    '    for j in range(n - 1 - i):',
    '        if a[j] > a[j + 1]:',
    '            a[j], a[j + 1] = a[j + 1], a[j]',
    'print(a)',
  ],
  [
    'for i in range(n - 1):',
    '    m = i',
    '    for j in range(i + 1, n):',
    '        if a[j] < a[m]:',
    '            m = j',
    '    if m != i:',
    '        a[i], a[m] = a[m], a[i]',
    'print(a)',
  ],
  [
    'k = -1',
    'for i in range(n):',
    '    if a[i] == x:',
    '        k = i',
    '        break',
    'print(k)',
  ],
  [
    'lo, hi, k = 0, n - 1, -1',
    'while lo <= hi:',
    '    mid = (lo + hi) // 2',
    '    if a[mid] == x:',
    '        k = mid',
    '        break',
    '    elif a[mid] < x:',
    '        lo = mid + 1',
    '    else:',
    '        hi = mid - 1',
    'print(k)',
  ],
];

// Пошаговое выполнение выбранного алгоритма. Каждое событие — одно сравнение (или одна перестановка
// у сортировки выбором) с состоянием массива после него: сцена проигрывает события по очереди.
//   arr — массив после события, marks — указатели [имя, индекс], pair — сравниваемые/меняемые индексы,
//   swap — была ли перестановка, check/line — проверяемая и выполненная строки кода,
//   done — границы уже упорядоченной части [от, до), lo/hi — окно бинарного поиска.
export function trace(p) {
  const a = arrayOf(p);
  const n = a.length;
  const events = [];
  let cmp = 0;
  let swaps = 0;

  if (p.algo === 0) {
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1 - i; j++) {
        cmp++;
        const swap = a[j] > a[j + 1];
        if (swap) {
          [a[j], a[j + 1]] = [a[j + 1], a[j]];
          swaps++;
        }
        // Последнее сравнение прохода ставит на место ещё один элемент в конце массива
        const from = j === n - 2 - i ? n - 1 - i : n - i;
        events.push({ arr: a.slice(), marks: [['j', j], ['j+1', j + 1]], pair: [j, j + 1], swap, check: 2, line: swap ? 3 : 2, cmp, swaps, done: [from === 1 ? 0 : from, n] });
      }
    }
    return { events, cmp, swaps, arr: a, n };
  }

  if (p.algo === 1) {
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) {
        cmp++;
        const prev = m;
        if (a[j] < a[m]) m = j;
        events.push({ arr: a.slice(), marks: [['i', i], ['j', j], ['m', m]], pair: [j, prev], swap: false, check: 3, line: m === j ? 4 : 3, cmp, swaps, done: [0, i] });
      }
      if (m !== i) {
        [a[i], a[m]] = [a[m], a[i]];
        swaps++;
        events.push({ arr: a.slice(), marks: [['i', i], ['m', m]], pair: [i, m], swap: true, check: 5, line: 6, cmp, swaps, done: [0, i + 1] });
      }
    }
    return { events, cmp, swaps, arr: a, n };
  }

  // Поиск: проверка — сравнение одного элемента массива с искомым числом x
  const x = p.key;
  let k = -1;
  if (p.algo === 2) {
    for (let i = 0; i < n; i++) {
      cmp++;
      const hit = a[i] === x;
      events.push({ arr: a, marks: [['i', i]], pair: [i], hit, check: 2, line: hit ? 3 : 2, cmp, lo: i, hi: n - 1 });
      if (hit) {
        k = i;
        break;
      }
    }
  } else {
    let lo = 0;
    let hi = n - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      cmp++;
      const hit = a[mid] === x;
      events.push({ arr: a, marks: [['lo', lo], ['mid', mid], ['hi', hi]], pair: [mid], hit, check: 3, line: hit ? 4 : a[mid] < x ? 7 : 9, cmp, lo, hi });
      if (hit) {
        k = mid;
        break;
      }
      if (a[mid] < x) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return { events, cmp, swaps: 0, arr: a, n, k };
}

const list = (a) => `[${a.join(', ')}]`;

export default {
  id: 'it-array-sorting',
  freeTitle: 'Сортировка и поиск',
  freeSub: 'Пузырёк, выбор, линейный и бинарный поиск',
  subject: 'informatics',
  title: 'Сортировка и поиск в массиве',
  controls: [
    { id: 'algo', label: 'Алгоритм', min: 0, max: 3, step: 1, unit: '', value: 0, names: ALGOS, action: true, actionLabel: 'Выбрать алгоритм на вкладке редактора' },
    { id: 'run', label: 'Выполнение', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['программа не запущена', 'программа запущена'], action: true, actionLabel: 'Нажать кнопку «Пуск» в редакторе' },
    { id: 'key', label: 'Искомое число x', min: 10, max: 99, step: 1, unit: '', value: 47, action: true, actionLabel: 'Щёлкнуть столбик с искомым числом' },
    { id: 'n', label: 'Длина массива n', min: 4, max: 16, step: 1, unit: '', value: 8 },
    { id: 'speed', label: 'Скорость показа', min: 1, max: 30, step: 1, unit: 'шагов/с', value: 12 },
  ],
  formula: 'сравнений в сортировке = n(n − 1)/2; проверок в бинарном поиске ≤ ⌊log₂ n⌋ + 1',
  chart: {
    x: 'n',
    y: (p) => trace(p).cmp,
    xLabel: 'длина массива n',
    yLabel: 'сравнений (проверок)',
    series: (p) => (isSearch(p) ? `${ALGOS[p.algo]}, x = ${p.key}` : ALGOS[p.algo]),
  },
  hint: 'Выберите вкладку алгоритма и нажмите «Пуск». В поиске щёлкните столбик, чтобы выбрать число x.',
  theory: 'Массив (в Python — список) — упорядоченный набор элементов, к каждому обращаются по индексу: a[0], a[1], … Сортировка пузырьком сравнивает соседние элементы и меняет их местами, если они стоят не по порядку; за каждый проход наибольший элемент «всплывает» в конец. Сортировка выбором на каждом шаге находит наименьший элемент неотсортированной части и ставит его в начало. Обе сортировки делают n(n − 1)/2 сравнений: при удвоении длины массива сравнений становится примерно в 4 раза больше. Линейный поиск просматривает элементы по порядку и в худшем случае проверяет все n. Бинарный поиск работает только в отсортированном массиве: он сравнивает x со средним элементом и отбрасывает половину массива, поэтому делает не больше ⌊log₂ n⌋ + 1 проверок — при удвоении массива всего на одну больше.',

  // Не больше четырёх показаний: название алгоритма и так видно на вкладке редактора, n(n − 1)/2 —
  // в формуле, а массив на экране сцены нужен только сортировке (при поиске он уже упорядочен)
  readings(p) {
    const len = { label: 'Длина массива n', value: String(p.n) };
    if (!isSearch(p)) {
      if (!p.run) return [len, { label: 'Результат', value: 'сортировка не запущена' }, { label: 'Массив a', value: list(arrayOf(p)) }];
      const r = trace(p);
      return [len,
        { label: 'Сравнений', value: String(r.cmp) },
        { label: 'Перестановок', value: String(r.swaps) },
        { label: 'Массив a', value: list(r.arr) }];
    }
    const head = [len, { label: 'Искомое число x', value: String(p.key) }];
    if (!p.run) return [...head, { label: 'Результат', value: 'поиск не запущен' }];
    const r = trace(p);
    return [...head,
      { label: 'Проверок', value: String(r.cmp) },
      { label: 'Результат', value: r.k >= 0 ? `найдено, индекс ${r.k}` : 'числа нет в массиве' }];
  },

  describe(p) {
    const name = ALGOS[p.algo];
    if (!p.run) return `${name}: программа не запущена, длина массива n = ${p.n}`;
    const r = trace(p);
    if (!isSearch(p)) return `${name} массива из ${p.n} чисел: сравнений — ${r.cmp}, перестановок — ${r.swaps}`;
    return r.k >= 0
      ? `${name} числа ${p.key} в массиве из ${p.n} чисел: проверок — ${r.cmp}, найдено, индекс ${r.k}`
      : `${name} числа ${p.key} в массиве из ${p.n} чисел: проверок — ${r.cmp}, числа нет в массиве`;
  },

  create(container, params, set) {
    return itArraySortingScene(container, params, set, { CODE, ALGOS, trace, arrayOf, isSearch, POOL });
  },
};
