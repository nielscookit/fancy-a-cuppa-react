/**
 * Exact same tenth-second reading for both displayed clock and diagnostics.
 * Rounding upwards prevents a premature 0.0 before the timer actually ends.
 */
export function formatCountdown(remainingSeconds) {
  const deciseconds = Math.ceil(Math.max(0, remainingSeconds) * 10);
  const minutes = Math.floor(deciseconds / 600);
  const seconds = Math.floor((deciseconds % 600) / 10);
  const fraction = deciseconds % 10;
  return String(minutes).padStart(2, '0')
    + ':' + String(seconds).padStart(2, '0') + '.' + fraction;
}
