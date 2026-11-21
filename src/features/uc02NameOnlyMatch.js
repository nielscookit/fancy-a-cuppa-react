import { normalizeQuery } from './teaModel.js';

// Whole OCR lines only. A catalog name found inside a longer label is not
// evidence for the shorter product. Preserve all words and numbers.
const genericWords = new Set('tea tee black green white herbal fruit red rooibos oolong assam darjeeling chai blend mix mixture loose leaf bags bag beutel schwarz schwarzer gruen gruener weiss weisser kraeuter fruechte mischung bio organic classic klassik original'.split(' '));
const genericNames = new Set(['earl grey', 'english breakfast', 'irish breakfast', 'chai latte', 'fruechte tee']);
const variantCue = /^(?:bio|organic|decaf|entkoffeiniert|koffeinfrei|zuckerfrei|sugar free|extra strong|classic|klassik|original|instant|loose leaf|loser tee|limited edition|\d+ ?(?:g|gramm|ml|beutel|bags))(?: |$)/;
const manufacturerLabel = /^(?:hersteller|manufacturer|marke|brand)\s*:\s*(.+)$/i;

export function matchNameOnlyCandidates(lines, teas, report) {
  const rows = lines.filter(line => typeof line === 'string').flatMap(line => line.split(/\r?\n/));
  const normalized = rows.map(normalizeQuery);
  const catalog = teas.filter(tea => tea?.id);
  const brands = new Set(catalog.map(tea => normalizeQuery(tea.brand)).filter(Boolean));
  const explicit = new Set(rows.map(row => normalizeQuery(row.trim().match(manufacturerLabel)?.[1])).filter(Boolean));
  const observedBrands = new Set(explicit);
  for (const row of normalized) {
    if (brands.has(row)) observedBrands.add(row);
    else if (row.length >= 5) {
      for (const brand of brands) {
        if (brand.length >= 4 && row.startsWith(brand + ' ')) observedBrands.add(brand);
      }
    }
  }

  const names = new Map();
  const seen = new Set();
  for (const tea of catalog) {
    const id = String(tea.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const name = normalizeQuery(tea.rawName);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(tea);
  }
  let maxLength = 0;
  for (const name of names.keys()) maxLength = Math.max(maxLength, name.length);
  const exact = new Map();
  for (let start = 0; start < normalized.length; start++) {
    let phrase = '';
    for (let end = start; end < normalized.length && normalized[end]; end++) {
      phrase = phrase ? phrase + ' ' + normalized[end] : normalized[end];
      if (phrase.length > maxLength) break;
      if (names.has(phrase)) {
        const adjacentVariant = variantCue.test(normalized[start - 1] ?? '')
          || variantCue.test(normalized[end + 1] ?? '');
        exact.set(phrase, Boolean(exact.get(phrase) || adjacentVariant));
      }
    }
  }

  const matches = [];
  const decisions = [];
  for (const [name, adjacentVariant] of exact) {
    const longerNameObserved = [...exact.keys()].some(other =>
      other.length > name.length && (' ' + other + ' ').includes(' ' + name + ' '));
    const words = name.split(' ');
    // The two-word Test 23 label is eligible for manual selection only.
    const specific = words.length >= 2 && name.length >= 8 && !genericNames.has(name)
      && (/^(?:bio )?fruechte mischung$/.test(name) || words.some(word => /[a-z]{3}/.test(word) && !genericWords.has(word)));
    for (const tea of names.get(name)) {
      const brand = normalizeQuery(tea.brand);
      let reason = 'candidate';
      if (!specific) reason = 'short_or_generic_name';
      else if (!brand) reason = 'missing_catalog_manufacturer';
      else if (longerNameObserved) reason = 'longer_catalog_variant_observed';
      else if (adjacentVariant) reason = 'adjacent_variant_or_pack_size';
      else if ([...observedBrands].some(value => value !== brand)) reason = 'manufacturer_conflict';
      if (reason === 'candidate') matches.push(tea);
      if (report) decisions.push({ id: String(tea.id), name: tea.rawName, brand: tea.brand, nameExact: true, reason });
    }
  }
  if (report) {
    report({
      candidates: decisions.filter(item => item.reason === 'candidate'),
      exactNameDecisions: decisions,
      rejectionCounts: decisions.reduce((counts, { reason }) => {
        if (reason !== 'candidate') counts[reason] = (counts[reason] ?? 0) + 1;
        return counts;
      }, { no_complete_name: seen.size - decisions.length }),
      observedManufacturers: [...observedBrands],
      ambiguous: matches.length > 1,
      manufacturers: [...new Set(matches.map(tea => tea.brand))],
      variants: [...new Set(matches.map(tea => tea.rawName))],
    });
  }
  return matches;
}
