/** UI/domain values inherited from Fancy a Cuppa V2. */
export const CATEGORY_LABELS = Object.freeze({
  black:'Schwarztee', green:'Grüntee', white:'Weißtee', oolong:'Oolong',
  fruit:'Früchtetee', herbal:'Kräutertee', rooibos:'Rooibos', other:'Sonstige',
});
export const TEA_VARIETIES = Object.freeze({
  black:['Assam','Darjeeling','Ceylon','Earl Grey','English Breakfast','Sonstige'],
  green:['Sencha','Bancha','Gunpowder','Gyokuro','Matcha','Sonstige'],
  white:['Silver Needle','Bai Mu Dan','Shou Mei','Sonstige'],
  oolong:['Oolong','Sonstige'],
  fruit:['Beeren','Apfel','Zitrus','Mischung','Sonstige'],
  herbal:['Pfefferminze','Kamille','Fenchel','Mischung','Sonstige'],
  rooibos:['Natur','Aromatisiert','Sonstige'],
  other:['Sonstige'],
});
export const DOSE_UNITS = Object.freeze({
  tsp:'TL', g:'g', bag:'Beutel', measure:'Teemaß',
});
export const VOLUMES = Object.freeze([250,500,1000,1500]);

export function normalizeQuery(value) {
  return String(value || '').toLowerCase()
    .replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim();
}
const SYNONYMS = Object.freeze({
  'black tea':'black', 'schwarz tee':'black','schwarztee':'black',
  'green tea':'green', 'gruen tee':'green','gruentee':'green',
  'white tea':'white','weiss tee':'white','weisstee':'white',
  'fruit tea':'fruit','fruechtetee':'fruit','fruechte tee':'fruit',
  'herbal tea':'herbal','kraeutertee':'herbal','kraeuter tee':'herbal',
  'loose tea':'loose','loser tee':'loose','loser':'loose',
  'tea bag':'bag','tea bags':'bag','teebeutel':'bag','beuteltee':'bag',
});
function expandSearchTerms(raw) {
  let text = normalizeQuery(raw);
  for (const [term, replacement] of Object.entries(SYNONYMS)) {
    text = (' ' + text + ' ').replaceAll(' ' + term + ' ', ' ' + replacement + ' ').trim();
  }
  return text.split(/\s+/).filter(Boolean);
}
export function teaMatches(tea, query) {
  const words = expandSearchTerms(query);
  if (!words.length) return true;
  const indexed = normalizeQuery([
    tea.name, tea.rawName, tea.brand, tea.category,
    tea.subcategory, tea.subcategory_other, tea.type,
    CATEGORY_LABELS[tea.category], tea.type === 'bag' ? 'tea bag teebeutel' : 'loose tea loser tee',
  ].join(' '));
  return words.every(word => indexed.includes(word));
}
export function calculateDose(tea, waterMl) {
  if (!tea || !(waterMl > 0) || !(tea.base > 0)) return null;
  return tea.qty * waterMl / tea.base;
}
export function formatDose(quantity, unit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return '–';
  const digits = quantity % 1 === 0 ? 0 : (unit === 'g' ? 1 : 2);
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(quantity) + ' ' + (DOSE_UNITS[unit] || unit);
}
export function initialTeaForm(tea) {
  return {
    id: tea?.id || null,
    name: tea?.rawName || '',
    brand: tea?.brand || '',
    category: tea?.category || 'black',
    subcategory: tea?.subcategory || 'Assam',
    subcategory_other: tea?.subcategory_other || '',
    type: tea?.type || 'loose',
    unit: tea?.unit || 'tsp',
    qty: String(tea?.qty ?? 1),
    base: String(tea?.base ?? 250),
    mins: String(tea?.brewSeconds ? tea.brewSeconds / 60 : 4),
    temperature: tea?.temperature == null ? '' : String(tea.temperature),
  };
}
export function validateTeaForm(form) {
  if (!form.name?.trim() || !form.brand?.trim() || !form.category || !form.subcategory) {
    throw new Error('Tee, Hersteller, Kategorie und Sorte sind Pflichtfelder.');
  }
  if (form.subcategory === 'other' && !form.subcategory_other?.trim()) {
    throw new Error('Bitte die Sorte angeben.');
  }
  if (form.type === 'bag' && form.unit !== 'bag' || form.type === 'loose' && form.unit === 'bag') {
    throw new Error('Die Dosier-Einheit passt nicht zur Darreichungsform.');
  }
  const qty = Number(form.qty), base = Number(form.base), mins = Number(form.mins);
  const temp = form.temperature === '' ? null : Number(form.temperature);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100) throw new Error('Dosierung muss zwischen 0 und 100 liegen.');
  if (!Number.isInteger(base) || base < 50 || base > 5000) throw new Error('Wassermenge muss zwischen 50 und 5000 ml liegen.');
  if (!Number.isInteger(mins) || mins < 1 || mins > 30) throw new Error('Ziehzeit muss 1 bis 30 volle Minuten betragen.');
  if (temp != null && (!Number.isInteger(temp) || temp < 40 || temp > 100)) throw new Error('Temperatur muss zwischen 40 und 100 °C liegen.');
  return { ...form, name: form.name.trim(), brand: form.brand.trim(), qty, base, mins, temperature: temp };
}
export function recentTeaIds(previous, id) {
  return [id, ...previous.filter(item => item !== id)].slice(0,5);
}
