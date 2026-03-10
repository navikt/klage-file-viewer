import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const CHROMIUM_142_PATH: Record<string, string> = {
  darwin: '.chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  linux: '.chromium/chrome-linux/chrome',
};

const chromium142Executable = path.resolve(CHROMIUM_142_PATH[os.platform()] ?? CHROMIUM_142_PATH.linux);

export default defineConfig({
  timeout: 30_000,
  testDir: './e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: undefined,
  reporter: process.env.CI ? 'github' : undefined,

  expect: {
    timeout: 30_000,
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'Egen maskin',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'Applikasjonsportalen',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: chromium142Executable },
      },
    },
  ],

  webServer: {
    command: 'bun run dev:preview',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
