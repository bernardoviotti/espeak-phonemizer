import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice } from '../../src/espeak.mjs';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

test('setVoice rejects cleanly for a language excluded from this build (Japanese)', async () => {
  await initialize(distDir);
  await assert.rejects(() => setVoice('ja'), /Unknown or unbundled voice: ja/);
});
