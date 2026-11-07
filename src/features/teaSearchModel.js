import { normalizeQuery, teaMatches } from './teaModel.js';

const brandKey = brand => normalizeQuery(brand);

export function manufacturerOptions(teas) {
  const brands = new Map();
  for (const tea of teas) {
    const brand = String(tea.brand || '').trim();
    if (brand && !brands.has(brandKey(brand))) brands.set(brandKey(brand), brand);
  }
  return [...brands.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Apply the same AND filter to pins, results and history; never duplicate a pin. */
export function filterTeaGroups(teas, {query='', manufacturer='', pinnedIds=[], recentIds=[]} = {}) {
  const matching = teas.filter(tea => (!manufacturer || brandKey(tea.brand) === brandKey(manufacturer))
    && teaMatches(tea, query));
  const byId = new Map(matching.map(tea => [tea.id, tea]));
  const pinnedSet = new Set(pinnedIds);
  return {
    pinned:[...pinnedSet].map(id => byId.get(id)).filter(Boolean),
    results:matching.filter(tea => !pinnedSet.has(tea.id)),
    recent:[...new Set(recentIds)].filter(id => !pinnedSet.has(id))
      .map(id => byId.get(id)).filter(Boolean).slice(0, 3),
  };
}
