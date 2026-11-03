import assert from 'node:assert/strict';
import { listTeas } from '../src/data/teaRepository.js';

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
try {
  const teas = await listTeas({ signal: controller.signal });
  assert.ok(Array.isArray(teas), 'Catalog must be an array.');
  for (const tea of teas) {
    assert.match(tea.id, /^cloud-/);
    assert.ok(tea.name);
    assert.ok(tea.base > 0);
  }
  console.log('Supabase live read OK: ' + teas.length + ' teas. No writes performed.');
} finally {
  clearTimeout(timeout);
}
