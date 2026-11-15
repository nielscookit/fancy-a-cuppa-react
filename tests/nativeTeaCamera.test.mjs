import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCameraBarcode, DEMO_TEA_BARCODE, openNativeTeaCamera } from '../src/features/nativeTeaCamera.js';

test('camera PoC classifies UPC-A and equivalent EAN-13 using existing normalization', () => {
  assert.equal(classifyCameraBarcode({ text: DEMO_TEA_BARCODE, format: 'UPC-A' }), 'known');
  assert.equal(classifyCameraBarcode({ text: '0' + DEMO_TEA_BARCODE, format: 'EAN-13' }), 'known');
  assert.equal(classifyCameraBarcode({ text: '96385074', format: 'EAN8' }), 'unknown');
  assert.equal(classifyCameraBarcode({ text: '', format: 'EAN13' }), 'unreadable');
});

test('camera bridge attaches before presentation and removes its listener on close and error', async () => {
  for (const failure of [false, true]) {
    const calls = [];
    let listener;
    const operation = openNativeTeaCamera({
      async addListener(event, callback) {
        calls.push(event);
        listener = callback;
        return { remove: async () => { calls.push('remove'); } };
      },
      async open() {
        calls.push('open');
        if (failure) throw new Error('camera unavailable');
        listener({ id: 'scan-1', text: DEMO_TEA_BARCODE, format: 'UPC-A' });
        return { action: 'close' };
      },
      async showBarcodeResult(result) { calls.push(result); },
    });
    if (failure) await assert.rejects(operation, /camera unavailable/);
    else assert.deepEqual(await operation, { action: 'close' });
    assert.deepEqual(calls, failure ? ['barcode', 'open', 'remove']
      : ['barcode', 'open', { id: 'scan-1', result: 'known' }, 'remove']);
  }
});
