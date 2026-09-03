import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice, getPhonemes } from '../../src/espeak.mjs';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist/wasm');

test('initialize -> setVoice -> getPhonemes basic smoke test', async () => {
  await initialize(dataDir);
  setVoice('en-us');

  const result = getPhonemes('Hello world. How are you?');

  assert.equal(result.length, 2);
  for (const clause of result) {
    assert.ok(clause.phonemes.length > 0, 'phonemes should be non-empty');
  }
  const last = result[result.length - 1];
  assert.equal(last.terminator, '?');
  assert.equal(last.isSentenceEnd, true);
});
