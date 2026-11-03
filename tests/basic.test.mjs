import test from 'node:test';
import assert from 'node:assert/strict';
import { listTeas, lookupTeaByCode, createTea, updateTea, deleteTea, normalizeTea } from '../src/data/teaRepository.js';
import { v3StorageKey } from '../src/storage.js';

const example = {
  id: '69c829bd-6ca9-450e-9441-80867d14fae5',
  brand: 'Test brand',
  name: 'Assam',
  category: 'black',
  subcategory: 'assam',
  tea_preparations: [{
    dose_teaspoons: 3,
    dose_grams: null,
    dose_bags: null,
    dose_measures: null,
    dose_water_ml: 500,
    brew_seconds: 240,
    water_temp_c: 100,
  }],
};
const response = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

test('catalog GET returns V2-compatible normalized teas', async () => {
  let requested;
  const fetchImpl = async (url, options) => {
    requested = { url, options };
    return response([example]);
  };
  const rows = await listTeas({ fetchImpl });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'cloud-' + example.id);
  assert.equal(rows[0].unit, 'tsp');
  assert.equal(rows[0].dose, 6);
  assert.equal(rows[0].min, 4);
  assert.equal(rows[0].brewSeconds, 240);
  assert.match(requested.url, /rest\/v1\/teas/);
  assert.match(requested.url, /status=eq.published/);
  assert.match(requested.options.headers.apikey, /^sb_publishable_/);
  assert.equal(requested.options.method, undefined);
});

test('catalog omits rows without a preparation', () => {
  assert.equal(normalizeTea({ ...example, tea_preparations: [] }), null);
});

test('barcode lookup reads matching shared tea', async () => {
  let url = '';
  const tea = await lookupTeaByCode({ type: 'ean_13', value: '1234567890123' }, {
    fetchImpl: async u => { url = u; return response([{ teas: example }]); },
  });
  assert.equal(tea.name, 'Test brand · Assam');
  assert.match(url, /code_type=eq.ean_13/);
  assert.match(url, /code_value=eq.1234567890123/);
});

test('createTea calls existing Edge Function only after explicit save function', async () => {
  let request;
  const data = {
    brand: 'Test brand', name: 'Assam', category: 'black', subcategory: 'assam',
    type: 'loose', unit: 'tsp', qty: 3, base: 500, mins: 4, temperature: 100,
  };
  const result = await createTea(data, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ id: example.id });
    },
  });
  assert.equal(result.id, example.id);
  assert.match(request.url, /functions\/v1\/community-tea$/);
  assert.equal(request.options.method, 'POST');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.action, 'create');
  assert.equal(payload.brew_seconds, 240);
  assert.equal(payload.dose_teaspoons, 3);
  assert.equal(payload.dose_water_ml, 500);
});

test('updateTea strips V2 cloud- prefix for the Edge Function', async () => {
  let payload;
  await updateTea({
    id: 'cloud-' + example.id, brand: 'Test brand', name: 'Assam',
    category: 'black', subcategory: 'assam', type: 'loose', unit: 'tsp',
    qty: 4, base: 500, mins: 5,
  }, {
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return response({ updated: true });
    },
  });
  assert.equal(payload.action, 'update');
  assert.equal(payload.id, example.id);
  assert.equal(payload.dose_teaspoons, 4);
});

test('server HTTP errors are surfaced', async () => {
  await assert.rejects(
    listTeas({ fetchImpl: async () => response({ error: 'Unavailable' }, 503) }),
    /Unavailable/,
  );
});

test('deletion is not available in the existing V2 API', async () => {
  await assert.rejects(deleteTea(), /not supported/);
});

test('V3 browser storage keys are namespaced', () => {
  assert.equal(v3StorageKey('recent'), 'fac-v3:recent');
});
