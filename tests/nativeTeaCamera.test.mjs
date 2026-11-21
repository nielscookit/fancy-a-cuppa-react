import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyCameraBarcode, DEMO_TEA_BARCODE, openNativeTeaCamera, captureNativeTeaBarcode, matchPhotoText } from '../src/features/nativeTeaCamera.js';

test('camera PoC classifies UPC-A and equivalent EAN-13 using existing normalization', () => {
  assert.equal(classifyCameraBarcode({ text: DEMO_TEA_BARCODE, format: 'UPC-A' }), 'known');
  assert.equal(classifyCameraBarcode({ text: '0' + DEMO_TEA_BARCODE, format: 'EAN-13' }), 'known');
  assert.equal(classifyCameraBarcode({ text: '96385074', format: 'EAN8' }), 'unknown');
  assert.equal(classifyCameraBarcode({ text: '', format: 'EAN13' }), 'unreadable');
});

test('form scanning only opens the barcode mode and returns a normalized code or cancellation', async () => {
  for (const [response, expected] of [
    [{ action: 'barcode', barcode: { format: 'EAN13', text: '0' + DEMO_TEA_BARCODE } }, { type: 'upc_a', value: DEMO_TEA_BARCODE }],
    [{ action: 'close', barcode: { format: 'EAN8', text: '96385074' } }, null],
  ]) {
    const camera = { open: async options => {
      assert.deepEqual(options, { mode: 'barcode' });
      return response;
    } };
    assert.deepEqual(await captureNativeTeaBarcode(camera), expected);
  }
  await assert.rejects(captureNativeTeaBarcode({
    open: async () => ({ action: 'barcode', barcode: { format: 'EAN8', text: '123' } }),
  }), /No valid EAN or UPC/);
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
    assert.deepEqual(calls, failure ? ['barcode', 'photoText', 'cameraState', 'open', 'remove', 'remove', 'remove']
      : ['barcode', 'photoText', 'cameraState', 'open', { id: 'scan-1', result: 'unknown' }, 'remove', 'remove', 'remove']);
  }
});

const cameraSwift = readFileSync(new URL('../ios/App/App/FACTeaCameraPlugin.swift', import.meta.url), 'utf8');

test('camera Close remains an interactive root control in the approved camera shell', () => {
  assert.match(cameraSwift, /roundControl\(close, icon: "uc02-close"/);
  assert.match(cameraSwift, /view\.addSubview\(button\)/);
  assert.match(cameraSwift, /close\.frame = CGRect\(x: width - 64, y: controlsTop, width: 48, height: 48\)/);
  assert.ok(cameraSwift.includes('closeCamera() { finish("close") }'));
  assert.match(cameraSwift, /let controlsTop = max\(16, view\.safeAreaInsets\.top \+ 8\)/);
});

test('unknown barcode persists until capture; scanning again is impossible after any successful photo', () => {
  assert.ok(cameraSwift.includes('state = .unknownBarcode'));
  assert.ok(!cameraSwift.includes('autoDismiss'));
  assert.ok(cameraSwift.includes('guard !hasCapturedPhoto else { return }'));
  assert.equal((cameraSwift.match(/hasCapturedPhoto = true/g) || []).length, 1);
  assert.equal((cameraSwift.match(/hasCapturedPhoto = false/g) || []).length, 1);
  assert.ok(cameraSwift.includes('didRemove removedItems: [RecognizedItem]'));
  assert.ok(cameraSwift.includes('seen.remove(key)'));
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

test('native camera automatically opens its accepted known lookup after readable feedback', () => {
  assert.match(cameraSwift, /guard !closed, !manualOpening, let id, id == candidateID[\s\S]*?acceptedBarcodeID = value[\s\S]*?case "known": state = .knownBarcode[\s\S]*?scheduleBarcodeNavigation[\s\S]*?self.acceptedBarcodeID == id[\s\S]*?finish\("use"\)/);
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
  assert.ok(source.includes('self.photos.removeAll()'));
  assert.ok(source.includes('onClose(action, photos, barcodeID, photoID, teaID)'));
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

test('unmatched photo prefill accepts only unambiguous labelled identity', async () => {
  const { photoPrefillFromText } = await import('../src/features/nativeTeaCamera.js');
  assert.deepEqual(photoPrefillFromText(['Hersteller: Lebensbaum', 'Teename: Assam', 'Ziehzeit: 3–5 Minuten']),
    { brand: 'Lebensbaum', rawName: 'Assam' });
  assert.equal(photoPrefillFromText(['Hersteller: First', 'Hersteller: Second', 'Assam']), null);
  assert.equal(photoPrefillFromText(['100 °C', 'Tea brewing time: 3 minutes']), null);
});

test('OCR returns distinct, fully evidenced candidates, never synthetic products', async () => {
  const { matchPhotoCandidates } = await import('../src/features/nativeTeaCamera.js');
  const a = { id: 'a', brand: 'Fancy Tea', rawName: 'Assam Breakfast' };
  const b = { id: 'b', brand: 'Fancy Tea', rawName: 'Assam Breakfast Organic' };
  assert.deepEqual(matchPhotoCandidates(['Fancy Tea', 'Assam Breakfast Organic'], [a, b, a]), [a, b]);
  assert.deepEqual(matchPhotoCandidates(['Assam', 'Fancy Tea'], [a, b]), []);
  assert.deepEqual(matchPhotoCandidates(null, [a]), []);
});

test('labelled brewing time is transferred only when unique, whole and in range', async () => {
  const { photoPrefillFromText } = await import('../src/features/nativeTeaCamera.js');
  assert.deepEqual(photoPrefillFromText(['Ziehzeit: 4 Minuten']), { brewSeconds: 240 });
  assert.deepEqual(photoPrefillFromText(['Brewing time: 1 min']), { brewSeconds: 60 });
  for (const lines of [['4 minutes'], ['Ziehzeit: 3–5 Minuten'], ['Ziehzeit: 31 Minuten'],
    ['Ziehzeit: 0 Minuten'], ['Ziehzeit: 3 Minuten', 'Ziehzeit: 5 Minuten']]) {
    assert.equal(photoPrefillFromText(lines), null);
  }
});

function cameraHarness() {
  const listeners = {};
  const results = [];
  let finish;
  let opened;
  const ready = new Promise(resolve => { opened = resolve; });
  const camera = {
    async addListener(name, callback) { listeners[name] = callback; return { remove() {} }; },
    open() { opened(); return new Promise(resolve => { finish = resolve; }); },
    async showBarcodeResult(result) { results.push(result); },
    async showPhotoResult(result) { results.push(result); },
  };
  return { listeners, results, ready, camera, finish: result => finish(result) };
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('each real candidate navigates directly using its native selected ID', async () => {
  const teas = [{ id: 'a', brand: 'Fancy Tea', rawName: 'Assam' },
    { id: 'b', brand: 'Fancy Tea', rawName: 'Assam Organic' }];
  for (const id of ['a', 'b', 'forged']) {
    const h = cameraHarness();
    const result = openNativeTeaCamera(h.camera, { matchPhoto: () => teas });
    await h.ready;
    await h.listeners.photoText({ id: 'photos', lines: ['Fancy Tea Assam Organic'] });
    assert.equal(h.results[0].candidates.length, 2);
    h.finish({ action: 'use_photo', photoID: 'photos', teaID: id });
    assert.equal((await result).photoTea?.id ?? null, id === 'forged' ? null : id);
  }
});

test('rejected matches cannot prefill ADD; unknown barcode and retained photos survive', async () => {
  const h = cameraHarness();
  const result = openNativeTeaCamera(h.camera, { lookupBarcode: async () => null,
    matchPhoto: () => [{ id: 'a', rawName: 'Wrong product', brand: 'Wrong brand' }] });
  await h.ready;
  await h.listeners.barcode({ id: 'unknown', text: '96385074', format: 'EAN8' });
  await h.listeners.photoText({ id: 'photo', lines: ['wrong product'] });
  h.listeners.cameraState();
  h.finish({ action: 'add', barcodeID: 'unknown', photos: ['retained-photo'] });
  const response = await result;
  assert.equal(response.photoTea, null);
  assert.equal(response.photoPrefill, undefined);
  assert.deepEqual(response.barcode, { type: 'ean_8', value: '96385074' });
  assert.deepEqual(response.photos, ['retained-photo']);
});

test('deletion invalidates pending OCR results and labelled prefill from removed photos', async () => {
  const h = cameraHarness();
  let complete;
  const result = openNativeTeaCamera(h.camera, { matchPhoto: () => new Promise(resolve => { complete = resolve; }) });
  await h.ready;
  const pending = h.listeners.photoText({ id: 'deleted', lines: ['Manufacturer: Deleted'] });
  h.listeners.cameraState();
  complete(null);
  await pending;
  assert.deepEqual(h.results, []);
  h.finish({ action: 'add', photos: [] });
  assert.equal((await result).photoPrefill, undefined);
});

test('offline barcode lookup retries the captured code once on online, then stops', async () => {
  const h = cameraHarness();
  const network = new EventTarget();
  let calls = 0;
  const result = openNativeTeaCamera(h.camera, { network, lookupBarcode: async code => {
    assert.equal(code.value, '96385074');
    calls++;
    throw new Error('offline; sensitive request details must not be logged');
  } });
  await h.ready;
  await h.listeners.barcode({ id: 'offline', text: '96385074', format: 'EAN8' });
  assert.equal(h.results.at(-1).result, 'lookup_error');
  network.dispatchEvent(new Event('online'));
  await turn();
  network.dispatchEvent(new Event('online'));
  await turn();
  assert.equal(calls, 2);
  h.finish({ action: 'close' });
  await result;
  network.dispatchEvent(new Event('online'));
  assert.equal(calls, 2);
});

test('online retry can open a verified tea, but mode change suppresses it', async () => {
  for (const cancelled of [false, true]) {
    const h = cameraHarness();
    const network = new EventTarget();
    const tea = { id: 'tea', brand: 'Fancy', rawName: 'Assam' };
    let calls = 0, complete;
    const result = openNativeTeaCamera(h.camera, { network, lookupBarcode: async () => {
      if (++calls === 1) throw new Error('offline');
      return new Promise(resolve => { complete = resolve; });
    } });
    await h.ready;
    await h.listeners.barcode({ id: 'offline', text: '96385074', format: 'EAN8' });
    network.dispatchEvent(new Event('online'));
    if (cancelled) h.listeners.cameraState();
    complete(tea);
    await turn();
    assert.equal(h.results.at(-1).result, cancelled ? 'lookup_error' : 'known');
    h.finish(cancelled ? { action: 'add' } : { action: 'use', barcodeID: 'offline' });
    assert.equal((await result).tea, cancelled ? null : tea);
  }
});

test('catalogue failure in photo lookup is not reported as a negative match', async () => {
  const h = cameraHarness();
  const result = openNativeTeaCamera(h.camera, { matchPhoto: () => { throw new Error('unavailable'); } });
  await h.ready;
  await h.listeners.photoText({ id: 'photos', lines: ['Fancy Assam'] });
  assert.equal(h.results[0].result, 'lookup_error');
  h.finish({ action: 'add', photoID: 'photos' });
  const response = await result;
  assert.equal(response.photoTea, null);
  assert.equal(response.photoPrefill, undefined);
});

test('native photos identify automatically, retain unreadable captures and invalidate deleted snapshots', () => {
  assert.match(cameraSwift, /photos\.append[\s\S]*?rebuildThumbnails\(\)[\s\S]*?identifyPhotos\(captureStartedAt:/);
  assert.match(cameraSwift, /photos\.remove\(at: selectedPhoto\)/);
  assert.match(cameraSwift, /revision == photoRevision/);
  assert.match(cameraSwift, /case \.unreadablePhoto:[\s\S]*?Couldn't read the details[\s\S]*?Try another photo/);
  assert.doesNotMatch(cameraSwift, /IDENTIFY TEA|USE THIS TEA|autoDismiss/);
  assert.match(cameraSwift, /photos\.count < 3/);
  assert.match(cameraSwift, /photoLookupID[\s\S]*?id == photoLookupID/);
});

test('photo mutation clears accepted recognition data; native close preserves the chosen result', async () => {
  for (const reason of ['photos_changed', 'closed']) {
    const h = cameraHarness();
    const result = openNativeTeaCamera(h.camera, { matchPhoto: () => null });
    await h.ready;
    await h.listeners.photoText({ id:'old', lines:['Manufacturer: Actual brand'] });
    h.listeners.cameraState({ reason });
    h.finish({action:'add',photoID:'old'});
    const response = await result;
    assert.equal(response.photoPrefill?.brand, reason === 'closed' ? 'Actual brand' : undefined);
  }
});

test('connection restored while the failed request is settling still triggers only one retry', async () => {
  const h = cameraHarness();
  const network = new EventTarget();
  let fail, calls = 0;
  const result = openNativeTeaCamera(h.camera, { network, lookupBarcode: () => {
    calls++;
    if (calls === 1) return new Promise((_, reject) => { fail = reject; });
    return null;
  } });
  await h.ready;
  const pending = h.listeners.barcode({id:'recover',text:'96385074',format:'EAN8'});
  network.dispatchEvent(new Event('online'));
  fail(new Error('request failed just before reconnect'));
  await pending;
  await turn();
  assert.equal(calls, 2);
  assert.equal(h.results.at(-1).result, 'unknown');
  h.finish({action:'add',barcodeID:'recover'});
  assert.deepEqual((await result).barcode, {type:'ean_8',value:'96385074'});
});

test('P1 delivers the native result before a failing diagnostic and drops invalidated reports', async () => {
  for (const invalidated of [false, true]) {
    const h = cameraHarness();
    let analysisRuns = 0;
    let reports = 0;
    h.camera.reportOCRDiagnostic = async () => { reports++; };
    const flow = openNativeTeaCamera(h.camera, {
      matchPhoto: (_, { onCatalogDiagnostic }) => {
        onCatalogDiagnostic(() => { analysisRuns++; throw new Error('diagnostic only'); });
        return [{ id: 'tea', rawName: 'Assam' }];
      },
    });
    await h.ready;
    await h.listeners.photoText({ id: 'photo', lines: ['Assam'], ocrDiagnostic: { version: 1 } });
    assert.equal(h.results[0].result, 'possible');
    assert.equal(h.results[0].diagnostic, undefined);
    assert.equal(analysisRuns, 0);
    if (invalidated) h.listeners.cameraState({ reason: 'photos_changed' });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(analysisRuns, invalidated ? 0 : 1);
    assert.equal(reports, 0);
    h.finish({ action: invalidated ? 'close' : 'use_photo', photoID: 'photo', teaID: 'tea' });
    assert.equal((await flow).photoTea?.id, invalidated ? undefined : 'tea');
  }
});

test('P2a name-only navigation needs an explicit candidate ID and the current photo ID', async () => {
  for (const [action, photoID, teaID, newerPhoto, expected] of [
    ['use_photo','current',undefined,false,null],
    ['use_photo','current','wrong',false,null],
    ['use_photo','other','42',false,null],
    ['use_photo','current','42',true,null],
    ['use_photo','current','42',false,42],
    ['add','current','42',false,null],
  ]) {
    const h = cameraHarness();
    const result = openNativeTeaCamera(h.camera, {
      matchPhoto: () => ({ stage:'name_only', candidates:[{id:42,rawName:'Früchte-Mischung'}] }),
    });
    await h.ready;
    await h.listeners.photoText({ id:'current',lines:['Früchte-Mischung'] });
    assert.equal(h.results[0].candidates[0].id, '42');
    if (newerPhoto) await h.listeners.photoText({ id:'newer',lines:['Früchte-Mischung'] });
    h.finish({ action,photoID,teaID });
    assert.equal((await result).photoTea?.id ?? null, expected);
  }
});

function structuredPhoto(id) {
  return {
    id, lines: ['Manufacturer: Flat input'],
    observations: [{ photoIndex: 1, order: 0, confidence: 0.9, text: 'Manufacturer: Structured input' }],
  };
}

test('P3 requires the isolated configuration and returns only native-accepted no-match fields', async () => {
  for (const structuredPrefill of [false, true]) {
    const h = cameraHarness();
    const open = h.camera.open;
    h.camera.open = options => {
      assert.deepEqual(options, structuredPrefill ? { structuredOCR: true } : undefined);
      return open();
    };
    const flow = openNativeTeaCamera(h.camera, {
      structuredPrefill, matchPhoto: lines => { assert.deepEqual(lines, ['Manufacturer: Flat input']); return []; },
      lookupBarcode: async () => null,
    });
    await h.ready;
    await h.listeners.barcode({ id: 'unknown', text: '96385074', format: 'EAN8' });
    await h.listeners.photoText(structuredPhoto('current'));
    assert.equal(h.results.at(-1).result, 'no_match');
    h.listeners.cameraState({ reason: 'closed' }); // Native dismissal precedes the ADD result.
    h.finish({ action: 'add', photoID: 'current', barcodeID: 'unknown', photos: ['preview'] });
    const response = await flow;
    assert.deepEqual(response.photoPrefill, { brand: structuredPrefill ? 'Structured input' : 'Flat input' });
    assert.deepEqual(response.barcode, { value: '96385074', type: 'ean_8' });
    assert.deepEqual(response.photos, ['preview']);
  }
});

test('P3 discards rejected, failed, timed-out, deleted and superseded results', async () => {
  for (const scenario of ['candidate', 'error', 'nativeTimeout', 'deletion', 'newer', 'close', 'noMetadata']) {
    const h = cameraHarness();
    const flow = openNativeTeaCamera(h.camera, {
      structuredPrefill: true,
      matchPhoto: () => {
        if (scenario === 'candidate') return { stage: 'name_only', candidates: [{ id: 'wrong' }] };
        if (scenario === 'error') throw new Error('offline');
        return [];
      },
    });
    await h.ready;
    const photo = structuredPhoto('previous');
    if (scenario === 'noMetadata') delete photo.observations;
    await h.listeners.photoText(photo);
    assert.equal(h.results.at(-1).result, scenario === 'candidate' ? 'possible' : scenario === 'error' ? 'lookup_error' : 'no_match');
    if (scenario === 'deletion' || scenario === 'candidate') h.listeners.cameraState({ reason: 'photos_changed' });
    if (scenario === 'newer') await h.listeners.photoText(structuredPhoto('newer'));
    h.finish({ action: scenario === 'close' ? 'close' : 'add',
      photoID: scenario === 'nativeTimeout' ? undefined : 'previous' });
    assert.equal((await flow).photoPrefill, undefined, scenario);
  }
});

test('P3 drops pending lookups if a photo is deleted before the result arrives', async () => {
  let finishLookup;
  const h = cameraHarness();
  const flow = openNativeTeaCamera(h.camera, { structuredPrefill: true,
    matchPhoto: () => new Promise(resolve => { finishLookup = resolve; }),
  });
  await h.ready;
  const pending = h.listeners.photoText(structuredPhoto('removed'));
  h.listeners.cameraState({ reason: 'photos_changed' });
  finishLookup([]);
  await pending;
  assert.deepEqual(h.results, []);
  h.finish({ action: 'add', photoID: 'removed' });
  assert.equal((await flow).photoPrefill, undefined);
});

test('native structured OCR requires a Fancy Test bundle and rejects late no-match results after timeout', () => {
  assert.match(cameraSwift, /let structuredOCR = !barcodeOnly && call\.getBool\("structuredOCR"\) == true\s+&& Bundle\.main\.bundleIdentifier == "com\.fancyacuppa\.test"/);
  assert.match(cameraSwift, /if structuredOCR \{ event\["observations"\] = observations \}/);
  assert.match(cameraSwift, /let photoID = structuredOCR && state == \.networkError \? nil : acceptedPhotoID/);
});
