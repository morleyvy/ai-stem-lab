// Проверенная база реакций — единственный источник химических фактов в приложении.
// ИИ только разбирает запрос и объясняет результат, но НЕ решает, что произойдёт:
// иначе модель может «выдумать» реакцию (например, медь + разбавленная кислота).
//
// Важно: если пары нет в базе, мы говорим «не моделируется», а НЕ «реакции нет» —
// например, цинк реагирует со щёлочью, и ложное «ничего не будет» было бы ошибкой.

const COLORLESS = '#b5d9f0';
const PALE_GREEN = '#b5d99c';
const BLUE = '#2f8fd8';

const SAFETY_ACID = 'В реальной лаборатории с кислотами работают только в очках и перчатках, под присмотром учителя.';
const SAFETY_BASE = 'Щёлочь разъедает кожу и опасна для глаз — только в очках и перчатках.';
const SAFETY_SO2 = 'SO₂ — ядовитый газ. Этот опыт проводят только под вытяжкой, в школе его заменяют видеодемонстрацией.';

const ACTIVITY_WHY = (metal) =>
  `${metal} стоит в ряду активности металлов левее водорода, поэтому вытесняет водород из кислоты.`;

// Реакции металлов с кислотами, где выделяется водород.
function metalAcid({ metal, eq, eqConc, rate, liquidEnd = COLORLESS, extra = [] }) {
  return (T, conc) => {
    if (conc === 'concentrated' && eqConc) return eqConc(T);
    return {
      type: 'reaction',
      equation: eq,
      see: 'gas',
      baseRate: rate,
      visual: { liquidEnd, bubbles: 1, solidDissolves: true, gas: 'H₂' },
      observations: [
        `${metal} покрывается пузырьками газа и постепенно растворяется`,
        'Выделяется бесцветный газ без запаха — водород (H₂)',
        ...extra,
      ],
      why: ACTIVITY_WHY(metal),
      hint: 'А что будет, если заменить металл на медь?',
      safety: SAFETY_ACID,
    };
  };
}

const notModeledConcH2SO4 = (metal) => () => ({
  type: 'not_modeled',
  why: `${metal} с концентрированной серной кислотой реагирует иначе: вместо водорода образуются SO₂, S или H₂S — в зависимости от условий. Этот опыт лаборатория пока не моделирует. Попробуй разбавленную кислоту.`,
});

export const REACTIONS = [
  {
    reactants: ['acid_hcl', 'metal_zn'],
    resolve: metalAcid({ metal: 'Цинк', eq: 'Zn + 2HCl → ZnCl₂ + H₂↑', rate: 0.5 }),
  },
  {
    reactants: ['acid_hcl', 'metal_mg'],
    resolve: metalAcid({
      metal: 'Магний', eq: 'Mg + 2HCl → MgCl₂ + H₂↑', rate: 1.2,
      extra: ['Реакция бурная, пробирка заметно нагревается'],
    }),
  },
  {
    reactants: ['acid_hcl', 'metal_fe'],
    resolve: metalAcid({
      metal: 'Железо', eq: 'Fe + 2HCl → FeCl₂ + H₂↑', rate: 0.25, liquidEnd: PALE_GREEN,
      extra: ['Раствор постепенно становится бледно-зелёным (ионы Fe²⁺)'],
    }),
  },
  {
    reactants: ['acid_h2so4', 'metal_zn'],
    resolve: metalAcid({
      metal: 'Цинк', eq: 'Zn + H₂SO₄(разб.) → ZnSO₄ + H₂↑', rate: 0.5,
      eqConc: notModeledConcH2SO4('Цинк'),
    }),
  },
  {
    reactants: ['acid_h2so4', 'metal_mg'],
    resolve: metalAcid({
      metal: 'Магний', eq: 'Mg + H₂SO₄(разб.) → MgSO₄ + H₂↑', rate: 1.2,
      eqConc: notModeledConcH2SO4('Магний'),
      extra: ['Реакция бурная, пробирка заметно нагревается'],
    }),
  },
  {
    reactants: ['acid_h2so4', 'metal_fe'],
    resolve: metalAcid({
      metal: 'Железо', eq: 'Fe + H₂SO₄(разб.) → FeSO₄ + H₂↑', rate: 0.25, liquidEnd: PALE_GREEN,
      extra: ['Раствор постепенно становится бледно-зелёным (ионы Fe²⁺)'],
      eqConc: (T) => T < 60
        ? {
          type: 'no_reaction',
          why: 'Концентрированная серная кислота на холоде покрывает железо тонкой прочной плёнкой (пассивирует), и реакция не идёт. Поэтому такую кислоту можно перевозить в стальных цистернах.',
          hint: 'А если кислоту разбавить?',
          safety: SAFETY_ACID,
        }
        : notModeledConcH2SO4('Железо')(),
    }),
  },
  {
    reactants: ['acid_hcl', 'metal_cu'],
    resolve: () => ({
      type: 'no_reaction',
      why: 'Медь стоит в ряду активности металлов правее водорода, поэтому не может вытеснить водород из соляной кислоты.',
      hint: 'Сравните с цинком или магнием.',
      safety: SAFETY_ACID,
    }),
  },
  {
    reactants: ['acid_h2so4', 'metal_cu'],
    resolve: (T, conc) => {
      if (conc === 'dilute') {
        return {
          type: 'no_reaction',
          why: 'Медь стоит правее водорода в ряду активности, поэтому с разбавленной серной кислотой не реагирует.',
          hint: 'А если взять концентрированную кислоту и нагреть?',
          safety: SAFETY_ACID,
        };
      }
      if (T < 60) {
        return {
          type: 'no_reaction',
          why: 'Концентрированная серная кислота окисляет медь только при нагревании. На холоде реакция практически не идёт.',
          hint: 'Нагрейте раствор выше 60 °C.',
          safety: SAFETY_ACID,
        };
      }
      return {
        type: 'reaction',
        equation: 'Cu + 2H₂SO₄(конц.) → CuSO₄ + SO₂↑ + 2H₂O',
        see: 'gas',
        baseRate: 0.2,
        visual: { liquidEnd: '#6fb3e0', bubbles: 0.8, solidDissolves: true, gas: 'SO₂' },
        observations: [
          'Медь постепенно растворяется',
          'Выделяется бесцветный газ с резким запахом — сернистый газ (SO₂)',
          'Образуется сульфат меди — после разбавления водой раствор голубой',
        ],
        why: 'Здесь водород не выделяется: концентрированная серная кислота — сильный окислитель, она окисляет медь, а сама восстанавливается до SO₂.',
        hint: 'Сравните с разбавленной кислотой: почему там реакция не идёт?',
        safety: SAFETY_SO2,
      };
    },
  },
  {
    reactants: ['metal_fe', 'salt_cuso4'],
    resolve: () => ({
      type: 'reaction',
      equation: 'Fe + CuSO₄ → FeSO₄ + Cu',
      see: 'color',
      baseRate: 0.25,
      visual: { liquidEnd: PALE_GREEN, coating: '#b5532a' },
      observations: [
        'Железо покрывается красным налётом меди',
        'Синий раствор бледнеет и становится зеленоватым',
      ],
      why: 'Железо активнее меди, поэтому вытесняет медь из раствора её соли.',
      hint: 'А медь вытеснит железо обратно? Почему?',
      safety: 'Медный купорос ядовит — не пробуй на вкус и мой руки после опыта.',
    }),
  },
  {
    reactants: ['metal_zn', 'salt_cuso4'],
    resolve: () => ({
      type: 'reaction',
      equation: 'Zn + CuSO₄ → ZnSO₄ + Cu',
      see: 'color',
      baseRate: 0.35,
      visual: { liquidEnd: COLORLESS, coating: '#b5532a' },
      observations: [
        'Цинк покрывается рыхлым красным налётом меди',
        'Синий раствор постепенно обесцвечивается',
      ],
      why: 'Цинк активнее меди, поэтому вытесняет медь из раствора её соли.',
      hint: 'Что будет, если вместо цинка взять медь?',
      safety: 'Медный купорос ядовит — не пробуй на вкус и мой руки после опыта.',
    }),
  },
  {
    reactants: ['acid_hcl', 'base_naoh'],
    resolve: () => ({
      type: 'reaction',
      equation: 'NaOH + HCl → NaCl + H₂O',
      see: 'none',
      baseRate: 2,
      visual: {},
      observations: [
        'Видимых изменений нет — оба раствора бесцветные',
        'Раствор немного нагревается',
      ],
      why: 'Это реакция нейтрализации: кислота и щёлочь образуют соль и воду. Она идёт, но глазом её не видно.',
      hint: 'Как доказать протекание реакции? Используйте фенолфталеин.',
      safety: SAFETY_BASE,
    }),
  },
  {
    reactants: ['acid_h2so4', 'base_naoh'],
    resolve: () => ({
      type: 'reaction',
      equation: '2NaOH + H₂SO₄ → Na₂SO₄ + 2H₂O',
      see: 'none',
      baseRate: 2,
      visual: {},
      observations: [
        'Видимых изменений нет — оба раствора бесцветные',
        'Раствор нагревается',
      ],
      why: 'Это реакция нейтрализации: кислота и щёлочь образуют соль и воду. Она идёт, но глазом её не видно.',
      hint: 'Как доказать протекание реакции? Используйте фенолфталеин.',
      safety: SAFETY_BASE,
    }),
  },
  {
    reactants: ['base_naoh', 'salt_cuso4'],
    resolve: (T) => {
      const heated = T >= 70;
      return {
        type: 'reaction',
        equation: heated
          ? 'CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄\nCu(OH)₂ → CuO + H₂O (при нагревании)'
          : 'CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄',
        see: 'precipitate',
        baseRate: 1.5,
        visual: {
          liquidEnd: COLORLESS,
          precipitate: '#3d8fe0',
          precipitateEnd: heated ? '#1d1d1d' : null,
        },
        observations: [
          'Выпадает голубой студенистый осадок — гидроксид меди(II)',
          ...(heated ? ['При нагревании осадок чернеет: образуется оксид меди(II) CuO'] : []),
        ],
        why: heated
          ? 'Ионы меди связываются с гидроксид-ионами в нерастворимый Cu(OH)₂. При нагревании он разлагается на чёрный CuO и воду.'
          : 'Ионы меди связываются с гидроксид-ионами в нерастворимое вещество Cu(OH)₂ — поэтому выпадает осадок.',
        hint: heated ? 'Сравните с опытом без нагревания.' : 'А что будет с осадком, если нагреть выше 70 °C?',
        safety: SAFETY_BASE,
      };
    },
  },
  {
    reactants: ['acid_hcl', 'chalk_caco3'],
    resolve: () => ({
      type: 'reaction',
      equation: 'CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑',
      see: 'gas',
      baseRate: 0.7,
      visual: { liquidEnd: COLORLESS, bubbles: 1, solidDissolves: true, gas: 'CO₂' },
      observations: [
        'Мел «вскипает» — бурно выделяются пузырьки',
        'Газ бесцветный, без запаха — углекислый газ (CO₂)',
        'Кусочек мела растворяется',
      ],
      why: 'Соляная кислота сильнее угольной и вытесняет её из соли. Угольная кислота сразу распадается на воду и углекислый газ.',
      hint: 'Как доказать, что выделяется CO₂? Используют известковую воду.',
      safety: SAFETY_ACID,
    }),
  },
  {
    reactants: ['acid_h2so4', 'chalk_caco3'],
    resolve: () => ({
      type: 'reaction',
      equation: 'CaCO₃ + H₂SO₄ → CaSO₄↓ + H₂O + CO₂↑',
      see: 'gas',
      baseRate: 0.7,
      visual: { liquidEnd: COLORLESS, bubbles: 1, bubbleDecay: true, gas: 'CO₂' },
      observations: [
        'Сначала выделяются пузырьки CO₂',
        'Очень быстро реакция затухает, хотя мел ещё не растворился',
      ],
      why: 'На поверхности мела образуется малорастворимый сульфат кальция CaSO₄. Он закрывает мел плёнкой, и кислота больше не может до него добраться.',
      hint: 'Сравните с соляной кислотой: почему там мел растворяется полностью?',
      safety: SAFETY_ACID,
    }),
  },
];
