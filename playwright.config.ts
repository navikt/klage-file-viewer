import { defineConfig, devices } from '@playwright/test';

const IS_CI = process.env.CI !== undefined;
const E2E_PORT = 5172;
const E2E_BASE_URL = `http://localhost:${E2E_PORT.toString(10)}`;

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  timeout: 10_000,
  testDir: './e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: undefined,
  reporter: IS_CI ? 'github' : undefined,

  expect: {
    timeout: 10_000,
  },

  use: {
    ...devices['Desktop Chrome'],
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
  },

  webServer: {
    command: `PORT=${E2E_PORT.toString(10)} bun run dev:preview`,
    url: E2E_BASE_URL,
    reuseExistingServer: !IS_CI,
  },
});
