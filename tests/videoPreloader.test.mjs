import test from 'node:test';
import assert from 'node:assert/strict';
import { prefetchVideoAsBlob } from '../src/timer/videoPreloader.js';

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
