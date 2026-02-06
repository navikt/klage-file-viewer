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
 * Measure the flex gap between the sticky header and the page content
 * by comparing the offset positions of the section and the pages container.
 *
 * Returns `{ headerHeight, gap }` where `gap` is the measured CSS gap
 * between the sticky header and the pages container within the section.
 */
const measureStickyLayout = (
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
): { headerHeight: number; gap: number } => {
  const section = pageElement.closest('section');

  if (section === null) {
    return { headerHeight: 0, gap: 0 };
  }

  const stickyHeader = section.querySelector<HTMLElement>('[data-sticky-header]');

  if (stickyHeader === null) {
    return { headerHeight: 0, gap: 0 };
  }

  const headerHeight = stickyHeader.offsetHeight;
  const pagesContainer = pageElement.parentElement;

  if (pagesContainer === null) {
    return { headerHeight, gap: 0 };
  }

  const sectionTop = getOffsetTop(section as HTMLElement, scrollContainer);
  const pagesContainerTop = getOffsetTop(pagesContainer, scrollContainer);
  const gap = pagesContainerTop - sectionTop - headerHeight;

  return { headerHeight, gap: Math.max(0, gap) };
};

/**
 * Find the page element (`[data-page-number]`) that is most visible inside the scroll container.
 * Returns `null` when no page elements exist.
 */
export const getMostVisiblePage = (scrollContainer: HTMLElement): HTMLDivElement | null => {
  const pages = scrollContainer.querySelectorAll<HTMLDivElement>('[data-page-number]');

  if (pages.length === 0) {
    return null;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  let bestElement: HTMLDivElement | null = null;
  let bestVisibleArea = 0;

  for (const page of pages) {
    const pageRect = page.getBoundingClientRect();

    const overlapTop = Math.max(containerRect.top, pageRect.top);
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
 * Measure the sticky header offset for a page element within a scroll container.
 *
 * The returned value is the total vertical space that should be reserved above
 * the page: the sticky header height plus two gaps — one between the header
 * and the pages container (which collapses visually when the header is stuck)
 * and one for visual breathing room below the header.
 */
export const getStickyHeaderOffset = (pageElement: HTMLElement, scrollContainer: HTMLElement): number => {
  const { headerHeight, gap } = measureStickyLayout(pageElement, scrollContainer);

  return headerHeight + 2 * gap;
};

/**
 * Compute the `scrollTop` value needed to position `pageElement` at the top
 * of the visible area inside `scrollContainer`, accounting for the sticky
 * header and layout gap.
 */
export const getPageScrollTop = (pageElement: HTMLElement, scrollContainer: HTMLElement): number => {
  const stickyHeaderOffset = getStickyHeaderOffset(pageElement, scrollContainer);

  return getOffsetTop(pageElement, scrollContainer) - stickyHeaderOffset;
};

/**
 * Scroll the `scrollContainer` so that `pageElement` is positioned at the top
 * of the visible area, accounting for the sticky header and layout gap.
 */
export const scrollToPage = (
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
  options?: { behavior?: ScrollBehavior },
): void => {
  const top = getPageScrollTop(pageElement, scrollContainer);

  scrollContainer.scrollTo({ top, behavior: options?.behavior });
};
