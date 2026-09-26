// Единый справочник веществ. ИИ-парсер может выбирать ТОЛЬКО эти id —
// так модель не может «придумать» вещество, которого нет в симуляторе.

export const SUBSTANCES = {
  acid_hcl: { name: 'Соляная кислота', formula: 'HCl', form: 'solution' },
  acid_h2so4: { name: 'Серная кислота', formula: 'H₂SO₄', form: 'solution' },
  base_naoh: { name: 'Гидроксид натрия (щёлочь)', formula: 'NaOH', form: 'solution' },
  salt_cuso4: { name: 'Сульфат меди (медный купорос)', formula: 'CuSO₄', form: 'solution', color: '#2f8fd8' },
  indicator_phph: { name: 'Фенолфталеин', formula: 'индикатор', form: 'indicator' },
  metal_zn: { name: 'Цинк', formula: 'Zn', form: 'solid', color: '#aeb8c2' },
  metal_mg: { name: 'Магний', formula: 'Mg', form: 'solid', color: '#dcdcdc' },
  metal_fe: { name: 'Железо (гвоздь)', formula: 'Fe', form: 'solid', color: '#5f6368' },
  metal_cu: { name: 'Медь', formula: 'Cu', form: 'solid', color: '#c46a3a' },
  chalk_caco3: { name: 'Мел (карбонат кальция)', formula: 'CaCO₃', form: 'solid', color: '#f2efe6' },
};

export const SUBSTANCE_IDS = Object.keys(SUBSTANCES);

// Ключевые слова для офлайн-разбора (без ИИ): русский + казахский.
// Порядок важен: «медный купорос» проверяется раньше, чем «медь».
export const ALIASES = [
  ['salt_cuso4', [/купорос/, /сульфат\s*меди/, /cuso4/, /мыс\s*сульфат/]],
  ['indicator_phph', [/фенолфталеин/, /индикатор/]],
  ['acid_hcl', [/солян/, /hcl/, /тұз\s*қышқыл/]],
  ['acid_h2so4', [/серн/, /h2so4/, /күкірт\s*қышқыл/]],
  ['base_naoh', [/щ[её]л[оа]ч/, /naoh/, /гидроксид\s*натри/, /натрий\s*гидроксид/, /сілті/]],
  ['metal_zn', [/цинк/, /(^|[^a-z])zn/, /мырыш/]],
  ['metal_mg', [/магни/, /(^|[^a-z])mg/]],
  ['metal_fe', [/желез/, /гвозд/, /(^|[^a-z])fe/, /темір/, /шеге/]],
  ['metal_cu', [/(^|[^а-яё])мед[ьиюя]/, /(^|[^a-z])cu/, /(^|[^а-яәіңғүұқөһ])мыс/]],
  ['chalk_caco3', [/(^|[^а-яё])мел([^а-яё]|$)/, /мрамор/, /caco3/, /карбонат\s*кальци/, /(^|[^а-яәіңғүұқөһ])бор([^а-яәіңғүұқөһ]|$)/]],
];
