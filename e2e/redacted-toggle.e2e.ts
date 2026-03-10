import { DOCUMENT_WITH_VARIANTS_URL, TEXT_LAYER_SELECTOR, VIEWER_SELECTOR, waitForContent } from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.describe('redacted toggle', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate directly to only the document with both ARKIV and SLADDET variants
      await page.goto(DOCUMENT_WITH_VARIANTS_URL);
      await waitForContent(page);
    });

    test('shows redacted version by default', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);

      // The checkbox should be checked by default (showing redacted/SLADDET version)
      await expect(viewer.getByRole('checkbox', { name: 'Sladdet' })).toBeChecked();

      // "hunter2" is only present in the unredacted (ARKIV) version
      await expect(viewer.locator(TEXT_LAYER_SELECTOR, { hasText: 'hunter2' })).toBeHidden();
    });

    test('switches to unredacted version when unchecking Sladdet', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);

      // Verify we start with the redacted version — "hunter2" should not be visible
      await expect(viewer.locator(TEXT_LAYER_SELECTOR, { hasText: 'hunter2' })).toBeHidden();

      // The checkbox should be checked by default (showing redacted/SLADDET version)
      const checkbox = viewer.getByRole('checkbox', { name: 'Sladdet' });
      await expect(checkbox).toBeChecked();

      // Uncheck to switch to unredacted (ARKIV) version
      await checkbox.click();

      // The checkbox should now be unchecked and show "Usladdet"
      await expect(viewer.getByRole('checkbox', { name: 'Usladdet' })).not.toBeChecked();

      // Wait for the unredacted text to appear — "hunter2" is only in ARKIV
      await expect(viewer.locator(TEXT_LAYER_SELECTOR, { hasText: 'hunter2' })).toBeVisible();
    });

    test('switches back to redacted version when checking Sladdet', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);

      // Uncheck to switch to unredacted first
      await viewer.getByRole('checkbox', { name: 'Sladdet' }).click();
      await expect(viewer.locator(TEXT_LAYER_SELECTOR, { hasText: 'hunter2' })).toBeVisible();

      // Check again to switch back to redacted
      await viewer.getByRole('checkbox', { name: 'Usladdet' }).click();

      // The checkbox should be checked again showing "Sladdet"
      await expect(viewer.getByRole('checkbox', { name: 'Sladdet' })).toBeChecked();

      // "hunter2" should no longer be present
      await expect(viewer.locator(TEXT_LAYER_SELECTOR, { hasText: 'hunter2' })).toBeHidden();
    });
  });
});
