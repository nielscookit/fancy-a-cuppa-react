import { normalizeBarcode } from './scanBarcode.js';
import { normalizeQuery } from './teaModel.js';
import { getTeaCategoryIcon } from './teaCategoryIcons.js';
import { diagnosePrefill } from './uc02OcrDiagnostics.js';

// Retained as a test fixture; there is no production barcode hardcoded as a match.
export const DEMO_TEA_BARCODE = '850045678906';

export function classifyCameraBarcode(candidate) {
  const code = normalizeBarcode(candidate);
  if (!code) return 'unreadable';
  return code.type === 'upc_a' && code.value === DEMO_TEA_BARCODE ? 'known' : 'unknown';
}

/**
 * Match text recognized locally by Apple Vision to fully evidenced catalog entries.
 * Both the manufacturer and the complete product name must appear in the OCR
 * text. No approximate names or fallback products are fabricated.
 */
export function matchPhotoCandidates(lines, teas) {
  if (!Array.isArray(lines) || !Array.isArray(teas)) return [];
  const joined = normalizeQuery(lines.filter(v => typeof v === 'string').join(' '));
  const text = ' ' + joined + ' ';
  const seen = new Set();
  return teas.filter(tea => {
    if (!tea.id || seen.has(tea.id)) return false;
    seen.add(tea.id);
    const name = normalizeQuery(tea.rawName);
    const brand = normalizeQuery(tea.brand);
    return brand.length >= 4 && name.length >= 3
      && text.includes(' ' + brand + ' ')
      && text.includes(' ' + name + ' ');
  });
}

export function matchPhotoText(lines, teas) {
  const matches = matchPhotoCandidates(lines, teas);
  return matches.length === 1 ? matches[0] : null;
}

// Only explicitly labelled, unique OCR values are carried into an unmatched form.
export function photoPrefillFromText(lines) {
  if (!Array.isArray(lines)) return null;
  const field = label => {
    const pattern = new RegExp('^(?:' + label + ')\\s*:\\s*(.{2,120})$', 'i');
    const values = new Set(lines.filter(line => typeof line === 'string')
      .map(line => line.trim().match(pattern)?.[1].trim()).filter(Boolean));
    return values.size === 1 ? [...values][0] : undefined;
  };
  const brand = field('Hersteller|Manufacturer');
  const rawName = field('Teename|Tea name|Produktname|Product name');
  const timeLines = lines.filter(line => typeof line === 'string' && /^(?:Ziehzeit|Brewing time)\s*:/i.test(line.trim()));
  const times = timeLines.map(line => line.trim().match(/^(?:Ziehzeit|Brewing time)\s*:\s*(\d{1,2})\s*(?:min(?:utes?)?\.?|Minuten)$/i)?.[1])
    .filter(Boolean).map(Number);
  const uniqueTimes = [...new Set(times)];
  const brewSeconds = times.length === timeLines.length && uniqueTimes.length === 1 && uniqueTimes[0] >= 1 && uniqueTimes[0] <= 30
    ? uniqueTimes[0] * 60 : undefined;
  return brand || rawName || brewSeconds ? { ...(brand && { brand }), ...(rawName && { rawName }),
    ...(brewSeconds && { brewSeconds }) } : null;
}

// Swift returns only the IDs that were applied to its visible state.
// A pending or superseded lookup cannot supply data to the selected action.
/** Scan a form value without starting catalogue lookup or photo recognition. */
export async function captureNativeTeaBarcode(camera) {
  const response = await camera.open({ mode: 'barcode' });
  if (response.action !== 'barcode') return null;
  const code = normalizeBarcode(response.barcode);
  const length = { ean_8: 8, upc_a: 12, ean_13: 13 }[code?.type];
  if (!length || code.value.length !== length) throw new Error('No valid EAN or UPC barcode was read.');
  return code;
}

export async function openNativeTeaCamera(camera, { lookupBarcode, matchPhoto, shouldOpen,
  network = globalThis.window } = {}) {
  let active = true;
  let lookup;
  let failedLookup;
  let photoLookup;
  let photoRevision = 0;
  let recoveredDuringLookup = false;
  const barcodes = new Map();
  const photoMatches = new Map();
  const photoPrefills = new Map();
  const listeners = [];
  const cancelLookups = () => {
    lookup?.abort();
    photoLookup?.abort();
    lookup = undefined;
    failedLookup = undefined;
    recoveredDuringLookup = false;
    photoRevision++;
  };
  async function checkBarcode(candidate, retried = false) {
    if (!active) return;
    lookup?.abort();
    failedLookup = undefined;
    recoveredDuringLookup = false;
    const controller = new AbortController();
    lookup = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    const code = normalizeBarcode(candidate);
    let result = code ? 'unknown' : 'unreadable';
    let tea;
    try {
      if (code && lookupBarcode) {
        tea = await lookupBarcode(code, { signal: controller.signal });
        if (controller.signal.aborted) result = 'lookup_error';
        else {
          result = tea ? 'known' : 'unknown';
          barcodes.set(candidate.id, { code, tea });
        }
      }
    } catch {
      // Do not log request URLs, headers or response bodies from catalogue errors.
      result = 'lookup_error';
    } finally {
      clearTimeout(timeout);
    }
    if (!active || lookup !== controller) return;
    if (result === 'lookup_error' && !retried) failedLookup = candidate;
    await camera.showBarcodeResult({
      id: candidate.id, result, ...(tea && result === 'known' && { name: tea.rawName, brand: tea.brand }),
    }).catch(() => {});
    if (failedLookup && recoveredDuringLookup) online();
  }
  const online = () => {
    if (active && failedLookup) {
      const candidate = failedLookup;
      failedLookup = undefined;
      void checkBarcode(candidate, true);
    } else if (active && lookup) {
      recoveredDuringLookup = true;
    }
  };
  try {
    listeners.push(await camera.addListener('barcode', candidate => checkBarcode(candidate)));
    listeners.push(await camera.addListener('photoText', async candidate => {
      if (!active) return;
      const revision = ++photoRevision;
      photoLookup?.abort();
      const controller = new AbortController();
      photoLookup = controller;
      const timeout = setTimeout(() => controller.abort(), 7000);
      let matches = [];
      let result = 'no_match';
      const diagnostic = candidate.ocrDiagnostic?.version === 1 ? candidate.ocrDiagnostic : null;
      let catalogDiagnostic = null;
      let prefillDiagnostic = null;
      const matchingStartedAt = diagnostic ? performance.now() : 0;
      let prefillElapsedMs = 0;
      try {
        const found = await matchPhoto?.(candidate.lines, {
          signal: controller.signal,
          ...(diagnostic && { onCatalogDiagnostic: value => { catalogDiagnostic = value; } }),
        });
        if (!active || revision !== photoRevision) return;
        if (controller.signal.aborted) throw new Error('Catalogue lookup timed out');
        matches = Array.isArray(found) ? found : found ? [found] : [];
        matches = matches.filter((tea, index) => tea?.id && matches.findIndex(item => item?.id === tea.id) === index);
        if (matches.length) {
          photoMatches.set(candidate.id, matches);
          result = 'possible';
        } else {
          const prefill = photoPrefillFromText(candidate.lines);
          if (prefill) photoPrefills.set(candidate.id, prefill);
        }
        if (diagnostic) {
          const started = performance.now();
          try {
            const testPrefill = photoPrefillFromText(candidate.lines);
            prefillDiagnostic = diagnosePrefill(candidate.lines, testPrefill);
          } catch {
            // Diagnostics must never turn a valid product match into a lookup error.
            prefillDiagnostic = { error: 'diagnostic_parser_failed' };
          } finally {
            prefillElapsedMs = performance.now() - started;
          }
        }
      } catch {
        // A failed catalogue request is not evidence that no matching tea exists.
        result = 'lookup_error';
      } finally {
        clearTimeout(timeout);
      }
      if (!active || revision !== photoRevision) return;
      const report = diagnostic ? {
        ...diagnostic,
        stage: 'match_complete',
        result,
        ocrTextUsed: candidate.lines,
        catalog: catalogDiagnostic,
        prefill: prefillDiagnostic,
        timings: {
          catalogAndMatchingMs: Number((performance.now() - matchingStartedAt - prefillElapsedMs).toFixed(1)),
          prefillMs: Number(prefillElapsedMs.toFixed(1)),
          totalSinceCaptureMs: Math.max(0, Date.now() - Number(diagnostic.captureStartedAtMs || Date.now())),
        },
      } : null;
      await camera.showPhotoResult({
        id: candidate.id, result,
        candidates: matches.map(tea => ({ id: String(tea.id), name: tea.rawName || '', brand: tea.brand || '',
          symbol: getTeaCategoryIcon(tea.category) })),
        ...(report && { diagnostic: report }),
      }).catch(() => {});
    }));
    listeners.push(await camera.addListener('cameraState', event => {
      cancelLookups();
      if (event?.reason === 'photos_changed') {
        photoMatches.clear();
        photoPrefills.clear();
      }
    }));
    network?.addEventListener('online', online);
    if (shouldOpen && !shouldOpen()) return { action: 'close' };
    const { barcodeID, photoID, teaID, ...response } = await camera.open();
    const match = barcodes.get(barcodeID);
    const matches = photoMatches.get(photoID) || [];
    // A candidate is transferable only after its row was selected natively.
    const selected = teaID ? matches.find(tea => tea.id === teaID)
      : matches.length === 1 ? matches[0] : null;
    return {
      ...response,
      tea: response.action === 'use' ? match?.tea ?? null : null,
      barcode: response.action === 'add' && match && !match.tea ? match.code : null,
      ...(response.action === 'add' && photoPrefills.has(photoID) && { photoPrefill: photoPrefills.get(photoID) }),
      photoTea: response.action === 'use_photo' ? selected ?? null : null,
    };
  } finally {
    active = false;
    cancelLookups();
    network?.removeEventListener('online', online);
    await Promise.allSettled(listeners.map(handle => handle.remove()));
  }
}
