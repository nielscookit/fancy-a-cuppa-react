import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchFancyTestPhoto, matchPhotoCandidates } from '../src/features/nativeTeaCamera.js';
import { teas, cases } from './fixtures/uc02-p2a.mjs';

for (const [label, lines, expected, stage = 'name_only'] of cases) {
  test('P2a OCR fixture: ' + label, () => {
    const match = matchFancyTestPhoto(lines, teas, { nameOnlyEnabled: true });
    assert.equal(match.stage, stage);
    assert.deepEqual(match.candidates.map(tea => tea.id), expected);
    const normal = matchFancyTestPhoto(lines, teas);
    assert.deepEqual(normal.candidates, matchPhotoCandidates(lines, teas));
    assert.notEqual(normal.stage, 'name_only');
  });
}

test('P2a diagnostics expose exact decisions, competing identities and rejection reasons', () => {
  let report;
  const options = { nameOnlyEnabled: true, report: value => { report = value; } };
  matchFancyTestPhoto(['Minze Zitrone'], teas, options);
  assert.equal(report.ambiguous, true);
  assert.deepEqual(report.manufacturers, ['Gartenwerk','Nordblatt']);
  assert.ok(report.candidates.every(candidate => candidate.nameExact));
  matchFancyTestPhoto(['Bio', 'Früchte-Mischung'], teas, options);
  assert.deepEqual(report.variants, ['Bio Früchte-Mischung']);
  assert.equal(report.rejectionCounts.longer_catalog_variant_observed, 1);
  matchFancyTestPhoto(['Hersteller: Südkräuter', 'Früchte-Mischung'], teas, options);
  assert.equal(report.rejectionCounts.manufacturer_conflict, 1);
});

test('P2a app matching is gated by native iOS and the isolated build flag', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /nativeIOS = Capacitor.getPlatform\(\) === 'ios'/);
  assert.match(source, /nameOnlyEnabled: nativeIOS && communityTeaV4/);
});
