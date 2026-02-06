import { focusViewer, INITIAL_SCALE, VIEWER_SELECTOR, ZOOM_IN_REGEX, ZOOM_OUT_REGEX } from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(VIEWER_SELECTOR);
  });

  test.describe('zoom controls', () => {
    test('can zoom in and out using toolbar buttons', async ({ page }) => {
      const zoomInButton = page.locator(VIEWER_SELECTOR).getByRole('button', { name: ZOOM_IN_REGEX });

      // Only run this test if zoom buttons are present
      if ((await zoomInButton.count()) > 0) {
        await expect(zoomInButton).toBeVisible();
        await zoomInButton.click();

        const zoomOutButton = page.locator(VIEWER_SELECTOR).getByRole('button', { name: ZOOM_OUT_REGEX });
        await expect(zoomOutButton).toBeVisible();
        await zoomOutButton.click();
      }
    });
  });

  test.describe('keyboard shortcuts', () => {
    test('zooms in with Control+=', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      const scaleInput = viewer.locator('label', { hasText: '%' }).locator('input');
      await expect(scaleInput).toHaveValue(INITIAL_SCALE);

      await focusViewer(page);
      await page.keyboard.press('Control+=');

      await expect(scaleInput).not.toHaveValue(INITIAL_SCALE);
      const newValue = Number.parseInt(await scaleInput.inputValue(), 10);
      expect(newValue).toBeGreaterThan(Number.parseInt(INITIAL_SCALE, 10));
    });

    test('zooms out with Control+-', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      const scaleInput = viewer.locator('label', { hasText: '%' }).locator('input');
      await expect(scaleInput).toHaveValue(INITIAL_SCALE);

      await focusViewer(page);
      await page.keyboard.press('Control+-');

      await expect(scaleInput).not.toHaveValue(INITIAL_SCALE);
      const newValue = Number.parseInt(await scaleInput.inputValue(), 10);
      expect(newValue).toBeLessThan(Number.parseInt(INITIAL_SCALE, 10));
    });
  });
});
