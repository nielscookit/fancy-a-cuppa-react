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

test('Home switches from duration controls to countdown and reset', () => {
  const home = readFileSync('src/components/HomeScreen.jsx','utf8');
  assert.match(home, /inSession \? 'Reset'/);
  assert.match(home, /else if \(inSession\) reset\(\)/);
  assert.match(home, /onClick=\{onTeaAssistant\}\s+disabled=\{inSession\}/);
  assert.match(home, /onClick=\{actions\.toggle\}/);
  assert.match(home, /Pause timer/);
  assert.match(home, /Resume timer/);
  assert.doesNotMatch(home, /Brew again/);
});

test('Home duration buttons are independent of media preload', () => {
  const home = readFileSync('src/components/HomeScreen.jsx', 'utf8');
  assert.match(home, /onClick=\{\(\) => stepTime\(-1\)\}\s+disabled=\{minutes <= MIN_QUICK_MINUTES\}/);
  assert.match(home, /onClick=\{\(\) => stepTime\(1\)\}\s+disabled=\{minutes >= MAX_QUICK_MINUTES\}/);
});

test('only Web/PWA Home opts into durable timer recovery', () => {
  const home = readFileSync('src/components/HomeScreen.jsx', 'utf8');
  assert.match(home, /const native = Capacitor\.getPlatform\(\) === 'ios'/);
  assert.match(home, /storageKey: native \? undefined : 'fac-v3-active-timer'/);
  assert.match(home, /onPersist: push\.syncTimer/);
});

test('native Home keeps the assistant in flow and anchors all three controls to the canvas', () => {
  const css = readFileSync('src/components/home.css', 'utf8');
  assert.match(css, /\[data-native-ios\] \.fac-home__time-control \{ bottom:210px/);
  assert.match(css, /\[data-native-ios\] \.fac-home__action--primary\.MuiButton-root \{ bottom:96px/);
  assert.match(css, /\[data-native-ios\] \+ \.fac-home__assistant-slot \{ margin:-80px auto 14px/);
});

test('native drawer scopes all four modes and renders one validated BREW in its footer', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  const detail = readFileSync('src/components/TeaDetail.jsx', 'utf8');
  const css = readFileSync('src/components/tea-sheet.css', 'utf8');
  assert.match(app, /nativeIOS && \['search', 'prep', 'add', 'edit'\]\.includes\(mode\)/);
  assert.match(app, /fixedBrew=\{nativeIOS\}/);
  assert.match(detail, /disabled=\{!validWater\}/);
  assert.match(detail, /\{!fixedBrew && brewButton\}/);
  assert.match(detail, /<\/section>\s+\{fixedBrew && <div className="fac-sheet-footer fac-sheet-footer--brew">\{brewButton\}/);
  assert.match(css, /padding-bottom:max\(14px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\[data-native-expanded-gap="true"\] \.fac-sheet-editor-actions \{ margin-top:48px/);
});
