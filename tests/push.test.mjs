import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createPushController } from '../src/push/pushController.js';
import { validateCommand, validateSubscription, pushFailureReason } from '../supabase/functions/tea-push/protocol.js';

test('provider diagnostics allow known error codes without logging arbitrary response data', () => {
  assert.equal(pushFailureReason('{"reason":"BadJwtToken"}'), 'BadJwtToken');
  assert.equal(pushFailureReason('{"reason":"VapidPkHashMismatch"}'), 'VapidPkHashMismatch');
  for (const body of ['private endpoint', '{"reason":"secret-value"}', 'null', '{}']) {
    assert.equal(pushFailureReason(body), 'UnclassifiedProviderError');
  }
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function harness({ saved, permission = 'granted', handler, storage: givenStorage, serviceWorkerReady, active, setupTimeoutMs, permissionResult = 'granted' } = {}) {
  let clock = 100_000;
  const values = new Map(saved ? [['fac-v3-push', JSON.stringify(saved)]] : []);
  const storage = givenStorage || { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const calls = [];
  let permissionCalls = 0, unsubscribed = 0;
  const subscription = { toJSON: () => ({ endpoint: 'subscription' }), unsubscribe: async () => { unsubscribed++; } };
  const registration = { active, pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription } };
  const notification = { permission, requestPermission() { permissionCalls++; notification.permission = permissionResult; return Promise.resolve(permissionResult); } };
  const controller = createPushController({
    endpoint: '/push', baseUrl: '/fancy-a-cuppa-react/', storage, cryptoRef: webcrypto,
    now: () => clock, notificationRef: notification, setupTimeoutMs,
    navigatorRef: { serviceWorker: { register: async () => registration, ready: serviceWorkerReady || Promise.resolve(registration) } },
    windowRef: { PushManager: function () {}, matchMedia: () => ({ matches: true }) },
    fetchRef: async (_url, options = {}) => {
      if (!options.body) return { ok: true, json: async () => ({ publicKey: 'AAAA' }) };
      const body = JSON.parse(options.body); calls.push(body);
      if (handler) { const handled = await handler(body); if (handled) return handled; }
      return { ok: true, json: async () => ({ revision: body.revision || 0, status: body.remainingMs ? 'scheduled' : 'cancelled' }) };
    },
  });
  return { controller, calls, values, setClock: v => { clock = v; }, get permissionCalls() { return permissionCalls; }, get unsubscribed() { return unsubscribed; } };
}
const running = deadline => ({ running: true, preparing: false, finished: false, deadline });
const paused = { running: false, preparing: false, finished: false, deadline: null };

test('permission is requested only by the direct start gesture, never on mount', async () => {
  const h = harness({ permission: 'default' });
  await h.controller.prepare(); assert.equal(h.permissionCalls, 0);
  const enabled = h.controller.enable(); assert.equal(h.permissionCalls, 1);
  await enabled; assert.equal(h.controller.snapshot().enabled, true);
  h.controller.destroy();
});

test('Start plans once despite ticks; Pause cancels; Resume gets a new revision; finish and unmount do not cancel', async () => {
  const h = harness(); await h.controller.prepare(); await h.controller.enable();
  h.controller.syncTimer(running(160_000)); await settle();
  for (let i = 0; i < 100; i++) h.controller.syncTimer(running(160_000));
  assert.equal(h.calls.filter(c => c.action === 'sync').length, 1);
  h.controller.syncTimer(paused); await settle();
  h.setClock(110_000); h.controller.syncTimer(running(170_000)); await settle();
  const requests = h.calls.filter(c => c.action === 'sync');
  assert.deepEqual(requests.map(c => c.remainingMs), [60_000, null, 60_000]);
  assert.ok(requests[0].revision < requests[1].revision && requests[1].revision < requests[2].revision);
  h.controller.syncTimer({ ...paused, finished: true }); h.controller.destroy();
  assert.equal(h.calls.filter(c => c.action === 'sync').length, 3);
});

test('Reset while Start is in flight sends the newer cancellation, never shows the obsolete success', async () => {
  let release;
  const h = harness({ handler: c => c.action === 'sync' && c.remainingMs ? new Promise(resolve => { release = resolve; }) : null });
  await h.controller.prepare(); await h.controller.enable();
  h.controller.syncTimer(running(160_000)); await settle();
  h.controller.syncTimer(paused);
  release(null); await settle(); await settle();
  const sync = h.calls.filter(c => c.action === 'sync');
  assert.equal(sync.length, 2); assert.equal(sync[1].remainingMs, null);
  assert.equal(h.controller.snapshot().status, 'cancelled');
  h.controller.destroy();
});

test('offline cancellation remains durable and retry preserves the same revision', async () => {
  let offline = false;
  const h = harness({ handler: c => { if (offline && c.action === 'sync') throw new Error('offline'); } });
  await h.controller.prepare(); await h.controller.enable();
  h.controller.syncTimer(running(160_000)); await settle();
  offline = true; h.controller.syncTimer(paused); await settle();
  assert.equal(h.controller.snapshot().status, 'unconfirmed');
  assert.match(h.controller.snapshot().error, /Cancellation not confirmed/);
  const pending = JSON.parse(h.values.get('fac-v3-push')).intent;
  assert.equal(pending.kind, 'cancel');
  offline = false; await h.controller.retry();
  assert.equal(h.calls.at(-1).revision, pending.revision);
  assert.equal(h.controller.snapshot().status, 'cancelled');
  h.controller.destroy();
});

test('recovery keeps the existing deadline and does not enqueue a duplicate notification', async () => {
  const first = harness(); await first.controller.prepare(); await first.controller.enable();
  first.controller.syncTimer(running(160_000)); await settle();
  const saved = JSON.parse(first.values.get('fac-v3-push')); first.controller.destroy();
  const recovered = harness({ saved });
  recovered.controller.syncTimer(running(160_000)); await recovered.controller.prepare();
  assert.equal(recovered.calls.filter(c => c.action === 'sync').length, 0);
  assert.equal(recovered.controller.snapshot().status, 'scheduled');
  recovered.controller.destroy();
});

test('expired offline Start never creates an old notification on reconnect', async () => {
  let offline = true;
  const h = harness({ handler: c => { if (offline && c.action === 'sync') throw new Error(); } });
  await h.controller.prepare(); await h.controller.enable();
  h.controller.syncTimer(running(160_000)); await settle();
  offline = false; h.setClock(170_000); await h.controller.retry();
  assert.equal(h.calls.filter(c => c.action === 'sync').length, 1);
  assert.match(h.controller.snapshot().error, /timer ended/); h.controller.destroy();
});

test('Disable removes the server schedule before unsubscribing; storage failure does not fake success', async () => {
  const h = harness(); await h.controller.prepare(); await h.controller.enable();
  h.controller.syncTimer(running(160_000)); await settle(); await h.controller.disable();
  assert.equal(h.calls.at(-1).action, 'disable'); assert.equal(h.unsubscribed, 2);
  assert.equal(h.controller.snapshot().enabled, false); h.controller.destroy();
  const blocked = harness({ storage: { getItem() {}, setItem() { throw new Error(); } } });
  await blocked.controller.prepare(); assert.equal(await blocked.controller.enable(), false);
  assert.equal(blocked.calls.length, 0); assert.equal(blocked.controller.snapshot().enabled, false);
  blocked.controller.destroy();
});

test('failed Disable stays enabled and Retry repeats cancellation rather than ignoring it', async () => {
  let offline = false;
  const h = harness({ handler: c => { if (offline && c.action === 'disable') throw new Error(); } });
  await h.controller.prepare(); await h.controller.enable();
  offline = true; await h.controller.disable();
  assert.equal(h.controller.snapshot().enabled, true);
  assert.match(h.controller.snapshot().error, /Could not turn/);
  offline = false; await h.controller.retry();
  assert.equal(h.calls.filter(c => c.action === 'disable').length, 2);
  assert.equal(h.controller.snapshot().enabled, false);
  h.controller.destroy();
});

test('server validation rejects SSRF, malformed credentials and unlimited or past timers', () => {
  const curve = createECDH('prime256v1'); curve.generateKeys();
  const subscription = { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  assert.equal(validateSubscription(subscription).endpoint, subscription.endpoint);
  for (const endpoint of ['http://web.push.apple.com/a', 'https://web.push.apple.com.evil.test/a', 'https://127.0.0.1/a', 'https://web.push.apple.com:444/a', 'https://user:pass@web.push.apple.com/a']) {
    assert.throws(() => validateSubscription({ ...subscription, endpoint }));
  }
  const command = { action: 'sync', id: webcrypto.randomUUID(), token: randomBytes(32).toString('hex'), revision: 1, remainingMs: 60_000 };
  assert.equal(validateCommand(command), command);
  for (const remainingMs of [0, -1, 3_600_001, '60000', undefined]) assert.throws(() => validateCommand({ ...command, remainingMs }));
  assert.throws(() => validateCommand({ ...command, token: 'guess' }));
  assert.throws(() => validateCommand({ ...command, revision: 1.5 }));
});

test('worker displays a visible notification and reopens only the V3 home scope', async () => {
  const listeners = {}, shown = [], opened = [];
  let focused = 0, closed = 0;
  const scope = 'https://nielscookit.github.io/fancy-a-cuppa-react/';
  const self = {
    addEventListener: (type, callback) => { listeners[type] = callback; },
    registration: { scope, showNotification: async (...args) => { shown.push(args); } },
    clients: { matchAll: async () => [{ url: 'https://nielscookit.github.io/fancy-a-cuppa/', focus() { focused++; } }], openWindow: async url => { opened.push(url); } },
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL });
  let work;
  listeners.push({ data: { json: () => ({ version: 1, type: 'tea-ready', title: 'Your tea is ready', body: 'Time for a cuppa.' }) }, waitUntil: p => { work = p; } });
  await work; assert.equal(shown[0][0], 'Your tea is ready'); assert.equal(shown[0][1].tag, 'fac-tea-ready');
  listeners.notificationclick({ notification: { close: () => { closed++; } }, waitUntil: p => { work = p; } });
  await work; assert.equal(closed, 1); assert.equal(focused, 0); assert.deepEqual(opened, [scope]);
});

test('first Start prompts synchronously even while worker readiness is stuck; setup times out', async () => {
  const h = harness({ permission: 'default', serviceWorkerReady: new Promise(() => {}), setupTimeoutMs: 10 });
  const preparing = h.controller.prepare();
  await settle();
  const enabling = h.controller.enable();
  assert.equal(h.permissionCalls, 1);
  assert.equal(await enabling, false);
  await preparing;
  assert.equal(h.controller.snapshot().busy, false);
  assert.equal(h.controller.snapshot().ready, false);
  assert.equal(h.calls.length, 0);
  h.controller.destroy();
});

test('an already activated worker does not wait for the global ready promise', async () => {
  const h = harness({ active: { state: 'activated' }, serviceWorkerReady: new Promise(() => {}), setupTimeoutMs: 10 });
  await h.controller.prepare();
  assert.equal(h.controller.snapshot().ready, true);
  assert.equal(await h.controller.enable(), true);
  assert.equal(h.permissionCalls, 0);
  h.controller.destroy();
});

test('repeated Start after consent never prompts again; denied permission is respected', async () => {
  const h = harness({ permission: 'default' });
  await h.controller.enable();
  await h.controller.enable(); await h.controller.enable();
  assert.equal(h.permissionCalls, 1);
  h.controller.destroy();
  const denied = harness({ permission: 'denied' });
  assert.equal(await denied.controller.enable(), false);
  assert.equal(denied.permissionCalls, 0);
  denied.controller.destroy();
});

test('dismissed system prompt is not repeated at each brew or after reload', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = harness({ permission: 'default', permissionResult: 'default', storage });
  await first.controller.enable(); await first.controller.enable();
  assert.equal(first.permissionCalls, 1); first.controller.destroy();
  const second = harness({ permission: 'default', storage });
  await second.controller.enable();
  assert.equal(second.permissionCalls, 0); second.controller.destroy();
});

test('Reset during enrollment prevents an obsolete start from being scheduled', async () => {
  let activate;
  const ready = new Promise(resolve => { activate = resolve; });
  const h = harness({ permission: 'default', serviceWorkerReady: ready });
  h.controller.syncTimer(running(160_000));
  const enabling = h.controller.enable(); await settle();
  h.controller.syncTimer(paused);
  activate({ pushManager: { getSubscription: async () => null, subscribe: async () => ({ toJSON: () => ({endpoint: 'subscription'}) }) } });
  assert.equal(await enabling, true);
  assert.equal(h.calls.filter(c => c.action === 'sync' && c.remainingMs !== null).length, 0);
  h.controller.destroy();
});
