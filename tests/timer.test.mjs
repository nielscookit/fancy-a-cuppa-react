import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimerController } from '../src/timer/timerController.js';
import { createMediaController } from '../src/timer/mediaController.js';
import { MEDIA_ASSETS, V2_SOURCE_COMMIT } from '../src/timer/mediaManifest.js';

function timerHarness(seconds = 40) {
  const events = [];
  let milliseconds = 0;
  const media = Object.fromEntries(
    ['start', 'pause', 'resume', 'milk', 'finish', 'reset', 'unlock', 'destroy']
      .map(name => [name, () => events.push('media:' + name)]),
  );
  media.ready = () => true;
  media.prepare = () => Promise.resolve();
  const audio = Object.fromEntries(
    ['unlock', 'playAlmost', 'reset', 'destroy'].map(name => [name, () => events.push('audio:' + name)]),
  );
  audio.playFinished = () => { events.push('audio:finished'); return Promise.resolve(); };
  const scheduler = { setInterval: fn => { scheduler.tick = fn; return 1; }, clearInterval: () => {} };
  const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
  const timer = createTimerController({
    media, audio, initialSeconds: seconds, now: () => milliseconds,
    scheduler, documentRef: doc, navigatorRef: {},
  });
  return { timer, events, advance(secondsFromStart) {
    milliseconds = secondsFromStart * 1000;
    timer.tick();
  }};
}

test('deadline-based timer triggers exactly one 30s cue, milk at 5s, finish at zero', async () => {
  const t = timerHarness(40);
  t.timer.start();
  assert.equal(t.timer.state().running, true);
  t.advance(10);
  assert.equal(t.events.filter(x => x === 'audio:playAlmost').length, 1);
  t.advance(12);
  assert.equal(t.events.filter(x => x === 'audio:playAlmost').length, 1);
  t.advance(35);
  assert.equal(t.events.filter(x => x === 'media:milk').length, 1);
  t.advance(40);
  assert.equal(t.timer.state().finished, true);
  assert.equal(t.timer.state().remaining, 0);
  assert.equal(t.events.filter(x => x === 'audio:finished').length, 1);
  t.timer.tick();
  assert.equal(t.events.filter(x => x === 'audio:finished').length, 1);
  t.timer.destroy();
});

test('pause/resume uses remaining time instead of resetting countdown', () => {
  const t = timerHarness(120);
  t.timer.start();
  t.advance(20);
  t.timer.pause();
  assert.equal(t.timer.state().remaining, 100);
  t.advance(35);
  t.timer.start();
  assert.equal(t.timer.state().running, true);
  t.advance(45);
  assert.equal(t.timer.state().remaining, 90);
  assert.equal(t.events.filter(x => x === 'media:resume').length, 1);
  t.timer.destroy();
});

test('new duration resets flags and restart resets finished media', () => {
  const t = timerHarness(40);
  t.timer.start();
  t.advance(40);
  t.timer.start();
  assert.equal(t.timer.state().running, true);
  assert.equal(t.timer.state().remaining, 40);
  t.timer.setSeconds(60);
  assert.equal(t.timer.state().total, 60);
  assert.equal(t.timer.state().warnedThirty, false);
  assert.throws(() => t.timer.setSeconds(0), /Invalid timer duration/);
  t.timer.destroy();
});

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.readyState = 3;
    this.currentTime = 0;
    this.plays = 0;
    this.pauses = 0;
    const classes = new Set();
    this.classList = { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) };
  }
  setAttribute() {}
  removeAttribute() {}
  load() {}
  play() { this.plays++; return Promise.resolve(); }
  pause() { this.pauses++; }
}
class FakeAudio {
  constructor(url) { this.url = url; this.plays = 0; this.currentTime = 0; }
  pause() {}
  play() { this.plays++; return Promise.resolve(); }
}
const nextLoop = () => new Promise(resolve => setImmediate(resolve));

test('media controller follows V2 fill → brew → steep → milk, preserving milk at finish', async () => {
  const videos = Array.from({ length: 4 }, () => new FakeVideo());
  const sounds = [];
  const phases = [];
  const media = createMediaController({
    videos, assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => { const a = new FakeAudio(url); sounds.push(a); return a; },
    onPhase: value => phases.push(value),
  });
  await media.prepare();
  media.start();
  await nextLoop();
  assert.equal(media.phase, 0);
  videos[0].dispatchEvent(new Event('ended'));
  await nextLoop();
  assert.equal(media.phase, 1);
  videos[1].dispatchEvent(new Event('ended'));
  await nextLoop();
  assert.equal(media.phase, 2);
  videos[2].currentTime = 1.04;
  videos[2].dispatchEvent(new Event('timeupdate'));
  assert.equal(sounds.find(a => a.url.endsWith('BlubbKlein.mp3')).plays, 1);
  media.milk();
  await nextLoop();
  assert.equal(media.phase, 3);
  media.finish();
  assert.equal(videos[3].classList.contains('visible'), true);
  media.reset();
  assert.equal(media.phase, -1);
  assert.equal(videos[3].classList.contains('visible'), false);
  media.destroy();
});

test('media bundle is pinned to confirmed V2 commit and uses expected filenames', () => {
  assert.equal(V2_SOURCE_COMMIT, '203782e33b4d52184091c171008bccdbb6437057');
  assert.equal(MEDIA_ASSETS.fill.file, 'FIllSNB.mp4');
  assert.equal(MEDIA_ASSETS.milk.file, 'MILKSNB.mp4');
  assert.equal(Object.keys(MEDIA_ASSETS).length, 10);
  for (const {sha} of Object.values(MEDIA_ASSETS)) assert.match(sha, /^[a-f0-9]{40}$/);
});

test('countdown starts synchronously even if Safari preload never completes', () => {
  const t = timerHarness(40);
  let prepared = false;
  t.timer.start();
  assert.equal(t.timer.state().running, true);
  assert.equal(t.timer.state().remaining, 40);
  t.advance(11);
  assert.equal(t.timer.state().remaining, 29);
  assert.equal(t.events.filter(x => x === 'media:start').length, 1);
  t.timer.reset();
  assert.equal(t.timer.state().running, false);
  assert.equal(t.timer.state().remaining, 40);
  assert.equal(t.events.at(-2), 'media:reset');
  t.advance(35);
  assert.equal(t.timer.state().remaining, 40);
  t.timer.destroy();
});

test('media unlock error must not prevent a functioning countdown', () => {
  let milliseconds = 0;
  const events = [];
  const media = {
    unlock: () => { throw new Error('Safari audio denied'); },
    start: () => { throw new Error('Video unavailable'); },
    pause: () => events.push('pause'),
    reset: () => {}, finish: () => {}, destroy: () => {},
  };
  const audio = {
    unlock: () => { throw new Error('Audio unavailable'); },
    reset: () => {}, playAlmost: () => {}, playFinished: () => Promise.resolve(),
    destroy: () => {},
  };
  const errors = [];
  const timer = createTimerController({
    media, audio, initialSeconds: 40, onError: e => errors.push(e.message),
    now: () => milliseconds,
    scheduler: { setInterval: () => 1, clearInterval: () => {} },
    documentRef: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} },
    navigatorRef: {},
  });
  timer.start();
  assert.equal(timer.state().running, true);
  milliseconds = 2000;
  timer.tick();
  assert.equal(timer.state().remaining, 38);
  assert.equal(errors.length, 3);
  timer.reset();
  assert.equal(timer.state().remaining, 40);
  assert.equal(timer.state().running, false);
  timer.destroy();
});

test('media at timer zero cannot leave stalled steep video running', async () => {
  const videos = Array.from({ length: 4 }, () => new FakeVideo());
  const media = createMediaController({
    videos,
    assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
  });
  media.start();
  await nextLoop();
  videos[0].dispatchEvent(new Event('ended'));
  await nextLoop();
  videos[1].dispatchEvent(new Event('ended'));
  await nextLoop();
  assert.equal(media.phase, 2);
  // Simulate iPhone not loading / completing the milk video before zero.
  videos[3].readyState = 0;
  media.milk();
  media.finish();
  assert.ok(videos[2].pauses >= 1);
  media.reset();
  media.destroy();
});
