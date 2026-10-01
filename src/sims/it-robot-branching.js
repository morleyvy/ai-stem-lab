// Робот-исполнитель на клеточном поле 5 × 5: одна и та же программа запускается в трёх лабиринтах.
// Линейная программа — жёсткий список команд, составленный для лабиринта 1: в другом лабиринте
// робот на какой-то команде упрётся в стену. Программа с ветвлением перед каждым ходом проверяет
// условие («впереди свободно?») и сама выбирает команду, поэтому подходит для разных лабиринтов;
// if–else с одним поворотом направо справляется только с поворотами направо, а if–elif–else —
// с любым коридором. Результат (команды, клетка, направление) считает интерпретатор ниже по
// карте лабиринта — ничего не задано вручную. Иллюстрация — в svg/scenes/it-robot-branching.js.

import { itRobotScene } from '../svg/scenes/it-robot-branching.js';

export const SIZE = 5;
// Направления по часовой стрелке; ось y направлена вверх, как на координатной плоскости в математике
const STEP = [[0, 1], [1, 0], [0, -1], [-1, 0]];
export const START = { x: 1, y: 1, d: 0 };

// Карты: верхняя строка — y = 5, левый столбец — x = 1. «#» — стена, «.» — свободная клетка,
// «S» — старт, «F» — финиш. Все лабиринты — коридоры без развилок: в них правило
// «если впереди свободно — вперёд, иначе повернуть туда, где свободно» всегда ведёт к финишу.
// В лабиринтах 1 и 2 только повороты направо, в лабиринте 3 есть поворот налево.
const MAPS = [
  ['#####',
    '...F#',
    '.####',
    '.####',
    'S####'],
  ['#####',
    '#####',
    '....#',
    '.##.#',
    'S##F#'],
  ['#####',
    '##..F',
    '##.##',
    '...##',
    'S####'],
];

export const MAZES = MAPS.map((rows) => {
  const free = new Set();
  let finish = null;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const x = c + 1;
    const y = SIZE - r;
    if (ch !== '#') free.add(`${x},${y}`);
    if (ch === 'F') finish = { x, y };
  }));
  return { free, finish };
});

export const isFree = (m, x, y) => m.free.has(`${x},${y}`);

// Строки программ: block — надпись блока, py — та же строка на Python, indent — уровень вложенности.
// Линейная программа составлена ровно под лабиринт 1: 3 шага вверх, поворот, 3 шага вправо.
const F = { block: 'вперёд', py: 'robot.forward()', cmd: 'F' };
const R = { block: 'повернуть направо', py: 'robot.right()', cmd: 'R' };
const WHILE = { block: 'повторять, пока не финиш', py: 'while not robot.at_finish():', kind: 'loop' };
const IF = { block: 'если впереди свободно', py: 'if robot.free_ahead():', kind: 'if', indent: 1 };
export const PROGRAMS = [
  [F, F, F, R, F, F, F],
  [WHILE, IF, { ...F, indent: 2 }, { block: 'иначе', py: 'else:', kind: 'else', indent: 1 }, { ...R, indent: 2 }],
  [WHILE, IF, { ...F, indent: 2 },
    { block: 'иначе если справа свободно', py: 'elif robot.free_right():', kind: 'if', indent: 1 }, { ...R, indent: 2 },
    { block: 'иначе', py: 'else:', kind: 'else', indent: 1 }, { block: 'повернуть налево', py: 'robot.left()', cmd: 'L', indent: 2 }],
];

// Какую команду выберет программа с ветвлением в положении robot и какие строки-условия
// она при этом проверила (их сцена подсвечивает перед ходом)
function decide(prog, m, { x, y, d }) {
  const ahead = isFree(m, x + STEP[d][0], y + STEP[d][1]);
  if (ahead) return { cmd: 'F', line: 2, checked: [0, 1] };
  if (prog === 1) return { cmd: 'R', line: 4, checked: [0, 1, 3] };
  const r = (d + 1) % 4;
  if (isFree(m, x + STEP[r][0], y + STEP[r][1])) return { cmd: 'R', line: 4, checked: [0, 1, 3] };
  return { cmd: 'L', line: 6, checked: [0, 1, 3, 5] };
}

// Ход одной команды. «Вперёд» в стену не выполняется — исполнитель останавливается с ошибкой
function apply(m, pos, cmd) {
  if (cmd === 'R') return { ...pos, d: (pos.d + 1) % 4 };
  if (cmd === 'L') return { ...pos, d: (pos.d + 3) % 4 };
  const x = pos.x + STEP[pos.d][0];
  const y = pos.y + STEP[pos.d][1];
  return isFree(m, x, y) ? { ...pos, x, y } : null;
}

// Полное выполнение программы: список событий для анимации и итог.
// result: finish — дошёл до финиша, crash — упёрся в стену, loop — пришёл в уже бывшее положение
// (клетка и направление те же — дальше всё повторится, финиша не будет), end — команды кончились.
export function execute(p) {
  const m = MAZES[p.maze];
  let pos = { ...START };
  const events = [];
  const atFinish = () => pos.x === m.finish.x && pos.y === m.finish.y;
  const step = (cmd, line, checked) => {
    const next = apply(m, pos, cmd);
    if (!next) {
      events.push({ cmd, line, checked, ok: false, from: pos, to: pos });
      return false;
    }
    events.push({ cmd, line, checked, ok: true, from: pos, to: next });
    pos = next;
    return true;
  };
  const done = (result) => ({ events, result, n: events.filter((e) => e.ok).length, pos, failed: events.findIndex((e) => !e.ok) + 1 });

  if (p.prog === 0) {
    for (const [i, line] of PROGRAMS[0].entries()) if (!step(line.cmd, i, [])) return done('crash');
    return done(atFinish() ? 'finish' : 'end');
  }
  const seen = new Set();
  // Предел — страховка: в коридоре 5 × 5 повтор положения наступает гораздо раньше
  for (let guard = 0; guard < 200; guard++) {
    if (atFinish()) return done('finish');
    const key = `${pos.x},${pos.y},${pos.d}`;
    if (seen.has(key)) return done('loop');
    seen.add(key);
    const { cmd, line, checked } = decide(p.prog, m, pos);
    if (!step(cmd, line, checked)) return done('crash');
  }
  return done('loop');
}

const cell = ({ x, y }) => `(${x}; ${y})`;
const RESULT = {
  finish: 'робот дошёл до финиша',
  crash: 'робот упёрся в стену',
  loop: 'робот ходит по кругу',
  end: 'команды кончились, финиш не достигнут',
};

const MAZE_NAMES = ['Лабиринт 1', 'Лабиринт 2', 'Лабиринт 3'];
const PROG_NAMES = ['линейная', 'ветвление if–else', 'ветвление if–elif–else'];

export default {
  id: 'it-robot-branching',
  freeTitle: 'Робот в лабиринте',
  freeSub: 'Линейная программа и ветвление',
  subject: 'informatics',
  title: 'Робот-исполнитель: ветвление',
  controls: [
    { id: 'maze', label: 'Лабиринт', min: 0, max: 2, step: 1, unit: '', value: 0, names: MAZE_NAMES, action: true, actionLabel: 'Выбрать лабиринт на вкладке над полем' },
    { id: 'prog', label: 'Программа', min: 0, max: 2, step: 1, unit: '', value: 0, names: PROG_NAMES, action: true, actionLabel: 'Выбрать программу на вкладке редактора' },
    { id: 'run', label: 'Выполнение', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['робот на старте', 'программа запущена'], action: true, actionLabel: 'Нажать кнопку «Пуск» в редакторе' },
    { id: 'speed', label: 'Скорость выполнения', min: 1, max: 5, step: 1, unit: 'команд/с', value: 4 },
  ],
  formula: 'if условие: … elif условие: … else: …',
  hint: 'Щёлкните вкладку лабиринта над полем и вкладку программы в редакторе, затем нажмите «Пуск».',
  theory: 'В линейном алгоритме команды выполняются одна за другой в заданном порядке, без проверок, поэтому линейная программа работает только в той обстановке, для которой её составили. Ветвление — выбор действия в зависимости от условия. В Python его записывают так: if условие: — команды выполняются, если условие истинно; elif условие: — «иначе если», проверка ещё одного условия; else: — «иначе», когда ни одно условие не выполнено. После условия ставят двоеточие, а команды ветки записывают с отступом в 4 пробела.',

  // Лабиринт и программа видны на вкладках сцены, направление — по стрелке робота, поэтому
  // в приборах только то, что ученик сверяет с текстом шагов: итог, число команд и клетки
  readings(p) {
    const m = MAZES[p.maze];
    const r = p.run ? execute(p) : { result: null, n: 0, pos: START };
    return [
      { label: 'Результат', value: r.result ? RESULT[r.result] : 'программа не запущена' },
      { label: 'Выполнено команд', value: String(r.n) },
      { label: 'Клетка робота (x; y)', value: cell(r.pos) },
      { label: 'Клетка финиша (x; y)', value: cell(m.finish) },
    ];
  },

  describe(p) {
    if (!p.run) return 'Робот стоит на старте (1; 1) и смотрит вверх, программа не запущена';
    const r = execute(p);
    if (r.result === 'finish') return `Робот дошёл до финиша ${cell(r.pos)}, выполнено команд: ${r.n}`;
    if (r.result === 'crash') return `Робот упёрся в стену в клетке ${cell(r.pos)}: команда ${r.failed} «вперёд» не выполнена`;
    if (r.result === 'loop') return `Робот ходит по кругу: после ${r.n} команд он снова в клетке ${cell(r.pos)} с тем же направлением и до финиша не дойдёт`;
    return `Команды кончились, робот в клетке ${cell(r.pos)}, финиш не достигнут`;
  },

  create(container, params, set) {
    return itRobotScene(container, params, set, { MAZES, PROGRAMS, START, SIZE, execute });
  },
};
