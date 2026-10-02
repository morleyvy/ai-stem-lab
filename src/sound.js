// Звуки опытов: хлопок пробки, струя, шипение, горелка, взрыв, щелчок выключателя.
// Всё синтезируется Web Audio прямо в браузере — ни одного звукового файла, поэтому звук
// работает офлайн и не утяжеляет сайт. Громкость нарочно тихая: в классе может быть
// тридцать ноутбуков сразу. Кнопка 🔊 выключает звук, выбор запоминается.
//
// play(name) — короткий звук; level(name, 0..1) — непрерывный (шипение, кипение, горелка):
// его надо подтверждать каждым кадром сцены, иначе он сам затихает. Так звук не «залипает»,
// когда сцена скрыта и её кадры не рисуются.

const KEY = 'ai-stem-lab:sound';
const VOLUME = 0.35;
const STALE_MS = 200;

let on = true;
let ctx = null;
let master = null;
let noiseBuf = null;
let buttons = [];
const loops = new Map();
let watchdog = 0;
// Было ли действие пользователя: до него браузер звук не пустит, и копить звуки незачем
let unlocked = false;

function audio() {
  if (!on) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  // Браузер разрешает звук только после действия пользователя; кадры сцены могут
  // попросить звук раньше — тогда контекст ждёт первого нажатия (см. initSound)
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  return ctx;
}

// Короткий тон с затуханием: частота скользит от f0 к f1
function tone({ type = 'sine', f0, f1 = f0, dur, gain = 0.3, attack = 0.005, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// Шум через фильтр: струя, шипение, «вжух», хлопок
function noise({ filter = 'bandpass', f0, f1 = f0, q = 1, dur, gain = 0.3, attack = 0.01, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = filter;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

const SOUNDS = {
  // Ползунок: тихий тик, высота растёт вместе со значением (k = 0..1)
  tick: (k = 0.5) => tone({ type: 'triangle', f0: 500 + 900 * k, dur: 0.035, gain: 0.05 }),
  click: () => {
    tone({ type: 'square', f0: 1800, f1: 1100, dur: 0.03, gain: 0.08 });
    noise({ filter: 'highpass', f0: 3000, dur: 0.02, gain: 0.1 });
  },
  // Пробку вынимают с лёгким «чпок»
  uncork: () => {
    tone({ f0: 320, f1: 950, dur: 0.09, gain: 0.45 });
    noise({ f0: 1600, dur: 0.05, gain: 0.15, q: 2 });
  },
  cork: () => tone({ f0: 520, f1: 210, dur: 0.07, gain: 0.3 }),
  pour: () => {
    noise({ filter: 'bandpass', f0: 700, f1: 480, q: 1.4, dur: 0.75, gain: 0.22, attack: 0.1 });
    noise({ filter: 'highpass', f0: 2500, dur: 0.6, gain: 0.05, attack: 0.1, delay: 0.05 });
  },
  drip: () => {
    for (const delay of [0.05, 0.35, 0.65]) tone({ f0: 1300, f1: 520, dur: 0.08, gain: 0.25, delay });
  },
  // Кусочек металла падает в стакан: глухой удар и звон стекла
  plop: () => {
    tone({ f0: 240, f1: 90, dur: 0.16, gain: 0.4 });
    tone({ type: 'triangle', f0: 2600, f1: 2500, dur: 0.18, gain: 0.06, delay: 0.01 });
  },
  ignite: () => noise({ f0: 300, f1: 1400, q: 0.8, dur: 0.4, gain: 0.3, attack: 0.05 }),
  // Водород сгорает с хлопком
  boom: () => {
    noise({ filter: 'lowpass', f0: 2400, f1: 150, dur: 0.55, gain: 0.9, attack: 0.003 });
    tone({ f0: 130, f1: 40, dur: 0.45, gain: 0.7, attack: 0.003 });
  },
  hiss: () => noise({ filter: 'highpass', f0: 3200, f1: 2000, dur: 0.7, gain: 0.15, attack: 0.02 }),
  chime: () => {
    tone({ type: 'triangle', f0: 880, dur: 0.35, gain: 0.12 });
    tone({ type: 'triangle', f0: 1320, dur: 0.45, gain: 0.1, delay: 0.12 });
  },
  shimmer: () => {
    for (let i = 0; i < 4; i++) tone({ f0: 1700 + Math.random() * 900, dur: 0.25, gain: 0.05, delay: i * 0.09 });
  },
  success: () => {
    tone({ type: 'triangle', f0: 660, dur: 0.15, gain: 0.15 });
    tone({ type: 'triangle', f0: 990, dur: 0.25, gain: 0.15, delay: 0.12 });
  },
  error: () => {
    tone({ type: 'triangle', f0: 330, dur: 0.14, gain: 0.15 });
    tone({ type: 'triangle', f0: 220, dur: 0.22, gain: 0.15, delay: 0.13 });
  },
  switchOn: () => {
    SOUNDS.click();
    tone({ type: 'sawtooth', f0: 100, dur: 0.35, gain: 0.04, attack: 0.03, delay: 0.03 });
  },
  switchOff: () => tone({ type: 'square', f0: 1100, f1: 700, dur: 0.03, gain: 0.07 }),
  whoosh: () => noise({ f0: 400, f1: 1600, q: 1, dur: 0.35, gain: 0.25, attack: 0.06 }),
  blip: () => {
    [620, 830, 1040].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.06, gain: 0.05, delay: i * 0.07 }));
  },
};

// Непрерывные звуки. mod — небольшая случайность в каждом кадре: из ровного шума
// получается треск пузырьков, бульканье или живое пламя
const LOOPS = {
  fizz: { filter: 'highpass', f: 3500, q: 0.7, gain: 0.25, mod: () => 0.5 + Math.random() * 0.5 },
  boil: { filter: 'lowpass', f: 450, q: 1, gain: 0.5, mod: () => (Math.random() < 0.3 ? 1 : 0.25) },
  burner: { filter: 'bandpass', f: 260, q: 0.7, gain: 0.35, mod: () => 0.85 + Math.random() * 0.15 },
};

function makeLoop(name) {
  const conf = LOOPS[name];
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = conf.filter;
  flt.frequency.value = conf.f;
  flt.Q.value = conf.q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(flt).connect(g).connect(master);
  src.start(0, Math.random());
  const loop = { src, g, last: performance.now(), silentSince: 0 };
  loops.set(name, loop);
  if (!watchdog) watchdog = setInterval(checkLoops, 250);
  return loop;
}

function stopLoop(name, loop) {
  try {
    loop.src.stop();
  } catch {
    // Уже остановлен
  }
  loops.delete(name);
}

// Сцена перестала подтверждать звук (скрыта, опыт закончился) — затихаем,
// а через пару секунд тишины освобождаем источник
function checkLoops() {
  const now = performance.now();
  for (const [name, loop] of loops) {
    if (now - loop.last > STALE_MS) {
      loop.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      loop.silentSince ||= now;
      if (now - loop.silentSince > 2000) stopLoop(name, loop);
    }
  }
  if (!loops.size) {
    clearInterval(watchdog);
    watchdog = 0;
  }
}

export function play(name, arg) {
  if (!SOUNDS[name] || !unlocked || !audio() || document.hidden) return;
  // После паузы контекст просыпается не мгновенно — звук нажатия не должен потеряться
  if (ctx.state === 'running') SOUNDS[name](arg);
  else ctx.resume().then(() => SOUNDS[name](arg)).catch(() => {});
}

export function level(name, value) {
  if (!LOOPS[name] || !unlocked || !audio()) return;
  if (value <= 0.01) {
    const loop = loops.get(name);
    if (loop) loop.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    return;
  }
  const loop = loops.get(name) ?? makeLoop(name);
  loop.last = performance.now();
  loop.silentSince = 0;
  const conf = LOOPS[name];
  loop.g.gain.setTargetAtTime(Math.min(1, value) * conf.gain * conf.mod(), ctx.currentTime, 0.04);
}

function render() {
  for (const b of buttons) b.setAttribute('aria-pressed', String(on));
}

function setSound(value) {
  on = value;
  render();
  if (!on) {
    for (const [name, loop] of loops) stopLoop(name, loop);
    ctx?.suspend().catch(() => {});
  } else {
    audio();
    play('click');
  }
  try {
    localStorage.setItem(KEY, on ? '' : 'off');
  } catch {
    // Настройка просто не запомнится.
  }
}

export function initSound(buttonIds) {
  try {
    on = localStorage.getItem(KEY) !== 'off';
  } catch {
    // Без хранилища звук просто включён по умолчанию.
  }
  buttons = buttonIds.map((id) => document.getElementById(id)).filter(Boolean);
  for (const b of buttons) b.addEventListener('click', () => setSound(!on));
  render();
  // Контекст создаём на первом нажатии — раньше браузер его всё равно не запустит
  const unlock = () => {
    unlocked = true;
    audio();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // Вкладка в фоне — звук на паузе, чтобы шипение не продолжалось за кадром
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !on) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}
