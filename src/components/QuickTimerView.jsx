import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTeaTimer } from '../timer/useTeaTimer.js';
import { formatCountdown } from '../timer/formatCountdown.js';
import './tea-timer.css';
import './quick-timer.css';

const PHASES = ['Fill', 'Brew', 'Steep', 'Milk'];

/**
 * Phase 1B: separate presentation of the existing iPhone-validated timer.
 *
 * Stay mounted (with four real <video> elements) behind Home so prefetch
 * finishes BEFORE the first "Fancy a Cuppa?" tap. We never start from an
 * effect/Promise: begin(seconds) is called directly inside the Home click.
 */
const QuickTimerView = forwardRef(function QuickTimerView({
  active = false,
  onClose,
  onPreloadChange,
}, ref) {
  const videoRefs = useRef([]);
  // Fixed initialSeconds ensures +/- changes on Home do not recreate the
  // controller and trigger a fresh four-video download.
  const { snapshot, actions } = useTeaTimer({
    videoRefs,
    assetBase: import.meta.env.BASE_URL + 'media/',
    initialSeconds: 120,
  });
  const { countdown, preload, phase, error } = snapshot;

  useEffect(() => {
    onPreloadChange?.(preload);
  }, [onPreloadChange, preload]);

  useEffect(() => {
    if (!active) return undefined;
    // Prevent background scroll under the full-screen timer, restore on back.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [active]);

  useImperativeHandle(ref, () => ({
    begin(seconds) {
      // Both calls run synchronously inside the originating click, preserving
      // Safari's direct gesture for milk priming, audio and Fill video.play().
      if (preload !== 'ready') return false;
      actions.setSeconds(seconds);
      return actions.start();
    },
    reset: () => actions.reset(),
    retryPreload: () => actions.retryPreload(),
  }), [preload, actions]);

  const playbackLabel = countdown.preparing ? 'CANCEL START' :
    countdown.running ? 'PAUSE' :
    countdown.finished ? 'RESTART' :
    countdown.remaining < countdown.total ? 'RESUME' : 'START';
  const onPrimary = () => {
    if (preload === 'ready') actions.toggle();
    else if (preload === 'error') void actions.retryPreload();
  };
  const onBack = () => {
    // Reset immediately in the BACK tap, so no detached media plays while
    // Home is visible and the next quick start begins from frame one.
    actions.reset();
    onClose?.();
  };

  return (
    <Box
      component="section"
      role={active ? 'dialog' : undefined}
      aria-label={active ? 'Tea timer' : undefined}
      aria-modal={active ? 'true' : undefined}
      aria-hidden={!active}
      inert={!active}
      className={'fac-quick-timer' + (active ? ' fac-quick-timer--active' : '')}
    >
      <Box className="fac-quick-timer__layout">
        <Typography component="h2" className="fac-quick-timer__heading">
          FANCY A CUPPA?
        </Typography>
        <Box className="fac-quick-timer__media">
          <Box className="fac-timer-visual fac-quick-timer__visual">
            {PHASES.map((name, index) => (
              <video
                key={name}
                ref={element => { videoRefs.current[index] = element; }}
                className="fac-timer-video"
                aria-hidden="true"
                muted
                playsInline
                preload="auto"
                loop={index === 2}
              />
            ))}
          </Box>
          <Typography component="output" role="timer" aria-live="off"
            className="fac-quick-timer__countdown">
            {formatCountdown(countdown.remaining)}
          </Typography>
          <Typography role="status" className="fac-quick-timer__state">
            {countdown.finished ? 'Your tea is ready' :
              countdown.preparing ? 'Starting video…' :
              countdown.running ? 'Brewing' :
              countdown.remaining < countdown.total ? 'Paused' :
              preload === 'ready' ? 'Ready' :
              preload === 'error' ? 'Video loading failed' : 'Preparing videos…'}
          </Typography>
        </Box>
        <Box className="fac-quick-timer__controls">
          <Button variant="contained" disableElevation disableRipple
            className="fac-quick-timer__button fac-quick-timer__button--primary"
            disabled={preload === 'loading'}
            onClick={onPrimary}>
            {preload === 'error' ? 'RETRY VIDEOS' : playbackLabel}
          </Button>
          <Button variant="contained" disableElevation disableRipple
            className="fac-quick-timer__button fac-quick-timer__button--secondary"
            onClick={actions.reset}>
            RESET
          </Button>
          <Button variant="contained" disableElevation disableRipple
            className="fac-quick-timer__button fac-quick-timer__button--secondary"
            onClick={onBack}>
            BACK TO HOME
          </Button>
        </Box>
        {error && <Typography role="alert" className="fac-quick-timer__error">{error}</Typography>}
        <Typography aria-hidden="true" className="fac-quick-timer__phase">
          {phase < 0 ? '' : PHASES[phase]}
        </Typography>
      </Box>
    </Box>
  );
});
export default QuickTimerView;
