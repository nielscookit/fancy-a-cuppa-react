import test from 'node:test';
import assert from 'node:assert/strict';
import { listTeas, createTea, updateTea, deleteTea } from '../src/data/teaRepository.js';
import { v3StorageKey } from '../src/storage.js';

test('Phase 2 catalog is disconnected from all backends', async () => {
  assert.deepEqual(await listTeas(), []);
});

test('Phase 2 writes are blocked for all mutation types', async () => {
  for (const mutation of [createTea, updateTea, deleteTea]) {
    await assert.rejects(mutation({ name: 'Test tea' }), /writes are disabled/);
  }
});

test('V3 browser storage keys are namespaced', () => {
  assert.equal(v3StorageKey('recent'), 'fac-v3:recent');
});
