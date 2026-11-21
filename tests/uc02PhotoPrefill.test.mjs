import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPhotoPrefill } from '../src/features/uc02PhotoPrefill.js';
import { initialTeaForm, validateTeaForm } from '../src/features/teaModel.js';

const rows = (...texts) => texts.map((text, order) => ({ photoIndex: 1, order, text, confidence: 0.96 }));
const title = (text, y, order, photoIndex = 1) => ({ text, order, photoIndex, confidence: 0.94,
  boundingBox: { x: 0.15, y, width: 0.5, height: 0.08 } });

test('unlabelled manufacturer and product heading retain their OCR spelling', () => {
  const result = extractPhotoPrefill([
    title('dmBio', 0.81, 1), title('Schwangerschaftstee', 0.70, 0), ...rows('Kräutertee', '20 Beutel'),
  ]);
  assert.deepEqual(result.prefill, { brand: 'dmBio', rawName: 'Schwangerschaftstee', category: 'herbal' });
  assert.deepEqual(extractPhotoPrefill(rows('dm Bio Schwangerschaftstee')).prefill,
    { brand: 'dm Bio', rawName: 'Schwangerschaftstee' });
});

test('an aligned two-line heading is read in geometric order, never across photos', () => {
  const logo = title('TEEKANNE', 0.83, 2);
  const first = title('Früchte-', 0.72, 3);
  const second = title('Mischung', 0.62, 1);
  assert.deepEqual(extractPhotoPrefill([second, logo, first]).prefill, {
    brand: 'TEEKANNE', rawName: 'Früchte-Mischung',
  });
  assert.deepEqual(extractPhotoPrefill([logo, first, { ...second, photoIndex: 2 }]).prefill, { brand: 'TEEKANNE' });
});

test('category and subtype require explicit, unambiguous evidence', () => {
  assert.deepEqual(extractPhotoPrefill(rows('Category: Green Tea', 'Subcategory: Sencha')).prefill,
    { category: 'green', subcategory: 'Sencha' });
  assert.deepEqual(extractPhotoPrefill(rows('Grüntee', 'Unterkategorie: Shincha')).prefill,
    { category: 'green', subcategory: 'other', subcategory_other: 'Shincha' });
  assert.equal(extractPhotoPrefill(rows('Grüntee', 'Schwarztee', 'Subcategory: Sencha')).prefill, null);
});

test('explicit OCR fields and supported preparation initialise a valid existing form', () => {
  const result = extractPhotoPrefill(rows('Manufacturer: Example', 'Product name: Night Tea', 'Kräutertee',
    'Dosierung: 1 Beutel mit 250 ml Wasser', 'Ziehzeit: 3–5 Minuten', 'Wassertemperatur: 95 °C'));
  assert.deepEqual(result.prefill, {
    brand: 'Example', rawName: 'Night Tea', category: 'herbal',
    type: 'bag', unit: 'bag', qty: 1, base: 250, brewSeconds: 180, temperature: 95,
  });
  assert.equal(initialTeaForm(result.prefill).mins, '3');
  assert.equal(validateTeaForm(initialTeaForm(result.prefill)).leafStyle, 'bag');
  assert.deepEqual(result.evidence.brewSeconds[0].value, { min: 3, max: 5 });
  assert.equal(result.prefill.evidence, undefined);
  assert.equal(result.prefill.rejected, undefined);
});

test('loose dose and water must be explicitly paired in a preparation context', () => {
  assert.deepEqual(extractPhotoPrefill(rows('2,5 g mit 0,5 l Wasser aufgießen')).prefill,
    { type: 'loose', unit: 'g', qty: 2.5, base: 500 });
  for (const text of ['2 g pro 250 ml', 'Dosierung: 2 g', '2 g, Zutaten und 250 ml Wasser aufgießen',
    'Dosierung: 2 g pro 250 ml oder 3 g pro 300 ml']) {
    assert.equal(extractPhotoPrefill(rows(text)).prefill, null, text);
  }
});

test('pack content and unsupported tea-bag preparations do not populate any dosage fields', () => {
  for (const text of ['20 Beutel', 'Netto 100 g', 'Inhalt: 20 Beutel à 2 g', 'Dosierung: 2 Beutel mit 250 ml Wasser',
    '1 Beutel mit 200 ml Wasser aufgießen', 'Dosierung: 1 Beutel mit 250 ml Wasser, Inhalt 20 Beutel']) {
    assert.equal(extractPhotoPrefill(rows(text)).prefill, null, text);
  }
  assert.equal(extractPhotoPrefill(rows('Dosierung: 1 Beutel mit 250 ml Wasser', 'Dosierung: 1 Beutel mit 200 ml Wasser')).prefill, null);
});

test('non-preparation temperatures and contradictory preparations are omitted', () => {
  assert.equal(extractPhotoPrefill(rows('Bei 90 °C lagern', 'Water temperature: 85 °C', 'Wassertemperatur: 95 °C',
    'Ziehzeit: 3–5 Minuten', 'Brewing time: 3–7 minutes')).prefill, null);
  for (const text of ['Wassertemperatur: 85–95 °C', 'Ziehzeit: 5–3 Minuten', 'Ziehzeit: 31 Minuten']) {
    assert.equal(extractPhotoPrefill(rows(text)).prefill, null, text);
  }
  assert.deepEqual(extractPhotoPrefill(rows('Steep for 4 minutes')).prefill, { brewSeconds: 240 });
  assert.deepEqual(extractPhotoPrefill(rows('Mit kochendem Wasser aufgießen und 3–5 Minuten ziehen lassen.')).prefill,
    { brewSeconds: 180 });
});

test('multiple manufacturers and names, generic headings and low confidence are not resolved by guessing', () => {
  const result = extractPhotoPrefill(rows('Hersteller: A Tea', 'Manufacturer: B Tea', 'Teename: Tea One', 'Product name: Tea Two'));
  assert.equal(result.prefill, null);
  assert.equal(result.rejected.brand, 'conflicting_observations');
  assert.equal(result.rejected.rawName, 'conflicting_observations');
  assert.deepEqual(extractPhotoPrefill([title('dmBio', 0.83, 0), title('Kräutertee', 0.72, 1),
    { ...rows('Product name: Uncertain Tea')[0], confidence: 0.39 }]).prefill, { brand: 'dmBio', category: 'herbal' });
});

// Text excerpts come from the device test report. Boxes, confidence and Vision
// ordering are reconstructed fixtures, not a raw capture from the iPhone.
function observation(text, x, y, width, order, photoIndex = 1, height = 0.05) {
  return { text, photoIndex, order, confidence: 0.94, boundingBox: { x, y, width, height } };
}

const twinings = [
  observation('TWININGS®', 0.27, 0.80, 0.46, 0),
  observation('ENGLISH', 0.32, 0.72, 0.36, 1),
  observation('BREAKFAST', 0.29, 0.64, 0.42, 2),
  observation('100°C', 0.10, 0.42, 0.18, 0, 2),
  observation('250 ml', 0.40, 0.42, 0.18, 1, 2),
  observation('-4 min', 0.70, 0.42, 0.18, 2, 2),
];

const dm = [
  observation('amBio', 0.31, 0.84, 0.38, 0),
  observation('SCHWANGER-', 0.26, 0.76, 0.48, 2),
  observation('SCHAFTSTEE', 0.26, 0.68, 0.48, 1),
  observation('1 Beutel / 200 ml', 0.20, 0.54, 0.46, 2, 2),
  observation('5–', 0.22, 0.46, 0.14, 0, 2),
  observation('6 Minuten', 0.39, 0.46, 0.29, 1, 2),
];

test('Twinings excerpts yield brand, two-line product and contextual temperature without time or dose', () => {
  const result = extractPhotoPrefill(twinings);
  assert.deepEqual(result.prefill, { brand: 'TWININGS', rawName: 'ENGLISH BREAKFAST', temperature: 100 });
  assert.equal(result.rejected.brewSeconds, 'unsupported_or_incomplete');
  assert.equal(result.rejected.dose, 'no_evidence');
});

test('dm excerpts recover the split name and complete range without guessing amBio or adopting 200 ml', () => {
  const result = extractPhotoPrefill(dm);
  assert.deepEqual(result.prefill, { rawName: 'SCHWANGERSCHAFTSTEE', brewSeconds: 300 });
  assert.deepEqual(result.evidence.brewSeconds[0].value, { min: 5, max: 6 });
});

test('unlisted marked brands need a contiguous, non-generic title outside ingredients and company copy', () => {
  const [brand, first, second] = twinings;
  assert.equal(extractPhotoPrefill([{ ...brand, text: 'Harbour™' }, first, second]).prefill.brand, 'Harbour');
  for (const observations of [
    [{ ...brand, text: 'Importer Ltd®' }, first, second],
    [brand, { ...first, text: 'PREMIUM' }, { ...second, text: 'QUALITY TEA' }],
    [brand, { ...first, text: 'ENGLISH' }, { ...second, text: 'BLACK PEPPER' }],
    [brand, first, { ...second, photoIndex: 2 }],
    [brand, first, { ...second, boundingBox: { ...second.boundingBox, x: 0.70, width: 0.26 } }],
    [brand, { ...first, text: 'Ingredients' }, { ...second, text: 'ENGLISH BREAKFAST' }],
    [{ ...brand, text: 'enjoy our tea' }, first, second],
  ]) assert.equal(extractPhotoPrefill(observations).prefill, null);
});

test('unlabelled water and temperature require a coherent preparation block in the same photo', () => {
  const [temp, water, time] = twinings.slice(3);
  assert.equal(extractPhotoPrefill([temp, water]).prefill, null);
  assert.equal(extractPhotoPrefill([temp, water, { ...time, photoIndex: 3 }]).prefill, null);
  assert.equal(extractPhotoPrefill([temp, water, time, observation('Storage', 0.1, 0.50, 0.28, 3, 2)]).prefill, null);
  assert.equal(extractPhotoPrefill([temp, water, { ...time, boundingBox: { ...time.boundingBox, x: 0.1, y: 0.1 } }]).prefill, null);
});

test('a complete time range can be split before the dash or the unit', () => {
  for (const [first, last] of [['5', '–6 Minuten'], ['5–6', 'Minuten']]) {
    assert.deepEqual(extractPhotoPrefill([
      ...dm.slice(3, 4), { ...dm[4], text: first }, { ...dm[5], text: last },
    ]).prefill, { brewSeconds: 300 });
  }
  assert.equal(extractPhotoPrefill(dm.slice(3, 5)).prefill, null);
  assert.equal(extractPhotoPrefill([...dm.slice(3, 5), { ...dm[5], photoIndex: 3 }]).prefill, null);
  assert.equal(extractPhotoPrefill([...dm.slice(3, 5), { ...dm[5], text: '3 Minuten' }]).prefill, null);
});

test('split dosage still requires a documented pairing and the supported bag recipe', () => {
  const heading = observation('Brewing instructions', 0.20, 0.52, 0.65, 0);
  const portion = observation('1 tea bag /', 0.22, 0.44, 0.28, 1);
  const reference = observation('250 ml', 0.54, 0.44, 0.25, 2);
  assert.deepEqual(extractPhotoPrefill([heading, portion, reference]).prefill,
    { type: 'bag', unit: 'bag', qty: 1, base: 250 });
  for (const observations of [
    [heading, portion, { ...reference, text: '200 ml' }],
    [heading, { ...portion, text: '20 tea bags' }, reference],
    [heading, { ...portion, text: '1 tea bag' }, reference],
    [heading, portion, { ...reference, photoIndex: 2 }],
    [portion, reference],
  ]) assert.equal(extractPhotoPrefill(observations).prefill, null);
});
