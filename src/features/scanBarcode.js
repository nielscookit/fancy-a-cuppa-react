// Same packaged barcode decoder and code mapping as the known V2 photo scanner.
const CDN = 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/iife/reader/index.js';
let loader = null;
function ensureDecoder() {
  if (globalThis.ZXingWASM?.readBarcodes) return Promise.resolve(globalThis.ZXingWASM);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CDN;
    script.onload = () => globalThis.ZXingWASM?.readBarcodes ?
      resolve(globalThis.ZXingWASM) : reject(new Error('Barcode-Bibliothek nicht verfügbar.'));
    script.onerror = () => reject(new Error('Barcode-Bibliothek konnte nicht geladen werden.'));
    document.head.append(script);
  }).catch(error => { loader = null; throw error; });
  return loader;
}
export function normalizeBarcode(result) {
  const format = String(result?.format || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const type = {ean13:'ean_13',ean8:'ean_8',upca:'upc_a',gtin14:'gtin_14',qrcode:'qr'}[format];
  const value = String(result?.text || '').trim();
  if (!type || !value || value.length > 512 || type !== 'qr' && !/^\d+$/.test(value)) return null;
  if (type === 'ean_13' && value.length === 13 && value.startsWith('0')) {
    return {type:'upc_a',value:value.slice(1)};
  }
  return {type,value};
}
export async function scanBarcodePhoto(file) {
  const decoder = await ensureDecoder();
  const options = { tryHarder:true,formats:['EAN13','EAN8','UPCA','QRCode'],maxNumberOfSymbols:5 };
  let matches = [];
  try { matches = await decoder.readBarcodes(file, options); } catch { /* retry canvas */ }
  if (!matches.length) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d', {willReadFrequently:true});
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      matches = await decoder.readBarcodes(context.getImageData(0,0,canvas.width,canvas.height),options);
    } finally { bitmap.close?.(); }
  }
  return matches.map(normalizeBarcode).find(Boolean) || null;
}
