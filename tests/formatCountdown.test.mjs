import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCountdown } from '../src/timer/formatCountdown.js';

test('diagnostic main clock and fine clock share one reading', () => {
  assert.equal(formatCountdown(35.2), '00:35.2');
  assert.equal(formatCountdown(1.2), '00:01.2');
  assert.equal(formatCountdown(40), '00:40.0');
  assert.equal(formatCountdown(0), '00:00.0');
  assert.equal(formatCountdown(125.5), '02:05.5');
});
test('clock never rounds to zero while time remains', () => {
  assert.equal(formatCountdown(0.01), '00:00.1');
  assert.equal(formatCountdown(-3), '00:00.0');
});
