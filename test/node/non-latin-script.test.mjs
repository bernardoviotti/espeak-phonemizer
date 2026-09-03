import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice, getPhonemes } from '../../src/espeak.mjs';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

test('phonemizes Russian (Cyrillic, EXTRA_ru dictionary, its own oversized bucket)', async () => {
  await initialize(distDir);
  await setVoice('ru');

  const result = getPhonemes('Привет, как дела?');
  assert.ok(result.length > 0);
  for (const clause of result) assert.ok(clause.phonemes.length > 0);
  assert.equal(result[result.length - 1].terminator, '?');
});

test('phonemizes Arabic (right-to-left, abjad script)', async () => {
  await initialize(distDir);
  await setVoice('ar');

  const result = getPhonemes('مرحبا بالعالم.');
  assert.ok(result.length > 0);
  for (const clause of result) assert.ok(clause.phonemes.length > 0);
});
