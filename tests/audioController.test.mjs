import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../src/timer/audioController.js';
import { createHomeAudioController } from '../src/timer/homeSoundProfile.js';

function harness({ profile, legacy = false, context = null, play } = {}) {
  const files = [];
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  const options = {
    assetBase: '/fancy-a-cuppa-react/media/', documentRef,
    contextFactory: () => context,
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
    audioFactory: url => {
      const audio = { url, readyState: 4, currentTime: 0, loop: false, playing: false, plays: 0,
        pause() { this.playing = false; },
        play() { this.playing = true; this.plays++; return play ? play(this) : Promise.resolve(); },
      };
      files.push(audio); return audio;
    },
  };
  const controller = legacy ? createAudioController(options) : createHomeAudioController(options, profile);
  return { controller, files, documentRef, finished: files[0], almost: files[1],
    hide() { documentRef.hidden = true; documentRef.dispatchEvent(new Event('visibilitychange')); },
    show() { documentRef.hidden = false; documentRef.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('Home loads uploaded cues; Ready repeats until Reset, and a new run can play again', async () => {
  const h = harness();
  assert.equal(new URL(h.almost.url, 'https://example.org').pathname, '/fancy-a-cuppa-react/audio/Memo.mp3');
  assert.equal(new URL(h.finished.url, 'https://example.org').pathname, '/fancy-a-cuppa-react/audio/Ready.mp3');
  h.controller.playAlmost();
  assert.equal(h.almost.plays, 1); assert.equal(h.almost.loop, false);
  await h.controller.playFinished();
  assert.equal(h.finished.loop, true); assert.equal(h.finished.playing, true);
  h.finished.currentTime = 1;
  h.controller.reset();
  assert.equal(h.finished.playing, false); assert.equal(h.finished.loop, false);
  assert.equal(h.finished.currentTime, 0);
  await h.controller.playFinished(); assert.equal(h.finished.loop, true);
  h.controller.destroy(); assert.equal(h.finished.playing, false);
});

test('leaving Home app stops the alarm and returning never resumes it automatically', async () => {
  const h = harness();
  await h.controller.playFinished();
  h.hide(); assert.equal(h.finished.playing, false); assert.equal(h.finished.loop, false);
  await h.controller.playFinished(); assert.equal(h.finished.plays, 1);
  h.show(); assert.equal(h.finished.plays, 1); assert.equal(h.finished.playing, false);
  h.controller.destroy();
});

test('original Home profile and unconfigured diagnostics retain old cues without repeating', async () => {
  for (const options of [{ profile: 'original' }, { legacy: true }]) {
    const h = harness(options);
    assert.ok(h.finished.url.endsWith('/media/tea-finished.mp3'));
    assert.ok(h.almost.url.endsWith('/media/AlmostTime.mp3'));
    await h.controller.playFinished(); assert.equal(h.finished.loop, false);
    h.controller.destroy();
  }
});

test('Reset suppresses intentional play abort but actual playback failures remain visible', async () => {
  let reject;
  const h = harness({ play: () => new Promise((_, no) => { reject = no; }) });
  const pending = h.controller.playFinished();
  h.controller.reset(); reject(new DOMException('Reset', 'AbortError'));
  await pending;
  const next = h.controller.playFinished();
  reject(new DOMException('Blocked', 'NotAllowedError'));
  await assert.rejects(next, { name: 'NotAllowedError' });
  h.controller.destroy();
});

test('Reset stops decoded Memo audio and cancels a pending AudioContext resume', async () => {
  let resume;
  const sources = [];
  const context = { state: 'running', destination: {},
    decodeAudioData: async () => ({}), close: async () => {},
    resume: () => new Promise(resolve => { resume = resolve; }),
    createBufferSource() {
      const source = { stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const h = harness({ context });
  await new Promise(resolve => setImmediate(resolve));
  h.controller.playAlmost(); assert.equal(sources.length, 1);
  h.controller.reset(); assert.equal(sources[0].stopped, true);
  context.state = 'suspended'; h.controller.playAlmost(); h.controller.reset();
  resume(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sources.length, 1);
  h.controller.destroy();
});
