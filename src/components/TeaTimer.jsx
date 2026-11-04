import { useRef } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useTeaTimer } from '../timer/useTeaTimer.js';
import { formatCountdown } from '../timer/formatCountdown.js';
import './tea-timer.css';

const VIDEO_NAMES = ['Fill', 'Brew', 'Steep', 'Milk'];

/**
 * React presentation of the device-accepted 4-video timer.
 * The validated media/timer/audio controllers and /timer-test/ are unchanged.
 */
export default function TeaTimer({ initialSeconds }) {
  const refs = useRef([]);
  const { snapshot, actions } = useTeaTimer({
    videoRefs: refs,
    assetBase: import.meta.env.BASE_URL + 'media/',
    initialSeconds,
  });
  const { countdown, preload, error, phase } = snapshot;
  const blocked = !countdown.running && !countdown.preparing && preload !== 'ready';
  const buttonLabel = countdown.preparing ? 'Start abbrechen' :
    countdown.running ? 'Pause' :
    countdown.finished ? 'Erneut starten' :
    preload === 'loading' ? 'Videos werden geladen…' :
    preload === 'error' ? 'Videos erneut laden' : 'Timer starten';
  const onPrimary = () => {
    if (blocked && preload === 'error') { void actions.retryPreload(); return; }
    if (!blocked) actions.toggle();
  };
  const updateMinutes = amount => {
    const next = Math.max(60, Math.min(1800, countdown.total + amount * 60));
    if (next !== countdown.total) actions.setSeconds(next);
  };
  return (
    <Box component="section" aria-label="Tee-Timer" sx={{ mt: 3 }}>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>Ziehzeit</Typography>
      <Box className="fac-timer-visual" sx={{
        mx: 'auto', width: 'min(285px,79vw)', aspectRatio: '1 / 1', position: 'relative',
      }}>
        {VIDEO_NAMES.map((name, index) => (
          <video key={name} ref={node => { refs.current[index] = node; }}
            className="fac-timer-video" aria-hidden="true" muted playsInline
            preload="auto" loop={index === 2} />
        ))}
      </Box>
      <Typography component="output" aria-live="off" sx={{
        display: 'block', textAlign: 'center', fontSize: 'clamp(46px,12vw,68px)',
        letterSpacing: '-.055em', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      }}>{formatCountdown(countdown.remaining)}</Typography>
      <Stack direction="row" alignItems="center" justifyContent="center" gap={2} sx={{ my: 1 }}>
        <Button variant="outlined" aria-label="Eine Minute weniger"
          onClick={() => updateMinutes(-1)} disabled={countdown.running || countdown.preparing || countdown.total <= 60}
          sx={{ minWidth: 66, width: 66, px: 0, fontSize: 24 }}>−</Button>
        <Typography sx={{ fontSize: 14, textAlign:'center', fontWeight: 500, minWidth: 90 }}>
          {Math.round(countdown.total/60)} min
        </Typography>
        <Button variant="outlined" aria-label="Eine Minute mehr"
          onClick={() => updateMinutes(1)} disabled={countdown.running || countdown.preparing || countdown.total >= 1800}
          sx={{ minWidth: 66, width: 66, px: 0, fontSize: 24 }}>+</Button>
      </Stack>
      <Stack direction="row" gap={1} sx={{ mt: 2 }}>
        <Button variant="contained" fullWidth onClick={onPrimary} disabled={blocked && preload === 'loading'}>
          {buttonLabel}
        </Button>
        <Button variant="outlined" onClick={actions.reset} sx={{ minWidth: 105 }}>Reset</Button>
      </Stack>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1, textAlign:'center' }}>
        {countdown.preparing ? 'Video startet…' :
          countdown.finished ? 'Fertig' :
          preload === 'ready' ? phase < 0 ? 'Bereit' : '' :
          preload === 'error' ? 'Videos konnten nicht geladen werden.' : 'Videos werden vorbereitet…'}
      </Typography>
      {error && <Typography role="alert" color="error" sx={{ fontSize: 12, mt: 1 }}>{error}</Typography>}
    </Box>
  );
}
