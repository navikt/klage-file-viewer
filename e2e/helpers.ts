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
