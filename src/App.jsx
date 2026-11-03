import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { listTeas } from './data/teaRepository.js';

/** Temporary technical readout, not an approved final UX design. */
export default function App() {
  const [catalog, setCatalog] = useState({ status: 'loading', teas: [], error: '' });
  useEffect(() => {
    const controller = new AbortController();
    listTeas({ signal: controller.signal })
      .then(teas => {
        if (!controller.signal.aborted) setCatalog({ status: 'ready', teas, error: '' });
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setCatalog({ status: 'error', teas: [], error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: '20px', pt: '28px', pb: '45px' }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 500 }}>
        Fancy a Cuppa
      </Typography>
      <Typography component="p" variant="body2" sx={{ mt: 2 }}>
        V3 – technische Testumgebung. Supabase-Katalog (Testdaten).
      </Typography>
      <Box aria-live="polite" sx={{ mt: 3 }}>
        {catalog.status === 'loading' && <Typography>Connecting to catalog…</Typography>}
        {catalog.status === 'error' && (
          <Typography role="alert">Catalog connection failed: {catalog.error}</Typography>
        )}
        {catalog.status === 'ready' && (
          <>
            <Typography component="h2" variant="body1">
              Catalog connected: {catalog.teas.length} teas
            </Typography>
            <Box component="ul" sx={{ pl: 3 }}>
              {catalog.teas.map(tea => (
                <Typography component="li" key={tea.id} variant="body2">
                  {tea.name}
                </Typography>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
