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

test('browser-native timer methods use Window receiver and update automatically', () => {
  // Browsers reject window.setInterval/clearInterval when called as methods of
  // an unrelated object ("Illegal invocation"). Node normally tolerates it.
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  let scheduledTick = null;
  let clearedId = null;
  let time = 1000;
  const snapshots = [];
  globalThis.setInterval = function (callback, ms) {
    assert.equal(this, globalThis, 'setInterval must use the global receiver');
    assert.equal(ms, 100);
    scheduledTick = callback;
    return 37;
  };
  globalThis.clearInterval = function (id) {
    assert.equal(this, globalThis, 'clearInterval must use the global receiver');
    clearedId = id;
  };
  let controller;
  try {
    const media = {
      unlock() {}, start() {}, resume() {}, pause() {}, reset() {},
      milk() {}, finish() {}, destroy() {},
    };
    const audio = {
      unlock() {}, reset() {}, playAlmost() {},
      playFinished: () => Promise.resolve(), destroy() {},
    };
    const documentRef = {
      hidden: false, addEventListener() {}, removeEventListener() {},
    };
    controller = createTimerController({
      media, audio, initialSeconds: 40,
      now: () => time, onUpdate: snapshot => snapshots.push(snapshot),
      documentRef, navigatorRef: {},
      // Deliberately use the default scheduler to catch regression.
    });
    controller.start();
    assert.equal(typeof scheduledTick, 'function', 'automatic ticks must be scheduled');
    time += 5000;
    scheduledTick();
    assert.equal(controller.state().remaining, 35);
    assert.equal(snapshots.at(-1).remaining, 35);
    controller.pause();
    assert.equal(clearedId, 37, 'automatic interval must be cleared on pause');
    controller.reset();
    assert.equal(controller.state().remaining, 40);
  } finally {
    controller?.destroy();
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  }
});

test('milk video can start after zero when Safari loading is delayed', async () => {
  const videos = Array.from({ length: 4 }, () => new FakeVideo());
  videos[3].readyState = 0; // iPhone has not decoded milk video yet.
  const requests = [];
  const media = createMediaController({
    videos,
    assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
    onMilkRequested: () => requests.push('milk'),
  });
  media.start();
  await nextLoop();
  videos[0].dispatchEvent(new Event('ended'));
  await nextLoop();
  videos[1].dispatchEvent(new Event('ended'));
  await nextLoop();
  assert.equal(media.phase, 2);
  media.milk();
  assert.deepEqual(requests, ['milk']);
  assert.equal(media.milkStarted, true);
  media.finish(); // timer reaches zero BEFORE milk loadeddata
  assert.ok(videos[2].pauses >= 1, 'steep loop must stop at zero');
  assert.equal(media.phase, 2, 'milk is still loading, not falsely reported as visible');
  videos[3].readyState = 3;
  videos[3].dispatchEvent(new Event('loadeddata'));
  await nextLoop();
  assert.equal(media.phase, 3, 'pending milk must start after timer zero');
  assert.ok(videos[3].plays >= 1);
  videos[3].dispatchEvent(new Event('ended'));
  assert.equal(videos[3].classList.contains('visible'), true,
    'leave the finished milk frame visible instead of resetting it');
  media.reset();
  assert.equal(videos[3].classList.contains('visible'), false);
  media.destroy();
});

test('reset cancels a milk load still pending from the previous timer session', async () => {
  const videos = Array.from({ length: 4 }, () => new FakeVideo());
  const media = createMediaController({
    videos,
    assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
  });
  media.start();
  await nextLoop();
  videos[3].readyState = 0;
  media.milk();
  media.reset();
  videos[3].readyState = 3;
  videos[3].dispatchEvent(new Event('loadeddata'));
  await nextLoop();
  assert.equal(media.phase, -1);
  assert.equal(videos[3].plays, 0, 'stale milk must never play after reset');
  media.destroy();
});

test('running state is published synchronously before media processing', () => {
  let timer;
  const events = [];
  const audio = {
    unlock: () => events.push('audio-unlock'),
    reset() {}, playAlmost() {}, playFinished: () => Promise.resolve(), destroy() {},
  };
  const media = {
    unlock: () => events.push('video-unlock'),
    start: () => events.push('media-start'),
    reset() {}, resume() {}, pause() {}, milk() {}, finish() {}, destroy() {},
  };
  timer = createTimerController({
    media, audio, initialSeconds: 40,
    onUpdate: state => { if (state.running) events.push('state-running'); },
    documentRef: { hidden: false, addEventListener() {}, removeEventListener() {} },
    navigatorRef: {},
    scheduler: { setInterval: () => 1, clearInterval() {} },
  });
  timer.start();
  assert.deepEqual(events.slice(0, 4), [
    'state-running', 'audio-unlock', 'video-unlock', 'media-start',
  ]);
  timer.destroy();
});

test('milk playback telemetry is distinct from the requested phase', async () => {
  const videos = Array.from({ length: 4 }, () => new FakeVideo());
  const events = [];
  const media = createMediaController({
    videos, assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
    onMilkEvent: info => events.push(info),
  });
  media.start();
  await nextLoop();
  media.milk();
  await nextLoop();
  const requested = events.find(x => x.event === 'requested');
  assert.equal(requested.requested, true);
  assert.equal(requested.everPlayed, false, 'requested does not prove actual playback');
  videos[3].currentTime = 1.5;
  videos[3].dispatchEvent(new Event('timeupdate'));
  assert.equal(media.getMilkStatus().currentTime, 1.5);
  assert.equal(media.getMilkStatus().everPlayed, true);
  media.reset();
  assert.equal(media.getMilkStatus().requested, false);
  assert.equal(media.getMilkStatus().everPlayed, false);
  media.destroy();
});

test('Start gesture primes the actual milk video; playback may later resume without gesture', async () => {
  let userGesture = false;
  class GestureVideo extends FakeVideo {
    constructor() { super(); this.authorized = false; }
    play() {
      if (!userGesture && !this.authorized) {
        return Promise.reject(new Error('NotAllowedError'));
      }
      this.authorized = true;
      return super.play();
    }
  }
  const videos = Array.from({ length: 3 }, () => new FakeVideo());
  videos.push(new GestureVideo());
  const media = createMediaController({
    videos, assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
  });
  userGesture = true;
  media.unlock();
  media.start();
  userGesture = false;
  await nextLoop();
  assert.equal(media.getMilkStatus().primed, true);
  assert.equal(media.getMilkStatus().everPlayed, false,
    'priming must not be reported as visibly played');
  media.milk();
  await nextLoop();
  assert.equal(media.phase, 3);
  assert.equal(media.getMilkStatus().blocked, false);
  assert.equal(media.getMilkStatus().everPlayed, true);
  media.destroy();
});

test('iOS NotAllowedError keeps previous frame and shows tap-to-play recovery', async () => {
  let userGesture = false;
  class GestureVideo extends FakeVideo {
    play() {
      if (!userGesture) return Promise.reject(new Error('NotAllowedError'));
      return super.play();
    }
  }
  const videos = Array.from({ length: 3 }, () => new FakeVideo());
  videos.push(new GestureVideo());
  const errors = [];
  const media = createMediaController({
    videos, assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
    onError: error => errors.push(error.message),
  });
  media.start();
  await nextLoop();
  assert.equal(media.phase, 0);
  media.milk();
  await nextLoop();
  assert.equal(media.getMilkStatus().blocked, true);
  assert.equal(media.phase, 0, 'rejected milk must not pretend to be playing');
  assert.equal(videos[3].classList.contains('visible'), false);
  assert.match(errors.at(-1), /Milk video playback blocked: NotAllowedError/);
  media.finish(); // clock has reached 0
  userGesture = true;
  media.retryMilkPlayback();
  userGesture = false;
  await nextLoop();
  assert.equal(media.phase, 3, 'explicit user tap can start milk after timer zero');
  assert.equal(media.getMilkStatus().blocked, false);
  assert.equal(videos[3].classList.contains('visible'), true);
  media.destroy();
});

test('reset invalidates pending milk prime so a late Promise cannot reset active video', async () => {
  const videos = Array.from({ length: 4 }, () => new FakeVideo());
  let resolvePrime;
  videos[3].play = () => new Promise(resolve => { resolvePrime = resolve; });
  const media = createMediaController({
    videos, assetBase: '/fancy-a-cuppa-react/media/',
    audioFactory: url => new FakeAudio(url),
  });
  media.unlock();
  assert.equal(media.getMilkStatus().priming, true);
  media.reset();
  resolvePrime();
  await nextLoop();
  assert.equal(media.getMilkStatus().primed, false);
  assert.equal(media.getMilkStatus().priming, false);
  media.destroy();
});
