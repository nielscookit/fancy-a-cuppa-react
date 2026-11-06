import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Home mounts all four inline clips with a Fill poster and separate mask', () => {
  const home = readFileSync('src/components/HomeScreen.jsx','utf8');
  const stage = readFileSync('src/timer-kit/media-stage.css','utf8');
  assert.match(home, /\['fill', 'brew', 'steep', 'milk'\]/);
  assert.match(home, /PHASES\.map/);
  assert.match(home, /muted playsInline preload="auto"/);
  assert.match(home, /MEDIA_ASSETS\.fill\.poster/);
  assert.match(stage, /radial-gradient/);
  assert.match(stage, /background:#fff/);
});

test('Home reuses its button slots for pause, resume and reset', () => {
  const home = readFileSync('src/components/HomeScreen.jsx','utf8');
  assert.match(home, /running \|\| preparing \? 'Pause'/);
  assert.match(home, /inSession \? 'Resume'/);
  assert.match(home, /onClick=\{inSession \? reset : onTeaAssistant\}/);
});
