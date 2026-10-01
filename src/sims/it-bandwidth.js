// Передача файла по каналу связи: размер файла V в мегабайтах и скорость канала v в битах в секунду.
// Время передачи t = V / v считается только после перевода байтов в биты (1 байт = 8 бит): ученик видит,
// что 100 Мбайт по Wi-Fi 100 Мбит/с идут 8 с, а не 1 с. Приставки — двоичные, как в школьном курсе
// информатики РК: 1 Мбит = 1024 Кбит, поэтому 2G на 256 Кбит/с — это ровно 0,25 Мбит/с.
// Задержки, потери пакетов и служебные заголовки не учитываем: работа про связь объёма, скорости и времени.
// Иллюстрация — в svg/scenes/it-bandwidth.js.

import { fmt } from './canvas.js';
import { itBandwidthScene } from '../svg/scenes/it-bandwidth.js';

// Каналы связи в порядке на переключателе над схемой. kbit — скорость в Кбит/с: так 2G не требует дробей.
// Скорости — типичные для школьного примера: EDGE ≈ 256 Кбит/с, 4G ≈ 20 Мбит/с, домашний Wi-Fi 100 Мбит/с,
// оптоволоконная линия до 1000 Мбит/с.
export const CHANNELS = [
  { name: '2G (EDGE)', short: '2G', kbit: 256, unit: 'Кбит/с', color: '#a855f7' },
  { name: '4G (LTE)', short: '4G', kbit: 20 * 1024, unit: 'Мбит/с', color: '#0ea5e9' },
  { name: 'Wi-Fi', short: 'Wi-Fi', kbit: 100 * 1024, unit: 'Мбит/с', color: '#22c55e' },
  { name: 'Оптоволокно', short: 'Оптоволокно', kbit: 1000 * 1024, unit: 'Мбит/с', color: '#f97316' },
];
export const KBIT_PER_MBIT = 1024;
export const BITS_PER_BYTE = 8;

export const channel = (p) => CHANNELS[p.channel];
export const megabits = (p) => p.size * BITS_PER_BYTE;
export const kilobits = (p) => megabits(p) * KBIT_PER_MBIT;
export const mbitPerS = (p) => channel(p).kbit / KBIT_PER_MBIT;
export const seconds = (p) => kilobits(p) / channel(p).kbit;

// Число без лишних нулей: 0,08 · 0,8 · 8 · 10,4 · 6400 — так секундомер и текст шага совпадают дословно
export const num = (x) => fmt(Math.round(x * 100) / 100, 2).replace(/,?0+$/, '');

// Скорость в тех единицах, в которых её указывают для канала: 256 Кбит/с, 20 Мбит/с
export const speedText = (p) => (channel(p).unit === 'Кбит/с' ? `${channel(p).kbit} Кбит/с` : `${num(mbitPerS(p))} Мбит/с`);

// Долгую передачу дополнительно переводим в часы и минуты — 6400 с ни о чём не говорят ученику
export function timeText(t) {
  if (t < 60) return `${num(t)} с`;
  const total = Math.round(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const parts = [h ? `${h} ч` : '', m ? `${m} мин` : '', sec ? `${sec} с` : ''].filter(Boolean).join(' ');
  return `${num(t)} с (${parts})`;
}

export default {
  id: 'it-bandwidth',
  subject: 'informatics',
  title: 'Скорость передачи данных',
  freeTitle: 'Передача файла',
  freeSub: 'Размер файла, канал связи, время',
  controls: [
    { id: 'size', label: 'Размер файла', min: 10, max: 500, step: 10, unit: 'Мбайт', value: 100 },
    { id: 'channel', label: 'Канал связи', min: 0, max: 3, step: 1, unit: '', value: 1, names: CHANNELS.map((c) => c.name), action: true, actionLabel: 'Выбрать канал на переключателе' },
    { id: 'send', label: 'Передача файла', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не начата', 'файл отправлен'], action: true, actionLabel: 'Нажать на файл на экране ноутбука' },
  ],
  formula: 't = V / v;  1 байт = 8 бит',
  hint: 'Нажмите на файл на экране ноутбука, чтобы отправить его. Канал выбирайте на переключателе наверху, размер — регулятором.',
  theory: 'Скорость передачи данных (пропускная способность канала) показывает, сколько бит передаётся за одну секунду; её измеряют в бит/с, Кбит/с и Мбит/с. Размер файла обычно указывают в байтах (Кбайт, Мбайт), поэтому сначала его переводят в биты: 1 байт = 8 бит. Время передачи равно объёму данных, делённому на скорость канала: t = V / v. В школьном курсе приставки двоичные: 1 Мбит = 1024 Кбит, 1 Мбайт = 1024 Кбайт. Чем выше скорость канала, тем быстрее передаётся файл: оптоволокно быстрее Wi-Fi, Wi-Fi быстрее мобильной связи 4G, а 2G — самый медленный из этих каналов.',

  readings(p) {
    // Для канала в Кбит/с объём нужен и в килобитах — иначе единицы при делении не совпадут
    const kb = channel(p).unit === 'Кбит/с' ? ` = ${kilobits(p)} Кбит` : '';
    return [
      { label: 'Канал связи', value: channel(p).name },
      { label: 'Скорость канала v', value: speedText(p) },
      { label: 'Размер файла V', value: `${p.size} Мбайт = ${megabits(p)} Мбит${kb}` },
      p.send
        ? { label: 'Время передачи t', value: timeText(seconds(p)) }
        : { label: 'Передача файла', value: 'не начата' },
    ];
  },

  describe(p) {
    if (!p.send) return `Файл ${p.size} Мбайт (${megabits(p)} Мбит) готов к отправке по каналу «${channel(p).name}» со скоростью ${speedText(p)}`;
    return `Файл ${p.size} Мбайт (${megabits(p)} Мбит) передан по каналу «${channel(p).name}» (${speedText(p)}) за t = ${timeText(seconds(p))}`;
  },

  create(container, params, set) {
    return itBandwidthScene(container, params, set, { CHANNELS, channel, seconds, num });
  },
};
