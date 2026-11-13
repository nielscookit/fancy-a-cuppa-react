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
  video.duration = 4;
  video.videoWidth = 375;
  video.videoHeight = 375;
  video.classList = { add() {}, remove() {} };
  video.setAttribute = video.removeAttribute = video.pause = () => {};
  return video;
}

test('native Timer Kit loads all four bundled URLs directly, and retries a failed clip', async () => {
  const { createMediaController } = await import('../src/timer-kit/mediaController.js');
  const clips = ['fill', 'brew', 'steep', 'milk'];
  const assetBase = new URL('./media/', 'capacitor://localhost/').href;
  const videos = clips.map(() => metadataVideo());
  let failMilk = true;
  const loads = [];
  const errors = [];
  videos.forEach((video, index) => {
    video.load = () => {
      loads.push(video.src);
      const missing = index === 3 && failMilk;
      video.error = missing ? { code: 4 } : null;
      queueMicrotask(() => video.dispatchEvent(new Event(missing ? 'error' : 'loadedmetadata')));
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
    assert.deepEqual(await media.preloadAll(options), [true, true, true, true]);
    assert.deepEqual(loads, [...clips, 'milk'].map(clip => 'capacitor://localhost/media/timer-kit/' + clip + '.mp4'));
  } finally {
    media.destroy();
  }
});

test('bundled preload rejects invalid video metadata', async () => {
  const video = metadataVideo();
  video.videoWidth = 0;
  video.load = () => video.dispatchEvent(new Event('loadedmetadata'));
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
