/**
 * UI-only watchdog for the iPhone issue where the timer advances but video
 * time stays frozen. No media/timer/audio controller changes.
 */
export const VIDEO_STALL_THRESHOLD_MS = 4500;

export function nextVideoProgress(previous, {
  phase,
  time,
  elapsedMs = 1000,
} = {}) {
  const current = Number.isFinite(Number(time)) ? Number(time) : 0;
  const stage = Number.isInteger(phase) ? phase : -1;
  const old = previous || { phase: -1, time: 0, unchangedMs: 0 };
  const hasAdvanced = old.phase !== stage ||
    Math.abs(current - old.time) > 0.08;
  const unchangedMs = hasAdvanced
    ? 0
    : Math.max(0, old.unchangedMs || 0) + Math.max(0, elapsedMs);
  return {
    phase: stage,
    time: current,
    unchangedMs,
    stalled: unchangedMs >= VIDEO_STALL_THRESHOLD_MS,
  };
}
