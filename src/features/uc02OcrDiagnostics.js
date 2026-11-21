// P1: read-only diagnostic analysis. Never used to decide catalog matches.
import { normalizeQuery } from './teaModel.js';

const words = value => normalizeQuery(value || '').split(/\s+/).filter(word => word.length >= 3);
const hasPhrase = (text, value) => value.length > 0 && text.includes(' ' + value + ' ');

export function diagnoseCatalogMatch(lines, teas) {
  const recognized = normalizeQuery(lines.filter(line => typeof line === 'string').join(' '));
  const padded = ' ' + recognized + ' ';
  const found = new Set(words(recognized));
  const reasons = { matched: 0, invalid_catalog_fields: 0, missing_brand: 0, missing_name: 0, missing_both: 0 };
  const accepted = [];
  const rejected = [];
  for (const tea of teas) {
    const name = normalizeQuery(tea.rawName);
    const brand = normalizeQuery(tea.brand);
    const valid = Boolean(tea.id && brand.length >= 4 && name.length >= 3);
    const brandExact = hasPhrase(padded, brand);
    const nameExact = hasPhrase(padded, name);
    let reason;
    if (!valid) reason = 'invalid_catalog_fields';
    else if (brandExact && nameExact) reason = 'matched';
    else if (!brandExact && !nameExact) reason = 'missing_both';
    else if (!brandExact) reason = 'missing_brand';
    else reason = 'missing_name';
    reasons[reason] += 1;
    const entry = { id: String(tea.id ?? ''), brand: tea.brand ?? '', name: tea.rawName ?? '',
      brandExact, nameExact, reason };
    if (reason === 'matched') accepted.push(entry);
    else {
      const catalogTokens = [...new Set([...words(tea.brand), ...words(tea.rawName)])];
      const overlapping = catalogTokens.filter(word => found.has(word));
      if (overlapping.length || brandExact || nameExact) rejected.push({
        ...entry, overlappingTokens: overlapping, overlapCount: overlapping.length,
        tokenCount: catalogTokens.length,
      });
    }
  }
  rejected.sort((a,b) => b.overlapCount - a.overlapCount || Number(b.brandExact) - Number(a.brandExact));
  return { catalogCount: teas.length, accepted: accepted.slice(0, 15),
    rejectedSample: rejected.slice(0, 12), rejectionCounts: reasons,
    rejectedPartialCount: rejected.length, normalizedOcr: recognized };
}

export function diagnosePrefill(lines, extracted) {
  const definitions = {
    brand: /^(?:Hersteller|Manufacturer)\s*:\s*(.*)$/i,
    rawName: /^(?:Teename|Tea name|Produktname|Product name)\s*:\s*(.*)$/i,
    brewSeconds: /^(?:Ziehzeit|Brewing time)\s*:\s*(.*)$/i,
  };
  const fields = {};
  for (const [field, pattern] of Object.entries(definitions)) {
    const candidates = lines.filter(v => typeof v === 'string').map(v => v.trim())
      .map(v => v.match(pattern)).filter(Boolean).map(m => m[1]);
    fields[field] = { candidates, accepted: extracted?.[field] ?? null,
      reason: extracted?.[field] != null ? 'accepted_by_current_parser'
        : candidates.length === 0 ? 'no_explicit_label'
          : candidates.length > 1 ? 'multiple_or_ambiguous_values' : 'not_accepted_by_current_parser' };
  }
  for (const field of ['category', 'dosage', 'waterMl', 'temperature']) {
    fields[field] = { candidates: [], accepted: null, reason: 'not_implemented_in_current_parser' };
  }
  return { extracted: extracted ?? null, fields };
}
