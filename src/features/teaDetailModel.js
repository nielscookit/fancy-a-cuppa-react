/** British-English Tea Detail copy, with comma decimal following Figma. */
export const CATEGORY_ENGLISH = Object.freeze({
  black:'BLACK TEA',green:'GREEN TEA',white:'WHITE TEA',
  oolong:'OOLONG',yellow:'YELLOW TEA',dark:'DARK TEA',
  pu_erh:'PU-ERH TEA',mate:'MATÉ',
  fruit:'FRUIT',herbal:'HERBAL',
  rooibos:'ROOIBOS',other:'OTHER',
});

const UNIT_ENGLISH = Object.freeze({
  tsp:'tsp',g:'g',bag:'bags',measure:'measures',
});

export function formatTeaDetailDose(quantity, unit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return '–';
  const digits = quantity % 1 === 0 ? 0 : (unit === 'g' ? 1 : 2);
  const value = new Intl.NumberFormat('de-DE',{
    maximumFractionDigits:digits,
  }).format(quantity);
  return value + ' ' + (UNIT_ENGLISH[unit] || unit || '');
}

export function initialDetailMinutes(tea) {
  const seconds = Number(tea?.brewSeconds);
  return Math.max(1, Math.min(30, Math.round((seconds >= 60 ? seconds : 240) / 60)));
}
