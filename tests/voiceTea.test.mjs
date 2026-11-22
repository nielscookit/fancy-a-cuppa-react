import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceTeaIntent, resolveVoiceTeaIntent, routeVoiceTeaIntent } from '../src/features/voiceTeaIntent.js';
import { createVoiceTeaSession } from '../src/features/voiceTeaSession.js';

const tea = { id: 1, brand: 'Example', rawName: 'Assam Morning Tea', brewSeconds: 240 };
const other = { id: 2, brand: 'Other', rawName: 'Assam Morning Tea' };
const catalog = [tea];

test('voice resolves explicit German and English camera and empty editor commands', () => {
  for (const text of ['Tee suchen', 'Tee scannen', 'Tee identifizieren', 'Find tea', 'Scan tea', 'Identify tea']) {
    assert.deepEqual(parseVoiceTeaIntent(text, []), { type: 'scan' });
  }
  for (const text of ['Tee anlegen', 'Neuen Tee hinzufügen', 'Add new tea', 'Create tea']) {
    assert.deepEqual(parseVoiceTeaIntent(text, []), { type: 'add' });
  }
});

test('voice keeps the detail default and reads preset and custom water quantities', () => {
  assert.deepEqual(parseVoiceTeaIntent('Assam Morning Tea', catalog), { type: 'detail', tea, water: undefined });
  for (const [quantity, water] of [
    ['500 ml', 500], ['0,5 Liter', 500], ['ein Liter', 1000], ['five hundred millilitres', 500],
    ['fünfhundert Milliliter', 500], ['siebenhundertfünfundzwanzig Milliliter', 725],
    ['seven hundred and twenty-five milliliters', 725],
  ]) assert.deepEqual(parseVoiceTeaIntent('Assam Morning Tea, ' + quantity, catalog), { type: 'detail', tea, water });
});

test('voice only brews an exact product with explicit command and valid water', () => {
  for (const text of ['Brew Assam Morning Tea, 500 ml', 'Assam Morning Tea mit 500 ml aufbrühen']) {
    assert.deepEqual(parseVoiceTeaIntent(text, catalog), { type: 'brew', tea, water: 500 });
  }
  assert.equal(parseVoiceTeaIntent('Brew Assam Morning Tea', catalog).type, 'unrecognised');
  assert.equal(parseVoiceTeaIntent('Brew Assam, 500 ml', catalog).type, 'search');
  assert.equal(parseVoiceTeaIntent('Brew Assam Morning Tea, 500 ml', [tea, other]).type, 'search');
  assert.equal(parseVoiceTeaIntent('Assam Morning Tea', [tea, other]).type, 'search');
  assert.equal(parseVoiceTeaIntent('Brew Earl Grey, 500 ml', catalog).type, 'no-match');
  assert.equal(parseVoiceTeaIntent('Brew Assam Morning Tea, 500 ml', []).type, 'catalog-unavailable');
  for (const amount of ['0 ml', '49 ml', '5001 ml', '500.5 ml', '-500 ml', '500 ml or 250 ml', 'ml']) {
    assert.equal(parseVoiceTeaIntent('Brew Assam Morning Tea ' + amount, catalog).type, 'invalid-water');
  }
});

test('different interpreted speech results never start a timer', () => {
  const brew = 'Brew Assam Morning Tea, 500 ml';
  assert.equal(resolveVoiceTeaIntent([brew, 'Assam Morning Tea, 500 ml'], catalog).type, 'unrecognised');
  assert.equal(resolveVoiceTeaIntent([brew, 'Brew Assam Morning Tea, 1000 ml'], catalog).type, 'unrecognised');
  assert.equal(resolveVoiceTeaIntent([brew, 'Brew Assam Morning Tea, 0 ml'], catalog).type, 'invalid-water');
  assert.equal(resolveVoiceTeaIntent([brew, brew], catalog).type, 'brew');
});

function harness(handle = async () => true) {
  const pending = [];
  const states = [];
  const errors = [];
  const cancellations = [];
  let removed = 0;
  const session = createVoiceTeaSession({
    addListener: async (_, phase) => ({ phase, remove: async () => { removed++; } }),
    listen: async ({ id }) => new Promise((resolve, reject) => pending.push({ id, resolve, reject })),
    cancel: async ({ id }) => { cancellations.push(id); },
  }, { update: value => states.push(value), handle, notify: code => errors.push(code), visible: () => true });
  return { session, pending, states, errors, cancellations, removed: () => removed };
}

test('double tap cancels, restart accepts only its own result and cleans listeners', async () => {
  const handled = [];
  const h = harness(async result => { handled.push(result); return true; });
  const old = h.session.toggle();
  await Promise.resolve();
  await h.session.toggle();
  assert.deepEqual(h.cancellations, [h.pending[0].id]);
  const current = h.session.toggle();
  await Promise.resolve();
  h.pending[0].resolve({ transcripts: ['obsolete'] });
  h.pending[1].resolve({ transcripts: ['new'] });
  await Promise.all([old, current]);
  assert.deepEqual(handled, [['new']]);
  assert.equal(h.removed(), 2);
});

test('cancellation while processing invalidates navigation and denied permission reports an error', async () => {
  let release;
  const navigated = [];
  const h = harness(async (result, current) => {
    await new Promise(resolve => { release = resolve; });
    if (current()) navigated.push(result);
    return true;
  });
  const first = h.session.toggle();
  await Promise.resolve();
  h.pending[0].resolve({ transcripts: ['Scan tea'] });
  await new Promise(resolve => setImmediate(resolve));
  h.session.cancel();
  release();
  await first;
  assert.deepEqual(navigated, []);
  const second = h.session.toggle();
  await Promise.resolve();
  h.pending[1].reject({ code: 'PERMISSION' });
  await second;
  assert.deepEqual(h.errors, ['PERMISSION']);
  assert.equal(h.states.at(-1), 'unrecognised');
});

test('voice routes to existing views and only the brew action invokes the timer', () => {
  const calls = [];
  const actions = Object.fromEntries(['scan', 'add', 'detail', 'search', 'brew', 'notice']
    .map(action => [action, (...args) => { calls.push([action, ...args]); return false; }]));
  for (const text of ['Assam Morning Tea', 'Scan tea', 'Add new tea', 'Earl Grey',
    'Brew Assam Morning Tea, 500 ml']) {
    routeVoiceTeaIntent(parseVoiceTeaIntent(text, catalog), actions);
  }
  assert.deepEqual(calls, [['detail', tea, undefined], ['scan'], ['add'], ['scan'], ['brew', 240],
    ['notice', 'Timer not ready. Please try again.']]);
  calls.length = 0;
  routeVoiceTeaIntent(parseVoiceTeaIntent('Brew Assam Morning Tea, 500 ml', []), actions);
  routeVoiceTeaIntent(parseVoiceTeaIntent('Brew Assam, 500 ml', catalog), actions);
  assert.deepEqual(calls, [['notice', 'Tea catalogue unavailable.'], ['search', 'assam']]);
});
