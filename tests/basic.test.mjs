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
    qty: 4, base: 500, mins: 5, leafStyle: 'other',
    original: { leafStyle:'other',photoUrl:null,
      instructions:null,sourceLabel:null,code:null },
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

test('bag preparation roundtrip keeps bag units and original seconds', () => {
  const bags = normalizeTea({
    ...example,
    tea_preparations: [{
      dose_teaspoons: null, dose_grams: null, dose_bags: 2,
      dose_measures: null, dose_water_ml: 500,
      brew_seconds: 180, water_temp_c: 98,
    }],
  });
  assert.equal(bags.type, 'bag');
  assert.equal(bags.unit, 'bag');
  assert.equal(bags.qty, 2);
  assert.equal(bags.base, 500);
  assert.equal(bags.brewSeconds, 180);
  assert.equal(bags.min, 3);
});

test('bag create payload sends only bag dosage, barcode and exact brewing time', async () => {
  let payload;
  await createTea({
    brand: 'QA-Mock', name: 'Teebeutel', category: 'black',
    subcategory: 'Assam', type: 'bag', unit: 'bag',
    qty: 2, base: 500, mins: 3, temperature: 100,
    code: { type: 'ean_13', value: '1234567890123' },
  }, { fetchImpl: async (_url, options) => {
    payload = JSON.parse(options.body);
    return response({ id: 'mock-id' });
  } });
  assert.equal(payload.action, 'create');
  assert.equal(payload.dose_bags, 2);
  assert.equal(payload.dose_teaspoons, null);
  assert.equal(payload.dose_grams, null);
  assert.equal(payload.dose_measures, null);
  assert.equal(payload.dose_unit, 'bag');
  assert.equal(payload.dose_water_ml, 500);
  assert.equal(payload.brew_seconds, 180);
  assert.equal(payload.code_type, 'ean_13');
});

test('invalid save payload never performs a network request', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; return response({}); };
  const base = {
    name: 'Assam', brand: 'QA-Mock', category: 'black',
    subcategory: 'Assam', type: 'loose', unit: 'tsp',
    qty: 2, base: 500, mins: 4,
  };
  await assert.rejects(createTea({ ...base, qty: -1 }, { fetchImpl }), /Invalid tea preparation/);
  await assert.rejects(createTea({ ...base, type: 'bag' }, { fetchImpl }), /does not match tea format/);
  await assert.rejects(updateTea({ ...base, id: null }, { fetchImpl }), /cloud tea ID/i);
  assert.equal(requests, 0);
});

test('write API reports Edge Function error without retrying itself', async () => {
  let calls = 0;
  await assert.rejects(createTea({
    brand: 'QA-Mock', name: 'Assam', category: 'black',
    subcategory: 'Assam', type: 'loose', unit: 'tsp',
    qty: 2, base: 500, mins: 4,
  }, { fetchImpl: async () => {
    calls++;
    return response({ error: 'Test server rejected save' }, 409);
  } }), /Test server rejected save/);
  assert.equal(calls, 1);
});
