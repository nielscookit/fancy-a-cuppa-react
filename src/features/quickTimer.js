import { v3StorageKey } from '../storage.js';

export const DEFAULT_QUICK_MINUTES = 2; // Figma Home 19:47
export const MIN_QUICK_MINUTES = 1;
export const MAX_QUICK_MINUTES = 30;
export const QUICK_MINUTES_KEY = v3StorageKey('quick-timer-minutes');

export function clampQuickMinutes(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < MIN_QUICK_MINUTES ||
    number > MAX_QUICK_MINUTES) return DEFAULT_QUICK_MINUTES;
  return number;
}

export function stepQuickMinutes(value, delta) {
  const current = clampQuickMinutes(value);
  if (delta !== -1 && delta !== 1) return current;
  return Math.min(MAX_QUICK_MINUTES,
    Math.max(MIN_QUICK_MINUTES, current + delta));
}

export function readQuickMinutes(storage = null) {
  try {
    const target = storage || globalThis.localStorage;
    const previous = target.getItem(QUICK_MINUTES_KEY);
    return previous === null ? DEFAULT_QUICK_MINUTES : clampQuickMinutes(previous);
  } catch {
    return DEFAULT_QUICK_MINUTES;
  }
}

export function saveQuickMinutes(value, storage = null) {
  try {
    const target = storage || globalThis.localStorage;
    target.setItem(QUICK_MINUTES_KEY, String(clampQuickMinutes(value)));
    return true;
  } catch {
    return false;
  }
}
