import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { createMediaController } from './mediaController.js';
import { createAudioController } from '../timer/audioController.js';
import { createTimerController } from '../timer/timerController.js';
import { formatCountdown } from '../timer/formatCountdown.js';
import TimerRadialRing from './TimerRadialRing.jsx';

const NAMES = ['Fill', 'Brew', 'Steep', 'Milk'];
const DURATIONS = [20, 40, 60, 120, 240];

export default function TimerKitLab() {
  const videos = useRef([]);
  const controllers = useRef(null);
  const [time, setTime] = useState({ total: 40, remaining: 40, running: false, preparing: false, finished: false });
  const [preload, setPreload] = useState('loading');
  const [phase, setPhase] = useState(-1);
  const [milk, setMilk] = useState(null);
  const [fill, setFill] = useState(null);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [runs, setRuns] = useState(0);
  const [status, setStatus] = useState('Idle');
  const push = (message) => {
    setEvents(previous => [new Date().toLocaleTimeString() + '  ' + message, ...previous].slice(0, 35));
  };
  useEffect(() => {
    let mounted = true;
    const base = import.meta.env.BASE_URL + 'media/';
    const onError = e => {
      if (!mounted) return;
      const message = e?.message || String(e);
      setError(message);
      push('ERROR: ' + message);
    };
    const audio = createAudioController({ assetBase: base, onError });
    const media = createMediaController({
      videos: videos.current.slice(), assetBase: base, onError,
      onPhase: value => {
        if (mounted) { setPhase(value); push('Phase: ' + (NAMES[value] || 'Idle')); }
      },
      onFillEvent: value => { if (mounted) setFill(value); },
      onMilkEvent: value => { if (mounted) setMilk(value); },
      onMilkRequested: () => push('Milk requested'),
    });
    const timer = createTimerController({
      media, audio, initialSeconds: 40, onError,
      onUpdate: value => { if (mounted) setTime(value); },
    });
    controllers.current = { timer, media, audio };
    media.preloadAll()
      .then(() => { if (mounted) { setPreload('ready'); push('4 clips downloaded as blobs'); } })
      .catch(e => { if (mounted) { setPreload('error'); onError(e); } });
    return () => {
      mounted = false;
      controllers.current = null;
      timer.destroy();
    };
  }, []);

  const selectDuration = seconds => {
    controllers.current?.timer.setSeconds(seconds);
    setStatus('Duration: ' + seconds + ' seconds');
    setError('');
  };
  const startPause = () => {
    const timer = controllers.current?.timer;
    if (!timer) return;
    const wasRunning = timer.state().running || timer.state().preparing;
    if (!wasRunning && preload !== 'ready') return;
    if (!wasRunning) setRuns(x => x + 1);
    // Call synchronously from the tap: essential for iPhone Safari.
    timer.toggle();
    setStatus(wasRunning ? 'Paused' : 'Start / Resume');
    push(wasRunning ? 'Pause' : 'Start / Resume');
  };
  const reset = () => {
    controllers.current?.timer.reset();
    setError('');
    setStatus('Reset');
    push('Reset');
  };
  const retry = () => {
    const media = controllers.current?.media;
    if (!media) return;
    setPreload('loading');
    setError('');
    media.preloadAll().then(() => {
      if (controllers.current?.media === media) setPreload('ready');
    }).catch(e => {
      if (controllers.current?.media === media) {
        setPreload('error');
        setError(e.message);
      }
    });
  };
  const retryMilk = () => controllers.current?.media.retryMilkPlayback();
  const stopped = !time.running && !time.preparing;
  const label = time.preparing ? 'Cancel start' : time.running ? 'Pause' : time.finished ? 'Restart' : time.remaining < time.total ? 'Resume' : 'Start';
  return (
    <Box component="main" sx={{maxWidth: 520, mx:'auto', px:2, pb:8, pt:2, bgcolor:'#fff'}}>
      <Typography component="h1" variant="h5">Timer Kit / Video Lab</Typography>
      <Typography sx={{fontSize:12, my:1}}>Isolated test · New 750×750 videos · Original V3 timer unchanged</Typography>
      <Box className="timer-kit-ring-stage">
        <Box className="timer-kit-stage" aria-label="375 by 375 video stage">
          {NAMES.map((name,i) => <video key={name} ref={element => { videos.current[i] = element; }}
            className="timer-kit-video" muted playsInline preload="auto" loop={i===2} aria-label={name} />)}
        </Box>
        <TimerRadialRing running={time.running}
          idle={!time.running && !time.preparing && !time.finished && time.remaining >= time.total} />
      </Box>
      <Typography component="output" role="timer" sx={{display:'block',fontSize:48,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>
        {formatCountdown(time.remaining)}
      </Typography>
      <Typography sx={{textAlign:'center',fontSize:13}}>{time.finished?'Finished':time.preparing?'Preparing':time.running?'Running':'Ready / paused'} · {NAMES[phase] || 'Idle'}</Typography>
      <Typography sx={{textAlign:'center',fontSize:12}}>Media: {preload} · Runs: {runs} · {status}</Typography>
      <Stack direction="row" gap={1} sx={{mt:2,flexWrap:'wrap'}}>
        {DURATIONS.map(seconds => <Button key={seconds} variant={time.total===seconds?'contained':'outlined'}
          onClick={() => selectDuration(seconds)} disabled={!stopped}
          sx={{minWidth:56,flex:1}}>{seconds>=60?seconds/60+'m':seconds+'s'}</Button>)}
      </Stack>
      <Stack direction="row" gap={1} sx={{mt:2}}>
        <Button fullWidth variant="contained" disabled={stopped&&preload!=='ready'} onClick={startPause}>{label}</Button>
        <Button variant="outlined" onClick={reset}>Reset</Button>
      </Stack>
      {preload==='error' && <Button fullWidth onClick={retry}>Retry download</Button>}
      {milk?.blocked && <Button fullWidth variant="outlined" onClick={retryMilk}>Retry milk (tap)</Button>}
      <Stack sx={{mt:2,fontFamily:'monospace',fontSize:12,overflowWrap:'anywhere'}} spacing={0.5}>
        <div>Fill: {fill?.event || '-'} · t={fill?.currentTime?.toFixed(2) || '0'} · readyState={fill?.readyState ?? '-'}</div>
        <div>Milk: {milk?.event || '-'} · t={milk?.currentTime?.toFixed(2) || '0'} · primed={String(milk?.primed ?? false)} · blocked={String(milk?.blocked ?? false)}</div>
        <div>Timer: {JSON.stringify({running:time.running,preparing:time.preparing,finished:time.finished})}</div>
      </Stack>
      {error && <Typography color="error" role="alert" sx={{mt:1}}>{error}</Typography>}
      <Typography component="h2" sx={{mt:3,fontWeight:600}}>Event log</Typography>
      <Box component="pre" sx={{fontSize:11,whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:220,overflowY:'auto',bgcolor:'#f4f4f4',p:1.5}}>
        {events.join('\n') || 'No events'}
      </Box>
    </Box>
  );
}
