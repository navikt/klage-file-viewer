import {
  assertPdfContainsText,
  dragAcrossPage,
  getCopyTarget,
  VIEWER_SELECTOR,
  waitForPdfRendered,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';

const FORM_PDF_URL = '/?files=file%3Apdf-skjema.pdf';

/** Values entered into the form's fields on page 1. */
const FORM_VALUES = ['Test AS', '1234567890', 'Ola Nordmann', 'Adresseveien 1'];

/** A value that only exists once the widgets have been flattened into the page. */
const FLATTENED_MARKER = 'Test AS';

/** Top of the form down to the middle of the page, where the filled fields are. */
const SELECTION = { startX: 0.1, startY: 0.05, endX: 0.9, endY: 0.5 };

const HEADING_PATTERN = /<h[1-6]>(.*?)<\/h[1-6]>/g;

/**
 * `pdf-skjema.pdf` is a filled-in AcroForm. PDFium keeps the entered values in
 * the appearance stream of each widget annotation, outside the page content
 * stream, so `FPDFText_*` — and therefore search, selection and copy — cannot
 * see them unless the widgets are flattened into the page first.
 *
 * These tests lock in that the values behave like ordinary page text, while
 * the fields stay non-interactive.
 */
test.describe('PDF form fields', () => {
  test('pre-filled values are searchable', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(FORM_PDF_URL);
    await waitForPdfRendered(page);

    // Values entered into form fields.
    await assertPdfContainsText(page, 'Ola Nordmann');
    await assertPdfContainsText(page, '1234567890');

    // A static label from the page content stream — proves flattening did not
    // cost us the original text layer.
    await assertPdfContainsText(page, 'Virksomhetens organisasjonsnummer');
  });

  test('pre-filled values are selectable and copyable', async ({ page, context }) => {
    test.setTimeout(30_000);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(FORM_PDF_URL);
    await waitForPdfRendered(page);

    // Flattening runs in the background and the swap clears any selection made
    // against the original document, so wait for a field value to be findable.
    await assertPdfContainsText(page, FLATTENED_MARKER);

    // A match is scrolled to the centre of the viewport; put the page back.
    await page.locator(VIEWER_SELECTOR).evaluate((element) => element.scrollTo({ top: 0 }));

    const copyTarget = getCopyTarget(page);

    await expect.poll(async () => dragAcrossPage(page, SELECTION), { timeout: 10_000 }).not.toBe('');

    const copiedText = (await copyTarget.evaluate((el) => el.textContent ?? '')).replace(/\s+/g, ' ');

    for (const value of FORM_VALUES) {
      expect(copiedText).toContain(value);
    }

    // Two fields in one table row, reported back to back with no space.
    expect(copiedText).toContain('Ola Nordmann 01.01.1970');

    // Pasting into a rich-text target uses the `text/html` clipboard flavour.
    // Field values render at roughly the same size as the labels around them,
    // so none of them may come through as a heading.
    //
    // `execCommand('copy')` dispatches the same synchronous `copy` event that
    // Ctrl+C would, without depending on where keyboard focus happens to be.
    const html = await page.evaluate(async () => {
      document.execCommand('copy');

      const items = await navigator.clipboard.read();

      for (const item of items) {
        if (item.types.includes('text/html')) {
          return await (await item.getType('text/html')).text();
        }
      }

      return '';
    });

    // The form's own title is genuinely larger than the body text and may stay
    // a heading; the field values must not be, since they render at
    // essentially the same size as the labels beside them.
    const headingText = [...html.matchAll(HEADING_PATTERN)].map((match) => match[1] ?? '').join(' ');

    for (const value of FORM_VALUES) {
      expect(html).toContain(value);
      expect(headingText).not.toContain(value);
    }
  });

  test('form fields are not interactive', async ({ page }) => {
    await page.goto(FORM_PDF_URL);
    await waitForPdfRendered(page);

    // Pages are rasterised to canvas, so no form controls are ever mounted for
    // the widgets — there is nothing for a user to type into.
    const pageContent = page.locator('[data-klage-file-viewer-page-content]');
    await expect(pageContent.locator('input, textarea, select, [contenteditable]')).toHaveCount(0);
  });
});
