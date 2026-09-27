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
  // Достижения
  flask: '<path d="M9 3h6"/><path d="M10 3v13a2 2 0 0 0 4 0V3"/><path d="M10 11h4"/>',
  beakers: '<path d="M4 6h7v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M13 9h7v9a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z"/><path d="M4 13h7M13 15h7"/>',
  microscope: '<path d="M6 21h12"/><path d="M9 18h6"/><path d="M12 18a6 6 0 0 0 5-9"/><path d="M8 3l4 2-3 6-4-2z"/><path d="M11 11l1.5 1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2 2 4-4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.8L7 22l5-3 5 3-1.5-8.2"/>',
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
  tools: 'mascot',
};

export function topicIcon(name) {
  const file = TOPIC_IMAGE[TOPIC_ICON[name] ?? name];
  // Картинка декоративная: название темы уже написано рядом текстом
  return file
    ? `<img src="/icons/${file}.webp" alt="" width="44" height="44" loading="lazy" decoding="async">`
    : lineIcon(name);
}
