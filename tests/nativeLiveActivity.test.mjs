import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeLiveActivitySync } from '../src/timer/nativeLiveActivity.js';
import { createTimerController } from '../src/timer/timerController.js';

test('ActivityKit receives confirmed timer transitions and the original deadlines', async () => {
  const events = [];
  const sync = createNativeLiveActivitySync({ sync: async state => events.push(state) }, assert.fail);
  let now = 1000;
  let fillStarted;
  const timer = createTimerController({
    initialSeconds: 60, now: () => now, onPersist: sync, documentRef: null, navigatorRef: null,
    scheduler: { setInterval: () => 1, clearInterval() {} },
    media: {
      startSynced(confirm) { fillStarted = confirm; },
      unlock() {}, pause() {}, resume() {}, reset() {}, milk() {}, finish() {}, destroy() {},
    },
    audio: { unlock() {}, reset() {}, playAlmost() {}, playFinished: async () => {}, destroy() {} },
  });
  timer.start();
  await new Promise(setImmediate);
  assert.deepEqual(events.map(event => event.status), ['idle']);
  fillStarted();
  now += 7000;
  timer.tick();
  timer.pause();
  now += 5000;
  timer.start();
  now += 53000;
  timer.tick();
  timer.reset();
  await new Promise(setImmediate);
  assert.deepEqual(events, [
    { status: 'idle', deadline: 0, remaining: 0 },
    { status: 'running', deadline: 61000, remaining: 0 },
    { status: 'paused', deadline: 0, remaining: 53 },
    { status: 'running', deadline: 66000, remaining: 0 },
    { status: 'finished', deadline: 0, remaining: 0 },
    { status: 'idle', deadline: 0, remaining: 0 },
  ]);
  timer.destroy();
});
