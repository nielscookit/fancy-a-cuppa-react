import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MEDIA_ASSETS } from '../src/timer/mediaManifest.js';
import { MEDIA_ASSETS as TIMER_KIT_ASSETS } from '../src/timer-kit/mediaManifest.js';

for (const file of ['index.html', 'lab/index.html', 'timer-test/index.html', 'timer-lab/index.html']) {
  assert.ok(existsSync('dist/' + file), 'Missing GitHub Pages entry: ' + file);
}
for (const { file } of Object.values(MEDIA_ASSETS)) {
  assert.ok(existsSync('dist/media/' + file), 'Missing verified V2 media: ' + file);
}
for (const { file, poster } of Object.values(TIMER_KIT_ASSETS)) {
  assert.ok(existsSync('dist/media/' + file), 'Missing Timer Kit media: ' + file);
  if (poster) assert.ok(existsSync('dist/media/' + poster), 'Missing Timer Kit poster: ' + poster);
}
console.log('Pages outputs OK: app, /lab/, /timer-test/, /timer-lab/ and timer media.');
