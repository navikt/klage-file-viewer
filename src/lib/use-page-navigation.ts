import { useCallback, useEffect, useRef, useState } from 'react';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { getPageScrollTop } from '@/lib/page-scroll';
import { useToolbarHeight } from '@/toolbar-height-context';

/**
 * Check whether the scroll container has been scrolled to (or past) the
 * reading position for the given element. The reading position is where
 * `scrollToPage` would place the element – right below the file header.
 */
const hasReachedItem = (element: HTMLElement, scrollContainer: HTMLElement, toolbarHeight: number): boolean =>
  scrollContainer.scrollTop >= getPageScrollTop(element, scrollContainer, toolbarHeight) - 1;

/**
 * Check whether the scroll container has been scrolled completely past the
 * given element (the element is entirely above the viewport).
 */
const hasPassedItem = (element: HTMLElement, scrollContainer: HTMLElement, toolbarHeight: number): boolean =>
  scrollContainer.scrollTop > getPageScrollTop(element, scrollContainer, toolbarHeight) + element.offsetHeight;

interface UsePageNavigationReturn {
  /** 1-based index of the most-visible item determined by the intersection observer. */
  currentPage: number;
  /** Navigate to a specific 1-based page number (clamped). */
  navigateToPage: (page: number) => void;
  /** Callback for the "previous page" button. `undefined` when there are no items. */
  onPreviousPage: (() => void) | undefined;
  /** Callback for the "next page" button. `undefined` when there are no items. */
  onNextPage: (() => void) | undefined;
  /** Whether the previous-page button should be disabled. */
  previousPageDisabled: boolean;
  /** Whether the next-page button should be disabled. */
  nextPageDisabled: boolean;
  /**
   * Ref setter for item elements. Call this for each item to register /
   * unregister its DOM element. Elements **must** have a
   * `data-klage-file-viewer-page-number` attribute with their 1-based index.
   */
  setItemRef: (itemNumber: number, element: HTMLDivElement | null) => void;
}

/**
 * Shared hook that implements page / sheet navigation with:
 *
 * 1. An `IntersectionObserver` that tracks the most-visible item.
 * 2. A stable "target" page with debounced sync so rapid button clicks
 *    accumulate without being overwritten by intermediate observer events.
 * 3. `onPreviousPage` / `onNextPage` handlers that account for partial
 *    scrolling (re-scrolls to the current target when it hasn't been fully
 *    reached or has been scrolled past).
 */
export const usePageNavigation = (
  pageCount: number,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
): UsePageNavigationReturn => {
  const scrollToPage = useScrollToPage();
  const toolbarHeight = useToolbarHeight();
  const [currentPage, setCurrentPage] = useState(1);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Track the most-visible item within this section
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null || pageCount === 0) {
      return;
    }

    const ratios = new Map<Element, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target, entry.intersectionRatio);
        }

        let maxVisibility = 0;
        let mostVisibleItem = 1;

        for (const [element, ratio] of ratios) {
          if (ratio > maxVisibility) {
            maxVisibility = ratio;
            mostVisibleItem = Number.parseInt(element.getAttribute('data-klage-file-viewer-page-number') ?? '1', 10);
          }
        }

        if (maxVisibility > 0) {
          setCurrentPage(mostVisibleItem);
        }
      },
      {
        root: scrollContainer,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const ref of itemRefs.current.values()) {
      observer.observe(ref);
    }

    return () => observer.disconnect();
  }, [pageCount, scrollContainerRef]);

  // Page navigation with stable target tracking
  // `targetPage` is state (for rendering the disabled state without flicker)
  // and mirrored in a ref (so rapid clicks accumulate without waiting for re-renders).
  const [targetPage, setTargetPage] = useState(currentPage);
  const targetPageRef = useRef(currentPage);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced sync: after scrolling settles, align targetPage with currentPage.
  // During a button-triggered smooth scroll the observer fires for intermediate
  // pages – the debounce prevents those transient values from resetting the target.
  useEffect(() => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      targetPageRef.current = currentPage;
      setTargetPage(currentPage);
    }, 150);

    return () => clearTimeout(syncTimerRef.current);
  }, [currentPage]);

  const navigateToPage = useCallback(
    (page: number) => {
      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null) {
        return;
      }

      const clamped = Math.max(1, Math.min(page, pageCount));

      const itemElement = itemRefs.current.get(clamped);

      if (itemElement === undefined) {
        return;
      }

      const desiredTop = getPageScrollTop(itemElement, scrollContainer, toolbarHeight);

      if (clamped === targetPageRef.current && Math.abs(scrollContainer.scrollTop - desiredTop) < 1) {
        return;
      }

      if (clamped !== targetPageRef.current) {
        targetPageRef.current = clamped;
        setTargetPage(clamped);

        // Cancel any pending debounced sync so it does not overwrite
        // the target we just set.
        clearTimeout(syncTimerRef.current);
      }

      scrollToPage(itemElement, scrollContainer, toolbarHeight);
    },
    [pageCount, scrollContainerRef, toolbarHeight, scrollToPage],
  );

  const onPreviousPage =
    pageCount === 0
      ? undefined
      : () => {
          const target = targetPageRef.current;
          const scrollContainer = scrollContainerRef.current;
          const itemElement = itemRefs.current.get(target);

          // If the target item is completely above the viewport (scrolled past),
          // it is itself the "previous" item – bring it back into view.
          const scrollToTarget =
            scrollContainer !== null &&
            itemElement !== undefined &&
            hasPassedItem(itemElement, scrollContainer, toolbarHeight);

          navigateToPage(scrollToTarget ? target : target - 1);
        };

  const onNextPage =
    pageCount === 0
      ? undefined
      : () => {
          const target = targetPageRef.current;
          const scrollContainer = scrollContainerRef.current;
          const itemElement = itemRefs.current.get(target);

          // If the user hasn't scrolled to the target item's reading position yet,
          // it is itself the "next" item – scroll to it instead of skipping past.
          const scrollToTarget =
            scrollContainer !== null &&
            itemElement !== undefined &&
            !hasReachedItem(itemElement, scrollContainer, toolbarHeight);

          navigateToPage(scrollToTarget ? target : target + 1);
        };

  const previousPageDisabled = targetPage <= 1;
  const nextPageDisabled = targetPage >= pageCount;

  const setItemRef = useCallback((itemNumber: number, element: HTMLDivElement | null) => {
    if (element === null) {
      itemRefs.current.delete(itemNumber);
    } else {
      itemRefs.current.set(itemNumber, element);
    }
  }, []);

  return {
    currentPage,
    navigateToPage,
    onPreviousPage,
    onNextPage,
    previousPageDisabled,
    nextPageDisabled,
    setItemRef,
  };
};
