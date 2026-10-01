// Робот-закрасчик в коридоре: три программы на Python с циклами — for i in range(N), while с
// условием «справа свободно» и вложенный for. Программа выполняется по шагам: один шаг — одна
// проверка условия цикла и, если оно True, одно выполнение тела. Из этих шагов складывается
// трассировочная таблица (шаг, переменные, условие, закрашено клеток). Всё, что видит ученик,
// считает интерпретатор ниже по длине коридора — числа в работе не заданы вручную.
// Иллюстрация — в svg/scenes/it-loop-trace.js.

import { itLoopScene } from '../svg/scenes/it-loop-trace.js';

// Поле: столбец 0 — старт, клетки коридора 1 … L, за ними стена. Строк 4: вложенный цикл
// закрашивает R строк, а последний robot.down() уводит робота на строку ниже, поэтому R ≤ 3.
export const ROWS = 4;
export const COLS = 11; // старт + коридор до 10 клеток

// Шаг t = 99 — «Пуск»: программа выполнена до конца, сколько бы шагов в ней ни было
export const RUN = 99;

export const PROG_NAMES = ['цикл for', 'цикл while', 'вложенный цикл'];

// Строки программы; номера строк нужны сцене, чтобы подсветить проверяемое условие и тело
export function code(p) {
  if (p.prog === 0) return [`for i in range(${p.N}):`, '    robot.right()', '    robot.paint()'];
  if (p.prog === 1) return ['k = 0', 'while robot.free_right():', '    robot.right()', '    robot.paint()', '    k = k + 1', 'print(k)'];
  return [`for row in range(${p.R}):`, `    for i in range(${p.N}):`, '        robot.right()', '        robot.paint()', `    robot.left(${p.N})`, '    robot.down()'];
}

// Полное выполнение программы — список шагов трассировки и итог.
// Шаг: vars — значения переменных цикла, cond — результат проверки, painted — закрашено клеток
// после шага, pos — клетка робота, cell — клетка, закрашенная на этом шаге, err — robot.right()
// упёрся в стену (программа остановлена), check/run — строки кода для подсветки.
export function trace(p) {
  const L = p.L;
  const events = [];
  let c = 0;
  let r = 0;
  let painted = 0;
  let body = 0;
  let result = 'done';
  // Тело цикла: шаг вправо и закраска. Справа от последней клетки коридора — стена
  const right = () => {
    if (c >= L) return false;
    c += 1;
    painted += 1;
    body += 1;
    return true;
  };
  const push = (e) => events.push({ painted, pos: { c, r }, body, ...e });

  if (p.prog === 0) {
    for (let i = 0; i < p.N; i++) {
      if (!right()) {
        push({ vars: { i }, cond: true, err: true, check: 0, run: [1] });
        result = 'crash';
        break;
      }
      push({ vars: { i }, cond: true, cell: { c, r }, check: 0, run: [1, 2] });
    }
    if (result !== 'crash') push({ vars: {}, cond: false, end: true, check: 0, run: [] });
  } else if (p.prog === 1) {
    let k = 0;
    for (;;) {
      const free = c < L;
      if (!free) {
        push({ vars: { k }, cond: false, end: true, out: k, check: 1, run: [5] });
        break;
      }
      right();
      k += 1;
      push({ vars: { k }, cond: true, cell: { c, r }, check: 1, run: events.length ? [2, 3, 4] : [0, 2, 3, 4] });
    }
  } else {
    outer: for (let row = 0; row < p.R; row++) {
      for (let i = 0; i < p.N; i++) {
        if (!right()) {
          push({ vars: { row, i }, cond: true, err: true, check: 1, run: [2] });
          result = 'crash';
          break outer;
        }
        push({ vars: { row, i }, cond: true, cell: { c, r }, check: 1, run: [2, 3] });
      }
      // Внутренний range исчерпан: robot.left(N) и robot.down() — робот в начале следующей строки
      c -= p.N;
      r += 1;
      push({ vars: { row }, cond: false, loop: 'inner', check: 1, run: [4, 5] });
    }
    if (result !== 'crash') push({ vars: {}, cond: false, loop: 'outer', end: true, check: 0, run: [] });
  }
  return { events, total: events.length, result };
}

// Состояние после s = min(t, total) шагов
export function state(p) {
  const tr = trace(p);
  const s = Math.min(p.t, tr.total);
  const last = s ? tr.events[s - 1] : null;
  return { ...tr, s, last, finished: s === tr.total, painted: last?.painted ?? 0, body: last?.body ?? 0, pos: last?.pos ?? { c: 0, r: 0 } };
}

// Переменные цикла строкой: «i = 2», «k = 3», «row = 1, i = 0»
export const varsText = (v) => Object.entries(v).map(([k, x]) => `${k} = ${x}`).join(', ');

const header = (p) => (p.prog === 0 ? `Цикл for i in range(${p.N})` : p.prog === 1 ? 'Цикл while robot.free_right()' : `Вложенный цикл ${p.R} × ${p.N}`);

export default {
  id: 'it-loop-trace',
  subject: 'informatics',
  title: 'Циклы for и while: трассировка',
  freeTitle: 'Робот-закрасчик',
  freeSub: 'Циклы for, while и вложенный цикл',
  controls: [
    { id: 'prog', label: 'Программа', min: 0, max: 2, step: 1, unit: '', value: 0, names: PROG_NAMES, action: true, actionLabel: 'Щёлкнуть по вкладке программы над кодом' },
    { id: 't', label: 'Выполнение программы', min: 0, max: RUN, step: 1, unit: '', value: 0, action: true, actionLabel: 'Нажать кнопку «Шаг» или «Пуск» в редакторе' },
    { id: 'N', label: 'Число повторений N в range(N)', min: 1, max: 10, step: 1, unit: '', value: 4 },
    { id: 'L', label: 'Длина коридора, клеток', min: 3, max: 10, step: 1, unit: '', value: 6 },
    { id: 'R', label: 'Повторений внешнего цикла', min: 1, max: 3, step: 1, unit: '', value: 3 },
  ],
  formula: 'for i in range(N): тело выполняется N раз; while условие: тело выполняется, пока условие True',
  hint: 'Выберите вкладку программы и нажмите «Шаг» или «Пуск» — робот закрасит клетки, а таблица покажет каждый шаг.',
  theory: 'Цикл — многократное повторение команд (тела цикла). Цикл for i in range(N) выполняет тело ровно N раз, переменная i по очереди принимает значения 0, 1, … N − 1; range(a, b) даёт числа от a до b − 1. Такой цикл подходит, когда число повторений известно заранее. Цикл while условие: проверяет условие перед каждым повторением и выполняет тело, пока условие True; когда условие стало False, цикл заканчивается. Поэтому условие проверяется на один раз больше, чем выполняется тело, а если оно сразу False — тело не выполнится ни разу. Цикл while подходит, когда число повторений заранее неизвестно; чтобы его узнать, заводят переменную-счётчик: k = k + 1. Во вложенном цикле внутренний цикл целиком выполняется на каждом шаге внешнего: тело внутреннего цикла выполнится R × N раз. Проверить работу цикла помогает трассировочная таблица — запись значений переменных и условия на каждом шаге.',

  readings(p) {
    const st = state(p);
    if (!st.s) {
      return [
        { label: 'Программа', value: PROG_NAMES[p.prog] },
        { label: 'Результат', value: 'программа не запущена' },
      ];
    }
    // Четыре строки, не больше: панель показаний прилипает к низу экрана и при большей высоте
    // закрывает трассировочную таблицу. True/False на шаге видно в таблице и подсветке кода.
    // Во вложенном цикле шаг таблицы — это не всегда проверка одного и того же условия, поэтому «шагов»
    const status = st.last.err ? 'ошибка: справа стена' : st.finished ? 'программа выполнена' : 'выполняется';
    return [
      { label: 'Результат', value: status },
      { label: p.prog === 2 ? 'Шагов в таблице' : 'Проверок условия', value: String(st.s) },
      { label: 'Выполнений тела', value: String(st.body) },
      { label: 'Закрашено клеток', value: p.prog === 2 ? String(st.painted) : `${st.painted} из ${p.L}` },
    ];
  },

  describe(p) {
    const st = state(p);
    if (!st.s) return `Программа не запущена, коридор из ${p.L} клеток не закрашен`;
    const e = st.last;
    if (e.err) return `${header(p)}: при ${varsText(e.vars)} robot.right() упёрся в стену, программа остановлена с ошибкой; закрашено клеток — ${st.painted}`;
    if (!st.finished) return `Шаг ${st.s} из ${st.total}: ${e.vars && Object.keys(e.vars).length ? `${varsText(e.vars)}, ` : ''}условие ${e.cond ? 'True' : 'False'}, закрашено клеток — ${st.painted}`;
    const checks = st.total;
    if (p.prog === 0) return `${header(p)} выполнен: выполнений тела — ${st.body}, проверок условия — ${checks}, закрашено клеток — ${st.painted} из ${p.L}`;
    if (p.prog === 1) return `${header(p)} выполнен: выполнений тела — ${st.body}, проверок условия — ${checks}, print(k) выводит ${e.out}, закрашено клеток — ${st.painted} из ${p.L}`;
    return `Вложенный цикл ${p.R} × ${p.N} выполнен: выполнений тела внутреннего цикла — ${st.body}, закрашено клеток — ${st.painted}`;
  },

  create(container, params, set) {
    return itLoopScene(container, params, set, { trace, code, PROG_NAMES, ROWS, COLS, RUN });
  },
};
