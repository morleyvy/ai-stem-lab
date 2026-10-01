// Тонкие линейные иконки для карточек тем и инструментов (24×24, обводка 1.6, цвет — currentColor).

const PATHS = {
  // Химия
  metals: '<path d="M4 17l4-8h8l4 8z"/><path d="M8 9l2-4h4l2 4"/><path d="M4 17h16v2H4z"/>',
  acids: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  rate: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-3"/><path d="M10 2h4"/><path d="M12 2v3"/>',
  // Физика
  mechanics: '<path d="M4 4h16"/><path d="M12 4l4 11"/><circle cx="16.5" cy="17" r="3"/>',
  electricity: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  optics: '<circle cx="12" cy="12" r="3.5"/><path d="M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
  heat: '<path d="M14 14.8V4.5a2.5 2.5 0 0 0-5 0v10.3a4.5 4.5 0 1 0 5 0z"/><path d="M11.5 9v7"/>',
  // Биология
  cell: '<ellipse cx="12" cy="12" rx="9" ry="7"/><circle cx="14" cy="11" r="2.5"/><circle cx="8" cy="13" r="1"/><circle cx="10" cy="8.5" r="0.8"/>',
  plants: '<path d="M12 21V11"/><path d="M12 14c-4 0-7-3-7-8 4 0 7 3 7 8z"/><path d="M12 11c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
  human: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5 12h4l2-3 2 5 2-2h4"/>',
  microbes: '<circle cx="9" cy="10" r="4.5"/><circle cx="16" cy="15" r="3.5"/><path d="M9 5.5V3M13.5 10H16M9 14.5V17M4.5 10H3M16 11.5V10M19.5 15H21"/>',
  genetics: '<path d="M7 3c0 6 10 6 10 12s-10 6-10 6"/><path d="M17 3c0 6-10 6-10 12s10 6 10 6"/><path d="M8.5 7h7M8.5 17h7M10 12h4"/>',
  // Новые темы химии
  mixture: '<path d="M7 3h10"/><path d="M8 3v5l-4 9a2.5 2.5 0 0 0 2.3 3.5h11.4A2.5 2.5 0 0 0 20 17l-4-9V3"/><circle cx="9.5" cy="16" r="1"/><circle cx="13" cy="14" r="0.8"/><circle cx="15" cy="17" r="1.1"/>',
  air: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.6 3-5.5 3.5-9.3 2.4 1.5 3.3 3.6 3.3 5.4 1-.8 1.6-2 1.7-3.4 2.3 1.9 3.5 4.4 3.5 7.3 0 3.6-2.5 6.2-5.5 6.2z"/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.6 1.4-2.4 1.8-4 1.6.9 3.8 2.3 3.8 4 0 1.6-1.1 2.8-2.8 2.8z"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-60 12 12)"/>',
  redox: '<path d="M4 9h13l-3-3"/><path d="M20 15H7l3 3"/><circle cx="5" cy="15" r="1.5"/><circle cx="19" cy="9" r="1.5"/>',
  benzene: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="4"/>',
  // Новые темы физики
  motion: '<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M4 17V11l3-4h7l4 4h2v6"/><path d="M2 7h3M1 10h3"/>',
  force: '<rect x="3" y="11" width="8" height="8" rx="1"/><path d="M11 15h10"/><path d="M18 12l3 3-3 3"/>',
  energy: '<path d="M4 20h16"/><path d="M6 20V9"/><path d="M6 9l5-5"/><circle cx="16" cy="9" r="2.5"/><path d="M16 11.5V17"/><path d="M13.5 17h5"/>',
  wave: '<path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0 2 3 2 3"/>',
  radiation: '<circle cx="12" cy="12" r="2"/><path d="M12 10V3a9 9 0 0 1 7.8 4.5l-6.1 3.5"/><path d="M13.7 13l6.1 3.5A9 9 0 0 1 12 21v-7"/><path d="M10.3 13l-6.1 3.5A9 9 0 0 1 4.2 7.5L10.3 11"/>',
  // Новые темы биологии
  brain: '<path d="M12 5a3 3 0 0 0-5.6 1.5A3 3 0 0 0 4.5 11a3 3 0 0 0 1 5 3 3 0 0 0 4 3.5L12 19"/><path d="M12 5a3 3 0 0 1 5.6 1.5A3 3 0 0 1 19.5 11a3 3 0 0 1-1 5 3 3 0 0 1-4 3.5L12 19"/><path d="M12 5v14"/>',
  // Информатика
  binary: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9v6M10.5 9h2v6h-2zM16 9v6"/>',
  network: '<rect x="9.5" y="3" width="5" height="4" rx="1"/><rect x="2.5" y="17" width="5" height="4" rx="1"/><rect x="9.5" y="17" width="5" height="4" rx="1"/><rect x="16.5" y="17" width="5" height="4" rx="1"/><path d="M12 7v10M5 17v-3h14v3"/>',
  logic: '<path d="M4 6h6a6 6 0 0 1 0 12H4z"/><path d="M1 9h3M1 15h3M16 12h7"/>',
  code: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9 8.5L6.5 10.5 9 12.5M15 8.5l2.5 2 -2.5 2M13 8l-2 5"/>',
  // Достижения
  flask: '<path d="M9 3h6"/><path d="M10 3v13a2 2 0 0 0 4 0V3"/><path d="M10 11h4"/>',
  beakers: '<path d="M4 6h7v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M13 9h7v9a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z"/><path d="M4 13h7M13 15h7"/>',
  microscope: '<path d="M6 21h12"/><path d="M9 18h6"/><path d="M12 18a6 6 0 0 0 5-9"/><path d="M8 3l4 2-3 6-4-2z"/><path d="M11 11l1.5 1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2 2 4-4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.8L7 22l5-3 5 3-1.5-8.2"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  // Инструменты
  tools: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4"/><circle cx="12" cy="3" r="1"/><path d="M9 12v1M15 12v1M9.5 16h5"/>',
};

// Тема → иконка (по названию темы из каталога)
const TOPIC_ICON = {
  'Металлы': 'metals',
  'Кислоты, основания и соли': 'acids',
  'Скорость химической реакции': 'rate',
  'Механика': 'mechanics',
  'Электричество': 'electricity',
  'Оптика': 'optics',
  'Тепловые явления': 'heat',
  'Клетка': 'cell',
  'Растения': 'plants',
  'Человек': 'human',
  'Микроорганизмы': 'microbes',
  'Генетика': 'genetics',
  'Вещества и смеси': 'mixture',
  'Воздух и кислород': 'air',
  'Растворы': 'beakers',
  'Энергия в химических реакциях': 'flame',
  'Строение атома': 'atom',
  'Окислительно-восстановительные реакции': 'redox',
  'Органическая химия': 'benzene',
  'Кинематика': 'motion',
  'Динамика': 'force',
  'Работа, энергия и импульс': 'energy',
  'Колебания и переменный ток': 'wave',
  'Атомное ядро': 'radiation',
  'Регуляция и движение': 'brain',
  'Биотехнология': 'genetics',
  'Информация и её кодирование': 'binary',
  'Устройство компьютера': 'chip',
  'Компьютерные сети': 'network',
  'Алгоритмы и программы': 'code',
  'Логические основы компьютера': 'logic',
  'Инструменты': 'tools',
};

export function lineIcon(name) {
  const key = TOPIC_ICON[name] ?? name;
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[key] ?? PATHS.tools}</svg>`;
}

// Объёмные иконки тем (public/icons, 192×192 WebP). Линейная иконка остаётся запасной для тем без картинки.
// «Инструменты» — это лаборатория и ИИ-ассистент, поэтому их представляет маскот.
const TOPIC_IMAGE = {
  metals: 'metals', acids: 'acids', rate: 'rate',
  mechanics: 'mechanics', electricity: 'electricity', optics: 'optics', heat: 'heat',
  cell: 'cell', plants: 'plants', human: 'human', microbes: 'microbes', genetics: 'genetics',
  mixture: 'mixture', air: 'air', beakers: 'beakers', atom: 'atom', force: 'force', energy: 'energy',
  chip: 'chip', network: 'network',
  tools: 'mascot',
};

export function topicIcon(name) {
  const file = TOPIC_IMAGE[TOPIC_ICON[name] ?? name];
  // Картинка декоративная: название темы уже написано рядом текстом
  return file
    ? `<img src="/icons/${file}.webp" alt="" width="44" height="44" loading="lazy" decoding="async">`
    : lineIcon(name);
}
