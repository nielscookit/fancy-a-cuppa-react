import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyLabSetting, COMPONENTS, COMPONENT_DEFINITIONS, createDefaults,
} from '../src/lab/labModel.js';

test('all requested real MUI components exist in the isolated lab model', () => {
  assert.deepEqual(COMPONENTS, ['TextField', 'Select', 'Autocomplete', 'Button']);
  for (const name of COMPONENTS) {
    assert.ok(COMPONENT_DEFINITIONS[name].variants.length >= 3);
    assert.ok(COMPONENT_DEFINITIONS[name].states.length >= 4);
  }
});

test('defaults follow established dimensions and keep per-component state isolated', () => {
  const defaults = createDefaults();
  assert.equal(defaults.TextField.height, 48);
  assert.equal(defaults.Select.height, 48);
  assert.equal(defaults.Autocomplete.height, 48);
  assert.equal(defaults.Button.height, 66);
  assert.equal(defaults.Button.radius, 6);
  const changed = applyLabSetting(defaults, 'Button', 'height', 80);
  assert.equal(changed.Button.height, 80);
  assert.equal(changed.TextField.height, 48);
  assert.equal(defaults.Button.height, 66);
});

test('unsupported states and out-of-range settings are rejected', () => {
  const defaults = createDefaults();
  assert.equal(applyLabSetting(defaults, 'Button', 'state', 'error'), defaults);
  assert.equal(applyLabSetting(defaults, 'Select', 'radius', -1), defaults);
  assert.equal(applyLabSetting(defaults, 'Select', 'height', 0), defaults);
  assert.equal(applyLabSetting(defaults, 'TextField', 'color', 'not-a-theme-color'), defaults);
  assert.equal(applyLabSetting(defaults, 'Button', 'variant', 'filled'), defaults);
});

test('direct nested Pages URL builds as independent HTML entry', () => {
  const config = readFileSync('vite.config.js', 'utf8');
  assert.match(config, /lab:\s*resolve\(import\.meta\.dirname,\s*'lab\/index\.html'\)/);
  const html = readFileSync('lab/index.html', 'utf8');
  assert.match(html, /\/src\/lab\/main\.jsx/);
});

test('lab is not wired to global theme mutation or database', () => {
  const source = readFileSync('src/lab/ComponentLab.jsx', 'utf8');
  assert.match(source, /from '@mui\/material'/);
  assert.doesNotMatch(source, /supabase|teaRepository|createTheme|ThemeProvider/i);
  assert.match(source, /COMPONENT_DEFINITIONS/);
});
