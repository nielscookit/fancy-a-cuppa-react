import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from '../theme.js';
import TimerTest from './TimerTest.jsx';
import './timer-test.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <TimerTest />
    </ThemeProvider>
  </React.StrictMode>,
);
