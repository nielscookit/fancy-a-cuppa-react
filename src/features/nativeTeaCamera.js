import { normalizeBarcode } from './scanBarcode.js';

// Retained as a test fixture; there is no production barcode hardcoded as a match.
export const DEMO_TEA_BARCODE = '850045678906';

export function classifyCameraBarcode(candidate) {
  const code = normalizeBarcode(candidate);
  if (!code) return 'unreadable';
  return code.type === 'upc_a' && code.value === DEMO_TEA_BARCODE ? 'known' : 'unknown';
}

/**
 * The native camera only signals what it sees. Supabase remains the source of
 * truth. Photo identification is still a separate, nonproduction PoC.
 */
export async function openNativeTeaCamera(camera, { lookupBarcode } = {}) {
  let matchedTea = null;
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
  try {
    const response = await camera.open();
    // For POSSIBLE MATCH (photo PoC), no real photo match has been established.
    return { ...response,
      tea: response.action === 'use' && matchedTea ? matchedTea : null,
      barcode: response.action === 'add' ? lastUnknownCode : null,
    };
  } finally {
    active = false;
    await listener.remove();
  }
}
