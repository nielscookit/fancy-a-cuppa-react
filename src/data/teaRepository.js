import { supabaseConfig } from './supabaseConfig.js';

// Framework-independent V3 adapter, behavior based on app-v2/cloud.js.
// For later migration: changing backend settings does not require React changes.
const endpoint = supabaseConfig.url;
const selectFields = 'id,brand,name,category,subcategory,subcategory_other,leaf_style,photo_url,tea_codes(code_type,code_value),tea_preparations(dose_teaspoons,dose_grams,dose_bags,dose_measures,dose_water_ml,brew_seconds,water_temp_c,instructions,source_label)';
const codeSelect = 'tea_id,teas(' + selectFields + ')';
const unitField = {
  bag: 'dose_bags',
  tsp: 'dose_teaspoons',
  g: 'dose_grams',
  measure: 'dose_measures',
};

async function readJson(response, message) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || message + ' (' + response.status + ')');
  }
  return body;
}

/** Normalized tea shape remains compatible with V2 for later migration. */
export function normalizeTea(tea) {
  if (!tea) return null;
  const prep = Array.isArray(tea.tea_preparations)
    ? tea.tea_preparations[0] : tea.tea_preparations;
  if (!prep) return null;
  const unit = Object.keys(unitField).find(key => prep[unitField[key]] != null);
  if (!unit) return null;
  const qty = Number(prep[unitField[unit]]);
  const base = Number(prep.dose_water_ml);
  const seconds = Number(prep.brew_seconds);
  if (!(qty > 0) || !(base > 0) || !(seconds >= 30)) return null;
  return {
    id: 'cloud-' + tea.id,
    name: tea.brand === 'Unbekannt' ? tea.name : tea.brand + ' · ' + tea.name,
    type: unit === 'bag' ? 'bag' : 'loose',
    unit,
    dose: qty * 1000 / base,
    brand: tea.brand,
    rawName: tea.name,
    category: tea.category || 'other',
    subcategory: tea.subcategory || null,
    subcategory_other: tea.subcategory_other || '',
    leafStyle: tea.leaf_style || null,
    photoUrl: typeof tea.photo_url === 'string' && /^https:\/\//i.test(tea.photo_url)
      ? tea.photo_url : null,
    instructions: prep.instructions || '',
    sourceLabel: prep.source_label || '',
    codes: Array.isArray(tea.tea_codes)
      ? tea.tea_codes.map(c => ({ type:c.code_type, value:c.code_value }))
      : [],
    code: Array.isArray(tea.tea_codes) && tea.tea_codes.length
      ? { type:tea.tea_codes[0].code_type, value:tea.tea_codes[0].code_value }
      : null,
    qty,
    base,
    temperature: prep.water_temp_c,
    // Retain precise original duration for future timer data model.
    brewSeconds: seconds,
    min: Math.max(1, Math.round(seconds / 60)),
    provisional: false,
  };
}

const CATALOG_PAGE_SIZE = 500;
const MAX_CATALOG_PAGES = 20;

export async function listTeas({ signal, fetchImpl = fetch } = {}) {
  const all = [];
  for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
    const url = endpoint + '/rest/v1/teas?select=' + encodeURIComponent(selectFields)
      + '&status=eq.published&order=created_at.desc,id.desc'
      + '&limit=' + CATALOG_PAGE_SIZE
      + '&offset=' + (page * CATALOG_PAGE_SIZE);
    const response = await fetchImpl(url, {
      headers: { apikey: supabaseConfig.publishableKey },
      signal,
    });
    const rows = await readJson(response, 'Cloud catalog unavailable');
    if (!Array.isArray(rows)) throw new Error('Invalid cloud catalog response.');
    all.push(...rows);
    if (rows.length < CATALOG_PAGE_SIZE) return all.map(normalizeTea).filter(Boolean);
  }
  throw new Error('The tea catalogue exceeds the current 10,000-item safety limit.');
}

export async function lookupTeaByCode(code, { signal, fetchImpl = fetch } = {}) {
  if (!code?.type || !code?.value) return null;
  const url = endpoint + '/rest/v1/tea_codes?select=' + encodeURIComponent(codeSelect)
    + '&code_type=eq.' + encodeURIComponent(code.type)
    + '&code_value=eq.' + encodeURIComponent(code.value)
    + '&limit=1';
  const response = await fetchImpl(url, {
    headers: { apikey: supabaseConfig.publishableKey },
    signal,
  });
  const rows = await readJson(response, 'Catalog lookup unavailable');
  if (!Array.isArray(rows)) throw new Error('Invalid barcode lookup response.');
  return normalizeTea(rows[0]?.teas || null);
}

function requireTeaIdentity(data) {
  if (!data?.name?.trim() || !data?.brand?.trim() || !data.category) {
    throw new Error('Please complete the tea identity fields.');
  }
  if (!unitField[data.unit]) throw new Error('Unknown dosage unit.');
  if (data.type === 'bag' && data.unit !== 'bag'
    || data.type === 'loose' && data.unit === 'bag') {
    throw new Error('Dosage unit does not match tea format.');
  }
  if (!Number.isFinite(Number(data.qty)) || Number(data.qty) <= 0
    || !Number.isFinite(Number(data.base)) || Number(data.base) <= 0
    || !Number.isFinite(Number(data.mins)) || Number(data.mins) <= 0) {
    throw new Error('Invalid tea preparation.');
  }
}

const SUPPORTED_CREATE_CATEGORIES = new Set([
  'black','green','white','oolong','pu_erh','herbal','fruit','rooibos','other',
]);
const SUPPORTED_UPDATE_CATEGORIES = new Set([
  'black','green','white','oolong','herbal','fruit','rooibos','other',
]);
const SUPPORTED_CREATE_LEAVES = new Set(['whole','broken','ctc','bag','other']);

/**
 * The live legacy backend does not yet support the complete new schema.
 * In particular update_community_tea forcibly changes leaf_style to other
 * or bag. Never submit an update that silently corrupts the existing tea.
 * This guard can be removed ONLY after the DB team upgrades both RPCs.
 */
export function assertLegacyWriteIsSafe(data) {
  const editing = Boolean(data.id);
  const message = 'The database write API must be updated for these fields. ' +
    'Nothing has been saved. Please contact the database team.';
  if (!(editing ? SUPPORTED_UPDATE_CATEGORIES : SUPPORTED_CREATE_CATEGORIES)
    .has(data.category)) throw new Error(message);
  if (!data.subcategory ||
    data.subcategory === 'other' && !data.subcategory_other) throw new Error(message);
  const leaf = data.type === 'bag' ? 'bag' : data.leafStyle || null;
  if (!editing && leaf && !SUPPORTED_CREATE_LEAVES.has(leaf)) throw new Error(message);
  const old = data.original || null;
  if (editing && (!old || old.leafStyle !== leaf ||
    !['bag','other'].includes(leaf))) throw new Error(message);
  const originalPhoto = old?.photoUrl || null;
  const originalInstructions = old?.instructions || null;
  const originalSource = old?.sourceLabel || null;
  if ((data.photoUrl || null) !== originalPhoto ||
    (data.instructions || null) !== originalInstructions ||
    (data.sourceLabel || null) !== originalSource) throw new Error(message);
  // An existing barcode cannot be removed or changed by the legacy RPC.
  if (editing && old?.code &&
    (old.code.type !== data.code?.type ||
     old.code.value !== data.code?.value)) throw new Error(message);
  return true;
}

function normalizeCloudId(id) {
  if (!id) return null;
  return String(id).startsWith('cloud-') ? String(id).slice(6) : String(id);
}

/**
 * Write API matches V2's existing community-tea Edge Function.
 * Calls are made only by explicit UI save actions; never during catalog reads.
 */
export async function saveTea(data, { signal, fetchImpl = fetch } = {}) {
  requireTeaIdentity(data);
  assertLegacyWriteIsSafe(data);
  const id = normalizeCloudId(data.id);
  const payload = {
    action: id ? 'update' : 'create',
    id,
    brand: data.brand.trim(),
    name: data.name.trim(),
    category: data.category,
    subcategory: data.subcategory,
    subcategory_other: data.subcategory === 'other' ? data.subcategory_other || null : null,
    leaf_style: data.type === 'bag' ? 'bag' : (data.leafStyle || null),
    dose_unit: data.unit,
    dose_quantity: Number(data.qty),
    brew_seconds: Math.round(Number(data.mins) * 60),
    dose_water_ml: Number(data.base),
    water_temp_c: data.temperature ?? null,
    dose_teaspoons: data.unit === 'tsp' ? Number(data.qty) : null,
    dose_grams: data.unit === 'g' ? Number(data.qty) : null,
    dose_measures: data.unit === 'measure' ? Number(data.qty) : null,
    dose_bags: data.unit === 'bag' ? Number(data.qty) : null,
    code_type: data.code?.type || null,
    code_value: data.code?.value || null,
  };
  const response = await fetchImpl(endpoint + '/functions/v1/community-tea', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return readJson(response, 'Cloud saving failed');
}

export function createTea(data, options) {
  return saveTea({ ...data, id: null }, options);
}

export function updateTea(data, options) {
  if (!normalizeCloudId(data?.id)) {
    return Promise.reject(new Error('A cloud tea ID is required for updates.'));
  }
  return saveTea(data, options);
}

export function deleteTea() {
  return Promise.reject(new Error('Deleting shared teas is not supported by the existing V2 API.'));
}
