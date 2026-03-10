import type { Page } from '@playwright/test';

export const VIEWER_SELECTOR = '[data-klage-file-viewer]';
export const FILE_HEADER_SELECTOR = '[data-klage-file-viewer-file-header]';
export const PAGE_SELECTOR = '[data-klage-file-viewer-page-number]';
export const SECTION_SELECTOR = '[data-klage-file-viewer-section-index]';

export const PAGE_COUNT_REGEX = /Side \d+ av \d+/;
export const PAGE_COUNT_CAPTURE_REGEX = /Side (\d+) av (\d+)/;
export const NEXT_PAGE_REGEX = /neste side/i;
export const ZOOM_IN_REGEX = /zoom inn|forstørr/i;
export const ZOOM_OUT_REGEX = /zoom ut|forminsk/i;
export const THEME_BUTTON_REGEX = /lys|mørk/i;
export const DOCUMENT_COUNT_REGEX = /Dokument \d+ av \d+/;
export const DOCUMENT_COUNT_CAPTURE_REGEX = /Dokument (\d+) av (\d+)/;
export const INITIAL_SCALE = '125';
export const DOCUMENT_WITH_VARIANTS_URL = '/?files=doc%3AVedtak%20om%20tilbakekreving';
export const SINGLE_PDF_URL = '/?files=file%3AKlagevedtak.pdf';
export const TEXT_LAYER_SELECTOR = '.textLayer';

/**
 * Focus the viewer's keyboard handler container.
 *
 * `devices['Desktop Chrome']` uses a Windows user-agent, so the component's
 * `isMetaKey` helper checks `ctrlKey`. We therefore use the literal `Control`
 * modifier throughout (not `ControlOrMeta`, which Playwright resolves via the
 * *host* OS and would send `Meta` on macOS).
 *
 * The `onKeyDown` handler lives on the outer `<div tabindex="0">` inside the
 * `<section data-klage-file-viewer>`. Focusing it ensures every subsequent
 * `page.keyboard.press` dispatches through that handler.
 */
export const focusViewer = async (page: Page) => {
  const container = page.locator('[data-klage-file-viewer]');
  await container.focus();
};

/**
 * Wait until the viewer has loaded at least one file section and the page
 * counter is visible.
 *
 * Files are lazy-loaded section by section, so this only guarantees that the
 * *first* section has loaded — not that every section or every page has
 * rendered. Works for all file types (PDF, Excel, images).
 *
 * Use {@link waitForPdfText} when a test depends on actual PDF content.
 */
export const waitForContent = async (page: Page) => {
  await page.locator(FILE_HEADER_SELECTOR).first().getByText(PAGE_COUNT_REGEX).waitFor({ state: 'visible' });
};

/**
 * Wait until the PDF text layer has rendered and contains the expected text.
 *
 * PDF pages are lazy-loaded — only visible pages get a canvas and text layer.
 * The text layer is the *last* step of the render pipeline (canvas first, then
 * text extraction), so its presence with the expected content confirms the PDF
 * is fully rendered and interactive.
 *
 * Chromium 141 (Edge 142 equivalent) is noticeably slower at rendering PDFs
 * than the latest Chromium. Waiting for specific text avoids flaky timeouts
 * caused by asserting before the render pipeline finishes.
 */
export const waitForPdfText = async (page: Page, text: string) => {
  await page.locator(TEXT_LAYER_SELECTOR, { hasText: text }).first().waitFor({ state: 'visible' });
};
