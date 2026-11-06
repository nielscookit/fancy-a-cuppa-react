import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
const files = ['fill.mp4','brew.mp4','steep.mp4','milk.mp4'];
for (const filename of files) {
  const path = 'public/media/timer-kit/' + filename;
  assert.ok(existsSync(path), 'Missing new video: ' + path);
  assert.ok(statSync(path).size > 10_000, 'Video unexpectedly small: ' + path);
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp', 'Not an ISO BMFF MP4: ' + path);
}
for (const path of ['timer-lab/index.html', 'src/timer-kit/TimerKitLab.jsx']) {
  assert.ok(existsSync(path), 'Missing timer lab source: ' + path);
}
console.log('Timer Kit assets OK: 4 MP4 files, separate test route.');
