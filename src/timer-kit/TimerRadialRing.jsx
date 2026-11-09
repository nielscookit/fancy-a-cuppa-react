import { memo, useEffect, useRef } from 'react';

/**
 * Isolated timer-lab experiment: an organic, breathing radial highlight.
 * Animation time is deliberately independent of the countdown duration.
 * A paused timer freezes this visual; reset returns to the quiet base ring.
 * No changes to the media / timer controllers.
 */
const TICKS = 72;
const wrapDistance = (a, b) => {
  const distance = Math.abs(a - b) % TICKS;
  return Math.min(distance, TICKS - distance);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function TimerRadialRing({ running, idle }) {
  const svgRef = useRef(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const lines = [...svg.querySelectorAll('line')];
    if (!lines.length) return undefined;

    let frame = 0;
    let previous = null;
    let lastPaint = -Infinity;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const paint = (seconds, active) => {
      // Hover around the lower-right arc instead of marching once per timer cycle.
      const center = 53 + 3.8 * Math.sin(seconds * 0.23) + 2.1 * Math.sin(seconds * 0.47);
      // The highlighted group gently grows and recedes, with a slower second swell.
      const breath = (1 - Math.cos(seconds * 0.77)) / 2;
      const secondaryBreath = (1 - Math.cos(seconds * 0.29)) / 2;
      const spread = 5.5 + breath * 7.5 + secondaryBreath * 2.5;

      lines.forEach((line, i) => {
        const distance = wrapDistance(i, center);
        // Neighboring bars do not grow identically: subtle, smooth variation.
        const unevenness = 0.87 + 0.13 * Math.sin(i * 0.74 + seconds * 0.57);
        const glow = active ? Math.exp(-Math.pow(distance / spread, 2) * 1.8) * unevenness : 0;
        const intensity = clamp(glow, 0, 1);
        const outward = 13 * intensity;
        const length = 7 + 16 * intensity;
        const outer = 173 + outward;

        line.setAttribute('y1', String(187.5 - outer + length));
        line.setAttribute('y2', String(187.5 - outer));
        line.setAttribute('stroke-opacity', String(0.20 + 0.67 * intensity));
        line.setAttribute('stroke-width', String(0.85 + 1.4 * intensity));
        line.setAttribute('stroke', intensity > 0.02 ? '#666666' : '#B8B8B8');
      });
    };

    paint(elapsedRef.current / 1000, !idle && elapsedRef.current > 0);

    if (!running || reduceMotion) return undefined;
    const tick = (now) => {
      if (previous !== null) elapsedRef.current += Math.min(100, Math.max(0, now - previous));
      previous = now;
      if (now - lastPaint >= 32) {
        paint(elapsedRef.current / 1000, true);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, idle]);

  useEffect(() => {
    if (idle) elapsedRef.current = 0;
  }, [idle]);

  return (
    <svg ref={svgRef} className="timer-kit-radial" viewBox="0 0 375 375"
      aria-hidden="true" focusable="false">
      {Array.from({ length: TICKS }, (_, i) => (
        <line key={i} x1="187.5" y1="21.5" x2="187.5" y2="14.5"
          transform={`rotate(${i * (360 / TICKS)} 187.5 187.5)`}
          stroke="#B8B8B8" strokeOpacity="0.2" strokeWidth="0.85"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default memo(TimerRadialRing);
