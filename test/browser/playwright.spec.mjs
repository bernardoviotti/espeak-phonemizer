import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { version: PKG_VERSION } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let server;
let baseUrl;

test.beforeAll(async () => {
  ({ server, url: baseUrl } = await startStaticServer());
});

test.afterAll(() => {
  server.close();
});

test('initialize/setVoice/getPhonemes works in a real browser with no backend', async ({ page }) => {
  await page.goto(`${baseUrl}/test/browser/harness.html`);
  await page.waitForFunction(() => window.__testResult || window.__testError);

  const error = await page.evaluate(() => window.__testError);
  expect(error).toBeUndefined();

  const result = await page.evaluate(() => window.__testResult);
  expect(result).toHaveLength(2);
  for (const clause of result) {
    expect(clause.phonemes.length).toBeGreaterThan(0);
  }
  expect(result[result.length - 1].terminator).toBe('?');
  expect(result[result.length - 1].isSentenceEnd).toBe(true);
});

test('initialize falls back to the npm CDN when dist/data is unreachable', async ({ page }) => {
  // Simulate a host that serves dist/wasm (picked up automatically via the
  // static import) but forgot to deploy dist/data: block the local data path
  // and serve the npm CDN URL initialize() should fall back to from this
  // repo's own dist/data, so the test never depends on the real network.
  await page.route(`${baseUrl}/dist/data/**`, (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.route(`https://cdn.jsdelivr.net/npm/espeak-phonemizer@${PKG_VERSION}/dist/data/**`, (route) => {
    const url = new URL(route.request().url());
    const relPath = url.pathname.split('/dist/data/')[1];
    const body = readFileSync(path.join(ROOT, 'dist/data', relPath));
    route.fulfill({ status: 200, body, contentType: 'application/octet-stream' });
  });

  await page.goto(`${baseUrl}/test/browser/harness.html`);
  await page.waitForFunction(() => window.__testResult || window.__testError);

  const error = await page.evaluate(() => window.__testError);
  expect(error).toBeUndefined();

  const result = await page.evaluate(() => window.__testResult);
  expect(result).toHaveLength(2);
  for (const clause of result) {
    expect(clause.phonemes.length).toBeGreaterThan(0);
  }
});
