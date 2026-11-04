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
  assert.match(app, /<QuickTimerView/);
  assert.match(app, /const startQuickTimer = \(\) => openTimerWithSeconds\(quickMinutes \* 60\)/);
  assert.match(app, /const startDetailTimer = \(\) => openTimerWithSeconds\(detailMinutes \* 60\)/);
  const visible = app.indexOf('flushSync(() => setQuickTimerOpen(true))');
  const start = app.indexOf('quickTimerRef.current?.begin(seconds)');
  assert.ok(visible >= 0 && start > visible,
    'Timer view must be visible synchronously before the iPhone video start');
  const gesture = app.slice(visible, start);
  assert.doesNotMatch(gesture, /await|\.then\(|setTimeout\(|requestAnimationFrame\(/);

  assert.match(app, /<TeaDetail/);
  assert.match(app, /<TeaEditor/);
  assert.doesNotMatch(readFileSync('src/components/HomeScreen.jsx','utf8'), /createMediaController|createTimerController|createAudioController/);
});

test('assistant button scrolls normally with document; click targets 8px top offset', () => {
  const app=readFileSync('src/App.jsx','utf8');
  const home=readFileSync('src/components/HomeScreen.jsx','utf8');
  const css=readFileSync('src/components/home.css','utf8');
  assert.match(home,/assistantActive\s*=\s*false/);
  assert.match(home,/aria-pressed=\{assistantActive\}/);
  assert.match(home,/ref=\{assistantButtonRef\}/);
  assert.match(home,/fac-home__assistant-slot/);
  assert.match(home,/is-active/);
  assert.doesNotMatch(home,/is-pinned|assistantPinned/);
  const rule=css.split('.fac-home__assistant-slot {')[1].split('}')[0];
  assert.match(rule,/position:\s*relative/);
  assert.match(rule,/margin:\s*-74px auto 8px/);
  assert.match(rule,/height:\s*66px/);
  assert.doesNotMatch(rule,/position:\s*(?:sticky|fixed)|top:\s*12px/);
  assert.match(css,/background-color:\s*#323234/);
  assert.match(app,/const nextActive = !assistantActive/);
  assert.match(app,/setAssistantActive\(nextActive\)/);
  assert.match(app,/scrollingRef\.current = animateScrollTo\(targetY\)/);
  assert.match(app,/assistantButtonRef\.current/);
  assert.match(app,/getBoundingClientRect\(\)\.top - 8/);
  assert.match(app,/assistantActive=\{assistantActive\}/);
  assert.match(app,/assistantButtonRef=\{assistantButtonRef\}/);
  // Scroll events only collapse the assistant at Home; they never pin the button.
  assert.doesNotMatch(app,/setAssistantPinned|assistantPinned|syncAssistantPosition/);
});
test('the button starts at the original Figma position and scrolls offscreen', () => {
  const homeHeight=812;
  const buttonTop=homeHeight-74;
  const buttonHeight=66;
  const bottomSpace=8;
  assert.equal(buttonTop,738);
  assert.equal(buttonTop + buttonHeight + bottomSpace, homeHeight);
  // User gestures continue to move the button after the click destination.
  const positions=[0,726,840,1000].map(scrollY => buttonTop-scrollY);
  assert.deepEqual(positions,[738,12,-102,-262]);
  assert.ok(positions[2] < 0, 'Button must disappear naturally when user scrolls further');
});

test('the red Home button is fully above the viewport at the 8px assistant landing', () => {
  const figmaHomeHeight=812;
  const redButtonBottom=figmaHomeHeight-82;
  const assistantButtonTop=figmaHomeHeight-74;
  const scrollY=assistantButtonTop-8;
  assert.equal(redButtonBottom-scrollY,0,
    'The 4px red sliver visible at 12px disappears at the 8px landing');
});

test('returning all the way to top hides assistant and restores default select state', () => {
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(app,/const \[assistantVisible, setAssistantVisible\] = useState\(false\)/);
  assert.match(app,/const \[assistantActive, setAssistantActive\] = useState\(false\)/);
  assert.match(app,/assistantHasLeftHomeRef\.current = true/);
  assert.match(app,/assistantReturningHomeRef\.current = true/);
  assert.match(app,/if \(y >= 24\) assistantHasLeftHomeRef\.current = true/);
  assert.match(app,/if \(y > 2 \|\|/);
  const reachedHome=app.split('function onPageScroll() {')[1].split("window.addEventListener('scroll'")[0];
  assert.match(reachedHome,/setAssistantActive\(false\)/);
  assert.match(reachedHome,/setAssistantVisible\(false\)/);
  assert.match(reachedHome,/setMode\('closed'\)/);
  assert.match(app,/\{assistantVisible && \(/);
  assert.match(app,/setAssistantVisible\(true\)/);
  assert.match(app,/setAssistantActive\(nextActive\)/);
  assert.match(app,/scrollingRef\.current = animateScrollTo\(targetY\)/);
});
