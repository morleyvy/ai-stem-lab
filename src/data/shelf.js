// Что стоит на лабораторном столе. Одно вещество может быть в разных склянках
// (разбавленная и концентрированная серная кислота) — ученик сам выбирает, что взять.

export const SHELF = [
  { id: 'hcl', substance: 'acid_hcl', label: 'HCl', note: 'разб.', kind: 'bottle', liquid: '#e3f1fb', cap: '#ef5b6b' },
  { id: 'h2so4', substance: 'acid_h2so4', label: 'H₂SO₄', note: 'разб.', kind: 'bottle', liquid: '#eef4e4', cap: '#f5a54a' },
  { id: 'h2so4c', substance: 'acid_h2so4', concentration: 'concentrated', label: 'H₂SO₄', note: 'конц.', kind: 'bottle', liquid: '#f3efdc', cap: '#c0392b' },
  { id: 'naoh', substance: 'base_naoh', label: 'NaOH', note: 'щёлочь', kind: 'bottle', liquid: '#eef0fb', cap: '#7b61ff' },
  { id: 'cuso4', substance: 'salt_cuso4', label: 'CuSO₄', note: 'р-р', kind: 'bottle', liquid: '#2f8fd8', cap: '#2f8fd8' },
  { id: 'phph', substance: 'indicator_phph', label: 'Ф-ф', note: 'индикатор', kind: 'dropper', liquid: '#f4f4f4', cap: '#d6246e' },
  { id: 'zn', substance: 'metal_zn', label: 'Zn', note: 'цинк', kind: 'dish', shape: 'granules' },
  { id: 'mg', substance: 'metal_mg', label: 'Mg', note: 'магний', kind: 'dish', shape: 'ribbon' },
  { id: 'fe', substance: 'metal_fe', label: 'Fe', note: 'гвоздь', kind: 'dish', shape: 'nail' },
  { id: 'cu', substance: 'metal_cu', label: 'Cu', note: 'медь', kind: 'dish', shape: 'granules' },
  { id: 'caco3', substance: 'chalk_caco3', label: 'CaCO₃', note: 'мел', kind: 'dish', shape: 'chunk' },
];

export const SHELF_BY_ID = Object.fromEntries(SHELF.map((item) => [item.id, item]));

// По списку веществ (например, из плана ИИ) находим склянки, которые нужно подсветить.
export function shelfIdsFor(substances, concentration) {
  return substances.map((s) => {
    const options = SHELF.filter((item) => item.substance === s);
    const wanted = concentration === 'concentrated' ? 'concentrated' : undefined;
    return (options.find((item) => item.concentration === wanted) ?? options[0])?.id;
  }).filter(Boolean);
}
