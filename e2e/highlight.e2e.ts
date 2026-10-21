import { dragAcrossPage, SINGLE_PDF_URL, waitForPdfRendered } from '@e2e/helpers';
import { expect, type Page, test } from '@playwright/test';

const MARKER_HIGHLIGHT_SELECTOR = '[data-klage-file-viewer-marker-highlight]';
const SELECTION = { startX: 0.1, startY: 0.1, endX: 0.9, endY: 0.3 };

const getMarkerToggle = (page: Page) => page.getByRole('button', { name: 'Markeringstusj' });
const getHighlightsPanelButton = (page: Page) => page.getByRole('button', { name: 'Markeringer', exact: true });
const getStoredHighlightCount = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{"highlights":[]}').highlights.length,
    `klage-file-viewer/${Buffer.from('/Klagevedtak.pdf').toString('base64url')}/highlights`,
  );

const MULTI_PDF_FILES = ['Klagevedtak.pdf', 'Notat.pdf', 'Vedleggsoversikt.pdf'];
const MULTI_PDF_URL = `/?files=${MULTI_PDF_FILES.map((file) => encodeURIComponent(`file:${file}`)).join(',')}`;
const SEEDED_HIGHLIGHT_ID = 'seeded-highlight';
const SEEDED_HIGHLIGHT_TEXT = 'Seeded highlight';

/** Store a highlight for the last document, which isn't loaded until scrolled to. */
const seedHighlightInLastDocument = (page: Page) =>
  seedHighlights(page, `/${MULTI_PDF_FILES.at(-1) ?? ''}`, [
    createSeededHighlight(SEEDED_HIGHLIGHT_ID, SEEDED_HIGHLIGHT_TEXT, { x: 0.1, y: 0.5, width: 0.5, height: 0.02 }),
  ]);

const createSeededHighlight = (
  id: string,
  text: string,
  rect: { x: number; y: number; width: number; height: number },
) => ({ id, pageIndex: 0, source: 'pdf', rects: [rect], text, createdAt: 0 });

type SeededHighlight = ReturnType<typeof createSeededHighlight> & { blocks?: unknown[] };

const seedHighlights = async (page: Page, url: string, highlights: SeededHighlight[]) => {
  const key = `klage-file-viewer/${Buffer.from(url).toString('base64url')}/highlights`;
  const value = JSON.stringify({ highlights, removedIds: [] });

  await page.addInitScript(({ storageKey, storageValue }) => localStorage.setItem(storageKey, storageValue), {
    storageKey: key,
    storageValue: value,
  });
};

/**
 * Geometry reaches the selection overlay asynchronously, so the first drag can
 * land before there is any text to select. Drag until a highlight appears —
 * repeated identical highlights are merged, so retries never add duplicates.
 */
const highlightByDragging = async (page: Page) => {
  const highlights = page.locator(MARKER_HIGHLIGHT_SELECTOR);

  await expect
    .poll(
      async () => {
        await dragAcrossPage(page, SELECTION);

        return highlights.count();
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
};

const clickFirstHighlight = async (page: Page) => {
  const box = await page.locator(MARKER_HIGHLIGHT_SELECTOR).first().boundingBox();

  if (box === null) {
    throw new Error('Marker highlight bounding box not available');
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

/** Returns empty values while the clipboard changes under the read (Chromium throws `InvalidStateError`), so polls retry. */
const readClipboardTypes = async (): Promise<{ plain: string; html: string }> => {
  try {
    const [item] = await navigator.clipboard.read();

    if (item === undefined) {
      return { plain: '', html: '' };
    }

    const read = async (type: string) => (item.types.includes(type) ? (await item.getType(type)).text() : '');

    return { plain: await read('text/plain'), html: await read('text/html') };
  } catch {
    return { plain: '', html: '' };
  }
};

test.describe('marker highlights', () => {
  test('highlights selected text, persists it and resets marker mode on reload', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    const toggle = getMarkerToggle(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await highlightByDragging(page);
    const count = await page.locator(MARKER_HIGHLIGHT_SELECTOR).count();
    await expect.poll(() => getStoredHighlightCount(page)).toBeGreaterThan(0);

    await page.reload();
    await waitForPdfRendered(page);

    await expect(page.locator(MARKER_HIGHLIGHT_SELECTOR)).toHaveCount(count);
    await expect(getMarkerToggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a highlight removes it only in marker mode', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    const toggle = getMarkerToggle(page);
    await toggle.click();
    await highlightByDragging(page);

    await toggle.click();
    await clickFirstHighlight(page);
    await expect(page.locator(MARKER_HIGHLIGHT_SELECTOR).first()).toBeVisible();

    await toggle.click();
    await clickFirstHighlight(page);
    await expect(page.locator(MARKER_HIGHLIGHT_SELECTOR)).toHaveCount(0);
  });

  test('a triple-click produces one highlight rather than overlapping word and line highlights', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    const highlights = page.locator(MARKER_HIGHLIGHT_SELECTOR);
    await getMarkerToggle(page).click();
    // Dragging first makes sure the page's text geometry is ready.
    await highlightByDragging(page);
    const box = await highlights.first().boundingBox();

    if (box === null) {
      throw new Error('Marker highlight bounding box not available');
    }

    await clickFirstHighlight(page);
    await expect(highlights).toHaveCount(0);

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
    await expect(highlights).toHaveCount(1);
  });

  test('Escape turns off marker mode, but closes the highlight list first', async ({ page }) => {
    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    const toggle = getMarkerToggle(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await getHighlightsPanelButton(page).click();
    await expect(page.getByRole('heading', { name: 'Markeringer' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Markeringer' })).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.locator('[data-klage-file-viewer]').focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('highlight list shows highlights and updates when they change', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    const panelButton = getHighlightsPanelButton(page);
    const emptyMessage = page.getByText('Ingen markeringer ennå.', { exact: false });
    await panelButton.click();
    await expect(panelButton).toHaveAttribute('aria-expanded', 'true');
    await expect(emptyMessage).toBeVisible();

    // Clicking outside closes the list.
    await getMarkerToggle(page).click();
    await expect(panelButton).toHaveAttribute('aria-expanded', 'false');

    await highlightByDragging(page);
    await panelButton.click();

    const items = page.getByRole('region', { name: 'Markeringer i Klagevedtak' }).getByRole('listitem');
    await expect(items).not.toHaveCount(0);
    await expect(items.first()).toContainText('Side 1');
    await expect(panelButton).toHaveAccessibleDescription(`Skjul markeringer (${(await items.count()).toString(10)})`);

    await page.getByRole('button', { name: 'Fjern alle markeringer i Klagevedtak' }).click();
    await expect(emptyMessage).toBeVisible();
  });

  test('clicking a listed highlight loads its document and scrolls to it', async ({ page }) => {
    test.setTimeout(30_000);

    await seedHighlightInLastDocument(page);
    await page.goto(MULTI_PDF_URL);
    await waitForPdfRendered(page);

    const highlight = page.locator(`[data-klage-file-viewer-marker-highlight="${SEEDED_HIGHLIGHT_ID}"]`);
    await expect(highlight).toHaveCount(0);

    await getHighlightsPanelButton(page).click();
    await page.getByRole('button', { name: SEEDED_HIGHLIGHT_TEXT }).click();

    await expect(highlight).toBeInViewport();
  });

  test('a listed highlight pulses above overlapping highlights', async ({ page }) => {
    await seedHighlights(page, '/Klagevedtak.pdf', [
      createSeededHighlight('covered', 'Covered highlight', { x: 0.1, y: 0.5, width: 0.4, height: 0.02 }),
      createSeededHighlight('covering', 'Covering highlight', { x: 0.1, y: 0.5, width: 0.5, height: 0.02 }),
    ]);
    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    const covered = page.locator('[data-klage-file-viewer-marker-highlight="covered"]');
    await expect(covered).toHaveCSS('z-index', 'auto');

    await getHighlightsPanelButton(page).click();
    await page.getByRole('button', { name: 'Covered highlight' }).click();

    // Later highlights are drawn on top, so the pulsing one is lifted while the pulse lasts.
    await expect(covered).toHaveCSS('z-index', '1');
    await expect(covered).toHaveCSS('z-index', 'auto');
  });

  test('copies a highlight with the same formatting as a document selection', async ({ page, context }) => {
    test.setTimeout(30_000);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    await getMarkerToggle(page).click();
    await highlightByDragging(page);

    await getHighlightsPanelButton(page).click();
    const copyButton = page.getByRole('button', { name: 'Kopier tekst på side 1' });
    await copyButton.click();
    // Shown once the clipboard write has finished.
    await expect(copyButton).toHaveAccessibleDescription('Kopiert');

    await expect
      .poll(() => page.evaluate(readClipboardTypes), { timeout: 5_000 })
      .toEqual({
        html: expect.stringContaining('<p>'),
        plain: expect.not.stringContaining('<p>'),
      });

    const { plain } = await page.evaluate(readClipboardTypes);
    expect(plain.trim().length).toBeGreaterThan(0);
  });

  test('shows the formatting of a highlight in the list', async ({ page }) => {
    await seedHighlights(page, '/Klagevedtak.pdf', [
      {
        ...createSeededHighlight('formatted', 'Vedtak Klagen tas ikke til følge.', {
          x: 0.1,
          y: 0.2,
          width: 0.5,
          height: 0.02,
        }),
        blocks: [
          {
            kind: 'heading',
            spans: [{ text: 'Vedtak', bold: true, italic: false }],
            level: 0,
            headingLevel: 1,
            gapBefore: false,
          },
          {
            kind: 'listItem',
            spans: [
              { text: 'Klagen tas ', bold: false, italic: false },
              { text: 'ikke', bold: false, italic: true },
              { text: ' til følge.', bold: false, italic: false },
            ],
            level: 1,
            headingLevel: 0,
            gapBefore: true,
          },
        ],
      },
    ]);
    await page.goto(SINGLE_PDF_URL);
    await waitForPdfRendered(page);

    await getHighlightsPanelButton(page).click();
    const item = page.getByRole('listitem');

    await expect(item.locator('strong')).toHaveText('Vedtak');
    await expect(item.locator('em')).toHaveText('ikke');
    await expect(item).toContainText('• Klagen tas ikke til følge.');
  });

  test('removes a highlight from the list', async ({ page }) => {
    test.setTimeout(30_000);

    await seedHighlightInLastDocument(page);
    await page.goto(MULTI_PDF_URL);
    await waitForPdfRendered(page);

    const panelButton = getHighlightsPanelButton(page);
    await panelButton.click();
    await page.getByRole('button', { name: 'Fjern markering på side 1' }).click();

    await expect(page.getByText('Ingen markeringer ennå.', { exact: false })).toBeVisible();
    await expect(panelButton).toBeFocused();
  });
});
