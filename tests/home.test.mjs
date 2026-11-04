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
  assert.match(app, /scrollIntoView\(/);
  assert.match(app, /Quick timer will be connected in Phase 1B/);
  assert.match(app, /<TeaTimer/);
  assert.match(app, /<TeaEditor/);
  assert.doesNotMatch(readFileSync('src/components/HomeScreen.jsx','utf8'), /createMediaController|createTimerController|createAudioController/);
});

test('assistant button has reversible selected state and sticks at 12px', () => {
  const app=readFileSync('src/App.jsx','utf8');
  const home=readFileSync('src/components/HomeScreen.jsx','utf8');
  const css=readFileSync('src/components/home.css','utf8');
  assert.match(home,/assistantActive\s*=\s*false/);
  assert.match(home,/assistantPinned\s*=\s*false/);
  assert.match(home,/aria-pressed=\{assistantActive\}/);
  assert.match(home,/is-active/);
  assert.match(home,/is-pinned/);
  assert.match(css,/\.fac-home__action--secondary\.is-active\.MuiButton-root/);
  assert.match(css,/background-color:\s*#323234/);
  assert.match(css,/\.fac-home__action--secondary\.is-pinned\.MuiButton-root\s*\{/);
  assert.match(css,/position:\s*fixed/);
  assert.match(css,/top:\s*12px/);
  assert.match(css,/z-index:\s*1100/);
  assert.match(app,/window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*'smooth'\s*\}\)/);
  assert.match(app,/scrollIntoView\(/);
  assert.match(app,/sectionTop\s*<=\s*86/);
  assert.match(app,/assistantActive=\{assistantActive\}/);
  assert.match(app,/assistantPinned=\{assistantPinned\}/);
  assert.match(app,/window\.addEventListener\('scroll',\s*syncAssistantPosition,\s*\{ passive: true \}\)/);
});
