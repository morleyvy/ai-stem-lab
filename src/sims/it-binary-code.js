// Двоичный код в регистре из 8 переключателей-битов. Каждый бит хранит 0 или 1, вес разряда
// вдвое больше соседнего справа (1, 2, 4 … 128), поэтому число — это сумма весов включённых битов.
// Тот же код по таблице ASCII читается как символ. Число битов N в регистре можно уменьшить:
// старшие разряды отключаются, и ученик видит, что N битов дают 2^N разных кодов.
// Иллюстрация стенда — в svg/scenes/it-binary-code.js.

import { itBinaryScene } from '../svg/scenes/it-binary-code.js';

export const BITS = 8;
export const WEIGHTS = Array.from({ length: BITS }, (_, k) => 2 ** k);
const SUP = '⁰¹²³⁴⁵⁶⁷⁸';
export const pow2 = (n) => `2${SUP[n]}`;

// Биты старше N в регистре отсутствуют: их переключатели закрыты и в число не входят
export const value = (p) => WEIGHTS.reduce((sum, w, k) => sum + (k < p.N && p[`b${k}`] ? w : 0), 0);

export const binary = (p) => value(p).toString(2).padStart(p.N, '0');

// Веса включённых битов от старшего к младшему — так число раскладывают в учебнике: 37 = 32 + 4 + 1
export const terms = (p) => WEIGHTS.filter((w, k) => k < p.N && p[`b${k}`]).reverse();

// ASCII — 7-битная таблица: 0–31 и 127 — управляющие коды, 32 — пробел, 33–126 — видимые знаки.
// Коды 128–255 в ASCII не входят (это вторая половина 8-битных таблиц, у каждой страны своя).
export function asciiOf(v) {
  if (v === 32) return { kind: 'space', text: 'пробел' };
  if (v < 32 || v === 127) return { kind: 'control', text: 'управляющий символ' };
  if (v > 127) return { kind: 'outside', text: 'вне таблицы ASCII' };
  const ch = String.fromCharCode(v);
  return { kind: 'char', ch, text: `символ «${ch}»` };
}

const sumText = (p) => {
  const t = terms(p);
  return t.length > 1 ? `${t.join(' + ')} = ${value(p)}` : String(value(p));
};

const bitControl = (k) => ({
  id: `b${k}`,
  label: `Бит с весом ${2 ** k}`,
  min: 0,
  max: 1,
  step: 1,
  unit: '',
  value: 0,
  names: ['0', '1'],
  action: true,
  actionLabel: 'Щёлкнуть по нужным переключателям битов',
});

export default {
  id: 'it-binary-code',
  subject: 'informatics',
  title: 'Двоичный код',
  freeTitle: 'Двоичный код',
  freeSub: 'Биты, байт и код символа',
  controls: [
    { id: 'N', label: 'Число битов в регистре', min: 1, max: 8, step: 1, unit: 'бит', value: 8 },
    ...WEIGHTS.map((_, k) => bitControl(k)),
  ],
  // Формула — только число кодов: правило «число = сумма весов» ученик видит в показаниях
  formula: 'Q = 2^N',
  hint: 'Щёлкайте по переключателям битов: вверху — 1, внизу — 0. Регулятором под сценой меняйте число битов в регистре.',
  chart: { x: 'N', y: (p) => 2 ** p.N, xLabel: 'N, бит', yLabel: 'число разных кодов', series: () => 'Q = 2^N' },
  theory: 'Компьютер хранит любую информацию в двоичном коде — последовательности нулей и единиц. Один двоичный разряд (0 или 1) — это 1 бит, наименьшая единица информации; 8 бит составляют 1 байт. Каждый следующий разряд слева весит вдвое больше: 1, 2, 4, 8, 16, 32, 64, 128. Число равно сумме весов разрядов, в которых стоит 1. В N битах можно записать Q = 2^N разных кодов, в одном байте — 2⁸ = 256 (числа от 0 до 255). Буквы и знаки тоже хранятся как числа: в таблице ASCII буква «A» имеет код 65, а «a» — код 97.',

  readings(p) {
    const v = value(p);
    const a = asciiOf(v);
    return [
      { label: 'Двоичный код', value: binary(p) },
      { label: 'Сумма весов', value: sumText(p) },
      { label: 'Символ ASCII', value: a.kind === 'char' ? `«${a.ch}»` : a.text },
      // Диапазон в скобках: наибольшее число на единицу меньше числа кодов, потому что есть ещё 0
      { label: 'Разных кодов', value: `${pow2(p.N)} = ${2 ** p.N} (0…${2 ** p.N - 1})` },
    ];
  },

  describe(p) {
    if (p.N < BITS) return `Длина кода ${p.N} бит: ${2 ** p.N} разных кодов, наименьший 0, наибольший ${2 ** p.N - 1}`;
    const v = value(p);
    if (v === 0) return `Все биты выключены: код ${binary(p)} = 0`;
    const a = asciiOf(v);
    const tail = { char: `в ASCII это символ «${a.ch}»`, space: 'в ASCII это пробел', control: 'в ASCII это управляющий символ', outside: 'в ASCII такого кода нет' }[a.kind];
    return `Код ${binary(p)} = ${sumText(p)}, ${tail}`;
  },

  create(container, params, set) {
    return itBinaryScene(container, params, set, { value, asciiOf, WEIGHTS });
  },
};
