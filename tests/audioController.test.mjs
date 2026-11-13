import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../src/timer/audioController.js';
import { createHomeAudioController } from '../src/timer/homeSoundProfile.js';

function harness({ profile, legacy = false, context = null, play, ...overrides } = {}) {
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
    ...overrides,
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


test('Ready uses unlocked Web Audio when HTML audio is blocked, loops and stops on hide/reset', async () => {
  const sources = [];
  const context = { state: 'running', destination: {},
    decodeAudioData: async () => ({}), close: async () => {}, resume: async () => {},
    createBufferSource() {
      const source = { stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const h = harness({ context, play: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) });
  await h.controller.playFinished();
  assert.equal(h.finished.plays, 0);
  assert.equal(sources.length, 1); assert.equal(sources[0].loop, true);
  h.hide(); assert.equal(sources[0].stopped, true);
  h.show(); assert.equal(sources.length, 1);
  await h.controller.playFinished(); h.controller.reset();
  assert.equal(sources[1].stopped, true);
  const pending = h.controller.playFinished(); h.controller.reset(); await pending;
  assert.equal(sources.length, 2);
  h.controller.destroy();
});

test('Start keeps foreground audio output active so Ready does not restart the device at expiry', async () => {
  const sources = [];
  let resumes = 0;
  const context = { state: 'running', sampleRate: 44100, destination: {},
    decodeAudioData: async () => ({}), close: async () => {},
    resume: async () => { resumes++; },
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource() {
      const source = { loop: false, stopped: false, connect() {}, disconnect() {},
        start() {}, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const h = harness({ context, play: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) });
  await new Promise(resolve => setImmediate(resolve));
  h.controller.unlock();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
  await h.controller.playFinished();
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[1].loop, true);
  assert.equal(resumes, 0);
  assert.equal(h.finished.plays, 0);
  h.controller.reset();
  assert.equal(sources[1].stopped, true);
  h.controller.destroy();
});

test('Ready recovers via HTML fallback when iOS Web Audio output cannot resume', async () => {
  const context = { state: 'suspended', destination: {},
    decodeAudioData: async () => ({}), close: async () => {},
    resume: () => Promise.reject(new Error('Failed to start the audio device')),
  };
  const h = harness({ context });
  await h.controller.playFinished();
  assert.equal(h.finished.plays, 1);
  h.controller.destroy();
});

test('Ready reports one useful error if both playback APIs are denied', async () => {
  const context = { state: 'suspended', destination: {},
    decodeAudioData: async () => ({}), close: async () => {},
    resume: () => Promise.reject(new Error('Failed to start the audio device')),
  };
  const h = harness({ context, play: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) });
  await assert.rejects(h.controller.playFinished(), /Ready-Ton konnte nicht gestartet werden/);
  h.controller.destroy();
});

const nativeAudio = {
  platform: 'ios',
  assetBase: './media/',
  locationRef: new URL('capacitor://localhost/'),
};

test('native Ready accepts status zero only after successful decoding', async () => {
  const sources = [];
  const context = {
    state: 'running', destination: {}, close: async () => {},
    decodeAudioData: async bytes => {
      assert.equal(bytes.byteLength, 42);
      return {};
    },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
  };
  const h = harness({ ...nativeAudio, context,
    fetchImpl: async () => ({ ok: false, status: 0, arrayBuffer: async () => new ArrayBuffer(42) }),
    onError: error => assert.fail(error.message),
  });
  await h.controller.playFinished();
  assert.equal(h.finished.plays, 0);
  assert.equal(sources[0].loop, true);
  h.hide();
  assert.equal(sources[0].stopped, true);
  h.show();
  await h.controller.playFinished();
  assert.equal(sources[1].loop, true);
  h.controller.reset();
  assert.equal(sources[1].stopped, true);
  h.controller.destroy();
});

test('native Ready falls back to the gesture-primed element after empty or undecodable bytes', async () => {
  for (const size of [0, 42]) {
    const context = { state: 'running', close: async () => {},
      decodeAudioData: async () => { throw new Error('Invalid MP3'); },
    };
    const h = harness({ ...nativeAudio, context,
      fetchImpl: async () => ({ ok: false, status: 0, arrayBuffer: async () => new ArrayBuffer(size) }),
      onError: error => assert.fail(error.message),
    });
    h.controller.unlock();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.finished.plays, 1);
    assert.equal(h.finished.playing, false);
    await h.controller.playFinished();
    assert.equal(h.finished.loop, true);
    assert.equal(h.finished.playing, true);
    h.controller.reset();
    assert.equal(h.finished.playing, false);
    h.controller.destroy();
  }
});

test('native Ready surfaces a failure when both paths cannot load the file', async () => {
  const context = { state: 'running', close: async () => {},
    decodeAudioData: async () => assert.fail('Missing response must not be decoded'),
  };
  const h = harness({ ...nativeAudio, context,
    fetchImpl: async () => ({ ok: false, status: 404 }),
    play: async () => { throw new Error('Missing media'); },
  });
  await assert.rejects(h.controller.playFinished(), /Ready.mp3 konnte nicht geladen oder abgespielt werden/);
  h.controller.destroy();
});

test('web Audio still rejects status zero', async () => {
  const errors = [];
  const context = { state: 'running', close: async () => {} };
  const h = harness({ context, onError: error => errors.push(error.message),
    fetchImpl: async () => ({ ok: false, status: 0, arrayBuffer: () => assert.fail('Unexpected read') }),
  });
  await assert.rejects(h.controller.playFinished(), /Ready.mp3 konnte nicht geladen werden/);
  assert.ok(errors.includes('Audio file not available: finishSound'));
  assert.equal(h.finished.plays, 0);
  h.controller.destroy();
});
