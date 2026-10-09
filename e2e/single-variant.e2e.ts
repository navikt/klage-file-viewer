import {
  assertPdfContainsText,
  DOCUMENT_ONLY_FULLVERSJON_URL,
  DOCUMENT_ONLY_SLADDET_URL,
  getFileToolbars,
  getVariantSelector,
  waitForContent,
  waitForPdfRendered,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.describe('single variant', () => {
    test('shows a Sladdet tag instead of the variant selector', async ({ page }) => {
      await page.goto(DOCUMENT_ONLY_SLADDET_URL);
      await waitForContent(page);
      await waitForPdfRendered(page);

      await expect(getVariantSelector(page)).toHaveCount(0);
      await expect(getFileToolbars(page).first().getByText('Sladdet', { exact: true })).toBeVisible();
    });

    test('shows a Fullversjon tag instead of the variant selector', async ({ page }) => {
      await page.goto(DOCUMENT_ONLY_FULLVERSJON_URL);
      await waitForContent(page);
      await waitForPdfRendered(page);

      await expect(getVariantSelector(page)).toHaveCount(0);
      await expect(getFileToolbars(page).first().getByText('Fullversjon', { exact: true })).toBeVisible();
      await assertPdfContainsText(page, 'fullversjonen');
    });
  });
});
