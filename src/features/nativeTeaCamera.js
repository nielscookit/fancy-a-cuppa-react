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
  const tokens = new Set(joined.split(' '));
  const compact = joined.replaceAll(' ', '');
  const matches = teas.filter(tea => {
    const nameTokens = normalizeQuery(tea.rawName).split(' ').filter(w => w.length >= 3);
    const brand = normalizeQuery(tea.brand);
    return brand.length >= 4 && nameTokens.length > 0
      && compact.includes(brand.replaceAll(' ', ''))
      && nameTokens.every(word => tokens.has(word));
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The native camera only signals what it sees. Supabase remains the source of
 * truth. Photo identification is still a separate, nonproduction PoC.
 */
export async function openNativeTeaCamera(camera, { lookupBarcode, matchPhoto } = {}) {
  let matchedTea = null;
  let matchedPhotoTea = null;
  let lastUnknownCode = null;
  let active = true;
  const pending = new Set();
  const listener = await camera.addListener('barcode', candidate => {
    const task = (async () => {
      const code = normalizeBarcode(candidate);
      if (!code) {
        if (active) await camera.showBarcodeResult({ id:candidate.id, result:'unreadable' });
        return;
      }
      if (typeof lookupBarcode !== 'function') {
        // Tests and the original PoC can still use the fixed, offline fixture.
        if (active) await camera.showBarcodeResult({
          id:candidate.id, result:classifyCameraBarcode(candidate),
        });
        return;
      }
      try {
        const tea = await lookupBarcode(code);
        if (!active) return;
        if (tea) matchedTea = tea;
        else lastUnknownCode = code;
        await camera.showBarcodeResult({
          id:candidate.id, result:tea ? 'known' : 'unknown',
          name:tea ? tea.rawName : undefined,
        });
      } catch (error) {
        if (!active) return;
        console.warn('[Tea Camera] Catalog lookup failed', error);
        await camera.showBarcodeResult({ id:candidate.id, result:'lookup_error' });
      }
    })().catch(error => console.warn('[Tea Camera]', error));
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  let photoListener = null;
  try {
    photoListener = await camera.addListener('photoText', candidate => {
      const task = (async () => {
        try {
          const tea = typeof matchPhoto === 'function' ? matchPhoto(candidate.lines) : null;
          if (!active) return;
          matchedPhotoTea = tea;
          await camera.showPhotoResult({
            id:candidate.id, result:tea ? 'possible' : 'no_match',
            name:tea ? tea.rawName : undefined,
          });
        } catch (error) {
          if (!active) return;
          console.warn('[Tea Camera] Photo recognition failed', error);
          await camera.showPhotoResult({id:candidate.id,result:'no_match'});
        }
      })().catch(error => console.warn('[Tea Camera]',error));
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
    const response = await camera.open();
    // For POSSIBLE MATCH (photo PoC), no real photo match has been established.
    return { ...response,
      tea: response.action === 'use' && matchedTea ? matchedTea : null,
      barcode: response.action === 'add' ? lastUnknownCode : null,
      photoTea: matchedPhotoTea,
    };
  } finally {
    active = false;
    await listener.remove();
    await photoListener?.remove();
  }
}
