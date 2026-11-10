import { Box, Button, Typography } from '@mui/material';

export default function TimerNotifications({ push }) {
  const { snapshot: state, enable, disable, retry } = push;
  if (!state.installed) return null;
  let text = state.enabled ? 'Notifications enabled on this device.' : 'Get a notification when your tea is ready.';
  if (state.status === 'syncing') text = 'Updating notification…';
  if (state.status === 'scheduled') text = 'Ready notification scheduled.';
  if (state.status === 'cancelled') text = 'No ready notification scheduled.';
  if (state.status === 'finished') text = 'Your tea is ready.';
  if (state.permission === 'denied') text = 'Notifications are blocked. Allow them for Fancy a Cuppa in iPhone Settings → Notifications.';
  if (!state.available) text = 'Notifications are not supported in this browser.';
  return (
    <Box component="section" aria-label="Timer notifications" className="fac-home__notifications">
      <Typography component="p" role="status" sx={{ fontSize: 12, lineHeight: 1.6 }}>{state.error || text}</Typography>
      {state.available && state.permission !== 'denied' && (
        <Button onClick={!state.ready ? retry : state.enabled ? disable : enable}
          disabled={state.busy} sx={{ mt: 1, width: '100%', bgcolor: '#F3F2F0', color: '#1B272B', borderRadius: '100px', fontWeight: 700 }}>
          {state.busy ? 'Connecting…' : !state.ready ? 'Retry notifications' : state.enabled ? 'Turn notifications off' : 'Enable notifications'}
        </Button>
      )}
      {state.error && state.ready && state.enabled && (
        <Button onClick={retry} disabled={state.busy} sx={{ color: '#1B272B' }}>Retry</Button>
      )}
    </Box>
  );
}
