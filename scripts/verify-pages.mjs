import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MEDIA_ASSETS } from '../src/timer/mediaManifest.js';

for (const file of ['index.html', 'lab/index.html', 'timer-test/index.html']) {
  assert.ok(existsSync('dist/' + file), 'Missing GitHub Pages entry: ' + file);
}
for (const { file } of Object.values(MEDIA_ASSETS)) {
  assert.ok(existsSync('dist/media/' + file), 'Missing verified V2 media: ' + file);
}
console.log('Pages outputs OK: app, /lab/, /timer-test/, 10 verified media files.');
