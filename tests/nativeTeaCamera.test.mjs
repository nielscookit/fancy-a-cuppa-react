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

test('verified barcode navigates on native acceptance without waiting for a tap', async () => {
  const listeners = {};
  const tea = { id: 'cloud-123', brand: 'Lebensbaum', rawName: 'Assam - Blatt' };
  let finish;
  const response = await openNativeTeaCamera({
    async addListener(name, callback) {
      listeners[name] = callback;
      return { remove: async () => {} };
    },
    open() {
      return new Promise(resolve => {
        finish = resolve;
        void listeners.barcode({ id: 'first', text: '4012346527109', format: 'EAN13' });
      });
    },
    async showBarcodeResult(result) {
      assert.deepEqual(result, { id: 'first', result: 'known', name: 'Assam - Blatt', brand: 'Lebensbaum' });
      finish({ action: 'use', barcodeID: result.id });
    },
  }, {
    lookupBarcode: async code => {
      assert.deepEqual(code, { type: 'ean_13', value: '4012346527109' });
      return tea;
    },
  });
  assert.equal(response.tea, tea);
});

test('native camera completes a known lookup directly after accepting its ID', () => {
  assert.match(cameraSwift, /guard !closed, let id, id == candidateID[\s\S]*?acceptedBarcodeID = value[\s\S]*?case "known":[\s\S]*?\[brand, name\][\s\S]*?finish\("use"\)/);
  assert.doesNotMatch(cameraSwift, /useKnownTea/);
});

test('unknown barcode is available as add-form metadata', async () => {
  const listeners = {};
  const response = await openNativeTeaCamera({
    async addListener(name,callback) { listeners[name]=callback; return {remove:async()=>{}}; },
    async open() {
      listeners.barcode({id:'unknown',text:'96385074',format:'EAN8'});
      await new Promise(resolve => setImmediate(resolve));
      return {action:'add',barcodeID:'unknown'};
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
  assert.ok(source.includes('onClose(action, photos, barcodeID, photoID)'));
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

test('new tea prefill never copies a barcode belonging to an existing catalogue record',()=>{
  const editor=readFileSync(new URL('../src/components/TeaEditor.jsx',import.meta.url),'utf8');
  assert.ok(editor.includes("next.codeType='';"));
  assert.ok(editor.includes("next.codeValue='';"));
  assert.ok(editor.includes("if(!tea&&barcode)"));
  assert.ok(editor.includes("Add tea information."));
  assert.ok(editor.includes('aria-label="Add a tea photo"'));
});

test('out-of-order lookup cannot replace the accepted result or reopen a closed camera', async () => {
  const listeners = {};
  const lookups = new Map();
  const shown = [];
  const tea = { id: 'cloud-newer', rawName: 'Tea B' };
  const response = await openNativeTeaCamera({
    async addListener(name, callback) {
      listeners[name] = callback;
      return { remove: async () => {} };
    },
    async open() {
      const old = listeners.barcode({ id: 'old', text: '96385074', format: 'EAN8' });
      const newer = listeners.barcode({ id: 'newer', text: DEMO_TEA_BARCODE, format: 'UPC-A' });
      assert.equal(lookups.get('96385074').signal.aborted, true);
      lookups.get(DEMO_TEA_BARCODE).resolve(tea);
      await newer;
      lookups.get('96385074').resolve({ id: 'cloud-old' });
      await old;
      return { action: 'use', barcodeID: 'newer' };
    },
    async showBarcodeResult(value) { shown.push(value); },
  }, {
    lookupBarcode: (code, { signal }) => new Promise(resolve => {
      lookups.set(code.value, { resolve, signal });
    }),
  });
  assert.equal(response.tea, tea);
  assert.deepEqual(shown.map(value => value.id), ['newer']);
});

test('closing aborts a pending lookup without waiting for its result', async () => {
  const listeners = {};
  let signal;
  let pending;
  let finish;
  const response = await openNativeTeaCamera({
    async addListener(name, callback) {
      listeners[name] = callback;
      return { remove: async () => {} };
    },
    async open() {
      pending = listeners.barcode({ id: 'pending', text: '96385074', format: 'EAN8' });
      return { action: 'close' };
    },
    async showBarcodeResult() { assert.fail('Closed camera must not receive late results'); },
  }, {
    lookupBarcode: (_, options) => new Promise(resolve => {
      signal = options.signal;
      finish = resolve;
    }),
  });
  assert.equal(response.barcode, null);
  assert.equal(signal.aborted, true);
  finish(null);
  await pending;
});

test('photo navigation uses only the photo ID actually accepted by the camera', async () => {
  const listeners = {};
  const tea = { id: 'cloud-photo', rawName: 'Assam Breakfast' };
  const response = await openNativeTeaCamera({
    async addListener(name, callback) {
      listeners[name] = callback;
      return { remove: async () => {} };
    },
    async open() {
      await listeners.photoText({ id: 'accepted', lines: ['TeeGschwendner', 'Assam Breakfast'] });
      await listeners.photoText({ id: 'stale', lines: [] });
      return { action: 'use_photo', photoID: 'accepted' };
    },
    async showPhotoResult() {},
  }, { matchPhoto: lines => matchPhotoText(lines, [{ ...tea, brand: 'TeeGschwendner' }]) });
  assert.equal(response.photoTea?.id, tea.id);
  assert.equal(response.tea, null);
});

test('OCR rejects scattered name tokens and embedded brand fragments', () => {
  const teas = [{ id: 'one', brand: 'Tea Co', rawName: 'Assam Breakfast' }];
  assert.equal(matchPhotoText(['Assam origin Breakfast blend', 'Tea Co'], teas), null);
  assert.equal(matchPhotoText(['Assam Breakfast', 'Great Tea Company'], teas), null);
});
