import { memo } from 'react';

/**
 * Reference-study variant for /timer-lab/ only.
 * The supplied cooking timer GIF has sparse stationary gray tick marks
 * and a small red indicator. Movement is intentionally very restrained.
 * The actual video below supplies the primary motion.
 */
function TimerReferenceRing({ running, idle }) {
  return (
    <svg className="timer-kit-radial timer-kit-reference-ring"
      viewBox="0 0 375 375" aria-hidden="true" focusable="false">
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * 30;
        return (
          <line key={i} x1="187.5" y1="31.5" x2="187.5" y2="24.5"
            transform={`rotate(${angle} 187.5 187.5)`}
            stroke="#9299A3" strokeOpacity="0.62"
            strokeWidth="2" strokeLinecap="round" />
        );
      })}
      <circle cx="187.5" cy="35.5" r="4.25" fill="#F65369"
        className={running ? 'timer-kit-reference-dot--running' : ''}
        style={{ opacity: idle ? 0.7 : 1 }} />
    </svg>
  );
}
export default memo(TimerReferenceRing);
