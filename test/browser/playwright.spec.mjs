import { test, expect } from '@playwright/test';
import { startStaticServer } from './static-server.mjs';

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
