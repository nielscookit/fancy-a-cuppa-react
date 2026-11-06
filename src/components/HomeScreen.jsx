import { Box, Button, IconButton, Typography } from '@mui/material';
import { MAX_QUICK_MINUTES, MIN_QUICK_MINUTES } from '../features/quickTimer.js';
import './home.css';

const SVG_BASE = import.meta.env.BASE_URL + 'figma/';

/**
 * Approved Figma 01 · Home (node 19:47, 375 × 812).
 * UI only: the direct BREW -> Timer flow is deliberately scoped to Phase 1B.
 */
export default function HomeScreen({ minutes, onStep, onBrew, onTeaAssistant, brewDisabled = false }) {
  return (
    <>
      <Box component="section" className="fac-home" aria-label="Home">
      <Box className="fac-home__canvas">
        <Box className="fac-home__time-control" aria-label="Brewing time">
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
        </Box>
        <Button
          variant="contained"
          disableElevation
          disableRipple
          className="fac-home__action fac-home__action--primary"
          onClick={onBrew}
          disabled={brewDisabled}
          aria-label={brewDisabled ? 'Preparing tea timer videos' : 'Fancy a Cuppa?'}
        >
          Fancy a Cuppa
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
        >
          How do you take it?
        </Button>
      </Box>
    </>
  );
}
