import { CATEGORY_LABELS, TEA_VARIETIES, normalizeQuery } from './teaModel.js';

// Unlabelled trademarks require an exact logo-text match. A nearby heading
// alone cannot establish a manufacturer. Values written on the package win
// only when all supported observations agree.
const productCue = /(?:tee|mischung|blend)\b|\b(?:tea|infusion)\b/iu;
const inlineLogo = /^(dm\s*bio|teekanne|lebensbaum|sonnentor|alnatura|yogi tea)\s+(.+)$/iu;
const logoText = new Set(['dm bio', 'dmbio', 'teekanne', 'lebensbaum', 'sonnentor', 'alnatura', 'yogi tea']);
const categories = new Map(Object.entries(CATEGORY_LABELS).map(([key, label]) => [normalizeQuery(label), key]));
for (const [key, text] of Object.entries({
  black: 'schwarztee|schwarzer tee', green: 'gruen tee|gruentee|gruener tee',
  white: 'weisstee|weisser tee', herbal: 'kraeutertee|kraeuter tee|kraeuterinfusion|herbal tea',
  fruit: 'fruechtetee|fruechte tee|fruechteaufguss|fruit tea', rooibos: 'rooibos|rooibostee|rotbuschtee',
})) {
  for (const label of text.split('|')) categories.set(label, key);
}

const preparation = /\b(?:zubereitung|preparation|brewing instructions|aufgie(?:ß|ss)en|überbrüh\p{L}*|steep|(?:ziehen|brew) lassen|infuse)\b/iu;
const preparationHeading = /^(?:zubereitung|preparation|brewing instructions)\s*:?$/i;
const dosageUnit = '(teebeutel|beutel|tea bags?|bags?|gramm|grams?|g|tl|tsp|teelöffel)';
const waterUnit = '(ml|litres?|liter|l)';
const portionAndWater = new RegExp('(?:^|\\s)(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*' + dosageUnit
  + '\\b\\s*(?:pro|auf|mit|für|per|with|for|/)\\s*(\\d{1,5}(?:[.,]\\d{1,2})?)\\s*' + waterUnit + '\\b', 'iu');
const packaging = /\b(?:packungsinhalt|netto(?:gewicht)?|net weight|inhalt|contains|teebeutel pro packung|in der packung)\b/i;
const identityLabel = /^(hersteller|manufacturer|teename|tea name|produktname|product name)\s*:\s*(.*)$/iu;
const otherLabel = /^(kategorie|category|unterkategorie|subcategory|teasorte|tea subtype)\s*:\s*(.*)$/iu;

function validBox(box) {
  return box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]))
    && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= 1.001 && box.y + box.height <= 1.001;
}

// Vision coordinates have their origin at the lower left of the photo.
function followsAboveLine(above, below) {
  if (!validBox(above?.boundingBox) || !validBox(below?.boundingBox) || above.photoIndex !== below.photoIndex) return false;
  const a = above.boundingBox;
  const b = below.boundingBox;
  const gap = a.y - b.y - b.height;
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return gap >= -0.005 && gap <= Math.max(a.height, b.height)
    && overlap >= Math.min(a.width, b.width) / 2;
}

function heading(row) {
  return !!row && /^[\p{L}][\p{L} &’'-]{2,79}$/u.test(row.text)
    && !categories.has(normalizeQuery(row.text))
    && !/\b(?:bio|organic|premium|natürlich|genuss|qualität|original|aus kontrolliertem anbau)\b/iu.test(row.text);
}

function labelValues(rows, pattern, labels) {
  return rows.flatMap(row => {
    const match = row.text.match(pattern);
    return match && labels.includes(match[1].toLowerCase())
      ? [{ value: match[2].trim().length <= 120 ? match[2].trim() : null, source: row }] : [];
  });
}

function brewingTime(text) {
  const label = /^(?:ziehzeit|brewing time)\b/i.test(text);
  const instruction = /\b(?:ziehen lassen|steep|infuse)\b/i.test(text);
  if (!label && !instruction) return undefined;
  const duration = '(\\d{1,2})(?:\\s*[-–—]\\s*(\\d{1,2}))?\\s*(?:min(?:uten|utes?)?\\.?)(?![\\p{L}\\d])';
  const pattern = label
    ? new RegExp('^(?:ziehzeit|brewing time)\\s*:?\\s*' + duration + '$', 'iu')
    : new RegExp('(?:^|\\s)(?:(?:steep|infuse)(?: for)?\\s+)?' + duration
      + '(?:\\s+ziehen lassen)?[.!]?$', 'iu');
  const match = text.match(pattern);
  if (!match || (!label && /\d\s*(?:[-–—]|bis|to|oder|or)\s*$/i.test(text.slice(0, match.index)))) return null;
  if (!label && [...text.matchAll(/\d\s*min(?:uten|utes?)?\b/gi)].length !== 1) return null;
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  return min >= 1 && max >= min && max <= 30 ? { min, max } : null;
}

function doseFor(text) {
  const pair = text.match(portionAndWater);
  if (!pair) return null;
  const qty = Number(pair[1].replace(',', '.'));
  const base = Number(pair[3].replace(',', '.')) * (pair[4].toLowerCase() === 'ml' ? 1 : 1000);
  const symbol = pair[2].toLowerCase();
  const unit = /beutel|bag/.test(symbol) ? 'bag' : /^(?:g|gram)/.test(symbol) ? 'g' : 'tsp';
  if (qty <= 0 || qty > 100 || !Number.isInteger(base) || base < 50 || base > 10000) return null;
  if (unit === 'bag' && (qty !== 1 || base !== 250)) return null;
  return { type: unit === 'bag' ? 'bag' : 'loose', unit, qty, base };
}

/** Data and decisions are ephemeral. Only prefill belongs in the form. */
export function extractPhotoPrefill(observations) {
  const rows = (Array.isArray(observations) ? observations : []).filter(row =>
    Number.isInteger(row?.photoIndex) && row.photoIndex > 0 && Number.isInteger(row.order) && row.order >= 0
    && row.confidence >= 0.6 && row.confidence <= 1 && typeof row.text === 'string')
    .map(row => ({ ...row, text: row.text.trim() })).filter(row => row.text)
    .sort((a, b) => a.photoIndex - b.photoIndex || a.order - b.order);
  const prefill = {};
  const evidence = {};
  const rejected = {};
  const assign = (field, candidates, keyFor = value => JSON.stringify(value)) => {
    if (!candidates.length) {
      rejected[field] = 'no_evidence';
    } else if (new Set(candidates.filter(({ value }) => value).map(({ value }) => keyFor(value))).size > 1) {
      rejected[field] = 'conflicting_observations';
    } else if (candidates.some(({ value }) => value == null || value === '')) {
      rejected[field] = 'unsupported_or_incomplete';
    } else {
      evidence[field] = candidates;
      return candidates[0].value;
    }
  };

  const logos = rows.filter(row => logoText.has(normalizeQuery(row.text)));
  const quotedTitles = rows.flatMap(row => {
    const match = row.text.match(inlineLogo);
    return match && productCue.test(match[2]) && heading({ text: match[2] })
      ? [{ brand: match[1], name: match[2], source: row }] : [];
  });
  const brands = labelValues(rows, identityLabel, ['hersteller', 'manufacturer']);
  const brandKey = value => normalizeQuery(value).replace(/ /g, '');
  const brand = assign('brand', [
    ...brands, ...logos.map(row => ({ value: row.text, source: row })),
    ...quotedTitles.map(({ brand: value, source }) => ({ value, source })),
  ], brandKey);
  if (brand) prefill.brand = brand;
  const names = labelValues(rows, identityLabel, ['teename', 'tea name', 'produktname', 'product name']);
  if (brand) {
    names.push(...quotedTitles.map(({ name: value, source }) => ({ value, source })));
    for (const logo of logos) {
      // Search by geometry in this photo: Vision observation order need not be reading order.
      const titles = rows.filter(row => followsAboveLine(logo, row) && heading(row) && !logos.includes(row)
        && row.boundingBox.height >= logo.boundingBox.height * 0.8);
      if (titles.length !== 1) {
        if (titles.length > 1) names.push({ value: null, source: logo });
        continue;
      }
      const first = titles[0];
      const next = rows.filter(row => followsAboveLine(first, row) && heading(row) && !logos.includes(row)
        && row.boundingBox.height >= first.boundingBox.height * 0.85
        && row.boundingBox.height <= first.boundingBox.height * 1.18
        && Math.abs(first.boundingBox.x - row.boundingBox.x) <= 0.055);
      if (!productCue.test(first.text) && next.length === 1 && productCue.test(next[0].text)) {
        names.push({ value: first.text.endsWith('-') ? first.text + next[0].text : first.text + ' ' + next[0].text,
          source: [logo, first, next[0]] });
      } else if (productCue.test(first.text) && next.length === 0) {
        names.push({ value: first.text, source: [logo, first] });
      } else if (productCue.test(first.text) || next.some(row => productCue.test(row.text))) {
        names.push({ value: null, source: [logo, first, ...next] });
      }
    }
  }
  const name = assign('rawName', !brand && (brands.length || logos.length)
    ? [...names, { value: null, source: [...brands, ...logos] }] : names, normalizeQuery);
  if (name) prefill.rawName = name;

  const categoryLabels = labelValues(rows, otherLabel, ['kategorie', 'category']);
  const category = assign('category', [
    ...categoryLabels.map(({ value, source }) => ({ value: categories.get(normalizeQuery(value)) ??
      Object.keys(CATEGORY_LABELS).find(key => normalizeQuery(key) === normalizeQuery(value)), source })),
    ...rows.filter(row => categories.has(normalizeQuery(row.text)))
      .map(row => ({ value: categories.get(normalizeQuery(row.text)), source: row })),
  ]);
  if (category) prefill.category = category;
  const subcategory = assign('subcategory', labelValues(rows, otherLabel, ['unterkategorie', 'subcategory', 'teasorte', 'tea subtype']), normalizeQuery);
  if (subcategory && !category) {
    delete evidence.subcategory;
    rejected.subcategory = 'category_unresolved';
  } else if (subcategory) {
    const known = TEA_VARIETIES[category]?.find(value => normalizeQuery(value) === normalizeQuery(subcategory));
    prefill.subcategory = known ?? 'other';
    if (!known) prefill.subcategory_other = subcategory;
  }

  const doses = [];
  const temperatures = [];
  const times = [];
  for (const row of rows) {
    const { text } = row;
    const inPrep = preparation.test(text) || /^(?:dosierung|dosage)\s*:/i.test(text)
      || rows.some(heading => preparationHeading.test(heading.text) && followsAboveLine(heading, row));
    if (inPrep && !packaging.test(text) && /\d\s*(?:teebeutel|beutel|tea bags?|bags?|g|gramm|grams?|tl|tsp|teelöffel)\b/iu.test(text)) {
      // Require a single portion and a single water reference.
      const quantities = [...text.matchAll(/\d\s*(?:teebeutel|beutel|tea bags?|bags?|g|gramm|grams?|tl|tsp|teelöffel|ml|l|liter|litres?)\b/giu)];
      doses.push({ value: quantities.length === 2 ? doseFor(text) : null, source: row });
    }
    if (inPrep || /^(?:wassertemperatur|water temperature|brewing temperature)\s*:/i.test(text)) {
      const values = [...text.matchAll(/(?<![\d.,-])\d{2,3}\s*°\s*C\b/giu)].map(match => Number.parseInt(match[0], 10));
      if (values.length || /°\s*C/i.test(text)) {
        const value = values[0];
        temperatures.push({ value: values.length === 1 && value >= 40 && value <= 100
          && !/\d\s*[-–—]\s*\d+\s*°/u.test(text) ? value : null, source: row });
      }
    }
    const time = brewingTime(text);
    if (time !== undefined) times.push({ value: time, source: row });
  }
  const dose = assign('dose', doses);
  if (dose) Object.assign(prefill, dose);
  const time = assign('brewSeconds', times);
  if (time) prefill.brewSeconds = time.min * 60;
  const temperature = assign('temperature', temperatures);
  if (temperature) prefill.temperature = temperature;
  return { prefill: Object.keys(prefill).length ? prefill : null, evidence, rejected };
}
