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
 * container width, not the actual content width. The first child element
 * (the `w-fit` wrapper around the canvas) carries the real content dimensions.
 *
 * Returns `null` when the content element cannot be found or has zero size.
 */
const getContentDimensions = (pageElement: HTMLElement): { width: number; height: number } | null => {
  const contentElement = pageElement.firstElementChild;

  if (contentElement === null || !(contentElement instanceof HTMLElement)) {
    return null;
  }

  const width = contentElement.offsetWidth;
  const height = contentElement.offsetHeight;

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
  const fitScale = Math.floor((available.width / unscaledWidth) * 100);

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
  const fitScale = Math.floor((available.height / unscaledHeight) * 100);

  return clamp(fitScale, MIN_SCALE, MAX_SCALE);
};
