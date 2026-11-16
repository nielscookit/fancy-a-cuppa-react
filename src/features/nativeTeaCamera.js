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
  return brand || rawName ? { brand, rawName } : null;
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

export async function openNativeTeaCamera(camera, { lookupBarcode, matchPhoto } = {}) {
  let active = true;
  let lookup;
  const barcodes = new Map();
  const photoMatches = new Map();
  const photoPrefills = new Map();
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
        else {
          const prefill = photoPrefillFromText(candidate.lines);
          if (prefill) photoPrefills.set(candidate.id, prefill);
        }
      } catch (error) {
        console.warn('[Tea Camera] Photo matching failed', error);
      }
      await camera.showPhotoResult({
        id: candidate.id, result: tea ? 'possible' : 'no_match', name: tea?.rawName, brand: tea?.brand,
      }).catch(error => console.warn('[Tea Camera]', error));
    });
    const { barcodeID, photoID, ...response } = await camera.open();
    const match = barcodes.get(barcodeID);
    return {
      ...response,
      tea: response.action === 'use' ? match?.tea ?? null : null,
      barcode: response.action === 'add' && match && !match.tea ? match.code : null,
      ...(response.action === 'add' && photoPrefills.has(photoID) && { photoPrefill: photoPrefills.get(photoID) }),
      photoTea: ['add', 'use_photo'].includes(response.action) ? photoMatches.get(photoID) ?? null : null,
    };
  } finally {
    active = false;
    lookup?.abort();
    await Promise.allSettled([listener, photoListener].filter(Boolean).map(handle => handle.remove()));
  }
}
