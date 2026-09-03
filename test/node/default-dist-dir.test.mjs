import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialize, setVoice, getPhonemes } from '../../src/espeak.mjs';

// No distDir argument — in Node this should resolve the package's own
// installed dist/ directory automatically (see defaultDistDir() in
// src/espeak.mjs), which is the main ergonomic win of packaging this as a
// real npm module.
test('initialize() with no arguments resolves this package\'s own dist/ in Node', async () => {
  await initialize();
  await setVoice('en-us');
  const result = getPhonemes('It just works.');
  assert.ok(result.length > 0);
  assert.ok(result[0].phonemes.length > 0);
});
