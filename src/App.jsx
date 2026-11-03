import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/** Technical placeholder only; no visual or UX decisions are preempted. */
export default function App() {
  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: '20px', pt: '28px', pb: '45px' }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 500 }}>
        Fancy a Cuppa
      </Typography>
      <Typography component="p" variant="body2" sx={{ mt: 2 }}>
        V3 – technische Testumgebung. Keine Verbindung zur produktiven Teedatenbank.
      </Typography>
    </Box>
  );
}
