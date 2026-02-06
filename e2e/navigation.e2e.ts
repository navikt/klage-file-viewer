import {
  DOCUMENT_COUNT_CAPTURE_REGEX,
  DOCUMENT_COUNT_REGEX,
  FILE_HEADER_SELECTOR,
  focusViewer,
  NEXT_PAGE_REGEX,
  PAGE_COUNT_CAPTURE_REGEX,
  PAGE_COUNT_REGEX,
  SINGLE_PDF_URL,
  VIEWER_SELECTOR,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(VIEWER_SELECTOR);
  });

  test.describe('navigation', () => {
    test('can navigate to next page within a document', async ({ page }) => {
      const header = page.locator(FILE_HEADER_SELECTOR).first();
      await expect(header.getByText(PAGE_COUNT_REGEX)).toBeVisible();

      const pageTag = header.getByText(PAGE_COUNT_REGEX);
      const initialText = await pageTag.textContent();

      // Only test navigation if the document has more than one page
      const match = initialText?.match(PAGE_COUNT_CAPTURE_REGEX);

      if (match !== null && match !== undefined) {
        const totalPages = Number.parseInt(match[2] ?? '1', 10);

        if (totalPages > 1) {
          const nextButton = header.getByRole('button', { name: NEXT_PAGE_REGEX });
          await expect(nextButton).toBeVisible();
          await nextButton.click();

          await expect(pageTag).not.toHaveText(initialText ?? '');
        }
      }
    });
  });

  test.describe('keyboard shortcuts', () => {
    test('opens search with Control+F on a single PDF', async ({ page }) => {
      // Search is only available when a single PDF is displayed
      await page.goto(SINGLE_PDF_URL);
      await page.waitForSelector(VIEWER_SELECTOR);

      await focusViewer(page);
      await page.keyboard.press('Control+f');

      // The search input is type="search", distinct from the scale input (type="text")
      const searchInput = page.locator('[data-klage-file-viewer] input[type="search"]');
      await expect(searchInput).toBeVisible();
    });

    test('navigates to next page with Control+ArrowDown', async ({ page }) => {
      // Use a single multi-page PDF — full-height pages make scroll-based visibility detection reliable
      await page.goto(SINGLE_PDF_URL);
      await page.waitForSelector(VIEWER_SELECTOR);

      const header = page.locator(FILE_HEADER_SELECTOR).first();
      await expect(header.getByText(PAGE_COUNT_REGEX)).toBeVisible();

      const pageTag = header.getByText(PAGE_COUNT_REGEX);
      const initialText = await pageTag.textContent();
      const match = initialText?.match(PAGE_COUNT_CAPTURE_REGEX);

      if (match !== null && match !== undefined) {
        const currentPage = Number.parseInt(match[1] ?? '1', 10);
        const totalPages = Number.parseInt(match[2] ?? '1', 10);

        if (totalPages > 1) {
          await focusViewer(page);
          await page.keyboard.press('Control+ArrowDown');

          await expect(pageTag).not.toHaveText(initialText ?? '');
          const updatedText = await pageTag.textContent();
          const updatedMatch = updatedText?.match(PAGE_COUNT_CAPTURE_REGEX);
          const updatedPage = Number.parseInt(updatedMatch?.[1] ?? '0', 10);
          expect(updatedPage).toBeGreaterThan(currentPage);
        }
      }
    });

    test('navigates to previous page with Control+ArrowUp', async ({ page }) => {
      // Use a single multi-page PDF — full-height pages make scroll-based visibility detection reliable
      await page.goto(SINGLE_PDF_URL);
      await page.waitForSelector(VIEWER_SELECTOR);

      const header = page.locator(FILE_HEADER_SELECTOR).first();
      await expect(header.getByText(PAGE_COUNT_REGEX)).toBeVisible();

      const pageTag = header.getByText(PAGE_COUNT_REGEX);
      const initialText = await pageTag.textContent();
      const match = initialText?.match(PAGE_COUNT_CAPTURE_REGEX);

      if (match !== null && match !== undefined) {
        const totalPages = Number.parseInt(match[2] ?? '1', 10);

        if (totalPages > 1) {
          await focusViewer(page);

          // Navigate forward first so there is a previous page to go back to
          await page.keyboard.press('Control+ArrowDown');
          await expect(pageTag).not.toHaveText(initialText ?? '');

          const afterForward = await pageTag.textContent();

          // Re-focus after scroll so the keydown handler receives the next keypress
          await focusViewer(page);
          await page.keyboard.press('Control+ArrowUp');
          await expect(pageTag).not.toHaveText(afterForward ?? '');

          const updatedText = await pageTag.textContent();
          const afterForwardMatch = afterForward?.match(PAGE_COUNT_CAPTURE_REGEX);
          const updatedMatch = updatedText?.match(PAGE_COUNT_CAPTURE_REGEX);
          const forwardPage = Number.parseInt(afterForwardMatch?.[1] ?? '0', 10);
          const backPage = Number.parseInt(updatedMatch?.[1] ?? '0', 10);
          expect(backPage).toBeLessThan(forwardPage);
        }
      }
    });

    test('navigates to next document with Control+Shift+ArrowDown', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      const documentTag = viewer.getByText(DOCUMENT_COUNT_REGEX);
      await expect(documentTag).toBeVisible();

      const initialText = await documentTag.textContent();
      const match = initialText?.match(DOCUMENT_COUNT_CAPTURE_REGEX);

      if (match !== null && match !== undefined) {
        const totalDocs = Number.parseInt(match[2] ?? '1', 10);

        if (totalDocs > 1) {
          await focusViewer(page);
          await page.keyboard.press('Control+Shift+ArrowDown');

          await expect(documentTag).not.toHaveText(initialText ?? '');
          const updatedText = await documentTag.textContent();
          const updatedMatch = updatedText?.match(DOCUMENT_COUNT_CAPTURE_REGEX);
          const updatedDoc = Number.parseInt(updatedMatch?.[1] ?? '0', 10);
          expect(updatedDoc).toBeGreaterThan(1);
        }
      }
    });

    test('navigates to previous document with Control+Shift+ArrowUp', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      const documentTag = viewer.getByText(DOCUMENT_COUNT_REGEX);
      await expect(documentTag).toBeVisible();

      const initialText = await documentTag.textContent();
      const match = initialText?.match(DOCUMENT_COUNT_CAPTURE_REGEX);

      if (match !== null && match !== undefined) {
        const totalDocs = Number.parseInt(match[2] ?? '1', 10);

        if (totalDocs > 1) {
          await focusViewer(page);

          // Navigate forward first, then back
          await page.keyboard.press('Control+Shift+ArrowDown');
          await expect(documentTag).not.toHaveText(initialText ?? '');

          const afterForward = await documentTag.textContent();

          await focusViewer(page);
          await page.keyboard.press('Control+Shift+ArrowUp');
          await expect(documentTag).not.toHaveText(afterForward ?? '');

          const updatedText = await documentTag.textContent();
          const updatedMatch = updatedText?.match(DOCUMENT_COUNT_CAPTURE_REGEX);
          const afterForwardMatch = afterForward?.match(DOCUMENT_COUNT_CAPTURE_REGEX);
          const backDoc = Number.parseInt(updatedMatch?.[1] ?? '0', 10);
          const forwardDoc = Number.parseInt(afterForwardMatch?.[1] ?? '0', 10);
          expect(backDoc).toBeLessThan(forwardDoc);
        }
      }
    });
  });
});
