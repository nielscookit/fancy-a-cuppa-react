import { normalizeBarcode } from './scanBarcode.js';

// Fixed UPC-A fixture. The existing normalizer also accepts its EAN-13 form.
export const DEMO_TEA_BARCODE = '850045678906';

export function classifyCameraBarcode(candidate) {
  const code = normalizeBarcode(candidate);
  if (!code) return 'unreadable';
  return code.type === 'upc_a' && code.value === DEMO_TEA_BARCODE ? 'known' : 'unknown';
}

export async function openNativeTeaCamera(camera) {
  const listener = await camera.addListener('barcode', candidate => {
    void camera.showBarcodeResult({
      id: candidate.id,
      result: classifyCameraBarcode(candidate),
    }).catch(error => console.warn('[Tea Camera]', error));
  });
  try {
    return await camera.open();
  } finally {
    await listener.remove();
  }
}
