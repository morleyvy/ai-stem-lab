// Системы счисления: одно число — четыре записи. Конвертер показывает число N (байт 0…255) сразу
// в системах с основаниями 10, 2, 8 и 16; правка цифры в любой строке меняет само число, и остальные
// строки пересчитываются. Рядом — перевод из десятичной системы делением на основание с остатком,
// а двоичный код делится на тройки и четвёрки битов, потому что 8 = 2³ и 16 = 2⁴.
// Иллюстрация — в svg/scenes/it-number-systems.js.

import { itNumberSystemsScene } from '../svg/scenes/it-number-systems.js';

export const BASES = [2, 8, 16];
// Ширина строки конвертера: байт (до 255) занимает 8 двоичных, 3 восьмеричные, 3 десятичные и 2 шестнадцатеричные цифры
export const WIDTH = { 2: 8, 8: 3, 10: 3, 16: 2 };
const SUB = { 2: '₂', 8: '₈', 10: '₁₀', 16: '₁₆' };

export const digitChar = (d) => '0123456789ABCDEF'[d];
export const toBase = (v, b) => v.toString(b).toUpperCase();
export const padded = (v, b) => toBase(v, b).padStart(WIDTH[b], '0');
export const divisor = (p) => BASES[p.base];

// Перевод делением: делим на основание, пока частное не станет 0; остатки — цифры числа от младшей
// к старшей, поэтому читают их снизу вверх. Ноль записывается одной цифрой 0 — одна строка деления.
export function divisionChain(v, b) {
  const rows = [];
  let n = v;
  do {
    rows.push({ n, q: Math.floor(n / b), r: n % b });
    n = Math.floor(n / b);
  } while (n > 0);
  return rows;
}

const remainders = (p) => divisionChain(p.N, divisor(p)).map((r) => digitChar(r.r)).join(', ');

export default {
  id: 'it-number-systems',
  subject: 'informatics',
  title: 'Системы счисления',
  freeTitle: 'Системы счисления',
  freeSub: 'Основания 2, 8, 10 и 16',
  controls: [
    { id: 'N', label: 'Число', min: 0, max: 255, step: 1, unit: '', value: 0 },
    {
      id: 'base', label: 'Делитель при переводе', min: 0, max: 2, step: 1, unit: '', value: 0,
      names: BASES.map(String),
      action: true, actionLabel: 'Нажать кнопку ÷2, ÷8 или ÷16 над столбиком деления',
    },
  ],
  formula: 'A = aₙ·qⁿ + … + a₁·q¹ + a₀·q⁰',
  hint: 'Щёлкайте по верхней половине цифры, чтобы увеличить её, по нижней — чтобы уменьшить. Кнопки ÷2, ÷8, ÷16 выбирают делитель.',
  theory: 'Система счисления — способ записи чисел цифрами. В позиционной системе вес цифры зависит от её места: в системе с основанием q он равен qᵏ, где k — номер разряда справа, начиная с 0. Поэтому 9C₁₆ = 9·16 + 12 = 156₁₀. Чтобы перевести целое число из десятичной системы, его делят на основание q с остатком, затем делят частное, пока оно не станет 0; остатки, прочитанные снизу вверх, — запись числа в новой системе. Так как 8 = 2³ и 16 = 2⁴, двоичный код переводят в восьмеричный тройками битов, а в шестнадцатеричный — четвёрками, начиная справа. В шестнадцатеричной системе цифры 10…15 обозначают буквами A…F. Байт (0…255) записывается двумя шестнадцатеричными цифрами 00…FF.',

  readings(p) {
    const b = divisor(p);
    return [
      { label: 'Число', value: `${p.N}${SUB[10]}` },
      { label: 'Делитель', value: String(b) },
      { label: 'Остатки', value: remainders(p) },
      { label: 'Снизу вверх', value: `${toBase(p.N, b)}${SUB[b]}` },
    ];
  },

  describe(p) {
    const v = p.N;
    return `${v}${SUB[10]} = ${toBase(v, 2)}${SUB[2]} = ${toBase(v, 8)}${SUB[8]} = ${toBase(v, 16)}${SUB[16]}; делитель ${divisor(p)}, остатки ${remainders(p)}`;
  },

  create(container, params, set) {
    return itNumberSystemsScene(container, params, set, { BASES, WIDTH, digitChar, padded, toBase, divisor, divisionChain });
  },
};
