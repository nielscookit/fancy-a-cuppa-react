import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTeaTimer } from '../timer/useTeaTimer.js';
import { formatCountdown } from '../timer/formatCountdown.js';
import { nextVideoProgress } from '../features/quickVideoProgress.js';
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
  const [playbackStalled, setPlaybackStalled] = useState(false);
  const progressRef = useRef({ phase: -1, time: 0, unchangedMs: 0 });
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

  // The supplied iPhone recording shows the clock progressing while the
  // visual stage stops. Detect that independently of timer-controller state.
  // A visible warning prevents treating a frozen video as a valid sequence.
  useEffect(() => {
    progressRef.current = { phase, time: 0, unchangedMs: 0 };
    if (!active || !countdown.running || phase < 0) return undefined;
    const id = window.setInterval(() => {
      const video = videoRefs.current[phase];
      if (!video) return;
      const sample = nextVideoProgress(progressRef.current, {
        phase, time: video.currentTime, elapsedMs: 1000,
      });
      progressRef.current = sample;
      setPlaybackStalled(sample.stalled);
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, countdown.running, phase]);

  useImperativeHandle(ref, () => ({
    begin(seconds) {
      // Both calls run synchronously inside the originating click, preserving
      // Safari's direct gesture for milk priming, audio and Fill video.play().
      if (preload !== 'ready') return false;
      setPlaybackStalled(false);
      actions.setSeconds(seconds);
      return actions.start();
    },
    reset: () => actions.reset(),
    retryPreload: () => actions.retryPreload(),
  }), [preload, actions]);

  const playbackLabel = countdown.finished ? 'FINISHED' :
    countdown.running || countdown.preparing ? 'PAUSE' : 'RESUME';
  const onPrimary = () => {
    if (preload === 'ready') actions.toggle();
    else if (preload === 'error') void actions.retryPreload();
  };
  const onReset = () => {
    // RESET is the single exit: stop media and audio, restore the initial
    // countdown and its first frame, then return to Home. The timer session
    // remains mounted and preloaded for a fresh start from Home.
    setPlaybackStalled(false);
    actions.reset();
    onClose?.();
  };
  const milkMissing = (countdown.finished || countdown.remaining <= 2) &&
    phase !== 3 && phase >= 0;

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
              countdown.running ? 'Brewing · ' + (PHASES[phase] || 'Preparing') :
              countdown.remaining < countdown.total ? 'Paused' :
              preload === 'ready' ? 'Ready' :
              preload === 'error' ? 'Video loading failed' : 'Preparing videos…'}
          </Typography>
          {playbackStalled && (
            <Typography role="alert" className="fac-quick-timer__error">
              Video playback has stopped. Tap RESET to return Home and try again.
            </Typography>
          )}
          {milkMissing && !playbackStalled && (
            <Typography role="alert" className="fac-quick-timer__error">
              The milk video has not appeared. Tap RESET to try again.
            </Typography>
          )}
        </Box>
        <Box className="fac-quick-timer__controls">
          <Button type="button" variant="contained" disableElevation disableRipple
            className="fac-quick-timer__button fac-quick-timer__button--primary"
            disabled={preload !== 'ready' || countdown.finished}
            onClick={onPrimary}>
            {playbackLabel}
          </Button>
          <Button type="button" variant="contained" disableElevation disableRipple
            className="fac-quick-timer__button fac-quick-timer__button--secondary"
            onClick={onReset}>
            RESET
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
