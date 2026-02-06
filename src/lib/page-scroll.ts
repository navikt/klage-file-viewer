/**
 * Compute the vertical offset of `element` relative to `ancestor` by walking
 * the `offsetParent` chain. Returns 0 when the ancestor is not found in the chain.
 */
const getOffsetTop = (element: HTMLElement, ancestor: HTMLElement): number => {
  let offset = 0;
  let current: HTMLElement | null = element;

  while (current !== null && current !== ancestor) {
    offset += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }

  return offset;
};

/**
 * Measure the file header height and the CSS row-gap of the section
 * containing the given page element.
 *
 * Returns `{ headerHeight, gap }` where `gap` is the CSS `row-gap` value
 * of the section's flex layout.
 */
const measureFileHeaderLayout = (pageElement: HTMLElement): { headerHeight: number; gap: number } => {
  const section = pageElement.closest('section');

  if (section === null) {
    return { headerHeight: 0, gap: 0 };
  }

  const fileHeader = section.querySelector<HTMLElement>('[data-klage-file-viewer-file-header]');

  if (fileHeader === null) {
    return { headerHeight: 0, gap: 0 };
  }

  const headerHeight = fileHeader.offsetHeight;
  const gap = Number.parseFloat(getComputedStyle(section).rowGap) || 0;

  return { headerHeight, gap };
};

/**
 * Find the page element (`[data-klage-file-viewer-page-number]`) that is most visible inside the scroll container.
 * Returns `null` when no page elements exist.
 *
 * The visible area is adjusted for the sticky toolbar at the top of the
 * scroll container — any portion of a page hidden behind the toolbar is
 * not counted as visible.
 */
export const getMostVisiblePage = (scrollContainer: HTMLElement, toolbarHeight: number): HTMLDivElement | null => {
  const pages = scrollContainer.querySelectorAll<HTMLDivElement>('[data-klage-file-viewer-page-number]');

  if (pages.length === 0) {
    return null;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const visibleTop = containerRect.top + toolbarHeight;

  let bestElement: HTMLDivElement | null = null;
  let bestVisibleArea = 0;

  for (const page of pages) {
    const pageRect = page.getBoundingClientRect();

    const overlapTop = Math.max(visibleTop, pageRect.top);
    const overlapBottom = Math.min(containerRect.bottom, pageRect.bottom);
    const overlapLeft = Math.max(containerRect.left, pageRect.left);
    const overlapRight = Math.min(containerRect.right, pageRect.right);

    const visibleHeight = Math.max(0, overlapBottom - overlapTop);
    const visibleWidth = Math.max(0, overlapRight - overlapLeft);
    const visibleArea = visibleHeight * visibleWidth;

    if (visibleArea > bestVisibleArea) {
      bestVisibleArea = visibleArea;
      bestElement = page;
    }
  }

  return bestElement;
};

/**
 * Measure the file header offset for a page element within a scroll container.
 *
 * The returned value is the total vertical space that should be reserved above
 * the page: the file header height plus two gaps — one between the header
 * and the pages container (which collapses visually when the header is stuck)
 * and one for visual breathing room below the header.
 */
export const getFileHeaderOffset = (pageElement: HTMLElement): number => {
  const { headerHeight, gap } = measureFileHeaderLayout(pageElement);

  return headerHeight + 2 * gap;
};

/**
 * Compute the `scrollTop` value needed to position `pageElement` at the top
 * of the visible area inside `scrollContainer`, accounting for the sticky
 * toolbar, file header, and layout gap.
 */
export const getPageScrollTop = (
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
  toolbarHeight: number,
): number => {
  const fileHeaderOffset = getFileHeaderOffset(pageElement);

  return getOffsetTop(pageElement, scrollContainer) - fileHeaderOffset - toolbarHeight;
};

/**
 * Scroll the `scrollContainer` so that `pageElement` is positioned at the top
 * of the visible area, accounting for the sticky toolbar, file header, and
 * layout gap.
 */
export const scrollToPage = (
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
  toolbarHeight: number,
  options?: { behavior?: ScrollBehavior },
): void => {
  const top = getPageScrollTop(pageElement, scrollContainer, toolbarHeight);

  scrollContainer.scrollTo({ top, behavior: options?.behavior });
};
