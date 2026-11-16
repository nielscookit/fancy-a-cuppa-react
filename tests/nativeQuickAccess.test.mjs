import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeNativeQuickAccess, routeNativeQuickAccess, waitForCameraCatalog } from '../src/features/nativeQuickAccess.js';
import { openNativeTeaCamera } from '../src/features/nativeTeaCamera.js';

const turn = () => new Promise(resolve => setImmediate(resolve));

test('native quick access drains cold and warm destinations, ignoring duplicate wake-ups', async () => {
  let target = 'timer';
  let wake;
  let removed = false;
  const received = [];
  const stop = observeNativeQuickAccess({
    async addListener(name, callback) {
      assert.equal(name, 'pending');
      wake = callback;
      return { remove() { removed = true; } };
    },
    async takePending() {
      const current = target;
      target = undefined;
      return { target: current };
    },
  }, value => received.push(value), assert.fail);
  await turn();
  assert.deepEqual(received, ['timer']);
  target = 'scanner';
  await Promise.all([wake(), wake()]);
  assert.deepEqual(received, ['timer', 'scanner']);
  stop();
  assert.equal(removed, true);
});

test('pending events during a drain are fetched again', async () => {
  let wake;
  let state = 'timer';
  let finishFirst;
  let calls = 0;
  const received = [];
  const stop = observeNativeQuickAccess({
    async addListener(_name, fn) { wake = fn; return { remove() {} }; },
    async takePending() {
      const target = state;
      if (++calls === 1) await new Promise(resolve => { finishFirst = resolve; });
      return { target };
    },
  }, value => received.push(value), assert.fail);
  await turn();
  state = 'scanner';
  await wake();
  finishFirst();
  await turn();
  assert.deepEqual(received, ['timer', 'scanner']);
  stop();
});

test('routing keeps the running timer and opens at most one scanner from home', () => {
  let sheet = 'search';
  let busy = false;
  let opens = 0;
  const session = { running: true, remaining: 95 };
  const hooks = {
    showHome() { sheet = 'closed'; },
    cameraBusy() { return busy; },
    openCamera(options) { assert.equal(options.fromQuickAccess, true); opens++; busy = true; },
    closeCamera() { busy = false; },
  };
  routeNativeQuickAccess('timer', hooks);
  assert.equal(sheet, 'closed');
  assert.deepEqual(session, { running: true, remaining: 95 });
  routeNativeQuickAccess('scanner', hooks);
  routeNativeQuickAccess('scanner', hooks);
  assert.equal(opens, 1);
  assert.equal(sheet, 'closed');
  routeNativeQuickAccess('timer', hooks);
  assert.equal(busy, false);
});

test('camera permission rejection and X both keep the quick-access return route on home', async () => {
  for (const denied of [true, false]) {
    let sheet = 'search';
    let removed = 0;
    let task;
    routeNativeQuickAccess('scanner', {
      showHome() { sheet = 'closed'; },
      cameraBusy: () => false,
      openCamera() {
        task = openNativeTeaCamera({
          async addListener() { return { remove() { removed++; } }; },
          async open() {
            if (denied) throw new Error('Allow camera access');
            return { action: 'close', photos: [] };
          },
        });
      },
    });
    if (denied) await assert.rejects(task, /Allow camera access/);
    else assert.deepEqual((await task).photos, []);
    assert.equal(sheet, 'closed');
    assert.equal(removed, 2);
  }
});

test('cold-start OCR waits for the catalogue without delaying camera presentation', async () => {
  let provide;
  let onText;
  let notified;
  const catalogue = new Promise(resolve => { provide = resolve; });
  const tea = { id: '1', rawName: 'Assam', brand: 'Fancy' };
  const result = openNativeTeaCamera({
    async addListener(name, callback) {
      if (name === 'photoText') onText = callback;
      return { remove() {} };
    },
    async open() {
      await onText({ id: 'photo', lines: ['Fancy Assam'] });
      return { action: 'use_photo', photoID: 'photo' };
    },
    async showPhotoResult(value) { notified = value; },
  }, { matchPhoto: async () => (await waitForCameraCatalog(catalogue))[0] });
  await turn();
  assert.equal(notified, undefined);
  provide([tea]);
  assert.equal((await result).photoTea, tea);
  assert.equal(notified.result, 'possible');
});

test('native scene integrates cold and warm URLs and retains Capacitor forwarding', () => {
  const scene = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');
  const info = readFileSync('ios/App/App/Info.plist', 'utf8');
  const widget = readFileSync('ios/App/LiveActivity/FACLiveActivityWidget.swift', 'utf8');
  assert.match(info, /\$\(PRODUCT_BUNDLE_IDENTIFIER\)\.quick-access/);
  assert.match(scene, /deliverQuickAccess\(connectionOptions\.urlContexts\)/);
  assert.match(scene, /deliverQuickAccess\(URLContexts\)[\s\S]*?SceneDelegateProxy\.shared\.scene\(scene, openURLContexts: URLContexts\)/);
  assert.match(scene, /\.activationState == \.foregroundActive/);
  for (const target of ['Timer', 'Scanner']) {
    assert.ok(widget.includes('FAC' + target + 'QuickAccessWidget()'));
    assert.ok(widget.includes('quickAccessConfiguration(for: .' + target.toLowerCase() + ')'));
  }
  assert.match(widget, /supportedFamilies\(\[\.accessoryCircular\]\)/);
});
