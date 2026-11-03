import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const config = readFileSync('vite.config.js', 'utf8');
assert.match(config, /base:\s*['"]\/fancy-a-cuppa-react\/['"]/);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.name, 'fancy-a-cuppa-react');
assert.equal(pkg.dependencies['@mui/material'].split('.')[0], '7');
const theme = readFileSync('src/theme.js', 'utf8');
assert.match(theme, /Roboto Mono/);
const data = readFileSync('src/data/teaRepository.js', 'utf8');
assert.match(data, /database writes are disabled/);
for (const path of sourceFiles('src')) {
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, /\b(?:https?:\/\/)[\w.-]*supabase\.co\b/,
    `Unsafe production Supabase reference: ${path}`);
  assert.doesNotMatch(source, /sb_secret_|service_role|functions\/v1\/community-tea/,
    `Unsafe write credential or endpoint: ${path}`);
}
console.log('Safety check passed: isolated V3 base, Roboto Mono, no production Supabase connection.');
