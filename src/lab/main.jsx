import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from '../theme.js';
import ComponentLab from './ComponentLab.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ComponentLab />
    </ThemeProvider>
  </React.StrictMode>,
);
