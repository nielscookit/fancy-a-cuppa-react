import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeTeaAlarm } from '../src/timer/nativeTeaAlarm.js';

const running = { running: true, deadline: 61000 };
const idle = { running: false };

function setup(overrides = {}) {
  const calls = [];
  const coordinator = createNativeTeaAlarm({
    alarm: {
      status: async () => ({ available: true }),
      schedule: async input => { calls.push(input); },
      clear: async () => { calls.push('clear'); },
      ...overrides,
    },
    fallback: {
      sync: state => calls.push(['fallback', state]),
      enable: () => calls.push('enable'),
    },
    onError: error => calls.push(error.message),
    now: () => 1000,
  });
  return { coordinator, calls };
}

test('planning uses the confirmed deadline once and AlarmKit owns completion', async () => {
  const { coordinator, calls } = setup();
  coordinator.sync({ ...idle, preparing: true });
  coordinator.sync({ ...running, deadline: 1000 });
  assert.deepEqual(calls, []);
  const planned = coordinator.sync(running);
  coordinator.sync(running);
  await planned;
  assert.equal(coordinator.useReady(), false);
  coordinator.sync({ ...idle, finished: true });
  coordinator.sync(idle); // Lifecycle reset is not an explicit stop.
  await coordinator.reconcile();
  assert.deepEqual(calls, [{ deadline: 61000 }]);
  await coordinator.reset();
  assert.deepEqual(calls, [{ deadline: 61000 }, 'clear']);
});

test('explicit RESET during native planning cancels after the schedule settles', async () => {
  let finish;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const { coordinator, calls } = setup({
    schedule: () => new Promise(resolve => { finish = resolve; entered(); }),
  });
  coordinator.sync(running);
  await started;
  const ready = coordinator.useReady();
  coordinator.sync(idle);
  const reset = coordinator.reset();
  finish();
  await reset;
  assert.equal(await ready, false);
  assert.deepEqual(calls, ['clear']);
});

test('permission denial enables legacy notification and foreground Ready', async () => {
  const { coordinator, calls } = setup({
    schedule: async () => { throw new Error('denied'); },
  });
  await coordinator.sync(running);
  coordinator.sync({ ...idle, finished: true });
  assert.equal(coordinator.useReady(), true);
  assert.deepEqual(calls, ['denied', ['fallback', running], 'enable',
    ['fallback', { ...idle, finished: true }]]);
});

test('recovered running timer submits its original deadline for native deduplication', async () => {
  const { coordinator, calls } = setup();
  coordinator.sync(idle);
  await coordinator.sync(running);
  await coordinator.reconcile();
  assert.deepEqual(calls, [['fallback', idle], { deadline: 61000 }]);
});

test('unsupported iOS uses the existing owner without attempting AlarmKit scheduling', async () => {
  const { coordinator, calls } = setup({ status: async () => ({ available: false }) });
  await coordinator.sync(running);
  assert.equal(coordinator.useReady(), true);
  assert.deepEqual(calls, ['AlarmKit unavailable.', ['fallback', running], 'enable']);
});

test('late native failure after automatic idle never starts a legacy alert', async () => {
  let reject;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const { coordinator, calls } = setup({
    schedule: () => new Promise((_, fail) => { reject = fail; entered(); }),
  });
  const pending = coordinator.sync(running);
  await started;
  coordinator.sync(idle);
  reject(new Error('expired'));
  await pending;
  assert.deepEqual(calls, []);
});
