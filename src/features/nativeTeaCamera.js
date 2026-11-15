import { normalizeBarcode } from './scanBarcode.js';
import { normalizeQuery } from './teaModel.js';

// Retained as a test fixture; there is no production barcode hardcoded as a match.
export const DEMO_TEA_BARCODE = '850045678906';

export function classifyCameraBarcode(candidate) {
  const code = normalizeBarcode(candidate);
  if (!code) return 'unreadable';
  return code.type === 'upc_a' && code.value === DEMO_TEA_BARCODE ? 'known' : 'unknown';
}

/**
 * Match text recognized locally by Apple Vision to one unambiguous catalog entry.
 * Both the manufacturer and the complete product name must appear in the OCR
 * text. No approximate names or fallback products are fabricated.
 */
export function matchPhotoText(lines, teas) {
  if (!Array.isArray(lines) || !Array.isArray(teas)) return null;
  const joined = normalizeQuery(lines.filter(v => typeof v === 'string').join(' '));
  const text = ' ' + joined + ' ';
  const matches = teas.filter(tea => {
    const name = normalizeQuery(tea.rawName);
    const brand = normalizeQuery(tea.brand);
    return brand.length >= 4 && name.length >= 3
      && text.includes(' ' + brand + ' ')
      && text.includes(' ' + name + ' ');
  });
  return matches.length === 1 ? matches[0] : null;
}

// Swift returns only the IDs that were applied to its visible state.
// A pending or superseded lookup cannot supply data to the selected action.
export async function openNativeTeaCamera(camera, { lookupBarcode, matchPhoto } = {}) {
  let active = true;
  let lookup;
  const barcodes = new Map();
  const photoMatches = new Map();
  const listener = await camera.addListener('barcode', async candidate => {
    if (!active) return;
    lookup?.abort();
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
      } else if (code) {
        result = classifyCameraBarcode(candidate);
      }
    } catch (error) {
      result = 'lookup_error';
      if (active && lookup === controller) console.warn('[Tea Camera] Catalog lookup failed', error);
    } finally {
      clearTimeout(timeout);
    }
    if (active && lookup === controller) {
      await camera.showBarcodeResult({
        id: candidate.id, result, ...(tea && { name: tea.rawName, brand: tea.brand }),
      }).catch(error => console.warn('[Tea Camera]', error));
    }
  });
  let photoListener;
  try {
    photoListener = await camera.addListener('photoText', async candidate => {
      if (!active) return;
      let tea;
      try {
        tea = matchPhoto?.(candidate.lines);
        if (tea) photoMatches.set(candidate.id, tea);
      } catch (error) {
        console.warn('[Tea Camera] Photo matching failed', error);
      }
      await camera.showPhotoResult({
        id: candidate.id, result: tea ? 'possible' : 'no_match', name: tea?.rawName,
      }).catch(error => console.warn('[Tea Camera]', error));
    });
    const { barcodeID, photoID, ...response } = await camera.open();
    const match = barcodes.get(barcodeID);
    return {
      ...response,
      tea: response.action === 'use' ? match?.tea ?? null : null,
      barcode: response.action === 'add' && match && !match.tea ? match.code : null,
      photoTea: ['add', 'use_photo'].includes(response.action) ? photoMatches.get(photoID) ?? null : null,
    };
  } finally {
    active = false;
    lookup?.abort();
    await Promise.allSettled([listener, photoListener].filter(Boolean).map(handle => handle.remove()));
  }
}
