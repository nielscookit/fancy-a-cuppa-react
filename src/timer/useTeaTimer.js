import { useCallback, useEffect, useRef, useState } from 'react';
import { createTeaTimerSession } from './teaTimerSession.js';

function initialState(seconds) {
  return {
    countdown: {
      total: seconds, remaining: seconds, running: false,
      preparing: false, finished: false, warnedThirty: false,
    },
    preload: 'loading',
    phase: -1,
    error: null,
  };
}

/**
 * Optional React adapter for V3. It never creates or styles UI components.
 *
 * Usage:
 *   const videoRefs = useRef([]);
 *   const { snapshot, actions } = useTeaTimer({
 *     videoRefs, assetBase: import.meta.env.BASE_URL + 'media/',
 *     initialSeconds: 240,
 *   });
 *
 * Render 4 persistent <video> elements with videoRefs.current[index] set
 * before the effect runs. Keep the exact same media CSS from /timer-test/
 * until the approved final layout is supplied.
 */
export function useTeaTimer({ videoRefs, assetBase, initialSeconds = 240 }) {
  const sessionRef = useRef(null);
  const [snapshot, setSnapshot] = useState(() => initialState(initialSeconds));

  useEffect(() => {
    let mounted = true;
    const session = createTeaTimerSession({
      videos: videoRefs.current,
      assetBase,
      initialSeconds,
      onChange: value => { if (mounted) setSnapshot(value); },
    });
    sessionRef.current = session;
    void session.prefetch();
    return () => {
      mounted = false;
      if (sessionRef.current === session) sessionRef.current = null;
      session.destroy();
    };
  }, [videoRefs, assetBase, initialSeconds]);

  const start = useCallback(() => sessionRef.current?.start() ?? false, []);
  const toggle = useCallback(() => sessionRef.current?.toggle() ?? false, []);
  const pause = useCallback(() => sessionRef.current?.pause(), []);
  const reset = useCallback(() => sessionRef.current?.reset(), []);
  const setSeconds = useCallback(value => sessionRef.current?.setSeconds(value), []);
  const retryPreload = useCallback(() => sessionRef.current?.prefetch(), []);
  const retryMilk = useCallback(() => sessionRef.current?.retryMilk(), []);

  return {
    snapshot,
    actions: { start, toggle, pause, reset, setSeconds, retryPreload, retryMilk },
  };
}
