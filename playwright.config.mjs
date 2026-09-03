import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
