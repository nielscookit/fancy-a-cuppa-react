import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('native iOS custom water input uses dark grey focus border', () => {
  const sheet = readFileSync('src/components/tea-sheet.css','utf8');
  const detail = readFileSync('src/components/tea-detail.css','utf8');
  assert.match(sheet,
    /\.fac-sheet-paper\[data-native-expanded-gap="true"\] \.fac-tea-custom-field \.MuiFilledInput-root\.Mui-focused \{\s*border-color:#1B272B;/);
  // Existing browser/PWA focus and separate validation-error colors are untouched.
  assert.match(detail, /\.fac-tea-custom-field \.MuiFilledInput-root\.Mui-focused \{ border-color: #792b40; \}/);
});
