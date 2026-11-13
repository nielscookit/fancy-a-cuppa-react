import test from 'node:test';
import assert from 'node:assert/strict';
import { preloadBundledVideo, prefetchVideoAsBlob } from '../src/timer/videoPreloader.js';

test('prefetch fetches complete MP4 into the actual video element', async () => {
  const actions = [];
  const video = { src: 'original.mp4', load: () => actions.push('load') };
  const cleanup = await prefetchVideoAsBlob({
    video, url: '/media/FIllSNB.mp4',
    fetchImpl: async (url, opts) => {
      assert.equal(url, '/media/FIllSNB.mp4');
      assert.equal(opts.cache, 'force-cache');
      return { ok: true, blob: async () => new Blob([new Uint8Array(2500)], {type:'video/mp4'}) };
    },
    createObjectURL: () => 'blob:ready-video',
    revokeObjectURL: url => actions.push('revoke:' + url),
  });
  assert.equal(video.src, 'blob:ready-video');
  assert.deepEqual(actions, ['load']);
  cleanup();
  assert.equal(actions.at(-1), 'revoke:blob:ready-video');
});

test('failed download does not replace existing video source', async () => {
  const video = { src: 'original.mp4', load() { throw Error('unexpected'); } };
  await assert.rejects(prefetchVideoAsBlob({
    video, url: '/media/FIllSNB.mp4',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  }), /HTTP 404/);
  assert.equal(video.src, 'original.mp4');
});

function metadataVideo() {
  const video = new EventTarget();
  video.readyState = 0;
  video.duration = 4;
  video.videoWidth = 375;
  video.videoHeight = 375;
  video.classList = { add() {}, remove() {} };
  video.setAttribute = video.removeAttribute = video.pause = () => {};
  video.setMetadata = () => {
    video.currentSrc = video.src;
    video.readyState = 1;
  };
  return video;
}

test('native Timer Kit loads all four bundled URLs directly, and retries a failed clip', async () => {
  const { createMediaController } = await import('../src/timer-kit/mediaController.js');
  const clips = ['fill', 'brew', 'steep', 'milk'];
  const assetBase = new URL('./media/', 'capacitor://localhost/').href;
  const videos = clips.map(() => metadataVideo());
  let failMilk = true;
  let pending = 0;
  const loads = [];
  const errors = [];
  videos.forEach((video, index) => {
    video.load = () => {
      assert.equal(pending++, 0, 'native metadata requests are serialized');
      loads.push(video.src);
      const missing = index === 3 && failMilk;
      video.error = missing ? { code: 4 } : null;
      queueMicrotask(() => {
        pending--;
        if (!missing) video.setMetadata();
        video.dispatchEvent(new Event(missing ? 'error' : 'loadedmetadata'));
      });
    };
  });
  const media = createMediaController({
    videos, assetBase, platform: 'ios',
    audioFactory: () => ({ pause() {} }),
    onError: error => errors.push(error.message),
  });
  const options = { fetchImpl: () => assert.fail('Native MP4s must bypass Fetch') };
  try {
    await assert.rejects(media.preloadAll(options), /milk video preload:.*media error 4/);
    assert.deepEqual(errors, ['milk video preload: Video could not be loaded (media error 4).']);
    failMilk = false;
    assert.deepEqual(await Promise.all([media.preloadAll(options), media.preloadAll(options)]),
      [[true, true, true, true], [true, true, true, true]]);
    assert.deepEqual(loads, [...clips, 'milk'].map(clip => 'capacitor://localhost/media/timer-kit/' + clip + '.mp4'));
  } finally {
    media.destroy();
  }
});

test('bundled preload rejects invalid video metadata', async () => {
  const video = metadataVideo();
  video.videoWidth = 0;
  video.load = () => {
    video.setMetadata();
    video.dispatchEvent(new Event('loadedmetadata'));
  };
  await assert.rejects(preloadBundledVideo({ video, url: './bad.mp4' }), /Invalid video metadata/);
});

test('bundled preload rejects if metadata stalls', async () => {
  const video = metadataVideo();
  video.load = () => {};
  await assert.rejects(preloadBundledVideo({ video, url: './stalled.mp4', timeoutMs: 5 }), /timed out/);
});

test('bundled preload cancels a pending load on teardown', async () => {
  const video = metadataVideo();
  video.load = () => {};
  const controller = new AbortController();
  const loading = preloadBundledVideo({ video, url: './fill.mp4', signal: controller.signal });
  controller.abort();
  await assert.rejects(loading, /cancelled/);
});

test('web Blob preload still rejects a response with status zero', async () => {
  await assert.rejects(prefetchVideoAsBlob({
    video: {}, url: './milk.mp4',
    fetchImpl: async () => ({
      ok: false, status: 0,
      blob: () => assert.fail('Rejected responses must not be read'),
    }),
  }), /HTTP 0/);
});


test('bundled preload recovers from one stalled load and ignores a stale metadata event', async () => {
  const video = metadataVideo();
  let loads = 0;
  video.load = () => {
    loads++;
    if (loads === 2) {
      video.dispatchEvent(new Event('loadedmetadata'));
      queueMicrotask(() => video.setMetadata());
    }
  };
  await preloadBundledVideo({ video, url: './milk.mp4', timeoutMs: 30 });
  assert.equal(loads, 2);
  assert.equal(video.preload, 'metadata');
});

test('bundled preload reuses already available metadata for the same URL', async () => {
  const video = metadataVideo();
  video.baseURI = 'capacitor://localhost/';
  video.src = 'capacitor://localhost/milk.mp4';
  video.setMetadata();
  video.load = () => assert.fail('Valid metadata must not be discarded');
  await preloadBundledVideo({ video, url: './milk.mp4' });
});

test('native Home can start when metadata is deferred until play', async () => {
  const { createMediaController } = await import('../src/timer-kit/mediaController.js');
  const videos = Array.from({ length: 4 }, () => metadataVideo());
  const played = [];
  let confirmFill;
  let fillSeeks = 0;
  Object.defineProperty(videos[0], 'currentTime', {
    get: () => 0, set: () => { fillSeeks++; },
  });
  videos.forEach((video, index) => {
    video.load = () => assert.fail('Native cold start must not force a metadata reload');
    video.play = () => {
      assert.ok(video.src.endsWith('.mp4'));
      played.push(index);
      if (index === 0) return new Promise(resolve => { confirmFill = resolve; });
      return Promise.resolve();
    };
  });
  const media = createMediaController({
    videos, assetBase: 'capacitor://localhost/media/', platform: 'ios',
    audioFactory: () => ({ play: async () => {}, pause() {} }),
  });
  try {
    await media.preloadForStart();
    await media.preloadForStart();
    assert.deepEqual(videos.map(video => video.readyState), [0, 0, 0, 0]);
    let starts = 0;
    media.reset();
    media.startSynced(() => starts++);
    assert.equal(fillSeeks, 0);
    assert.deepEqual(played, [0, 3]);
    assert.equal(starts, 0);
    confirmFill();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 1);
    for (const index of [0, 1]) {
      videos[index].dispatchEvent(new Event('ended'));
      await new Promise(resolve => setImmediate(resolve));
    }
    media.milk();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(played, [0, 3, 1, 2, 3]);
    assert.equal(media.phase, 3);
  } finally {
    media.destroy();
  }
});
