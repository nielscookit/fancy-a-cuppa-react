import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchPhotoCandidates, photoPrefillFromText } from '../src/features/nativeTeaCamera.js';
import { diagnoseCatalogMatch, diagnosePrefill } from '../src/features/uc02OcrDiagnostics.js';

const teas = [
  { id:'a', brand:'Lebensbaum', rawName:'Assam Breakfast' },
  { id:'b', brand:'Teekampagne', rawName:'Assam Second Flush' },
  { id:'c', brand:'TeeGschwendner', rawName:'Darjeeling' },
];

test('P1 catalog reasons reflect unchanged exact matching', () => {
  const lines = ['Lebensbaum', 'Assam Breakfast'];
  const original = matchPhotoCandidates(lines, teas);
  const report = diagnoseCatalogMatch(lines, teas);
  assert.deepEqual(original.map(x => x.id), ['a']);
  assert.deepEqual(report.accepted.map(x => x.id), ['a']);
  assert.equal(report.catalogCount, 3);
  assert.equal(report.rejectionCounts.matched, 1);
  assert.equal(report.rejectionCounts.missing_both, 2);
  assert.deepEqual(matchPhotoCandidates(lines, teas), original);
});

test('P1 rejected partial package text identifies missing complete name', () => {
  const report = diagnoseCatalogMatch(['Lebensbaum', 'Assam'], teas);
  assert.equal(report.rejectionCounts.matched, 0);
  assert.equal(report.rejectionCounts.missing_name, 1);
  assert.ok(report.rejectedSample.some(x => x.id === 'a' && x.reason === 'missing_name'));
  assert.deepEqual(matchPhotoCandidates(['Lebensbaum', 'Assam'], teas), []);
});

test('P1 prefill only observes existing parser output', () => {
  const lines = ['Hersteller: Lebensbaum', 'Ziehzeit: 4 Minuten', '100 °C', 'Assam Breakfast'];
  const original = photoPrefillFromText(lines);
  const report = diagnosePrefill(lines, original);
  assert.deepEqual(original, { brand: 'Lebensbaum', brewSeconds: 240 });
  assert.deepEqual(report.extracted, original);
  assert.equal(report.fields.rawName.reason, 'no_explicit_label');
  assert.equal(report.fields.temperature.reason, 'not_implemented_in_current_parser');
});

test('P1 native instrumentation is gated, unpersisted and invisible', () => {
  const source = readFileSync(new URL('../ios/App/App/FACTeaCameraPlugin.swift', import.meta.url), 'utf8');
  assert.match(source, /#if DEBUG\s*return Bundle\.main\.bundleIdentifier == "com\.fancyacuppa\.test"/);
  assert.match(source, /NSLog\("\[FAC-OCR-P1\] %@", line\)/);
  assert.match(source, /if let diagnostic, Self\.ocrDiagnosticsEnabled \{ Self\.emitOCRDiagnostic\(diagnostic\) \}/);
  assert.match(source, /recognized\.lines\.last\?\.isEmpty != false/);
  assert.match(source, /candidate\.confidence >= 0\.35/);
  assert.doesNotMatch(source, /diagnosticOverlay|debugButton|diagnosticSheet/);
});
