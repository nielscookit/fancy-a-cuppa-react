import { CATEGORY_LABELS, TEA_VARIETIES, normalizeQuery } from './teaModel.js';

const productCue = /(?:tee|mischung|blend)\b|\b(?:tea|infusion|english breakfast|irish breakfast|earl grey)\b/iu;
const trademark = /^(\p{L}[\p{L}'’ -]{2,39}?)\s*[®™]$/u;
const ingredientHeading = /^(?:zutaten|ingredients|ingredients list)\b/i;
const nonProductCopy = /\b(?:bio|organic|premium|natürlich|genuss|qualität|quality|delicious|finest|tradition|traditional|original|aus kontrolliertem anbau|zutaten|ingredients|family owned|since|seit|company|limited|ltd|gmbh|visit|website|100%|the best)\b/iu;
const stripMark = text => text.replace(/\s*[®™]+$/u, '').trim();
const brandedDisplay = new Map([['dmbio', 'dmBio'], ['twinings', 'Twinings']]);

function displayIdentity(value, isBrand = false) {
  const text = value.replace(/\s*[®™]/gu, '').replace(/\s+/gu, ' ').trim();
  if (isBrand) {
    const brand = brandedDisplay.get(normalizeQuery(text).replace(/ /g, ''));
    if (brand) return brand;
  }
  if (text === text.toLocaleLowerCase('de') || text === text.toLocaleUpperCase('de')) {
    return text.toLocaleLowerCase('de').replace(/(^|[\s‐-])(\p{L})(\p{L}*)/gu, (_, separator, initial, rest) => {
      const word = initial + rest;
      return separator === ' ' && /^(?:and|of|the|mit|und|von|für)$/u.test(word)
        ? separator + word : separator + initial.toLocaleUpperCase('de') + rest;
    });
  }
  return text;
}

const inlineLogo = /^(dm\s*bio|teekanne|lebensbaum|sonnentor|alnatura|yogi tea|twinings)\s+(.+)$/iu;
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
  const text = row && stripMark(row.text);
  return !!text && /^[\p{L}][\p{L} &’'‐-]{2,79}$/u.test(text)
    && !categories.has(normalizeQuery(text)) && !nonProductCopy.test(text);
}

function titleBelow(above, below) {
  if (!followsAboveLine(above, below) || !heading(below)) return false;
  const a = above.boundingBox;
  const b = below.boundingBox;
  return b.height >= a.height * 0.7 && b.height <= a.height * 1.45
    && (Math.abs(a.x - b.x) <= 0.06 || Math.abs(a.x + a.width / 2 - b.x - b.width / 2) <= 0.05);
}

function inIngredients(row, rows) {
  return rows.some(above => ingredientHeading.test(above.text) && followsAboveLine(above, row));
}

function titleBlock(first, rows) {
  const following = rows.filter(row => titleBelow(first, row));
  if (following.length === 0) return productCue.test(first.text) ? { value: first.text, source: [first] } : null;
  if (following.length !== 1) return { value: null, source: [first, ...following] };
  const [second] = following;
  const firstText = stripMark(first.text);
  const secondText = stripMark(second.text);
  const split = /[-‐]$/u.test(firstText);
  // A trailing hyphen can split a German derivational suffix, while a
  // hyphen between independently readable words stays (Früchte-Mischung).
  const dividedWord = split && /^(?:schafts|tungs|heits|keits|ungs)\p{L}*tee$/iu.test(secondText);
  const joined = dividedWord ? firstText.slice(0, -1) + secondText
    : firstText + (split ? '' : ' ') + secondText;
  if (!productCue.test(first.text) && !categories.has(normalizeQuery(joined)) && productCue.test(joined)) {
    return { value: joined, source: [first, second] };
  }
  return productCue.test(first.text) || productCue.test(second.text) ? { value: null, source: [first, second] } : null;
}

function followsKnownTitle(first, second) {
  if (titleBelow(first, second) || readBefore(first, second)) return true;
  const a = first.boundingBox;
  const b = second.boundingBox;
  if (!validBox(a) || !validBox(b)) return false;
  const gap = a.y - b.y - b.height;
  const centerOffset = Math.abs(a.x + a.width / 2 - b.x - b.width / 2);
  return gap >= 0 && gap <= 2 * Math.max(a.height, b.height) && centerOffset <= 0.10;
}

function twiningsBreakfast(rows) {
  const candidates = [];
  for (const brand of rows.filter(row => normalizeQuery(stripMark(row.text)) === 'twinings')) {
    const onPack = rows.filter(row => row.photoIndex === brand.photoIndex && !inIngredients(row, rows));
    if (!onPack.includes(brand)) continue;
    const matches = text => onPack.filter(row => normalizeQuery(stripMark(row.text)) === text);
    const full = matches('english breakfast');
    const english = matches('english');
    const breakfast = matches('breakfast');
    if (full.length === 1) candidates.push([brand, full[0]]);
    if (english.length === 1 && breakfast.length === 1 && followsKnownTitle(english[0], breakfast[0])) {
      candidates.push([brand, english[0], breakfast[0]]);
    }
  }
  return candidates;
}

function labelValues(rows, pattern, labels) {
  return rows.flatMap(row => {
    const match = row.text.match(pattern);
    return match && labels.includes(match[1].toLowerCase())
      ? [{ value: match[2].trim().length <= 120 ? match[2].trim() : null, source: row }] : [];
  });
}

function brewingTime(text) {
  const label = /^(?:ziehzeit|brewing time|steeping time|zubereitung:|brewing instructions:)/i.test(text);
  const instruction = /\b(?:ziehen(?: lassen)?|steep|infuse)\b/i.test(text);
  if (!label && !instruction) return undefined;
  const duration = '(\\d{1,2})(?:\\s*[-–—]\\s*(\\d{1,2}))?\\s*(?:min(?:uten|utes?)?\\.?)(?![\\p{L}\\d])';
  const pattern = label
    ? new RegExp('^(?:(?:ziehzeit|brewing time|steeping time)\\b\\s*:?|zubereitung:|brewing instructions:)\\s*' + duration + '[.!]?$', 'iu')
    : new RegExp('(?:^|\\s)(?:(?:steep|infuse)(?: for)?\\s+' + duration + '|'
      + duration + '\\s+ziehen(?: lassen)?)[.!]?$', 'iu');
  const match = text.match(pattern);
  if (!match || (!label && /(?:[-–—]|\b(?:bis|to|oder|or))\s*$/i.test(text.slice(0, match.index)))) return null;
  if (!label && [...text.matchAll(/\d\s*min(?:uten|utes?)?\b/gi)].length !== 1) return null;
  const lower = match[1] ?? match[3];
  const min = Number(lower);
  const max = Number(match[2] ?? match[4] ?? lower);
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

const waterOnly = new RegExp('^\\d{1,5}(?:[.,]\\d{1,2})?\\s*' + waterUnit + '(?:\\s+(?:wasser|water))?$', 'iu');
const doseOnly = new RegExp('^\\d{1,3}(?:[.,]\\d{1,2})?\\s*' + dosageUnit
  + '\\s*(?:pro|auf|mit|für|per|with|for|/)$', 'iu');
const minutes = /^(?:[-–—]\s*)?\d{1,2}(?:\s*[-–—]\s*\d{1,2})?\s*min(?:uten|utes?)?\.?$/iu;
const incompleteRangeEnd = /^[-–—]\s*\d{1,2}\s*min(?:uten|utes?)?\.?$/iu;
const rangePrefix = /^(?:\d{1,2}|\d{1,2}\s*[-–—](?:\s*\d{1,2})?)$/u;
const rangeFragment = /^(?:[-–—]|(?:[-–—]\s*)?\d{1,2}(?:\s*min(?:uten|utes?)?\.?)?|min(?:uten|utes?)?\.?)$/iu;
const rangeWithUnit = /^\d{1,2}\s*[-–—]\s*\d{1,2}\s*min(?:uten|utes?)?\.?$/iu;
const temperatureOnly = /^\d{2,3}\s*°\s*C$/iu;
const timeHeading = /^(?:ziehzeit|brewing time|steeping time|zubereitung|preparation|brewing instructions)\s*:?$/iu;
const unrelatedContext = /\b(?:lager(?:n|ung|hinweis)?|storage|store|serving temperature|serviertemperatur|abkühlen|cool down|zutaten|ingredients)\b/iu;

function nearby(a, b) {
  if (a === b || a.photoIndex !== b.photoIndex || !validBox(a.boundingBox) || !validBox(b.boundingBox)) return false;
  if (followsAboveLine(a, b) || followsAboveLine(b, a)) return true;
  const first = a.boundingBox;
  const second = b.boundingBox;
  const overlap = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  const gap = Math.max(first.x, second.x) - Math.min(first.x + first.width, second.x + second.width);
  return overlap >= Math.min(first.height, second.height) * 0.6 && gap >= -0.005 && gap <= 0.13;
}

function labelledTimeContext(heading, time, rows) {
  if (!timeHeading.test(heading.text) || heading.photoIndex !== time.photoIndex) return false;
  if (nearby(heading, time)) return true;
  const a = heading.boundingBox;
  const b = time.boundingBox;
  if (!validBox(a) || !validBox(b)) return false;
  const height = Math.max(a.height, b.height);
  const gap = a.y - b.y - b.height;
  const aligned = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) >= Math.min(a.width, b.width) / 2;
  return aligned && gap > height && gap <= height * 3
    && !rows.some(row => unrelatedContext.test(row.text) && row.photoIndex === time.photoIndex
      && validBox(row.boundingBox) && row.boundingBox.y > b.y && row.boundingBox.y < a.y);
}

function readBefore(a, b) {
  if (followsAboveLine(a, b)) return true;
  return !followsAboveLine(b, a) && nearby(a, b) && a.boundingBox.x < b.boundingBox.x;
}

function consecutive(row, rows, test) {
  return rows.filter(next => test(next.text) && readBefore(row, next)
    && !rows.some(other => readBefore(row, other) && readBefore(other, next)));
}

function splitRange(first, rows) {
  if (!rangePrefix.test(first.text)) return null;
  const group = [first];
  let text = first.text;
  while (group.length < 4) {
    const next = consecutive(group.at(-1), rows, value => rangeFragment.test(value)
      && (rangeWithUnit.test(text + ' ' + value)
        || /^\d{1,2}\s*[-–—](?:\s*\d{1,2})?$/.test(text + ' ' + value)));
    if (next.length !== 1) return null;
    group.push(next[0]);
    text += ' ' + next[0].text;
    if (rangeWithUnit.test(text)) return { group, value: brewingTime('Ziehzeit: ' + text) };
  }
  return null;
}

function readPreparation(rows) {
  const doses = [];
  const temperatures = [];
  const times = [];
  const reconstructed = new Set();
  const ranges = [];
  const quantityReferences = [];
  const independentContext = rows.filter(row => !packaging.test(row.text) && !unrelatedContext.test(row.text)
    && (preparationHeading.test(row.text) || preparation.test(row.text)
      || /^(?:ziehzeit|brewing time|dosierung|dosage)\s*:/i.test(row.text)));
  // Unlabelled pictogram strips need all three nearby roles. An incomplete
  // duration can identify the strip, but cannot supply a duration value.
  const strips = rows.filter(row => temperatureOnly.test(row.text)).flatMap(temp =>
    rows.filter(row => waterOnly.test(row.text) && nearby(temp, row)).flatMap(water =>
      rows.filter(row => minutes.test(row.text) && nearby(water, row)).map(time => [temp, water, time])));
  const bagInstructions = rows.filter(row => /^\d+\s*(?:tee)?beutel\s*\/\s*\d+\s*ml$/iu.test(row.text));
  const unrelated = row => unrelatedContext.test(row.text) || packaging.test(row.text)
    || rows.some(other => unrelatedContext.test(other.text) && nearby(other, row));
  const justified = row => !unrelated(row) && (independentContext.includes(row)
    || independentContext.some(other => nearby(other, row)) || strips.some(strip => strip.includes(row)));
  const brewTimeContext = row => justified(row)
    || (!unrelated(row) && (bagInstructions.some(bag => nearby(bag, row))
      || rows.some(heading => labelledTimeContext(heading, row, rows))));

  for (const row of rows) {
    if (doseOnly.test(row.text)) {
      const parts = consecutive(row, rows, text => waterOnly.test(text));
      if (parts.length === 1 && justified(row) && justified(parts[0])) {
        const [water] = parts;
        reconstructed.add(row);
        quantityReferences.push({ value: doseFor(row.text + ' ' + water.text), source: [row, water] });
      }
    }
    if (reconstructed.has(row)) continue;
    const range = splitRange(row, rows);
    if (!range || range.group.some(unrelated) || !range.group.some(brewTimeContext)) continue;
    range.group.forEach(item => reconstructed.add(item));
    ranges.push({ value: range.value, source: range.group });
  }

  for (const row of rows) {
    const { text } = row;
    if (justified(row) && !reconstructed.has(row) && /\d\s*(?:teebeutel|beutel|tea bags?|bags?|g|gramm|grams?|tl|tsp|teelöffel)\b/iu.test(text)) {
      const quantities = [...text.matchAll(/\d\s*(?:teebeutel|beutel|tea bags?|bags?|g|gramm|grams?|tl|tsp|teelöffel|ml|l|liter|litres?)\b/giu)];
      doses.push({ value: quantities.length === 2 ? doseFor(text) : null, source: row });
    }
    if (justified(row) || /^(?:wassertemperatur|water temperature|brewing temperature)\s*:/i.test(text)) {
      const values = [...text.matchAll(/(?<![\d.,-])\d{2,3}\s*°\s*C\b/giu)].map(match => Number.parseInt(match[0], 10));
      if (values.length || /°\s*C/i.test(text)) {
        const value = values[0];
        temperatures.push({ value: values.length === 1 && value >= 40 && value <= 100
          && !/\d\s*[-–—]\s*\d+\s*°/u.test(text) ? value : null, source: row });
      }
    }
    if (reconstructed.has(row) || timeHeading.test(text) || unrelatedContext.test(text) || packaging.test(text)) continue;
    const time = minutes.test(text) && brewTimeContext(row) ? brewingTime('Ziehzeit: ' + text) : brewingTime(text);
    if (time !== undefined) times.push({ value: time, source: row });
  }
  return { doses: [...doses, ...quantityReferences], temperatures, times: [...times, ...ranges] };
}

/** Data and decisions are ephemeral. Only prefill belongs in the form. */
export function extractPhotoPrefill(observations) {
  const acceptedRows = (Array.isArray(observations) ? observations : []).filter(row =>
    Number.isInteger(row?.photoIndex) && row.photoIndex > 0 && Number.isInteger(row.order) && row.order >= 0
    && row.confidence >= 0.35 && row.confidence <= 1 && typeof row.text === 'string')
    .map(row => ({ ...row, text: row.text.trim() })).filter(row => row.text)
    .sort((a, b) => a.photoIndex - b.photoIndex || a.order - b.order);
  const rows = acceptedRows.filter(row => row.confidence >= 0.6);
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

  const logos = rows.filter(row => !inIngredients(row, rows)
    && logoText.has(normalizeQuery(stripMark(row.text))));
  const titleRows = rows.filter(row => heading(row) && !logos.includes(row) && !inIngredients(row, rows));
  const quotedTitles = rows.flatMap(row => {
    const match = row.text.replace(/[®™](?=\s)/u, '').match(inlineLogo);
    return match && productCue.test(match[2]) && heading({ text: match[2] }) && !inIngredients(row, rows)
      ? [{ brand: match[1], name: match[2], source: row }] : [];
  });
  const exactBlocks = twiningsBreakfast(acceptedRows);
  const visualNames = exactBlocks.map(source => ({ value: 'English Breakfast', source }));
  const visualBrands = exactBlocks.map(source => ({ value: source[0].text, source }));
  for (const row of rows) {
    const known = logos.includes(row);
    const mark = row.text.match(trademark);
    const possibleLogo = mark && validBox(row.boundingBox) && row.boundingBox.y >= 0.55
      && normalizeQuery(mark[1]).split(' ').length <= 2 && !nonProductCopy.test(mark[1])
      && !productCue.test(mark[1]) && !categories.has(normalizeQuery(mark[1])) && !inIngredients(row, rows);
    if (!known && !possibleLogo) continue;
    const headings = titleRows.filter(next => followsAboveLine(row, next)
      && next.boundingBox.height >= row.boundingBox.height * 0.65);
    const block = headings.length === 1 ? titleBlock(headings[0], titleRows) : null;
    if (known || block?.value) visualBrands.push({ value: stripMark(row.text), source: row });
    if (block?.value || (block && !exactBlocks.some(([brand]) => brand === row))) visualNames.push(block);
    else if (known && headings.length > 1) visualNames.push({ value: null, source: headings });
  }
  // A distinct, hyphenated tea name can stand on its own near the top of the
  // package, even if the nearby logo was unreadable. It cannot supply a brand.
  for (const row of titleRows) {
    if (!validBox(row.boundingBox) || row.boundingBox.y < 0.55 || !/[-‐]$/u.test(row.text)) continue;
    const block = titleBlock(row, titleRows);
    if (block?.value && !categories.has(normalizeQuery(block.value))
      && /tee$/iu.test(block.value) && block.source.length === 2) visualNames.push(block);
  }
  const brands = labelValues(rows, identityLabel, ['hersteller', 'manufacturer']);
  const brand = assign('brand', [
    ...brands.map(({ value, source }) => ({ value: value && stripMark(value), source })),
    ...visualBrands, ...quotedTitles.map(({ brand: value, source }) => ({ value, source })),
  ], value => normalizeQuery(value).replace(/ /g, ''));
  if (brand) prefill.brand = displayIdentity(brand, true);
  const names = [
    ...labelValues(rows, identityLabel, ['teename', 'tea name', 'produktname', 'product name']),
    ...visualNames, ...quotedTitles.map(({ name: value, source }) => ({ value, source })),
  ];
  if (!brand && (brands.length || visualBrands.length)) names.push({ value: null, source: [...brands, ...visualBrands] });
  const name = assign('rawName', names, normalizeQuery);
  if (name) prefill.rawName = displayIdentity(name);

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

  const { doses, temperatures, times } = readPreparation(rows);
  const dose = assign('dose', doses);
  if (dose) Object.assign(prefill, dose);
  const time = assign('brewSeconds', times);
  if (time) prefill.brewSeconds = time.min * 60;
  const temperature = assign('temperature', temperatures);
  if (temperature) prefill.temperature = temperature;
  return { prefill: Object.keys(prefill).length ? prefill : null, evidence, rejected };
}
