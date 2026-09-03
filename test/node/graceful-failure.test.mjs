import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice } from '../../src/espeak.mjs';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist/wasm');

test('setVoice throws cleanly for a language excluded from this build (Japanese)', async () => {
  await initialize(dataDir);
  assert.throws(() => setVoice('ja'), /Failed to set voice: ja/);
});
