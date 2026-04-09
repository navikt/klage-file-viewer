import {
  assertPdfContainsText,
  assertPdfDoesNotContainText,
  DOCUMENT_WITH_VARIANTS_URL,
  getFileToolbars,
  waitForContent,
  waitForPdfRendered,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.describe('redacted toggle', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate directly to only the document with both ARKIV and SLADDET variants
      await page.goto(DOCUMENT_WITH_VARIANTS_URL);
      await waitForContent(page);
      await waitForPdfRendered(page);
    });

    test('shows redacted version by default', async ({ page }) => {
      const toolbar = getFileToolbars(page).first();

      // The toggle should show "Sladdet" by default (showing redacted/SLADDET version)
      await expect(toolbar.getByText('Sladdet')).toBeVisible();

      // "hunter2" is only present in the unredacted (ARKIV) version
      await assertPdfDoesNotContainText(page, 'hunter2');
    });

    test('switches to unredacted version when unchecking Sladdet', async ({ page }) => {
      const toolbar = getFileToolbars(page).first();

      // Verify we start with the redacted version — "hunter2" should not be found
      await assertPdfDoesNotContainText(page, 'hunter2');

      // The toggle should show "Sladdet" by default
      const toggle = toolbar.getByText('Sladdet');
      await expect(toggle).toBeVisible();

      // Click to switch to unredacted (ARKIV) version
      await toggle.click();

      // The toggle should now show "Usladdet"
      await expect(toolbar.getByText('Usladdet')).toBeVisible();

      // Wait for re-render after variant switch
      await waitForPdfRendered(page);

      // "hunter2" should now be found via search — it's only in ARKIV
      await assertPdfContainsText(page, 'hunter2');
    });

    test('switches back to redacted version when checking Sladdet', async ({ page }) => {
      const toolbar = getFileToolbars(page).first();

      // Click to switch to unredacted first
      await toolbar.getByText('Sladdet').click();
      await waitForPdfRendered(page);
      await assertPdfContainsText(page, 'hunter2');

      // Click again to switch back to redacted
      await toolbar.getByText('Usladdet').click();

      // The toggle should show "Sladdet" again
      await expect(toolbar.getByText('Sladdet')).toBeVisible();

      // Wait for re-render after variant switch
      await waitForPdfRendered(page);

      // "hunter2" should no longer be found
      await assertPdfDoesNotContainText(page, 'hunter2');
    });
  });
});
