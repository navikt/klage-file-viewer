import {
  assertPdfContainsText,
  assertPdfDoesNotContainText,
  DOCUMENT_WITH_FULLVERSJON_URL,
  getFileToolbars,
  getVariantSelector,
  waitForContent,
  waitForPdfRendered,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';

const DOWNLOAD_TOOLTIP_REGEX = /Last ned \(\d+(,\d)?\s(B|kB|MB)\)/;

test.describe('KlageFileViewer', () => {
  test.describe('fullversjon toggle', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate directly to the document with ARKIV, SLADDET and FULLVERSJON variants
      await page.goto(DOCUMENT_WITH_FULLVERSJON_URL);
      await waitForContent(page);
      await waitForPdfRendered(page);
    });

    test('shows all variants in the variant selector', async ({ page }) => {
      const selector = getVariantSelector(page);

      const radios = selector.getByRole('radio');

      await expect(radios).toHaveCount(3);
      await expect(radios.nth(0)).toHaveAccessibleName('Sladdet');
      await expect(radios.nth(1)).toHaveAccessibleName('Usladdet');
      await expect(radios.nth(2)).toHaveAccessibleName('Fullversjon');
      await expect(selector.getByRole('radio', { name: 'Sladdet', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    test('switches from redacted to fullversjon and back to arkiv', async ({ page }) => {
      const selector = getVariantSelector(page);
      const fullversjon = selector.getByRole('radio', { name: 'Fullversjon' });
      const usladdet = selector.getByRole('radio', { name: 'Usladdet' });

      await assertPdfDoesNotContainText(page, 'fullversjonen');

      await fullversjon.click();
      await expect(fullversjon).toHaveAttribute('aria-checked', 'true');
      await waitForPdfRendered(page);
      await assertPdfContainsText(page, 'fullversjonen');

      await usladdet.click();
      await expect(usladdet).toHaveAttribute('aria-checked', 'true');
      await expect(fullversjon).toHaveAttribute('aria-checked', 'false');
      await waitForPdfRendered(page);
      await assertPdfContainsText(page, 'hunter2');
      await assertPdfDoesNotContainText(page, 'fullversjonen');
    });

    test('shows file size in download tooltip', async ({ page }) => {
      const toolbar = getFileToolbars(page).first();

      await toolbar.locator('a[href*="/api/download"]').hover();

      await expect(page.getByRole('tooltip')).toHaveText(DOWNLOAD_TOOLTIP_REGEX);
    });
  });
});
