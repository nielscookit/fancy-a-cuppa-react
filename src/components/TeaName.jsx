import { useEffect, useRef, useState } from 'react';
import { Typography } from '@mui/material';

/** One automatic reading pass; an overflowing title can be replayed by tapping. */
export default function TeaName({ name }) {
  const viewport = useRef(null), text = useRef(null);
  const replay = useRef(() => {});
  const [running, setRunning] = useState(false);
  const [replayable, setReplayable] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, started = false, fontsReady = false, animation;
    function stop() {
      animation?.cancel();
      if (!disposed) setRunning(false);
    }
    function play(automatic = false) {
      if (disposed || !fontsReady || animation?.playState === 'running') return;
      const distance = Math.ceil(text.current.getBoundingClientRect().width - viewport.current.clientWidth);
      if (distance <= 1 || motion.matches) return;
      started = true;
      const travel = Math.max(800, distance / 36 * 1000);
      const duration = travel + 1500;
      setRunning(true);
      animation = text.current.animate([
        { transform: 'translateX(0)', offset: 0, easing: 'linear' },
        { transform: `translateX(-${distance}px)`, offset: travel / duration },
        { transform: `translateX(-${distance}px)`, offset: (travel + 900) / duration, easing: 'ease-in-out' },
        { transform: 'translateX(0)', offset: 1 },
      ], { delay: automatic ? 1200 : 0, duration, iterations: 1 });
      animation.finished.then(() => { if (!disposed) setRunning(false); }).catch(() => {});
    }
    replay.current = () => play();
    function measure() {
      if (disposed || !fontsReady) return;
      const overflows = text.current.getBoundingClientRect().width > viewport.current.clientWidth + 1;
      setReplayable(overflows && !motion.matches);
      if (!started) play(true);
    }
    function motionChanged() { stop(); measure(); }
    let width = viewport.current.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = viewport.current.clientWidth;
      if (nextWidth === width) return;
      width = nextWidth;
      if (started) stop();
      measure();
    });
    observer.observe(viewport.current);
    document.fonts.ready.then(() => { fontsReady = true; measure(); });
    motion.addEventListener('change', motionChanged);
    return () => {
      disposed = true;
      observer.disconnect();
      replay.current = () => {};
      motion.removeEventListener('change', motionChanged);
      animation?.cancel();
    };
  }, [name]);

  return <Typography ref={viewport} component="h2" className="fac-tea-card__name"
    title={name} data-running={running} data-replayable={replayable} onClick={() => replay.current()}>
    <span ref={text} className="fac-tea-card__name-text" role={replayable ? 'button' : undefined}
      tabIndex={replayable ? 0 : undefined} onKeyDown={event => {
        if (replayable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          replay.current();
        }
      }}>{name}</span>
  </Typography>;
}
