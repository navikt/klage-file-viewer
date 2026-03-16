import { expect, type Page } from '@playwright/test';

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
export const MATCH_COUNTER_REGEX = /^\d+ \/ \d+$/;
export const DOCUMENT_WITH_VARIANTS_URL = '/?files=doc%3AVedtak%20om%20tilbakekreving';
export const SINGLE_PDF_URL = '/?files=file%3AKlagevedtak.pdf';

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
 * Use {@link waitForPdfRendered} when a test depends on actual PDF rendering.
 */
export const waitForContent = async (page: Page) => {
  await page.locator(FILE_HEADER_SELECTOR).first().getByText(PAGE_COUNT_REGEX).waitFor({ state: 'visible' });
};

/**
 * Wait until at least one PDF page image has rendered.
 *
 * Since there is no text layer in the DOM, we cannot check for specific text
 * content directly. Instead, we wait for the page images to appear, which
 * proves the PDF was loaded and rendered successfully by the engine.
 *
 * For text content verification, use {@link assertPdfContainsText} which
 * programmatically drives the search UI.
 */
export const waitForPdfRendered = async (page: Page) => {
  await page.locator('[data-klage-file-viewer-page-number] canvas').first().waitFor({ state: 'visible' });
};

/**
 * @deprecated Use {@link waitForPdfRendered} instead. There is no longer a
 * text layer in the DOM, so this function now waits for the page image to
 * render rather than checking for specific text content.
 */
export const waitForPdfText = async (page: Page, _text: string) => {
  await waitForPdfRendered(page);
};

/**
 * Assert that the PDF contains the given text by driving the search UI.
 *
 * Opens the search input (Control+F), types the query, waits for a match
 * count indicator (e.g. "1 / 3"), then closes search. Fails the test if no
 * matches are found.
 */
export const assertPdfContainsText = async (page: Page, text: string) => {
  await openSearch(page);

  const searchInput = page.locator('[data-klage-file-viewer] input[type="search"]');
  await searchInput.fill(text);

  // Wait for the match counter to appear (e.g. "1 / 5")
  const matchCounter = page.locator('[data-klage-file-viewer]').getByText(MATCH_COUNTER_REGEX);
  await expect(matchCounter).toBeVisible({ timeout: 10_000 });

  await closeSearch(page);
};

/**
 * Assert that the PDF does NOT contain the given text by driving the search UI.
 *
 * Opens the search input (Control+F), types the query, waits briefly, then
 * verifies that the "Ingen treff" indicator appears (meaning zero matches).
 * Closes search afterward.
 */
export const assertPdfDoesNotContainText = async (page: Page, text: string) => {
  await openSearch(page);

  const searchInput = page.locator('[data-klage-file-viewer] input[type="search"]');
  await searchInput.fill(text);

  // Wait for "Ingen treff" (no matches) to appear
  const noMatches = page.locator('[data-klage-file-viewer]').getByText('Ingen treff');
  await expect(noMatches).toBeVisible({ timeout: 10_000 });

  await closeSearch(page);
};

const openSearch = async (page: Page) => {
  // If search is already open, just return
  const existingInput = page.locator('[data-klage-file-viewer] input[type="search"]');

  if ((await existingInput.count()) > 0 && (await existingInput.isVisible())) {
    return;
  }

  await focusViewer(page);
  await page.keyboard.press('Control+f');
  await existingInput.waitFor({ state: 'visible' });
};

const closeSearch = async (page: Page) => {
  await page.keyboard.press('Escape');
};
