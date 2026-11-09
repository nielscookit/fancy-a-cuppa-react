import { memo } from 'react';

/**
 * A subtle radial clock for the isolated timer lab.
 * Pure visualization: reads the existing countdown, never controls timing.
 * The bright sector travels clockwise from 12 o'clock while running;
 * pausing freezes its exact position. No animation timeline to desync.
 */
const TICKS = 72;
const MOD = TICKS;
const wrapDistance = (a, b) => Math.min(Math.abs(a - b), MOD - Math.abs(a - b));

function TimerRadialRing({ total, remaining, running, preparing, finished }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const elapsedFraction = Math.min(1, Math.max(0, (safeTotal - Number(remaining || 0)) / safeTotal));
  const active = (running || finished || (remaining < total && !preparing));
  const head = elapsedFraction * TICKS;
  return (
    <svg className="timer-kit-radial" viewBox="0 0 375 375" aria-hidden="true" focusable="false">
      {Array.from({ length: TICKS }, (_, i) => {
        const distance = wrapDistance(i, head % TICKS);
        const intensity = active ? Math.max(0, 1 - distance / 7) : 0;
        const angle = i * (360 / TICKS);
        const outward = 9 * Math.pow(intensity, 1.5);
        const length = 7 + 7 * intensity;
        const outer = 174 + outward;
        return (
          <line key={i} x1="187.5" y1={187.5 - outer + length}
            x2="187.5" y2={187.5 - outer}
            transform={`rotate(${angle} 187.5 187.5)`}
            stroke={intensity > 0.01 ? '#777777' : '#B8B8B8'}
            strokeOpacity={0.22 + 0.62 * intensity}
            strokeWidth={0.85 + 1.4 * intensity}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export default memo(TimerRadialRing);
