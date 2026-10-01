// Версия для слабовидящих: контрастная тема — чёрное на белом, крупный текст, толстые рамки
// (стили html.low-vision в style.css). Здесь только переключатель и запоминание выбора.

const KEY = 'ai-stem-lab:low-vision';

let buttons = [];

const isOn = () => document.documentElement.classList.contains('low-vision');

function render(on) {
  document.documentElement.classList.toggle('low-vision', on);
  for (const b of buttons) b.setAttribute('aria-pressed', String(on));
}

function setLowVision(on) {
  render(on);
  try {
    localStorage.setItem(KEY, on ? '1' : '');
  } catch {
    // Настройка просто не запомнится.
  }
}

export function initAccessibility(buttonIds) {
  buttons = buttonIds.map((id) => document.getElementById(id)).filter(Boolean);
  for (const b of buttons) b.addEventListener('click', () => setLowVision(!isOn()));
  let saved = false;
  try {
    saved = localStorage.getItem(KEY) === '1';
  } catch {
    // Без хранилища режим просто не восстановится после перезагрузки.
  }
  render(saved);
}
