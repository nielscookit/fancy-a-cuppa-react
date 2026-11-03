import { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  COMPONENTS,
  COMPONENT_DEFINITIONS,
  PALETTE_COLORS,
  applyLabSetting,
  createDefaults,
} from './labModel.js';

const CATEGORIES = ['Black tea', 'Green tea', 'Herbal tea', 'Fruit tea', 'Rooibos'];
const TEAS = ['Assam Second Flush', 'Assam CTC', 'Darjeeling First Flush', 'Ceylon', 'English Breakfast', 'Earl Grey'];

const displayName = {
  default: 'Default',
  focused: 'Focused',
  disabled: 'Disabled',
  error: 'Error',
  required: 'Required',
  readOnly: 'Read-only',
  loading: 'Loading',
};

function GroupControl({ label, options, value, onChange }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h3" sx={{ fontSize: 12, fontWeight: 600, mb: 1, color: 'text.secondary' }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        onChange={(_, next) => { if (next != null) onChange(next); }}
        aria-label={label}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          width: '100%',
          gap: '6px',
          '& .MuiToggleButtonGroup-grouped': {
            flex: '1 1 auto',
            minHeight: 42,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '6px !important',
            mx: '0 !important',
            fontFamily: '"Roboto Mono", monospace',
            fontWeight: 500,
            fontSize: 12,
            textTransform: 'none',
            px: 1.2,
          },
        }}
      >
        {options.map(option => (
          <ToggleButton key={option} value={option} aria-label={option}>
            {displayName[option] || option}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

function ValueSlider({ label, value, unit, min, max, step, onChange }) {
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography component="h3" sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {value}{unit}
        </Typography>
      </Stack>
      <Slider
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        valueLabelDisplay="auto"
        onChange={(_, next) => { if (typeof next === 'number') onChange(next); }}
        sx={{ mx: 1, width: 'calc(100% - 16px)', mt: 0.3, mb: 0.3 }}
      />
    </Box>
  );
}

function Preview({ component, settings, onInteraction }) {
  const rootRef = useRef(null);
  const [text, setText] = useState('Assam Second Flush');
  const [category, setCategory] = useState('Black tea');
  const [tea, setTea] = useState('Assam Second Flush');

  // Programmatic focus is scoped to the preview, never to the settings controls.
  useEffect(() => {
    if (settings.state !== 'focused') return undefined;
    const raf = window.requestAnimationFrame(() => {
      const target = rootRef.current?.querySelector(
        '.MuiSelect-select, .MuiAutocomplete-input, input:not([type="hidden"]), button',
      );
      target?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [component, settings.state]);

  const { variant, height, radius, color, state } = settings;
  const error = state === 'error';
  const disabled = state === 'disabled';
  const required = state === 'required';
  const readOnly = state === 'readOnly';
  // All overrides are local to the preview, not injected into the shared theme.
  const fieldSx = {
    width: '100%',
    '& .MuiInputBase-root': {
      height: height + 'px',
      borderRadius: radius + 'px',
    },
    '& .MuiInputBase-input': {
      boxSizing: 'border-box',
      minWidth: 0,
    },
  };
  const commonFieldProps = { variant, color, error, disabled, required, fullWidth: true };
  const helper = error ? 'Example validation error' : 'Preview only – no data is saved.';

  return (
    <Box ref={rootRef} sx={{ width: '100%', minWidth: 0 }}>
      {component === 'TextField' && (
        <TextField
          {...commonFieldProps}
          label="Tea name"
          value={text}
          onChange={event => setText(event.target.value)}
          slotProps={{ input: { readOnly } }}
          helperText={helper}
          sx={fieldSx}
        />
      )}
      {component === 'Select' && (
        <FormControl {...commonFieldProps} sx={fieldSx}>
          <InputLabel id="lab-select-label">Tea category</InputLabel>
          <Select
            labelId="lab-select-label"
            id="lab-select"
            label="Tea category"
            value={category}
            onChange={event => setCategory(event.target.value)}
            inputProps={{ readOnly }}
            MenuProps={{
              PaperProps: { sx: { borderRadius: radius + 'px', maxHeight: 'min(320px, 60dvh)' } },
            }}
          >
            {CATEGORIES.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </Select>
          <FormHelperText>{helper}</FormHelperText>
        </FormControl>
      )}
      {component === 'Autocomplete' && (
        <Autocomplete
          options={TEAS}
          value={tea}
          onChange={(_, next) => setTea(next)}
          disabled={disabled}
          readOnly={readOnly}
          autoHighlight
          sx={{ width: '100%' }}
          slotProps={{
            paper: { sx: { borderRadius: radius + 'px' } },
            popper: { sx: { zIndex: 1400 } },
          }}
          renderInput={params => (
            <TextField
              {...params}
              variant={variant}
              color={color}
              error={error}
              required={required}
              label="Choose a tea"
              helperText={helper}
              sx={fieldSx}
            />
          )}
        />
      )}
      {component === 'Button' && (
        <Button
          variant={variant}
          color={color}
          disabled={disabled}
          loading={state === 'loading'}
          fullWidth
          onClick={onInteraction}
          sx={{
            height: height + 'px',
            minHeight: height + 'px',
            borderRadius: radius + 'px',
            fontSize: '16px',
            fontWeight: 500,
          }}
        >
          Start timer
        </Button>
      )}
    </Box>
  );
}

export default function ComponentLab() {
  const [component, setComponent] = useState('TextField');
  const [allSettings, setAllSettings] = useState(createDefaults);
  const [pressCount, setPressCount] = useState(0);
  const settings = allSettings[component];
  const definition = COMPONENT_DEFINITIONS[component];
  const setOption = (key, value) => {
    setAllSettings(previous => applyLabSetting(previous, component, key, value));
  };
  const reset = () => {
    setAllSettings(previous => ({
      ...previous,
      [component]: createDefaults()[component],
    }));
    setPressCount(0);
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        bgcolor: 'background.default',
        pb: 'max(40px, env(safe-area-inset-bottom))',
      }}
    >
      <Box sx={{ maxWidth: 1024, mx: 'auto', px: { xs: 2.25, sm: 4 }, pt: { xs: 3, sm: 5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1.5 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>
            FANCY A CUPPA / V3
          </Typography>
          <Typography component="a" href={import.meta.env.BASE_URL} sx={{
            fontSize: 12, fontWeight: 500, color: 'primary.main',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}>
            Back to app
          </Typography>
        </Stack>
        <Typography component="h1" sx={{
          fontWeight: 600, fontSize: { xs: 27, sm: 33 }, letterSpacing: '-0.04em', lineHeight: 1.2,
        }}>
          MUI Component Lab
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 1, lineHeight: 1.75 }}>
          Interactive previews with the existing Roboto Mono theme. Changes apply only here.
        </Typography>

        <Box component="nav" aria-label="Preview component" sx={{ mt: 3, mb: 2.5 }}>
          <GroupControl
            label="Component"
            options={COMPONENTS}
            value={component}
            onChange={setComponent}
          />
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
          alignItems: 'start',
          gap: 2.5,
        }}>
          <Paper
            component="section"
            aria-label="Interactive component preview"
            variant="outlined"
            sx={{ minWidth: 0, borderRadius: '10px', overflow: 'hidden' }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography component="h2" sx={{ fontSize: 12, fontWeight: 600 }}>
                LIVE PREVIEW
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{component}</Typography>
            </Stack>
            <Box sx={{ px: 2.5, py: 6, minHeight: 240, bgcolor: 'background.paper', display: 'grid', placeItems: 'center' }}>
              <Preview component={component} settings={settings} onInteraction={() => setPressCount(n => n + 1)} />
            </Box>
            <Typography sx={{
              px: 2.5, py: 1.7, bgcolor: 'background.default', borderTop: '1px solid',
              borderColor: 'divider', color: 'text.secondary', fontSize: 11, lineHeight: 1.7,
            }}>
              {component === 'Button'
                ? 'Button clicks: ' + pressCount + '. No timer is started.'
                : 'Try typing or opening the menu. Nothing is saved.'}
            </Typography>
          </Paper>

          <Paper
            component="section"
            aria-label="Component settings"
            variant="outlined"
            sx={{ minWidth: 0, borderRadius: '10px', p: { xs: 2.5, sm: 3 } }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
              <Typography component="h2" sx={{ fontSize: 12, fontWeight: 600 }}>
                PROPERTIES
              </Typography>
              <Button variant="text" onClick={reset} sx={{
                minWidth: 0, minHeight: 40, height: 40, px: 1, fontSize: 12, borderRadius: '6px',
              }}>
                Reset
              </Button>
            </Stack>
            <Stack spacing={3}>
              <GroupControl
                label="Variant"
                options={definition.variants}
                value={settings.variant}
                onChange={next => setOption('variant', next)}
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
                <ValueSlider
                  label="Height"
                  value={settings.height}
                  unit="px"
                  min={36}
                  max={88}
                  step={2}
                  onChange={next => setOption('height', next)}
                />
                <ValueSlider
                  label="Radius"
                  value={settings.radius}
                  unit="px"
                  min={0}
                  max={24}
                  step={1}
                  onChange={next => setOption('radius', next)}
                />
              </Box>

              <Box>
                <Typography component="h3" sx={{
                  fontSize: 12, fontWeight: 600, mb: 1.25, color: 'text.secondary',
                }}>
                  Theme color
                </Typography>
                <Box role="group" aria-label="Theme color" sx={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1,
                }}>
                  {PALETTE_COLORS.map(color => (
                    <Button
                      key={color}
                      type="button"
                      variant={settings.color === color ? 'contained' : 'outlined'}
                      color={color}
                      aria-pressed={settings.color === color}
                      onClick={() => setOption('color', color)}
                      sx={{
                        minWidth: 0, minHeight: 43, height: 43, p: 0.75,
                        borderRadius: '6px', fontSize: 11, fontWeight: 500,
                        textTransform: 'none',
                      }}
                    >
                      {color}
                    </Button>
                  ))}
                </Box>
              </Box>

              <GroupControl
                label="State"
                options={definition.states}
                value={settings.state}
                onChange={next => setOption('state', next)}
              />

              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                  CURRENT SETTINGS
                </Typography>
                <Box component="pre" sx={{
                  m: 0, p: 2, bgcolor: 'background.default', borderRadius: '6px',
                  overflowX: 'auto', fontSize: 11, lineHeight: 1.8,
                  fontFamily: '"Roboto Mono", monospace', tabSize: 2,
                }}>
                  {JSON.stringify({ component, ...settings, font: 'Roboto Mono' }, null, 2)}
                </Box>
              </Box>
            </Stack>
          </Paper>
        </Box>

        <Typography sx={{ mt: 3, fontSize: 11, lineHeight: 1.7, color: 'text.secondary' }}>
          Isolated lab · No Supabase calls · No changes to global theme, app or timer
        </Typography>
      </Box>
    </Box>
  );
}
