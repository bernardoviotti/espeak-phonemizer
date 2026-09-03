import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize, setVoice, getPhonemes } from '../../src/espeak.mjs';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

test('decodes comma / period / trailing-unterminated-clause terminators correctly', async () => {
  await initialize(distDir);
  await setVoice('en-us');

  // "one, two." has three clauses: "one" (comma), "two" (period+sentence-end),
  // and a final empty clause once the text pointer is exhausted (getPhonemes
  // itself stops the loop there, so we only see the first two below).
  const result = getPhonemes('one, two.');

  assert.equal(result.length, 2);

  assert.equal(result[0].terminator, ',');
  assert.equal(result[0].isSentenceEnd, false);

  assert.equal(result[1].terminator, '.');
  assert.equal(result[1].isSentenceEnd, true);
});

test('decodes question and exclamation terminators', async () => {
  await initialize(distDir);
  await setVoice('en-us');

  const question = getPhonemes('Is this a question?');
  assert.equal(question[question.length - 1].terminator, '?');
  assert.equal(question[question.length - 1].isSentenceEnd, true);

  const exclamation = getPhonemes('This is exciting!');
  assert.equal(exclamation[exclamation.length - 1].terminator, '!');
  assert.equal(exclamation[exclamation.length - 1].isSentenceEnd, true);
});
