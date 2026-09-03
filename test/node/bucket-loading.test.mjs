import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice, getPhonemes } from '../../src/espeak.mjs';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const manifest = JSON.parse(readFileSync(path.join(distDir, 'data/manifest.json'), 'utf8'));

test('voices in different buckets both phonemize correctly (separate lazy loads)', async () => {
  await initialize(distDir);
  assert.notEqual(manifest.voiceToBucket['en-us'], manifest.voiceToBucket['ru'], 'test assumes en-us and ru land in different buckets');

  await setVoice('en-us');
  assert.ok(getPhonemes('hello').length > 0);

  await setVoice('ru');
  assert.ok(getPhonemes('привет').length > 0);

  // switching back to a bucket already loaded earlier still works
  await setVoice('en-us');
  assert.ok(getPhonemes('hello again').length > 0);
});

test('two voices sharing one bucket both work after a single bucket load', async () => {
  await initialize(distDir);

  const byBucket = new Map();
  for (const [voice, bucket] of Object.entries(manifest.voiceToBucket)) {
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(voice);
  }
  const shared = [...byBucket.values()].find((voices) => voices.length >= 2);
  assert.ok(shared, 'expected at least one bucket containing 2+ voices in the current manifest');
  const [voiceA, voiceB] = shared;

  await setVoice(voiceA);
  assert.ok(getPhonemes('test').length > 0, `voice ${voiceA} should phonemize`);

  await setVoice(voiceB);
  assert.ok(getPhonemes('test').length > 0, `voice ${voiceB} should phonemize`);
});
