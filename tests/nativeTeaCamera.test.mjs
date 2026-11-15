import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyCameraBarcode, DEMO_TEA_BARCODE, openNativeTeaCamera, matchPhotoText } from '../src/features/nativeTeaCamera.js';

test('camera PoC classifies UPC-A and equivalent EAN-13 using existing normalization', () => {
  assert.equal(classifyCameraBarcode({ text: DEMO_TEA_BARCODE, format: 'UPC-A' }), 'known');
  assert.equal(classifyCameraBarcode({ text: '0' + DEMO_TEA_BARCODE, format: 'EAN-13' }), 'known');
  assert.equal(classifyCameraBarcode({ text: '96385074', format: 'EAN8' }), 'unknown');
  assert.equal(classifyCameraBarcode({ text: '', format: 'EAN13' }), 'unreadable');
});

test('camera bridge attaches before presentation and removes its listener on close and error', async () => {
  for (const failure of [false, true]) {
    const calls = [];
    const listeners = {};
    const operation = openNativeTeaCamera({
      async addListener(event, callback) {
        calls.push(event);
        listeners[event] = callback;
        return { remove: async () => { calls.push('remove'); } };
      },
      async open() {
        calls.push('open');
        if (failure) throw new Error('camera unavailable');
        listeners.barcode({ id: 'scan-1', text: DEMO_TEA_BARCODE, format: 'UPC-A' });
        return { action: 'close' };
      },
      async showBarcodeResult(result) { calls.push(result); },
    });
    if (failure) await assert.rejects(operation, /camera unavailable/);
    else assert.deepEqual(await operation, { action: 'close', tea:null, barcode:null, photoTea:null });
    assert.deepEqual(calls, failure ? ['barcode', 'photoText', 'open', 'remove', 'remove']
      : ['barcode', 'photoText', 'open', { id: 'scan-1', result: 'known' }, 'remove', 'remove']);
  }
});

const cameraSwift = readFileSync(new URL('../ios/App/App/FACTeaCameraPlugin.swift', import.meta.url), 'utf8');

test('camera Close is in the interactive root view, at original on-screen position', () => {
  assert.ok(cameraSwift.includes('view.addSubview(close)'));
  assert.ok(!cameraSwift.includes('overlay.addSubview(close)'));
  assert.ok(cameraSwift.includes('y: top + 14, width: 48, height: 48'));
  assert.ok(cameraSwift.includes('closeCamera() { finish("close") }'));
});

test('unknown barcode banner expires and repeat scanning waits for a removal event', () => {
  assert.ok(cameraSwift.includes('didRemove removedItems: [RecognizedItem]'));
  assert.ok(cameraSwift.includes('seen.remove(key)'));
  assert.ok(cameraSwift.includes('visibleBarcodeIDs[barcode.id] = key'));
  assert.ok(cameraSwift.includes('2_500_000_000'));
  assert.ok(cameraSwift.includes('found: false, autoDismiss: true'));
  assert.ok(cameraSwift.includes('toastDismissTask?.cancel()'));
});

test('production camera barcode lookup returns a real tea and never uses the fixture', async () => {
  const listeners = {};
  const notifications = [];
  const tea = { id:'cloud-123', rawName:'Assam Breakfast' };
  const response = await openNativeTeaCamera({
    async addListener(name, callback) {
      listeners[name] = callback;
      return { remove:async () => {} };
    },
    async open() {
      listeners.barcode({id:'first',text:DEMO_TEA_BARCODE,format:'UPC-A'});
      // Allow the asynchronous lookup to complete before selecting USE.
      await new Promise(resolve => setImmediate(resolve));
      return {action:'use'};
    },
    async showBarcodeResult(result) { notifications.push(result); },
  }, { lookupBarcode:async () => tea });
  assert.equal(response.tea, tea);
  assert.equal(notifications[0].result,'known');
  assert.equal(notifications[0].name,'Assam Breakfast');
});

test('unknown barcode is available as add-form metadata', async () => {
  const listeners = {};
  const response = await openNativeTeaCamera({
    async addListener(name,callback) { listeners[name]=callback; return {remove:async()=>{}}; },
    async open() {
      listeners.barcode({id:'unknown',text:'96385074',format:'EAN8'});
      await new Promise(resolve => setImmediate(resolve));
      return {action:'add'};
    },
    async showBarcodeResult() {},
  }, {lookupBarcode:async()=>null});
  assert.deepEqual(response.barcode,{type:'ean_8',value:'96385074'});
  assert.equal(response.tea,null);
});

test('native camera transfers photo previews only when adding, not closing', () => {
  const source = readFileSync(new URL('../ios/App/App/FACTeaCameraPlugin.swift', import.meta.url),'utf8');
  assert.ok(source.includes('let photos = action == "add" ? photoPreviews : []'));
  assert.ok(source.includes('photoPreviews.removeAll()'));
  assert.ok(source.includes('onClose(action, photos)'));
});

test('Add New Tea integrates the captured previews without changing photo_url writes', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8');
  const editor = readFileSync(new URL('../src/components/TeaEditor.jsx', import.meta.url),'utf8');
  assert.ok(app.includes('photos={mode === \'add\' ? capturedPhotos : []}'));
  assert.ok(editor.includes('Photos are previews only and are not saved yet.'));
  assert.ok(editor.includes('Barcode (EAN / UPC)'));
});

test('Vision OCR matcher accepts only an unambiguous brand and complete product name',()=>{
  const teas=[
    {id:'one',brand:'TeeGschwendner',rawName:'Assam Breakfast'},
    {id:'two',brand:'Other',rawName:'Darjeeling First Flush'},
  ];
  assert.equal(matchPhotoText(['Assam Breakfast','TeeGschwendner'],teas)?.id,'one');
  assert.equal(matchPhotoText(['Assam Breakfast'],teas),null);
  assert.equal(matchPhotoText(['TeeGschwendner'],teas),null);
  assert.equal(matchPhotoText(['no readable labels'],teas),null);
  assert.equal(matchPhotoText(['Assam Breakfast','TeeGschwendner'],[teas[0],{...teas[0],id:'duplicate'}]),null);
});
test('camera has a native Vision OCR callback instead of photo-count simulation',()=>{
  const s=readFileSync(new URL('../ios/App/App/FACTeaCameraPlugin.swift',import.meta.url),'utf8');
  assert.ok(s.includes('VNRecognizeTextRequest'));
  assert.ok(s.includes('notifyListeners("photoText"'));
  assert.ok(!s.includes('if strip.arrangedSubviews.count > 1'));
});
