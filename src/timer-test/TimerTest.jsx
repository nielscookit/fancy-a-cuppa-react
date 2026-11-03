import { useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { createMediaController } from '../timer/mediaController.js';
import { createAudioController } from '../timer/audioController.js';
import { createTimerController } from '../timer/timerController.js';
import { formatCountdown } from '../timer/formatCountdown.js';

const PHASES = ['Fill', 'Brew', 'Steep (loop)', 'Milk'];
const DURATIONS = [40, 60, 120, 240];

export default function TimerTest() {
  const videos = useRef([]);
  const timer = useRef(null);
  const audio = useRef(null);
  const [clock, setClock] = useState({ total: 40, remaining: 40, running: false, finished: false });
  const [phase, setPhase] = useState(-1);
  const [milkRequested, setMilkRequested] = useState(false);
  const [milkStatus, setMilkStatus] = useState({
    event: 'idle', currentTime: 0, duration: null,
    everPlayed: false, paused: true, readyState: 0, errorCode: null,
  });
  const [issue, setIssue] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lastAction, setLastAction] = useState('None');

  useEffect(() => {
    const base = import.meta.env.BASE_URL + 'media/';
    const sound = createAudioController({ assetBase: base, onError: e => {
      console.warn('Audio playback:', e);
      setIssue('Audio: ' + (e?.message || String(e)));
    } });
    const visuals = createMediaController({
      videos: videos.current,
      assetBase: base,
      onPhase: setPhase,
      onMilkRequested: () => setMilkRequested(true),
      onMilkEvent: info => setMilkStatus(info),
      onError: e => {
        console.warn('Media playback:', e);
        setIssue('Video/audio: ' + (e?.message || String(e)));
      },
    });
    const controller = createTimerController({
      media: visuals,
      audio: sound,
      initialSeconds: 40,
      onUpdate: snapshot => {
        setClock(snapshot);
        setMilkStatus(visuals.getMilkStatus());
      },
      onError: e => setIssue('Timer/audio: ' + (e?.message || String(e))),
    });
    audio.current = sound;
    timer.current = controller;
    // Preload all videos before the first user start, exactly as in V2.
    visuals.prepare().catch(e => setIssue('Preload: ' + (e?.message || String(e))));
    return () => {
      timer.current = null;
      audio.current = null;
      controller.destroy();
    };
  }, []);

  function selectDuration(seconds) {
    setMilkRequested(false);
    setIssue('');
    setLastAction('Duration ' + seconds + 's');
    timer.current?.setSeconds(seconds);
  }
  function toggle() {
    if (!timer.current?.state().running && timer.current?.state().finished) {
      setMilkRequested(false);
    }
    setIssue('');
    setLastAction(timer.current?.state().running ? 'Pause' : 'Start / resume');
    if (!timer.current?.state().running) setAttempts(x => x + 1);
    timer.current?.toggle();
  }
  function reset() {
    setMilkRequested(false);
    setIssue('');
    setLastAction('Reset');
    timer.current?.reset();
  }
  function soundCheck() {
    setIssue('');
    audio.current?.unlock();
    audio.current?.playFinished().catch(e => setIssue('Finished sound: ' + e.message));
  }
  const time = formatCountdown(clock.remaining);
  const startLabel = clock.running ? 'Pause' : clock.finished ? 'Restart' :
    clock.remaining < clock.total ? 'Resume' : 'Start timer';

  return (
    <Box component="main" sx={{
      maxWidth: 500, mx: 'auto', px: 2.5, py: 3,
      minHeight: '100dvh', pb: 'max(45px, env(safe-area-inset-bottom))',
    }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
        FANCY A CUPPA / V3
      </Typography>
      <Typography component="h1" sx={{ fontSize: 24, fontWeight: 600, mt: 1 }}>
        Timer / media test
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 1, lineHeight: 1.8 }}>
        Diagnostic page: real V2 media, separate controller. Use repeatedly on iPhone.
      </Typography>

      <Paper variant="outlined" sx={{ borderRadius: '8px', mt: 2.5, p: 2, textAlign: 'center' }}>
        <Box className="fac-test-visual" sx={{
          mx: 'auto', width: 'min(285px, 79vw)', aspectRatio: '1 / 1', position: 'relative',
        }}>
          {PHASES.map((name, index) => (
            <video key={name}
              ref={node => { videos.current[index] = node; }}
              className="fac-test-video"
              aria-hidden="true"
              playsInline
              muted
              preload="auto"
              loop={index === 2}
            />
          ))}
        </Box>
        <Typography role="timer" aria-live="off" sx={{
          fontSize: 'clamp(38px, 10vw, 58px)', fontWeight: 600,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.05em',
        }}>
          {time}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
          {clock.finished ? 'Finished' : clock.running ? 'Running' : 'Ready / paused'}
          {' · '}{phase < 0 ? 'No video' : PHASES[phase]}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.6 }}>
          Clock: {time} · Milk: {milkRequested ? milkStatus.event : 'not requested'}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
          Milk video: {milkStatus.currentTime.toFixed(1)}s
          /{milkStatus.duration == null ? 'duration unknown' : milkStatus.duration.toFixed(1) + 's'}
          {' · '}loaded: {milkStatus.readyState}
          {' · '}played: {milkStatus.everPlayed ? 'yes' : 'no'}
          {milkStatus.errorCode != null ? ' · media error: ' + milkStatus.errorCode : ''}
        </Typography>
      </Paper>

      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
        {DURATIONS.map(seconds => (
          <Button
            key={seconds}
            variant={clock.total === seconds ? 'contained' : 'outlined'}
            onClick={() => selectDuration(seconds)}
            sx={{ flex: '1 0 21%', minWidth: 0, minHeight: 48, height: 48, borderRadius: '6px', fontSize: 12 }}
          >
            {seconds >= 60 ? (seconds / 60) + 'm' : seconds + 's'}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" gap={1} sx={{ mt: 2 }}>
        <Button variant="contained" fullWidth onClick={toggle}>{startLabel}</Button>
        <Button variant="outlined" onClick={reset} sx={{ minWidth: 105 }}>Reset</Button>
      </Stack>
      <Button variant="text" fullWidth onClick={soundCheck}
        sx={{ minHeight: 48, height: 48, mt: 1.5, fontSize: 12 }}>
        Play finish sound (tap test)
      </Button>

      <Box aria-live="polite" sx={{ mt: 2, minHeight: 40 }}>
        <Typography sx={{ fontSize: 12 }}>
          Starts: {attempts} · Last action: {lastAction} · Video phase: {phase < 0 ? 'Idle' : PHASES[phase]}
        </Typography>
        {issue && <Typography role="alert" sx={{ mt: 1, fontSize: 12, color: 'error.main' }}>{issue}</Typography>}
      </Box>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.9, mt: 2 }}>
        Check: fill → brew → still loop, sound at 30s, milk video at 5s,
        finish sound at 0. Repeat restart at least five times; test pause/resume
        and switching away from Safari. A CI build cannot verify iPhone media behavior.
      </Typography>
      <Typography component="a" href={import.meta.env.BASE_URL}
        sx={{ display: 'inline-block', mt: 2, color: 'primary.main', fontSize: 12 }}>
        Back to V3 test page
      </Typography>
    </Box>
  );
}
