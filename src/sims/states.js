// Изменение агрегатного состояния воды: лёд из морозилки (−10 °C) нагревают на электроплитке
// до кипения. Подведённая теплота Q = P·t последовательно идёт на нагрев льда, плавление (0 °C),
// нагрев воды и кипение (100 °C). Пока идёт плавление или кипение, вся теплота уходит
// на изменение состояния, поэтому на графике t(время) получаются горизонтальные площадки.
// Мощность и масса меняют длительность площадок, но не их температуру — это и проверяет ученик.
// Потери теплоты в воздух не учитываем: P — полезная мощность, дошедшая до вещества.
// Иллюстрация установки — в svg/scenes/states.js.

import { fmt } from './canvas.js';
import { statesScene } from '../svg/scenes/states.js';

// Табличные значения из учебника физики (те же, что в задачах 8 класса)
const C_ICE = 2100; // Дж/(кг·°C) — удельная теплоёмкость льда
const C_WATER = 4200; // Дж/(кг·°C) — удельная теплоёмкость воды
const LAMBDA = 3.4e5; // Дж/кг — удельная теплота плавления льда
const L_VAP = 2.3e6; // Дж/кг — удельная теплота парообразования воды
export const T_START = -10; // °C — лёд прямо из морозильника
export const T_MELT = 0;
export const T_BOIL = 100; // при нормальном атмосферном давлении

// Границы участков нагрева в джоулях для массы m (г): нагрев льда, плавление, нагрев воды, кипение
function stages(m) {
  const kg = m / 1000;
  const ice = C_ICE * kg * (T_MELT - T_START);
  const melt = LAMBDA * kg;
  const water = C_WATER * kg * (T_BOIL - T_MELT);
  const boil = L_VAP * kg;
  return { ice, melt, water, boil, kg };
}

// Состояние вещества через t минут нагрева (по умолчанию — время с регулятора).
// Возвращает температуру, фазу, массы льда, воды и пара и времена начала/конца площадок.
export function stateAt(p, t = p.time) {
  const st = stages(p.m);
  const P = p.P;
  const toMin = (q) => q / P / 60;
  const meltStart = toMin(st.ice);
  const meltEnd = toMin(st.ice + st.melt);
  const boilStart = toMin(st.ice + st.melt + st.water);
  const boilEnd = toMin(st.ice + st.melt + st.water + st.boil);
  const timing = { meltStart, meltEnd, boilStart, boilEnd };
  const Q = p.heater ? P * t * 60 : 0;
  if (Q < st.ice) return { ...timing, phase: 0, T: T_START + Q / (C_ICE * st.kg), ice: p.m, water: 0, vapor: 0 };
  if (Q < st.ice + st.melt) {
    const melted = ((Q - st.ice) / LAMBDA) * 1000;
    return { ...timing, phase: 1, T: T_MELT, ice: p.m - melted, water: melted, vapor: 0 };
  }
  if (Q < st.ice + st.melt + st.water) {
    return { ...timing, phase: 2, T: T_MELT + (Q - st.ice - st.melt) / (C_WATER * st.kg), ice: 0, water: p.m, vapor: 0 };
  }
  const vapor = ((Q - st.ice - st.melt - st.water) / L_VAP) * 1000;
  if (vapor >= p.m) return { ...timing, phase: 4, T: T_BOIL, ice: 0, water: 0, vapor: p.m };
  return { ...timing, phase: 3, T: T_BOIL, ice: 0, water: p.m - vapor, vapor };
}

// Что видно на холодном стекле над стаканом: при кипении пар конденсируется в капли,
// над тёплой водой стекло лишь слегка запотевает, надо льдом и холодной водой — сухое
export function glassLevel(p) {
  if (!p.glass) return -1;
  const s = stateAt(p);
  if (s.phase === 3) return 2;
  if (s.phase === 2 && s.T >= 40) return 1;
  return 0;
}
const GLASS_SUFFIX = ['; холодное стекло сухое', '; холодное стекло слегка запотело', '; на холодном стекле пар конденсируется в капли воды'];

const min = (v) => String(v).replace('.', ',');

export default {
  id: 'states',
  subject: 'chemistry',
  title: 'Плавление и кипение воды',
  freeTitle: 'Лёд, вода и пар',
  freeSub: 'Плавление, кипение, конденсация',
  controls: [
    { id: 'm', label: 'Масса льда', min: 50, max: 200, step: 50, unit: 'г', value: 100 },
    { id: 'P', label: 'Мощность нагревателя', min: 100, max: 500, step: 50, unit: 'Вт', value: 200 },
    { id: 'time', label: 'Время нагрева', min: 0, max: 15, step: 0.5, unit: 'мин', value: 0 },
    // Действия на сцене: тумблер на корпусе плитки и холодное стекло, которое подносят к стакану
    { id: 'heater', label: 'Нагреватель', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['выключен', 'включён'], action: true, actionLabel: 'Включить нагреватель' },
    { id: 'glass', label: 'Холодное стекло', min: 0, max: 1, step: 1, unit: '', value: 0, names: ['лежит на льду', 'над стаканом'], action: true, actionLabel: 'Подержать холодное стекло над стаканом' },
  ],
  formula: 'лёд ⇄ вода ⇄ пар (плавление 0 °C, кипение 100 °C)',
  hint: 'Нажмите тумблер на плитке и двигайте «Время нагрева». Ручка плитки меняет мощность, холодное стекло перетащите к стакану.',
  theory: 'Вещество может находиться в твёрдом, жидком и газообразном состоянии. Переход из твёрдого состояния в жидкое — плавление, из жидкого в газообразное — парообразование (испарение и кипение), из газообразного в жидкое — конденсация, из жидкого в твёрдое — кристаллизация. Пока лёд плавится, его температура остаётся 0 °C, а пока вода кипит — 100 °C (при нормальном давлении): вся подводимая теплота идёт на изменение состояния. Поэтому температуры плавления и кипения — постоянные характеристики чистого вещества.',

  // Состояние вещества видно по строке «В стакане» (лёд, вода или и то и другое), а холодное стекло —
  // на сцене и в журнале через describe(): так в панели не больше четырёх строк
  readings(p) {
    const s = stateAt(p);
    const meltRow = s.phase === 0 ? 'ещё не началось' : s.phase === 1 ? `идёт ${fmt(p.time - s.meltStart, 1)} мин` : `длилось ${fmt(s.meltEnd - s.meltStart, 1)} мин`;
    const boilRow = s.phase < 3 ? 'ещё не началось' : s.phase === 3 ? `идёт ${fmt(p.time - s.boilStart, 1)} мин` : `вся вода выкипела за ${fmt(s.boilEnd - s.boilStart, 1)} мин`;
    const content = [
      `лёд ${p.m} г`,
      `лёд ${fmt(s.ice, 1)} г, вода ${fmt(s.water, 1)} г`,
      `вода ${p.m} г`,
      `вода ${fmt(s.water, 1)} г, выкипело ${fmt(s.vapor, 1)} г`,
      'стакан пустой',
    ][s.phase];
    return [
      { label: 'Температура', value: s.phase === 4 ? 'воды нет' : `${fmt(s.T, 1)} °C` },
      { label: 'В стакане', value: content },
      { label: 'Плавление', value: meltRow },
      { label: 'Кипение', value: boilRow },
    ];
  },

  describe(p) {
    const s = stateAt(p);
    const g = glassLevel(p);
    if (!p.heater) return `Нагреватель выключен: ${p.m} г льда при −10 °C`;
    const head = `${min(p.time)} мин, ${p.P} Вт: `;
    const tail = g < 0 ? '' : GLASS_SUFFIX[g];
    if (s.phase === 0) return `${head}температура льда ${fmt(s.T, 1)} °C — лёд ещё не тает${tail}`;
    if (s.phase === 1) return `${head}идёт плавление при 0 °C — растаяло ${fmt(s.water, 1)} г льда из ${p.m} г${tail}`;
    if (s.phase === 2) return `${head}весь лёд растаял за ${fmt(s.meltEnd - s.meltStart, 1)} мин, вода нагрелась до ${fmt(s.T, 1)} °C${tail}`;
    if (s.phase === 3) return `${head}вода кипит при 100 °C уже ${fmt(p.time - s.boilStart, 1)} мин, выкипело ${fmt(s.vapor, 1)} г${tail}`;
    return `${head}вся вода выкипела${tail}`;
  },

  create(container, params, set) {
    return statesScene(container, params, set, { stateAt, glassLevel });
  },
};
