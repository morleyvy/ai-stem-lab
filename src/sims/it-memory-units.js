// Единицы измерения информации и ёмкость носителей: файлы заданного размера копируются на SD-карту,
// флешку или внешний SSD-диск. Все объёмы хранятся в Кбайт и переводятся в другие единицы
// по школьным соотношениям 1 байт = 8 бит, 1 Кбайт = 1024 байт, 1 Мбайт = 1024 Кбайт, 1 Гбайт = 1024 Мбайт.
// Сколько файлов поместится — целая часть от деления ёмкости на размер файла: неполный файл записать нельзя,
// поэтому ученик видит, что после 341 фото по 3 Мбайт на флешке 1 Гбайт остаётся 1 Мбайт, но 342-е фото уже не входит.
// Служебные области файловой системы не учитываем: в задачах 7 класса ёмкость носителя целиком доступна для файлов.
// Иллюстрация — папки и носители на столе — в svg/scenes/it-memory-units.js.

import { fmt } from './canvas.js';
import { itMemoryScene } from '../svg/scenes/it-memory-units.js';

export const KB = 1;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

// Носители: ёмкость в Кбайт. Значение 0 регулятора — носитель не подключён
export const DEVICES = [
  null,
  { name: 'SD-карта', capacity: 512 * MB },
  { name: 'флешка', capacity: 1 * GB },
  { name: 'SSD-диск', capacity: 128 * GB },
];

// Папки с файлами одного типа. Размеры — типичные: документ в несколько страниц, фото со смартфона,
// песня в MP3 около 4 минут, фильм в сжатом виде
export const KINDS = [
  { folder: 'Документы', size: 20 * KB },
  { folder: 'Фото', size: 3 * MB },
  { folder: 'Песни', size: 8 * MB },
  { folder: 'Видео', size: 700 * MB },
];

// Разряды больших чисел разделяем неразрывным пробелом, как в учебнике: 1 073 741 824 байт;
// четырёхзначные (1024) по правилам набора пишутся слитно
export const group = (n) => (n < 10000 ? String(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'));

// Целое число — без запятой; дробное — с одним знаком, а малое (меньше 10) — с двумя,
// чтобы 1,95 Мбайт не превращались в «2,0»
const num = (v) => (Number.isInteger(v) ? group(v) : fmt(v, v < 10 ? 2 : 1));

// Объём в самых удобных единицах: Кбайт, Мбайт или Гбайт (от 10 Гбайт, чтобы 1023 Мбайт не стали «1,0 Гбайт»).
// Пустое место пишем в Мбайт: «свободно 0 Мбайт» понятнее, чем «0 Кбайт»
export function size(kb) {
  if (kb === 0) return '0 Мбайт';
  if (kb < MB) return `${num(kb)} Кбайт`;
  if (kb < 10 * GB) return `${num(kb / MB)} Мбайт`;
  return `${num(kb / GB)} Гбайт`;
}

// Ёмкость в принятых для носителя единицах и цепочка переводов до битов
export const capacityText = (dev) => (dev.capacity >= GB ? `${dev.capacity / GB} Гбайт` : `${dev.capacity / MB} Мбайт`);
export function capacityChain(dev) {
  const kb = dev.capacity;
  const steps = [];
  if (kb >= GB) steps.push(`${group(kb / GB)} Гбайт`);
  steps.push(`${group(kb / MB)} Мбайт`, `${group(kb)} Кбайт`);
  return steps;
}
const bytes = (dev) => dev.capacity * 1024;

export const device = (p) => DEVICES[p.device];
export const kind = (p) => KINDS[p.kind];
export const fits = (p) => (device(p) ? Math.floor(device(p).capacity / kind(p).size) : 0);
export const copied = (p) => Math.min(p.count, fits(p));
export const used = (p) => copied(p) * kind(p).size;
const filesText = (p) => `${kind(p).folder.toLowerCase()} по ${size(kind(p).size)}`;
// Доля занятого места; меньше 1 % — с двумя знаками, иначе 500 документов на SSD-диске показали бы «0,0 %»
const pct = (p) => {
  const v = (100 * used(p)) / device(p).capacity;
  return `${fmt(v, v > 0 && v < 1 ? 2 : 1)} %`;
};

export default {
  id: 'it-memory-units',
  subject: 'informatics',
  title: 'Ёмкость носителей информации',
  freeTitle: 'Файлы и носители',
  freeSub: 'Бит, байт, Кбайт, Мбайт, Гбайт',
  controls: [
    { id: 'device', label: 'Носитель информации', min: 0, max: 3, step: 1, unit: '', value: 0, names: ['не подключён', 'SD-карта 512 Мбайт', 'флешка 1 Гбайт', 'SSD-диск 128 Гбайт'], action: true, actionLabel: 'Нажать на носитель на столе' },
    { id: 'kind', label: 'Папка с файлами', min: 0, max: 3, step: 1, unit: '', value: 1, names: ['документы по 20 Кбайт', 'фото по 3 Мбайт', 'песни по 8 Мбайт', 'видео по 700 Мбайт'], action: true, actionLabel: 'Нажать на папку на столе' },
    { id: 'count', label: 'Число файлов в папке', min: 1, max: 500, step: 1, unit: 'шт.', value: 100 },
    { id: 'copy', label: 'Копирование', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не начато', 'выполнено'], action: true, actionLabel: 'Перетащить папку на носитель' },
  ],
  formula: 'N = V(носителя) : V(файла), дробная часть отбрасывается;  1 байт = 8 бит, 1 Кбайт = 1024 байт',
  hint: 'Нажмите на носитель на столе, затем перетащите на него папку с файлами. Число файлов меняйте регулятором.',
  chart: { x: 'count', y: copied, xLabel: 'файлов в папке, шт.', yLabel: 'поместится файлов, шт.', series: (p) => `${kind(p).folder.toLowerCase()} → ${device(p)?.name ?? 'нет носителя'}` },
  theory: 'Наименьшая единица измерения информации — бит: один двоичный разряд, 0 или 1. 8 бит составляют 1 байт. Более крупные единицы больше предыдущей в 1024 = 2¹⁰ раз: 1 Кбайт = 1024 байт, 1 Мбайт = 1024 Кбайт, 1 Гбайт = 1024 Мбайт, 1 Тбайт = 1024 Гбайт. Программы и данные хранятся в памяти компьютера: во внутренней (оперативной) памяти — пока компьютер работает, во внешней — на жёстких и SSD-дисках, флешках, картах памяти — долговременно. Ёмкость носителя — наибольший объём информации, который на нём помещается. Чтобы узнать, сколько файлов поместится на носитель, ёмкость и размер файла переводят в одни единицы и делят, а дробную часть отбрасывают: неполный файл записать нельзя. Производители носителей часто считают 1 Гбайт = 1 000 000 000 байт, поэтому компьютер показывает чуть меньшую ёмкость, но в школьных задачах используют множитель 1024.',

  // Не больше четырёх показаний: до копирования важны ёмкость носителя и объём папки, после — сколько
  // файлов вошло и сколько места осталось. Носитель после копирования виден на сцене и в строке «Занято»,
  // а перевод ёмкости в байты и биты — в описании опыта
  readings(p) {
    const k = kind(p);
    const dev = device(p);
    const folder = { label: 'Папка', value: `${k.folder.toLowerCase()}: ${p.count} × ${size(k.size)} = ${size(p.count * k.size)}` };
    if (!dev) return [{ label: 'Носитель', value: 'не подключён' }, folder];
    if (!p.copy) {
      return [
        { label: 'Носитель', value: `${dev.name}, ${capacityText(dev)}` },
        { label: 'Ёмкость', value: capacityChain(dev).join(' = ') },
        folder,
        { label: 'Свободно', value: `${size(dev.capacity)} — носитель пуст` },
      ];
    }
    return [
      folder,
      { label: 'Скопировано файлов', value: `${copied(p)} из ${p.count}` },
      { label: 'Занято', value: `${size(used(p))} из ${capacityText(dev)} (${pct(p)})` },
      { label: 'Свободно', value: size(dev.capacity - used(p)) },
    ];
  },

  describe(p) {
    const dev = device(p);
    if (!dev) return `Носитель не подключён; выбрана папка «${kind(p).folder}»: ${p.count} × ${size(kind(p).size)}`;
    if (!p.copy) return `Подключён носитель «${dev.name} ${capacityText(dev)}»: ${[...capacityChain(dev), `${group(bytes(dev))} байт`, `${group(bytes(dev) * 8)} бит`].join(' = ')}`;
    const free = size(dev.capacity - used(p));
    if (copied(p) === p.count) return `Скопировано ${p.count} из ${p.count} (${filesText(p)}): занято ${size(used(p))} из ${capacityText(dev)} (${pct(p)}), свободно ${free}`;
    if (!copied(p)) return `Не скопировано ни одного файла (${filesText(p)}): файл больше всего носителя ${capacityText(dev)}`;
    // Носитель заполнен ровно: «свободно 0 Мбайт — меньше одного файла» звучало бы странно
    if (used(p) === dev.capacity) return `Поместилось только ${copied(p)} из ${p.count} (${filesText(p)}): занято ${size(used(p))} из ${capacityText(dev)} — носитель заполнен полностью, ${p.count - copied(p)} не скопировано`;
    return `Поместилось только ${copied(p)} из ${p.count} (${filesText(p)}): занято ${size(used(p))} из ${capacityText(dev)}, свободно ${free} — меньше одного файла, ${p.count - copied(p)} не скопировано`;
  },

  create(container, params, set) {
    return itMemoryScene(container, params, set, { DEVICES, KINDS, copied, size, capacityText });
  },
};
