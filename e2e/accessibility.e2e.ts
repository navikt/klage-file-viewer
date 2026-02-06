import AxeBuilder from '@axe-core/playwright';
import { FILE_HEADER_SELECTOR, PAGE_SELECTOR, THEME_BUTTON_REGEX, VIEWER_SELECTOR } from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(VIEWER_SELECTOR);
  });

  test.describe('accessibility', () => {
    test('should not have any automatically detectable a11y violations on initial load', async ({ page }) => {
      // Wait for at least one page to render so we're testing meaningful content
      await page.locator(PAGE_SELECTOR).first().waitFor({ state: 'visible' });

      const results = await new AxeBuilder({ page })
        .include(VIEWER_SELECTOR)
        // Exclude canvas elements — PDF.js renders to canvas which axe can't inspect for text
        .exclude('canvas')
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test('should not have a11y violations in file headers', async ({ page }) => {
      await page.locator(FILE_HEADER_SELECTOR).first().waitFor({ state: 'visible' });

      const results = await new AxeBuilder({ page }).include(FILE_HEADER_SELECTOR).analyze();

      expect(results.violations).toEqual([]);
    });

    test('should not have a11y violations with dark theme', async ({ page }) => {
      // Toggle to dark mode using the dev toolbar theme button
      const themeButton = page.getByRole('button', { name: THEME_BUTTON_REGEX });

      if ((await themeButton.count()) > 0) {
        await themeButton.click();
      }

      await page.locator(PAGE_SELECTOR).first().waitFor({ state: 'visible' });

      const results = await new AxeBuilder({ page }).include(VIEWER_SELECTOR).exclude('canvas').analyze();

      expect(results.violations).toEqual([]);
    });
  });
});
