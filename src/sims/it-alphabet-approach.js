// Алфавитный подход к измерению информации: ученик выбирает алфавит (двоичный, цифры, латиница,
// казахский, ASCII, Unicode) и длину сообщения, а модель считает информационный вес символа
// i — наименьшее целое, при котором 2^i ≥ N, — и объём сообщения I = K·i в битах и байтах.
// Вес символа целый, а не log₂N: компьютер кодирует символ целым числом двоичных разрядов,
// поэтому для 26 букв нужно 5 бит (2⁴ = 16 мало), а удвоение алфавита добавляет только 1 бит.
// Иллюстрация — в svg/scenes/it-alphabet-approach.js.

import { fmt } from './canvas.js';
import { alphabetScene } from '../svg/scenes/it-alphabet-approach.js';

// Мощности алфавитов — как в учебнике информатики: ASCII — 256 символов (8 бит),
// UTF-16 — 65 536 символов (16 бит); казахский алфавит на кириллице — 42 буквы
export const ALPHABETS = [
  { name: 'двоичный (0 и 1)', short: 'двоичный', glyphs: '0 1', N: 2 },
  { name: 'цифры 0–9', short: 'цифры', glyphs: '0 … 9', N: 10 },
  { name: 'латиница: a–z', short: 'латиница', glyphs: 'a … z', N: 26 },
  { name: 'латиница: a–z и A–Z', short: 'латиница Aa', glyphs: 'a…z A…Z', N: 52 },
  { name: 'казахский алфавит', short: 'казахский', glyphs: 'а ә … я', N: 42 },
  { name: 'ASCII', short: 'ASCII', glyphs: 'A z ! 7', N: 256 },
  { name: 'Unicode (UTF-16)', short: 'UTF-16', glyphs: 'Ә π ✓ €', N: 65536 },
];

// i = ⌈log₂N⌉ считаем целочисленно, без Math.log2: для N = 2^k логарифм в плавающей
// точке может дать k + 1e-16, и округление вверх ошибочно добавило бы лишний бит
export const weight = (N) => {
  let i = 0;
  while (2 ** i < N) i++;
  return i;
};

const alpha = (p) => ALPHABETS[p.alphabet];
export const bitsPerSymbol = (p) => weight(alpha(p).N);
export const volumeBits = (p) => p.K * bitsPerSymbol(p);
// 1 байт = 8 бит; при K, кратном 10, остаток — только половины и четверти байта,
// поэтому знаков после запятой ровно столько, сколько нужно: 25; 97,5; 6,25
export const bytesText = (bits) => {
  const b = bits / 8;
  return fmt(b, Number.isInteger(b) ? 0 : Number.isInteger(b * 2) ? 1 : 2);
};

const symbolsWord = (n) => {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'символ';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'символа';
  return 'символов';
};

// Пятизначные числа делим на разряды пробелом, как в тексте работы и на карточке: 65 536
const num = (n) => (n >= 10000 ? fmt(n, 0).replace(/\B(?=(\d{3})+$)/g, ' ') : fmt(n, 0));

const sup = (n) => String(n).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);

export default {
  id: 'it-alphabet-approach',
  freeTitle: 'Алфавитный подход',
  freeSub: 'Мощность алфавита, вес символа, объём сообщения',
  subject: 'informatics',
  title: 'Измерение информации: алфавитный подход',
  controls: [
    { id: 'alphabet', label: 'Алфавит', min: 0, max: 6, step: 1, unit: '', value: 0, names: ALPHABETS.map((a) => a.name), action: true, actionLabel: 'Выбрать алфавит на доске' },
    { id: 'K', label: 'Длина сообщения K', min: 10, max: 200, step: 10, unit: 'символов', value: 40 },
  ],
  formula: 'N ≤ 2ⁱ,  I = K · i,  1 байт = 8 бит',
  hint: 'Нажмите на карточку алфавита на доске и посчитайте клетки кода символа. Длину сообщения меняйте регулятором.',
  chart: { x: 'K', y: (p) => volumeBits(p), xLabel: 'K, символов', yLabel: 'I, бит', series: (p) => `i = ${bitsPerSymbol(p)} бит` },
  theory: 'При алфавитном подходе информацию измеряют, не вникая в смысл сообщения. Мощность алфавита N — число символов в нём. Информационный вес символа i — сколько двоичных разрядов (бит) нужно, чтобы каждому символу дать свой код: это наименьшее целое i, при котором 2ⁱ ≥ N. Информационный объём сообщения из K символов I = K · i бит; 1 байт = 8 бит. Удвоение мощности алфавита увеличивает вес символа на 1 бит. В кодировке ASCII символ занимает 8 бит (256 символов), в UTF-16 — 16 бит (65 536 символов).',

  readings(p) {
    const { N } = alpha(p);
    const i = bitsPerSymbol(p);
    const I = volumeBits(p);
    // Название алфавита видно на доске, поэтому в показаниях только величины формулы I = K · i
    return [
      { label: 'Мощность алфавита N', value: `${num(N)} ${symbolsWord(N)}` },
      { label: 'Вес символа i', value: `${i} бит (2${sup(i)} = ${num(2 ** i)})` },
      { label: 'Длина сообщения K', value: `${fmt(p.K, 0)} ${symbolsWord(p.K)}` },
      { label: 'Объём I = K · i', value: `${fmt(I, 0)} бит = ${bytesText(I)} байт` },
    ];
  },

  describe(p) {
    const { N } = alpha(p);
    const i = bitsPerSymbol(p);
    const I = volumeBits(p);
    return `Сообщение из ${fmt(p.K, 0)} символов: N = ${num(N)}, i = ${i} бит, I = ${fmt(p.K, 0)} · ${i} = ${fmt(I, 0)} бит = ${bytesText(I)} байт`;
  },

  create(container, params, set) {
    return alphabetScene(container, params, set, { ALPHABETS, weight });
  },
};
