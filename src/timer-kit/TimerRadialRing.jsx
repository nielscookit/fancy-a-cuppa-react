import { memo, useEffect, useRef } from 'react';

/**
 * Isolated timer-lab experiment: an organic, breathing radial highlight.
 * Animation time is deliberately independent of the countdown duration.
 * A paused timer freezes this visual; reset returns to the quiet base ring.
 * No changes to the media / timer controllers.
 */
const TICKS = 72;
const REVOLUTION_MS = 1000;
const wrapDistance = (a, b) => {
  const distance = Math.abs(a - b) % TICKS;
  return Math.min(distance, TICKS - distance);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function TimerRadialRing({ running, idle }) {
  const svgRef = useRef(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const lines = [...(svgRef.current?.querySelectorAll('line') || [])];
    if (!lines.length) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    let frame = null;
    let previous = null;
    if (idle) elapsedRef.current = 0;

    const paint = active => {
      const center = ((elapsedRef.current % REVOLUTION_MS) / REVOLUTION_MS) * TICKS;
      lines.forEach((line, i) => {
        const distance = wrapDistance(i, center);
        // Fisheye magnification: broad smooth shoulders with a pronounced peak.
        const intensity = active ? Math.exp(-0.5 * Math.pow(distance / 5, 2)) : 0;
        const outward = 14 * intensity;
        const length = 7 + 21 * intensity;
        const radius = 170 + outward;
        line.setAttribute('y1', String(187.5 - radius + length));
        line.setAttribute('y2', String(187.5 - radius));
        line.setAttribute('stroke-opacity', String(0.24 + intensity * 0.72));
      });
    };

    paint(!idle && elapsedRef.current > 0);
    if (!running || reducedMotion) return undefined;
    const tick = now => {
      if (previous !== null) elapsedRef.current += Math.max(0, now - previous);
      previous = now;
      paint(true);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { if (frame !== null) cancelAnimationFrame(frame); };
  }, [running, idle]);

  return (
    <svg ref={svgRef} className="timer-kit-radial" viewBox="0 0 375 375"
      aria-hidden="true" focusable="false">
      {Array.from({ length: TICKS }, (_, i) => (
        <line key={i} x1="187.5" y1="21.5" x2="187.5" y2="14.5"
          transform={`rotate(${i * (360 / TICKS)} 187.5 187.5)`}
          stroke="#777777" strokeOpacity="0.24" strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default memo(TimerRadialRing);
