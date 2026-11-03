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
const settings = readFileSync('src/data/supabaseConfig.js', 'utf8');
assert.match(settings, /sb_publishable_/);
const adapter = readFileSync('src/data/teaRepository.js', 'utf8');
assert.match(adapter, /functions\/v1\/community-tea/);
for (const path of sourceFiles('src')) {
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, /sb_secret_|SUPABASE_SERVICE_ROLE_KEY|Bearer\s+eyJ/,
    `Sensitive credential in frontend: ${path}`);
}
console.log('Safety check passed: isolated V3 origin, Roboto Mono, public Supabase key only.');
