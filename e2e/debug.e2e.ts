import { test } from '@playwright/test';

test('debug: open app and pause', async ({ page }) => {
  await page.goto('/');
  await page.pause();
});
