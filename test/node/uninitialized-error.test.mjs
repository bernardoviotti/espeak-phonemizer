import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPhonemes, setVoice } from '../../src/espeak.mjs';

// Deliberately does NOT call initialize() — this file's job is only to check
// that calling into the wrapper before initialize() fails with a clear error
// rather than a wasm-level crash. Relies on `node --test` isolating each test
// file into its own process, so this module's singleton starts out unset.

test('setVoice rejects with a clear error if called before initialize', async () => {
  await assert.rejects(() => setVoice('en-us'), /not initialized/);
});

test('getPhonemes throws a clear error if called before initialize', () => {
  assert.throws(() => getPhonemes('hello'), /not initialized/);
});
