import {
  assertPdfContainsText,
  assertPdfDoesNotContainText,
  DOCUMENT_WITH_VARIANTS_URL,
  getVariantSelector,
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

    test('shows only Sladdet and Standard in the variant selector', async ({ page }) => {
      const radios = getVariantSelector(page).getByRole('radio');

      await expect(radios).toHaveCount(2);
      await expect(radios.nth(0)).toHaveAccessibleName('Sladdet');
      await expect(radios.nth(1)).toHaveAccessibleName('Standard');
    });

    test('shows redacted version by default', async ({ page }) => {
      const selector = getVariantSelector(page);

      await expect(selector.getByRole('radio', { name: 'Sladdet', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // "hunter2" is only present in the unredacted (ARKIV) version
      await assertPdfDoesNotContainText(page, 'hunter2');
    });

    test('switches to unredacted version when selecting Standard', async ({ page }) => {
      const selector = getVariantSelector(page);
      const standard = selector.getByRole('radio', { name: 'Standard' });

      await assertPdfDoesNotContainText(page, 'hunter2');

      await standard.click();
      await expect(standard).toHaveAttribute('aria-checked', 'true');
      await waitForPdfRendered(page);

      // "hunter2" should now be found via search — it's only in ARKIV
      await assertPdfContainsText(page, 'hunter2');
    });

    test('switches back to redacted version when selecting Sladdet', async ({ page }) => {
      const selector = getVariantSelector(page);
      const sladdet = selector.getByRole('radio', { name: 'Sladdet', exact: true });

      await selector.getByRole('radio', { name: 'Standard' }).click();
      await waitForPdfRendered(page);
      await assertPdfContainsText(page, 'hunter2');

      await sladdet.click();
      await expect(sladdet).toHaveAttribute('aria-checked', 'true');
      await waitForPdfRendered(page);

      await assertPdfDoesNotContainText(page, 'hunter2');
    });
  });
});
