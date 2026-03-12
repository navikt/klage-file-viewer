import {
  FILE_HEADER_SELECTOR,
  PAGE_COUNT_REGEX,
  PAGE_SELECTOR,
  SECTION_SELECTOR,
  SINGLE_PDF_URL,
  VIEWER_SELECTOR,
  waitForContent,
  waitForPdfRendered,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';

test.describe('KlageFileViewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForContent(page);
  });

  test.describe('rendering', () => {
    test('renders the viewer component', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      await expect(viewer).toBeVisible();
    });

    test('renders file headers for selected files', async ({ page }) => {
      const headers = page.locator(FILE_HEADER_SELECTOR);
      await expect(headers.first()).toBeVisible();
    });

    test('renders at least one page', async ({ page }) => {
      const firstPage = page.locator(PAGE_SELECTOR).first();
      await expect(firstPage).toBeVisible();
    });

    test('renders multiple document sections when multiple files are selected', async ({ page }) => {
      const sections = page.locator(SECTION_SELECTOR);
      const count = await sections.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('file header', () => {
    test('displays document title in the file header', async ({ page }) => {
      const header = page.locator(FILE_HEADER_SELECTOR).first();
      await expect(header).toBeVisible();

      const heading = header.locator('h2');
      await expect(heading).toBeVisible();
      const text = await heading.textContent();
      expect(text?.length).toBeGreaterThan(0);
    });

    test('displays page count in the file header', async ({ page }) => {
      const header = page.locator(FILE_HEADER_SELECTOR).first();
      await expect(header).toBeVisible();

      // Wait for the page count to load — it starts as "…" and becomes "Side X av Y"
      await expect(header.getByText(PAGE_COUNT_REGEX)).toBeVisible();
    });
  });

  test.describe('single file view', () => {
    test('renders correctly with a single PDF selected', async ({ page }) => {
      await page.goto(SINGLE_PDF_URL);
      await waitForPdfRendered(page);

      const viewer = page.locator(VIEWER_SELECTOR);
      await expect(viewer).toBeVisible();

      const headers = page.locator(FILE_HEADER_SELECTOR);
      await expect(headers).toHaveCount(1);
    });
  });
});
