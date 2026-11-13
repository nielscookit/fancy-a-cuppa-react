import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeVideoController } from '../src/timer-kit/nativeVideoController.js';

function setup() {
  const calls = [];
  const phases = [];
  const videos = Array.from({ length: 4 }, (_, i) => Object.assign(new EventTarget(), {
    classList: { toggle() {} },
    currentTime: 0, readyState: 1, duration: i === 1 ? 15 : 5,
    pause() {},
    play() { calls.push(i); return new Promise(resolve => { this.confirm = resolve; }); },
  }));
  const media = createNativeVideoController({
    videos, assetBase: './media/', onPhase: phase => phases.push(phase),
    audioFactory: () => ({ pause() {}, play: async () => {} }),
  });
  return { media, videos, calls, phases };
}

test('native sequence starts directly and keeps the Milk frame until reset', async () => {
  const { media, videos, calls, phases } = setup();
  await media.preloadForStart();
  let starts = 0;
  media.startSynced(() => starts++);
  assert.deepEqual(calls, [0]);
  assert.equal(videos[0].preload, 'none');
  assert.equal(starts, 0);
  videos[0].confirm();
  await Promise.resolve();
  assert.equal(starts, 1);
  for (const index of [0, 1]) {
    videos[index].dispatchEvent(new Event('ended'));
    videos[index + 1].dispatchEvent(new Event('playing'));
  }
  media.milk();
  videos[3].dispatchEvent(new Event('playing'));
  videos[3].currentTime = 5;
  videos[3].dispatchEvent(new Event('ended'));
  media.finish();
  assert.deepEqual(calls, [0, 1, 2, 3]);
  assert.deepEqual(phases, [-1, 0, 1, 2, 3]);
  assert.equal(videos[3].currentTime, 5);
  media.reset();
  assert.equal(videos[3].currentTime, 0);
  media.startSynced(() => starts++);
  videos[0].dispatchEvent(new Event('playing'));
  assert.equal(starts, 2);
  media.destroy();
});

test('native reset cancels stale startup and a restored pause preserves position', async () => {
  const { media, videos, calls } = setup();
  let starts = 0;
  media.startSynced(() => starts++);
  const confirm = videos[0].confirm;
  media.reset();
  confirm();
  await Promise.resolve();
  assert.equal(starts, 0);
  media.restore({ elapsed: 7, remaining: 53, running: false, finished: false });
  assert.equal(videos[1].currentTime, 2);
  assert.deepEqual(calls, [0]);
  media.resume();
  videos[1].dispatchEvent(new Event('playing'));
  media.pause();
  media.resume();
  assert.deepEqual(calls, [0, 1, 1]);
  assert.equal(videos[1].currentTime, 2);
  media.destroy();
});
