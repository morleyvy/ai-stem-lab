// Логические элементы на учебном стенде: входы-переключатели A и B (1 — есть сигнал, 0 — нет)
// и лампы-выходы. Схемы готовые, выбираются кнопками на плате: И, ИЛИ, полусумматор и две схемы
// закона де Моргана рядом. Отдельных вкладок НЕ и исключающего ИЛИ нет: ни один шаг работы их
// не открывает, а сами элементы стоят внутри полусумматора и схем де Моргана. Значение каждого выхода считается
// по логическим операциям из текущих значений входов, а таблица истинности — перебором всех
// 2ⁿ наборов входов, поэтому ни одна строка таблицы не задана вручную.
// Иллюстрация стенда — в svg/scenes/it-logic-gates.js.

import { itLogicGatesScene } from '../svg/scenes/it-logic-gates.js';

const and = (a, b) => a & b;
const or = (a, b) => a | b;
const not = (a) => 1 - a;
const xor = (a, b) => a ^ b;

// inputs — какие переключатели участвуют (порядок столбцов таблицы), outs — выходы-лампы.
// Выражения записаны знаками ∧ ∨ ¬ ⊕, как в учебнике: такая запись одинакова на обоих языках.
export const CIRCUITS = [
  { name: 'И', inputs: ['A', 'B'], expr: 'F = A ∧ B', outs: [{ id: 'F', f: ({ A, B }) => and(A, B) }] },
  { name: 'ИЛИ', inputs: ['A', 'B'], expr: 'F = A ∨ B', outs: [{ id: 'F', f: ({ A, B }) => or(A, B) }] },
  // Полусумматор складывает два одноразрядных двоичных числа: S — разряд суммы, P — перенос в старший разряд
  {
    name: 'Полусумматор', inputs: ['A', 'B'], expr: 'S = A ⊕ B;  P = A ∧ B',
    outs: [{ id: 'S', f: ({ A, B }) => xor(A, B) }, { id: 'P', f: ({ A, B }) => and(A, B) }],
  },
  // Две разные схемы на одних входах: если их столбцы совпадают во всех строках, выражения равносильны
  {
    name: 'Закон де Моргана', inputs: ['A', 'B'], expr: 'F₁ = ¬(A ∧ B);  F₂ = ¬A ∨ ¬B',
    outs: [{ id: 'F₁', f: ({ A, B }) => not(and(A, B)) }, { id: 'F₂', f: ({ A, B }) => or(not(A), not(B)) }],
  },
];

export const circuitOf = (p) => CIRCUITS[p.circuit];

// Номер строки таблицы: наборы входов идут по возрастанию двоичного числа ABC (00, 01, 10, 11)
export const rowOf = (p) => circuitOf(p).inputs.reduce((n, k) => n * 2 + p[k], 0);
export const rowCount = (c) => 2 ** c.inputs.length;

// Набор входов для строки r — тот же двоичный разбор, что в rowOf, только обратно
export const rowInputs = (c, r) => Object.fromEntries(c.inputs.map((k, i) => [k, (r >> (c.inputs.length - 1 - i)) & 1]));

export const outputs = (p) => circuitOf(p).outs.map((o) => ({ id: o.id, v: o.f(p) }));

// Столбец выхода в таблице истинности: значения во всех строках подряд
export const column = (c, o) => Array.from({ length: rowCount(c) }, (_, r) => o.f(rowInputs(c, r)));

const inputsText = (p) => circuitOf(p).inputs.map((k) => `${k} = ${p[k]}`).join(', ');
const colText = (col) => col.join(', ');

const toggle = (id) => ({
  id,
  label: `Вход ${id}`,
  min: 0,
  max: 1,
  step: 1,
  unit: '',
  value: 0,
  names: ['0', '1'],
  action: true,
  actionLabel: `Щёлкнуть по переключателю ${id}`,
});

export default {
  id: 'it-logic-gates',
  subject: 'informatics',
  title: 'Логические элементы',
  freeTitle: 'Логические элементы',
  freeSub: 'И, ИЛИ, НЕ, полусумматор',
  controls: [
    {
      id: 'circuit', label: 'Схема', min: 0, max: CIRCUITS.length - 1, step: 1, unit: '', value: 0,
      names: CIRCUITS.map((c) => c.name), action: true, actionLabel: 'Выбрать схему кнопкой на стенде',
    },
    toggle('A'),
    toggle('B'),
    { id: 'scan', label: 'Перебор наборов', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не выполнялся', 'таблица заполнена'], action: true, actionLabel: 'Нажать кнопку «Перебор» под таблицей' },
  ],
  formula: 'A ∧ B,  A ∨ B,  ¬A,  A ⊕ B',
  hint: 'Щёлкайте по переключателям A и B, выбирайте схему кнопками вверху стенда, а кнопка «Перебор» заполнит таблицу.',
  theory: 'Компьютер обрабатывает сигналы двух уровней: 1 (есть напряжение, «истина») и 0 (нет напряжения, «ложь»). Логический элемент — устройство, которое выполняет логическую операцию над входными сигналами. Элемент И (конъюнкция, логическое умножение) даёт 1, только если все входы равны 1. Элемент ИЛИ (дизъюнкция, логическое сложение) даёт 0, только если все входы равны 0. Элемент НЕ (инверсия) меняет значение на противоположное. Исключающее ИЛИ даёт 1, когда входы различны. Таблица истинности перечисляет все наборы входов: при n входах в ней 2ⁿ строк. Полусумматор складывает два одноразрядных двоичных числа: сумма S = A ⊕ B, перенос P = A ∧ B. Закон де Моргана: ¬(A ∧ B) = ¬A ∨ ¬B.',

  // Три показания: выражение и название схемы уже видны на стенде, а два выхода (полусумматор,
  // де Морган) и их столбцы сведены в одну строку, чтобы список не разрастался
  readings(p) {
    const c = circuitOf(p);
    const outs = outputs(p);
    const out = [
      { label: 'Входы', value: inputsText(p) },
      outs.length === 1
        ? { label: `Выход ${outs[0].id}`, value: outs[0].v ? '1 — лампа горит' : '0 — лампа не горит' }
        : { label: 'Выходы', value: outs.map((o) => `${o.id} = ${o.v}`).join(', ') },
    ];
    if (!p.scan) out.push({ label: 'Строка таблицы', value: `№ ${rowOf(p) + 1} из ${rowCount(c)}` });
    else if (c.outs.length === 1) out.push({ label: `Столбец ${c.outs[0].id}`, value: colText(column(c, c.outs[0])) });
    else out.push({ label: 'Столбцы', value: c.outs.map((o) => `${o.id}: ${colText(column(c, o))}`).join('; ') });
    return out;
  },

  describe(p) {
    const c = circuitOf(p);
    if (p.scan) {
      const cols = c.outs.map((o) => column(c, o));
      const same = cols.length > 1 && cols.every((col) => colText(col) === colText(cols[0]));
      const list = c.outs.map((o, i) => `${o.id}: ${colText(cols[i])}`).join('; ');
      return `Схема «${c.name}», таблица истинности из ${rowCount(c)} строк — ${list}${same ? ' — столбцы совпадают' : ''}`;
    }
    const outs = outputs(p);
    const lamp = outs.length === 1 ? (outs[0].v ? ', лампа горит' : ', лампа не горит') : '';
    return `Схема «${c.name}»: ${inputsText(p)} → ${outs.map((o) => `${o.id} = ${o.v}`).join(', ')}${lamp}`;
  },

  create(container, params, set) {
    return itLogicGatesScene(container, params, set, { CIRCUITS, rowOf, rowCount, rowInputs, column });
  },
};
