import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeNotificationController, TEA_READY_NOTIFICATION_ID, NATIVE_READY_SOUND_FILE } from './nativeNotificationController.js';
const wait = () => new Promise(resolve => setImmediate(resolve));
function rig(permission = 'granted') {
  const actions = [];
  const plugin = {
    checkPermissions: async () => ({ display: permission }),
    requestPermissions: async () => ({ display: 'granted' }),
    cancel: async p => { actions.push({ kind: 'cancel', id: p.notifications[0].id }); },
    schedule: async p => { actions.push({ kind: 'schedule', ...p.notifications[0] }); },
  };
  return { actions, plugin };
}
test('start and resume schedule one stable notification; ticks do not duplicate', async () => {
  const { actions, plugin } = rig();
  const c = createNativeNotificationController({ notifications: plugin, now: () => 1000 });
  await c.prepare();
  await wait();
  actions.length = 0;
  c.syncTimer({ running: true, deadline: 61_000 });
  c.syncTimer({ running: true, deadline: 61_000 });
  await wait();
  assert.deepEqual(actions.map(x => x.kind), ['cancel', 'schedule']);
  assert.equal(actions[1].id, TEA_READY_NOTIFICATION_ID);
  assert.equal(NATIVE_READY_SOUND_FILE, 'Ready.caf');
  assert.equal(actions[1].sound, NATIVE_READY_SOUND_FILE);
  assert.equal(actions[1].schedule.at.getTime(), 61_000);
  c.syncTimer({ running: false, deadline: 61_000 });
  await wait();
  c.syncTimer({ running: true, deadline: 91_000 });
  await wait();
  assert.deepEqual(actions.map(x => x.kind), ['cancel', 'schedule', 'cancel', 'cancel', 'schedule']);
  assert.equal(actions.at(-1).schedule.at.getTime(), 91_000);
});
test('reset cancels and does not re-schedule', async () => {
  const { actions, plugin } = rig();
  const c = createNativeNotificationController({ notifications: plugin, now: () => 1000 });
  await c.prepare();
  c.syncTimer({ running: true, deadline: 20_000 });
  await wait();
  c.syncTimer({ running: false, remaining: 240, total: 240 });
  await wait();
  assert.equal(actions.at(-1).kind, 'cancel');
});
test('permission requested only on enable; pending timer schedules after grant', async () => {
  const { actions, plugin } = rig('prompt');
  let requests = 0;
  plugin.requestPermissions = async () => { requests++; return { display: 'granted' }; };
  const c = createNativeNotificationController({ notifications: plugin, now: () => 1000 });
  c.syncTimer({ running: true, deadline: 30_000 });
  await c.prepare();
  assert.equal(requests, 0);
  assert.equal(actions.length, 0);
  await c.enable();
  await wait();
  assert.equal(requests, 1);
  assert.equal(actions.at(-1).kind, 'schedule');
});
test('cancel supersedes in-flight schedule and ends with no pending notification', async () => {
  const { actions, plugin } = rig();
  let release;
  plugin.schedule = p => new Promise(resolve => { actions.push({ kind: 'schedule', ...p.notifications[0] }); release = resolve; });
  const c = createNativeNotificationController({ notifications: plugin, now: () => 1000 });
  await c.prepare();
  c.syncTimer({ running: true, deadline: 30_000 });
  await wait();
  c.syncTimer({ running: false });
  release();
  await wait();
  assert.equal(actions.at(-1).kind, 'cancel');
});
test('finished timer cancels and keeps a single stable ID', async () => {
  const { actions, plugin } = rig();
  const c = createNativeNotificationController({ notifications: plugin, now: () => 1000 });
  await c.prepare();
  c.syncTimer({ running: true, deadline: 30_000 });
  await wait();
  c.syncTimer({ running: false, finished: true, deadline: 30_000 });
  await wait();
  assert.equal(actions.at(-1).kind, 'cancel');
});
