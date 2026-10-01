// Качественные реакции альдегидов: «серебряное зеркало» с аммиачным раствором оксида серебра
// и восстановление свежеосаждённого гидроксида меди(II) до кирпично-красного Cu₂O.
// Обе пробирки стоят в одной водяной бане; ученик выбирает вещество (метаналь, этаналь, пропанон),
// добавляет реактивы и меняет температуру бани. Через 3 минуты в бане доля прореагировавшего
// реактива считается как 1 − e^(−k·t): альдегидная группа окисляется, кетон — нет.
// Скорость растёт с температурой по правилу Вант-Гоффа, поэтому без нагревания реакции почти не видно.
// Иллюстрация установки — в svg/scenes/carbonyl.js.

import { fmt } from './canvas.js';
import { carbonylScene } from '../svg/scenes/carbonyl.js';

export const TIME = 3; // мин — сколько пробирки выдерживают в бане при заданной температуре
const GAMMA = 3; // температурный коэффициент: при нагревании на 10 °C скорость растёт втрое

// В пробирке 1 — 2 мл аммиачного раствора оксида серебра с 0,2 ммоль Ag⁺: серебра может выделиться
// не больше 0,2 ммоль × 108 г/моль = 21,6 мг. В пробирке 2 — 0,2 ммоль свежего Cu(OH)₂,
// из него получится не больше 0,1 ммоль × 144 г/моль = 14,4 мг Cu₂O. Альдегида в обеих — избыток.
export const AG_MAX = 21.6;
export const CU2O_MAX = 14.4;

// Относительная активность: метаналь окисляется легче этаналя, у кетона нет атома водорода
// при карбонильном углероде — мягкие окислители его не окисляют
const K_AG = [2, 1, 0]; // 1/мин при 60 °C
const K_CU = [2, 1, 0]; // 1/мин при 90 °C: Cu(OH)₂ — окислитель слабее, нужен почти кипяток
const K_DEC = 0.8; // 1/мин при 90 °C: без альдегида Cu(OH)₂ при нагревании разлагается на чёрный CuO

const SUBSTANCES = ['метаналь (формальдегид)', 'этаналь (уксусный альдегид)', 'пропанон (ацетон)'];
const SHORT = ['Метаналь', 'Этаналь', 'Пропанон'];

const ext = (k) => 1 - Math.exp(-k * TIME);
const arrh = (T, at) => GAMMA ** ((T - at) / 10);

// Доля восстановленного серебра и доля Cu(OH)₂, превращённого в Cu₂O (0…1)
export const silverShare = (p) => (p.tollens ? ext(K_AG[p.substance] * arrh(p.T, 60)) : 0);
export const copperShare = (p) => (p.cuoh ? ext(K_CU[p.substance] * arrh(p.T, 90)) : 0);
// Доля Cu(OH)₂, разложившегося до CuO — только когда восстанавливать его нечему (кетон)
export const blackShare = (p) => (p.cuoh && !K_CU[p.substance] ? ext(K_DEC * arrh(p.T, 90)) : 0);

// Что видно в пробирках. Пороги общие для показаний и для рисунка в сцене
export function silverLook(p) {
  const x = silverShare(p);
  if (x < 0.1) return 'раствор прозрачный, изменений нет';
  if (x < 0.5) return 'раствор потемнел, на стенках серый налёт';
  return 'на стенках серебряное зеркало';
}

export function copperLook(p) {
  const x = copperShare(p);
  if (blackShare(p) >= 0.5) return 'осадок почернел — CuO';
  if (x < 0.15) return 'голубой осадок Cu(OH)₂';
  if (x < 0.6) return 'осадок пожелтел — CuOH';
  return 'кирпично-красный осадок Cu₂O';
}

export default {
  id: 'carbonyl',
  subject: 'chemistry',
  title: 'Качественные реакции альдегидов',
  freeTitle: 'Альдегиды и кетоны',
  freeSub: 'Серебряное зеркало, Cu(OH)₂, водяная баня',
  controls: [
    { id: 'T', label: 'Температура бани', min: 20, max: 100, step: 5, unit: '°C', value: 20 },
    // Действия на сцене: склянку с веществом выбирают щелчком, реактивы переносят пипетками в пробирки
    { id: 'substance', label: 'Вещество в пробирках', min: 0, max: 2, step: 1, unit: '', value: 1, names: SUBSTANCES, action: true, actionLabel: 'Выбрать склянку с веществом' },
    { id: 'tollens', label: 'Аммиачный раствор Ag₂O', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не добавлен', 'добавлен в пробирку 1'], action: true, actionLabel: 'Перенести капельницу из тёмной склянки к пробирке 1' },
    { id: 'cuoh', label: 'Свежий Cu(OH)₂', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['не добавлен', 'добавлен в пробирку 2'], action: true, actionLabel: 'Перенести пипетку из стаканчика к пробирке 2' },
  ],
  formula: 'R–CHO + Ag₂O → R–COOH + 2Ag↓ (NH₃, t)\nR–CHO + 2Cu(OH)₂ → R–COOH + Cu₂O↓ + 2H₂O (t)',
  hint: 'Щёлкните по склянке с веществом, затем по реактивам 1 и 2. Нагрейте баню ползунком или ручкой плитки.',
  chart: { x: 'T', y: (p) => Math.round(silverShare({ ...p, tollens: 1 }) * AG_MAX * 10) / 10, xLabel: 'T бани, °C', yLabel: 'выделилось серебра, мг', series: (p) => SHORT[p.substance] },
  theory: 'В молекуле альдегида карбонильная группа связана с атомом водорода, поэтому альдегиды легко окисляются до карбоновых кислот. Качественные реакции на альдегидную группу: с аммиачным раствором оксида серебра при нагревании на стенках пробирки образуется «серебряное зеркало», со свежеосаждённым гидроксидом меди(II) при нагревании выпадает кирпично-красный осадок оксида меди(I) Cu₂O. Кетоны (ацетон) этих реакций не дают: у них карбонильная группа связана с двумя углеводородными радикалами. Обе реакции идут при нагревании: при комнатной температуре они очень медленные.',

  readings(p) {
    const ag = silverShare(p) * AG_MAX;
    const cu = copperShare(p) * CU2O_MAX;
    // Вещество в строки не выносим: выбранная склянка на сцене подсвечена и подписана
    return [
      { label: 'Пробирка 1', value: p.tollens ? silverLook(p) : 'реактив не добавлен' },
      { label: 'Серебро', value: p.tollens ? `${fmt(ag, 1)} мг` : '—' },
      { label: 'Пробирка 2', value: p.cuoh ? copperLook(p) : 'реактив не добавлен' },
      { label: 'Оксид Cu₂O', value: p.cuoh ? `${fmt(cu, 1)} мг` : '—' },
    ];
  },

  describe(p) {
    const name = SHORT[p.substance];
    if (!p.tollens && !p.cuoh) return `${name}, ${p.T} °C: реактивы ещё не добавлены`;
    const parts = [];
    if (p.tollens) {
      const ag = silverShare(p) * AG_MAX;
      parts.push(`с аммиачным раствором Ag₂O — ${silverLook(p)} (Ag: ${fmt(ag, 1)} мг)`);
    }
    if (p.cuoh) {
      const cu = copperShare(p) * CU2O_MAX;
      parts.push(`с Cu(OH)₂ — ${copperLook(p)} (Cu₂O: ${fmt(cu, 1)} мг)`);
    }
    return `${name}, ${p.T} °C: ${parts.join('; ')}`;
  },

  create(container, params, set) {
    return carbonylScene(container, params, set, { silverShare, copperShare, blackShare });
  },
};
