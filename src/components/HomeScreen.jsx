import { useEffect, useImperativeHandle, useRef } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { MAX_QUICK_MINUTES, MIN_QUICK_MINUTES } from '../features/quickTimer.js';
import { useTeaTimer } from '../timer/useTeaTimer.js';
import { createMediaController } from '../timer-kit/mediaController.js';
import { MEDIA_ASSETS } from '../timer-kit/mediaManifest.js';
import '../timer-kit/media-stage.css';
import './home.css';

const SVG_BASE = import.meta.env.BASE_URL + 'figma/';
const MEDIA_BASE = import.meta.env.BASE_URL + 'media/';
const PHASES = ['fill', 'brew', 'steep', 'milk'];
const FILL_POSTER = MEDIA_BASE + MEDIA_ASSETS.fill.poster;

export default function HomeScreen({ ref, minutes, onStep, onTeaAssistant, onTimerError }) {
  const videoRefs = useRef([]);
  const { snapshot, actions } = useTeaTimer({
    videoRefs,
    assetBase: MEDIA_BASE,
    mediaFactory: createMediaController,
  });
  const { countdown, preload, error } = snapshot;
  const { running, preparing, finished, total, remaining } = countdown;
  const inSession = running || preparing || finished || remaining < total;
  const seconds = Math.ceil(remaining);
  const timeLabel = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

  const begin = seconds => {
    if (preload !== 'ready' || inSession) return false;
    actions.setSeconds(seconds);
    return actions.start();
  };
  useImperativeHandle(ref, () => ({ begin }));
  useEffect(() => {
    if (error) onTimerError(error);
  }, [error, onTimerError]);

  const reset = () => actions.setSeconds(minutes * 60);
  const handlePrimary = () => {
    if (preload === 'error') void actions.retryPreload();
    else if (inSession) reset();
    else begin(minutes * 60);
  };
  const primaryLabel = inSession ? 'Reset'
    : preload === 'error' ? 'Retry videos' : 'Fancy a Cuppa';

  return (
    <>
      <Box component="section" className="fac-home" aria-label="Home">
      <Box className="fac-home__canvas">
        <Box className="timer-kit-stage fac-home__tea-stage" aria-hidden="true"
          style={{ backgroundImage: `url(${FILL_POSTER})` }}>
          {PHASES.map((phase, index) => (
            <video key={phase} ref={element => { videoRefs.current[index] = element; }}
              className="timer-kit-video" muted playsInline preload="auto" loop={phase === 'steep'}
              poster={phase === 'fill' ? FILL_POSTER : undefined} />
          ))}
        </Box>
        <Box className="fac-home__time-control" aria-label="Brewing time">
          {inSession ? (
            <Typography component="output" role="timer" className="fac-home__countdown"
              aria-label="Brewing countdown">{timeLabel}</Typography>
          ) : (
            <>
              <IconButton
                aria-label="Decrease brewing time by one minute"
                className="fac-home__time-button"
                onClick={() => onStep(-1)}
                disabled={minutes <= MIN_QUICK_MINUTES}
                disableRipple
              >
                <img src={SVG_BASE + 'home-minus.svg'} width="66" height="66" alt="" />
              </IconButton>
              <Typography component="output" aria-live="polite" className="fac-home__time-value">
                {minutes} MIN
              </Typography>
              <IconButton
                aria-label="Increase brewing time by one minute"
                className="fac-home__time-button"
                onClick={() => onStep(1)}
                disabled={minutes >= MAX_QUICK_MINUTES}
                disableRipple
              >
                <img src={SVG_BASE + 'home-plus.svg'} width="66" height="66" alt="" />
              </IconButton>
            </>
          )}
        </Box>
        <Button
          variant="contained"
          disableElevation
          disableRipple
          className="fac-home__action fac-home__action--primary"
          data-timer-control={inSession ? 'reset' : undefined}
          onClick={handlePrimary}
          disabled={preload === 'loading'}
        >
          {primaryLabel}
        </Button>
      </Box>
      </Box>
      <Box className="fac-home__assistant-slot">
        <Button
          variant="contained"
          disableElevation
          disableRipple
          className="fac-home__action fac-home__action--secondary"
          onClick={onTeaAssistant}
          disabled={inSession}
        >
          How do you take it?
        </Button>
      </Box>
    </>
  );
}
