import { clamp } from '@/lib/clamp';
import { getFileHeaderOffset, getMostVisiblePage } from '@/lib/page-scroll';
import { MAX_SCALE, MIN_SCALE } from '@/scale/constants';

/**
 * Find the most visible scalable page element inside the scroll container.
 * Returns `null` when no scalable page is visible.
 */
export const getScalablePage = (scrollContainer: HTMLElement, toolbarHeight: number): HTMLDivElement | null => {
  const pageElement = getMostVisiblePage(scrollContainer, toolbarHeight);

  if (pageElement === null || !pageElement.hasAttribute('data-klage-file-viewer-scalable')) {
    return null;
  }

  return pageElement;
};

/**
 * Find the first scalable page element inside the scroll container by DOM order,
 * regardless of whether it is scrolled into view.
 * Returns `null` when no scalable page exists.
 */
export const getFirstScalablePage = (scrollContainer: HTMLElement): HTMLDivElement | null =>
  scrollContainer.querySelector<HTMLDivElement>('[data-klage-file-viewer-scalable]');

/**
 * Measure the rendered content dimensions of a scalable page element.
 *
 * The page element itself has `w-full` so its `offsetWidth` reflects the
 * container width, not the actual content width. The element marked with
 * `data-klage-file-viewer-content` carries the real content dimensions
 * (the sized wrapper for PDFs, the `<img>` for images).
 *
 * Returns `null` when the content element cannot be found or has zero size.
 */
const getContentDimensions = (pageElement: HTMLElement): { width: number; height: number } | null => {
  const contentElement = pageElement.querySelector<HTMLElement>('[data-klage-file-viewer-content]');

  if (contentElement === null) {
    return null;
  }

  const { width, height } = contentElement.getBoundingClientRect();

  if (width === 0 || height === 0) {
    return null;
  }

  return { width, height };
};

/**
 * Compute the available width and height inside the scroll container for a
 * given page element.
 *
 * - Height accounts for the sticky toolbar and the file header offset
 *   (header height + gaps).
 * - Width uses the page element's own `clientWidth` since it stretches to
 *   fill its parent (`w-full`), giving us the true available horizontal space.
 */
const getAvailableDimensions = (
  pageElement: HTMLElement,
  container: HTMLElement,
  toolbarHeight: number,
): { width: number; height: number } => {
  const fileHeaderOffset = getFileHeaderOffset(pageElement);
  const availableHeight = container.clientHeight - fileHeaderOffset - toolbarHeight;
  const availableWidth = pageElement.clientWidth;

  return { width: availableWidth, height: availableHeight };
};

/**
 * Calculate the clamped scale percentage that makes the page content fit
 * the available width of the scroll container.
 *
 * Returns `null` when the page or its content cannot be measured.
 */
export const computeFitWidthScale = (
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
  currentScale: number,
  toolbarHeight: number,
): number | null => {
  const content = getContentDimensions(pageElement);

  if (content === null) {
    return null;
  }

  const available = getAvailableDimensions(pageElement, scrollContainer, toolbarHeight);
  const unscaledWidth = content.width / (currentScale / 100);
  const fitScale = (available.width / unscaledWidth) * 100;

  return clamp(fitScale, MIN_SCALE, MAX_SCALE);
};

/**
 * Calculate the clamped scale percentage that makes the page content fit
 * the available height of the scroll container.
 *
 * Returns `null` when the page or its content cannot be measured.
 */
export const computeFitHeightScale = (
  pageElement: HTMLElement,
  container: HTMLElement,
  currentScale: number,
  toolbarHeight: number,
): number | null => {
  const content = getContentDimensions(pageElement);

  if (content === null) {
    return null;
  }

  const available = getAvailableDimensions(pageElement, container, toolbarHeight);
  const unscaledHeight = content.height / (currentScale / 100);
  const fitScale = (available.height / unscaledHeight) * 100;

  return clamp(fitScale, MIN_SCALE, MAX_SCALE);
};

/**
 * Compute the viewer width needed to exactly fit the current content.
 *
 * All file types follow the same DOM pattern:
 *   [data-klage-file-viewer-scalable]  (page element, w-full)
 *     > overflow-x-auto wrapper
 *       > [data-klage-file-viewer-content]  (w-fit)
 *
 * For shadow-bearing content (Excel, JSON, Image) a `px-2` scroll-margin
 * wrapper holds the content element. This padding is included in the
 * bounding rect measurement so shadows are visible at scroll edges.
 *
 * The formula only adds external overhead (scrollbar, borders) between
 * the scroll container's outer edge and the page element's content area.
 *
 * Returns the target viewer width in pixels, or `null` when no page or
 * content can be measured.
 */
export const computeFitToContentWidth = (scrollContainer: HTMLElement, toolbarHeight: number): number | null => {
  const pageElement = getScalablePage(scrollContainer, toolbarHeight);

  if (pageElement === null) {
    return null;
  }

  const content = getContentDimensions(pageElement);

  if (content === null) {
    return null;
  }

  const overhead = scrollContainer.offsetWidth - pageElement.clientWidth;

  return Math.ceil(content.width) + overhead;
};
