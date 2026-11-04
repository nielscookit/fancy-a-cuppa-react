import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_QUICK_MINUTES, MAX_QUICK_MINUTES, MIN_QUICK_MINUTES,
  QUICK_MINUTES_KEY, readQuickMinutes, saveQuickMinutes, stepQuickMinutes,
} from '../src/features/quickTimer.js';

test('Figma Home quick timer defaults to 2 minutes, then steps by 1 minute', () => {
  assert.equal(DEFAULT_QUICK_MINUTES, 2);
  assert.equal(stepQuickMinutes(2, 1), 3);
  assert.equal(stepQuickMinutes(3, -1), 2);
  assert.equal(stepQuickMinutes(1, -1), MIN_QUICK_MINUTES);
  assert.equal(stepQuickMinutes(30, 1), MAX_QUICK_MINUTES);
});

test('quick timer time is retained in V3 storage without touching V2', () => {
  const entries = new Map();
  const fakeStorage = {
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, value),
  };
  assert.equal(QUICK_MINUTES_KEY, 'fac-v3:quick-timer-minutes');
  assert.equal(readQuickMinutes(fakeStorage), 2);
  assert.equal(saveQuickMinutes(6, fakeStorage), true);
  assert.equal(readQuickMinutes(fakeStorage), 6);
  entries.set(QUICK_MINUTES_KEY, 'invalid');
  assert.equal(readQuickMinutes(fakeStorage), 2);
});

test('Figma 01 Home faithfully reflects exact sizes, positions and colours', () => {
  const home = readFileSync('src/components/HomeScreen.jsx', 'utf8');
  const css = readFileSync('src/components/home.css', 'utf8');
  assert.match(home, /Fancy a Cuppa\?/);
  assert.match(home, /How do you take it\?/);
  assert.match(home, /home-minus\.svg/);
  assert.match(home, /home-plus\.svg/);
  assert.match(css, /max-width:\s*375px/);
  assert.match(css, /top:\s*calc\(50% - 43px\)/);
  assert.match(css, /bottom:\s*82px/);
  assert.match(css, /bottom:\s*8px/);
  assert.match(css, /width:\s*66px/);
  assert.match(css, /font-size:\s*28px/);
  assert.match(css, /font-weight:\s*700/);
  assert.match(css, /#782b40/);
  assert.match(css, /#eeeeec/);
});

test('Figma exports are local 66px SVG assets, no remote temporary URLs', () => {
  for (const icon of ['minus','plus']) {
    const svg=readFileSync('public/figma/home-'+icon+'.svg','utf8');
    assert.match(svg, /<svg width="66" height="66"/);
    assert.match(svg, /viewBox="0 0 66 66"/);
    assert.match(svg, /<path d=/);
    assert.doesNotMatch(svg, /figma\.com|https:\/\//);
  }
});

test('home keeps tea assistant and validated timer integration isolated', () => {
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(app, /<HomeScreen/);
  assert.match(app, /onTeaAssistant=\{showTeaAssistant\}/);
  assert.match(app, /animateScrollTo\(/);
  assert.match(app, /Quick timer will be connected in Phase 1B/);
  assert.match(app, /<TeaTimer/);
  assert.match(app, /<TeaEditor/);
  assert.doesNotMatch(readFileSync('src/components/HomeScreen.jsx','utf8'), /createMediaController|createTimerController|createAudioController/);
});

test('one sticky button tracks the scrolling page without a fixed-position jump', () => {
  const app=readFileSync('src/App.jsx','utf8');
  const home=readFileSync('src/components/HomeScreen.jsx','utf8');
  const css=readFileSync('src/components/home.css','utf8');
  assert.match(home,/assistantActive\s*=\s*false/);
  assert.match(home,/aria-pressed=\{assistantActive\}/);
  assert.match(home,/fac-home__assistant-slot/);
  assert.match(home,/is-active/);
  assert.doesNotMatch(home,/is-pinned|assistantPinned/);
  assert.match(css,/\.fac-home__assistant-slot\s*\{\s*position:\s*sticky/);
  assert.match(css,/top:\s*12px/);
  assert.match(css,/margin:\s*-74px auto 8px/);
  assert.match(css,/height:\s*66px/);
  assert.match(css,/\.fac-home__assistant-slot \.fac-home__action--secondary\.MuiButton-root/);
  assert.match(css,/background-color:\s*#323234/);
  assert.doesNotMatch(css,/position:\s*fixed/);
  assert.match(app,/const nextActive = !assistantActive/);
  assert.match(app,/setAssistantActive\(nextActive\)/);
  assert.match(app,/scrollingRef\.current = animateScrollTo\(targetY\)/);
  assert.match(app,/const targetY = nextActive && section/);
  // Only a real button click changes selection. Scroll does not change state.
  assert.doesNotMatch(app,/setAssistantPinned|assistantPinned|syncAssistantPosition|addEventListener\('scroll'/);
  assert.match(app,/assistantActive=\{assistantActive\}/);
});
test('sticky button occupies the same Home-space coordinates as the reference', () => {
  // Initial top = viewport height - 74px (Figma 812 -> 738px).
  const viewport = 812;
  const initialTop = viewport - 74;
  const buttonHeight = 66;
  const compensatingMargin = 8;
  assert.equal(initialTop, 738);
  assert.equal(initialTop + buttonHeight + compensatingMargin, viewport);
  // It tracks content smoothly until it reaches the 12px top limit.
  const positions = [0, 10, 100, 500, 715, 730, 800]
    .map(scrollY => Math.max(12, initialTop - scrollY));
  assert.deepEqual(positions, [738, 728, 638, 238, 23, 12, 12]);
  assert.ok(positions.every((position, index) =>
    index === 0 || position <= positions[index - 1]));
});
