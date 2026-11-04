import test from 'node:test';
import assert from 'node:assert/strict';
import { animateScrollTo, easeOutCubic, scrollDuration } from '../src/features/scrollMotion.js';

function fakeWindow({ initial = 0, reducedMotion = false } = {}) {
  const frames = new Map();
  const handlers = new Map();
  const moves = [];
  let nextId = 0;
  let clock = 0;
  const view = {
    scrollY: initial,
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return { matches: reducedMotion };
    },
    scrollTo(x, y) {
      assert.equal(x, 0);
      view.scrollY = y;
      moves.push(y);
    },
    requestAnimationFrame(fn) {
      const id = ++nextId;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, listener) { handlers.set(name, listener); },
    removeEventListener(name) { handlers.delete(name); },
  };
  function tick(milliseconds = 16) {
    clock += milliseconds;
    const next = [...frames.values()];
    frames.clear();
    for (const callback of next) callback(clock);
  }
  function flush(n = 80) { for (let i=0;i<n;i++) tick(); }
  return { view, tick, flush, moves, frames, handlers };
}

test('ease-out starts quickly and settles progressively; respects duration bounds', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(.25) > .25);
  assert.ok(easeOutCubic(.75) > .75);
  assert.equal(scrollDuration(0), 300);
  assert.equal(scrollDuration(500), 310);
  assert.equal(scrollDuration(2000), 560);
});

test('scroll reaches exact destination after a fast start and smooth deceleration', () => {
  const simulation = fakeWindow();
  const cancel = animateScrollTo(800, { view: simulation.view });
  simulation.tick();
  simulation.tick(100);
  const early = simulation.view.scrollY;
  simulation.tick(100);
  const later = simulation.view.scrollY;
  assert.ok(early > 0 && later > early);
  assert.ok(early > (later - early), 'Progress should decelerate');
  simulation.flush();
  assert.equal(simulation.view.scrollY, 800);
  assert.equal(simulation.frames.size, 0);
  assert.equal(simulation.handlers.size, 0);
  assert.doesNotThrow(cancel);
});

test('the return direction is animated and remains reversible mid-animation', () => {
  const simulation = fakeWindow({ initial: 850 });
  const cancelDown = animateScrollTo(0, { view: simulation.view });
  simulation.tick();
  simulation.tick(120);
  assert.ok(simulation.view.scrollY < 850);
  cancelDown();
  const interrupted = simulation.view.scrollY;
  const cancelUp = animateScrollTo(850, { view: simulation.view });
  simulation.flush();
  assert.equal(simulation.view.scrollY, 850);
  assert.ok(interrupted < 850);
  assert.equal(simulation.frames.size, 0);
  cancelUp();
});

test('touch input takes precedence over scripted scrolling', () => {
  const simulation = fakeWindow();
  animateScrollTo(900, { view: simulation.view });
  simulation.tick();
  simulation.tick();
  const whenTouched = simulation.view.scrollY;
  simulation.handlers.get('touchstart')();
  simulation.flush();
  assert.equal(simulation.view.scrollY, whenTouched);
  assert.equal(simulation.frames.size, 0);
  assert.equal(simulation.handlers.size, 0);
});

test('prefers-reduced-motion moves immediately without animation', () => {
  const simulation = fakeWindow({ reducedMotion: true });
  animateScrollTo(740, { view: simulation.view });
  assert.equal(simulation.view.scrollY, 740);
  assert.equal(simulation.frames.size, 0);
  assert.equal(simulation.handlers.size, 0);
});
