/**
 * Fast-starting, gently decelerating scroll for Home ↔ Tea Assistant.
 * Unlike native scrollIntoView({ behavior: 'smooth' }), the duration and
 * ease-out curve stay consistent across browsers and iPhone WebViews.
 *
 * Returns a cancellation function; touch, wheel or key input takes priority
 * over the automated navigation. Reduced-motion setting is respected.
 */
export function easeOutCubic(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return 1 - (1 - t) ** 3;
}

export function scrollDuration(distance) {
  return Math.min(560, Math.max(300, Math.abs(distance) * 0.62));
}

export function animateScrollTo(targetY, { view = window } = {}) {
  const from = view.scrollY || 0;
  const to = Math.max(0, Number(targetY) || 0);
  const distance = to - from;
  const duration = scrollDuration(distance);

  const reducedMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reducedMotion || Math.abs(distance) < 1) {
    view.scrollTo(0, to);
    return () => {};
  }

  let frameId = null;
  let firstFrameTime = null;
  let cancelled = false;
  const cancelEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const unsubscribe = () => {
    for (const event of cancelEvents) view.removeEventListener(event, cancel);
  };
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    if (frameId !== null) view.cancelAnimationFrame(frameId);
    unsubscribe();
  }
  function frame(timestamp) {
    if (cancelled) return;
    if (firstFrameTime === null) firstFrameTime = timestamp;
    const progress = Math.min(1, (timestamp - firstFrameTime) / duration);
    view.scrollTo(0, from + distance * easeOutCubic(progress));
    if (progress < 1) frameId = view.requestAnimationFrame(frame);
    else {
      cancelled = true;
      unsubscribe();
    }
  }
  for (const event of cancelEvents) view.addEventListener(event, cancel, { passive: true });
  frameId = view.requestAnimationFrame(frame);
  return cancel;
}
