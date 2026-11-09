import { useEffect, useRef, useState } from 'react';
import { Typography } from '@mui/material';

/** One reading pass per opened tea, only when its title actually overflows. */
export default function TeaName({ name }) {
  const viewport = useRef(null), text = useRef(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, started = false, fontsReady = false, animation;
    function stop() {
      animation?.cancel();
      if (!disposed) setRunning(false);
    }
    function measure() {
      if (disposed || !fontsReady) return;
      const distance = Math.ceil(text.current.getBoundingClientRect().width - viewport.current.clientWidth);
      if (started) return;
      if (distance <= 1 || motion.matches) return;
      started = true;
      const travel = Math.max(1200, distance / 24 * 1000);
      const duration = travel + 1500;
      setRunning(true);
      animation = text.current.animate([
        { transform: 'translateX(0)', offset: 0, easing: 'linear' },
        { transform: `translateX(-${distance}px)`, offset: travel / duration },
        { transform: `translateX(-${distance}px)`, offset: (travel + 900) / duration, easing: 'ease-in-out' },
        { transform: 'translateX(0)', offset: 1 },
      ], { delay: 1200, duration, iterations: 1 });
      animation.finished.then(() => { if (!disposed) setRunning(false); }).catch(() => {});
    }
    let width = viewport.current.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = viewport.current.clientWidth;
      if (nextWidth === width) return;
      width = nextWidth;
      if (started) stop();
      else measure();
    });
    observer.observe(viewport.current);
    document.fonts.ready.then(() => { fontsReady = true; measure(); });
    motion.addEventListener('change', stop);
    return () => {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener('change', stop);
      animation?.cancel();
    };
  }, [name]);

  return <Typography ref={viewport} component="h2" className="fac-tea-card__name"
    title={name} data-running={running}>
    <span ref={text} className="fac-tea-card__name-text">{name}</span>
  </Typography>;
}
