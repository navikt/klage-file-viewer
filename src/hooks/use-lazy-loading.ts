import { useCallback, useEffect, useState } from 'react';

/** Minimum total pages to load on initial render (across all sections). */
const MIN_INITIAL_PAGES = 5;

/** Number of rendered pages to keep below the viewport as a scroll buffer. */
const PAGE_BUFFER_COUNT = 3;

interface UseLazyLoadingParams {
  /** Total number of file sections available. */
  sectionCount: number;
  /** Ref to the scrollable container element. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseLazyLoadingResult {
  /** How many sections (starting from index 0) are allowed to load. */
  loadedSectionCount: number;
  /** Page counts reported by each loaded section, keyed by section index. */
  sectionPageCounts: Map<number, number>;
  /** Callback for a section to report its page count once loaded. */
  handlePageCountReady: (sectionIndex: number, pageCount: number) => void;
}

export const useLazyLoading = ({ sectionCount, scrollContainerRef }: UseLazyLoadingParams): UseLazyLoadingResult => {
  const [loadedSectionCount, setLoadedSectionCount] = useState(Math.min(1, sectionCount));
  const [sectionPageCounts, setSectionPageCounts] = useState<Map<number, number>>(new Map());

  // --- derived: total loaded pages and whether initial load phase is complete ---
  let totalLoadedPages = 0;

  for (const count of sectionPageCounts.values()) {
    totalLoadedPages += count;
  }

  const allSectionsReportedDuringInitial = sectionPageCounts.size >= loadedSectionCount && loadedSectionCount > 0;

  const initialLoadComplete =
    loadedSectionCount >= sectionCount || (allSectionsReportedDuringInitial && totalLoadedPages >= MIN_INITIAL_PAGES);

  // --- Phase 1: initial progressive loading until we reach MIN_INITIAL_PAGES ---
  useEffect(() => {
    // Wait until all currently-loading sections have reported their page counts.
    if (sectionPageCounts.size < loadedSectionCount) {
      return;
    }

    // All sections already loaded — nothing to do.
    if (loadedSectionCount >= sectionCount) {
      return;
    }

    if (totalLoadedPages < MIN_INITIAL_PAGES) {
      setLoadedSectionCount((prev) => Math.min(prev + 1, sectionCount));
    }
  }, [sectionPageCounts.size, loadedSectionCount, sectionCount, totalLoadedPages]);

  // --- Phase 2: scroll-based buffer — only active after initial load is complete ---
  useEffect(() => {
    if (!initialLoadComplete) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const checkScrollBuffer = () => {
      if (loadedSectionCount >= sectionCount) {
        return;
      }

      const pagesBelow = countPagesBelow(scrollContainer);

      if (pagesBelow < PAGE_BUFFER_COUNT) {
        setLoadedSectionCount((prev) => Math.min(prev + 1, sectionCount));
      }
    };

    scrollContainer.addEventListener('scroll', checkScrollBuffer, { passive: true });

    // Run once immediately in case the loaded content is short.
    checkScrollBuffer();

    return () => {
      scrollContainer.removeEventListener('scroll', checkScrollBuffer);
    };
  }, [initialLoadComplete, loadedSectionCount, sectionCount, scrollContainerRef]);

  // Re-check the buffer whenever new pages finish rendering (totalLoadedPages changes).
  useEffect(() => {
    if (!initialLoadComplete || loadedSectionCount >= sectionCount || totalLoadedPages === 0) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    // Small delay so the DOM has time to update after pages render.
    const timerId = setTimeout(() => {
      const pagesBelow = countPagesBelow(scrollContainer);

      if (pagesBelow < PAGE_BUFFER_COUNT) {
        setLoadedSectionCount((prev) => Math.min(prev + 1, sectionCount));
      }
    }, 150);

    return () => clearTimeout(timerId);
  }, [totalLoadedPages, initialLoadComplete, loadedSectionCount, sectionCount, scrollContainerRef]);

  // Reset lazy-loading state when the section count changes.
  useEffect(() => {
    setLoadedSectionCount(Math.min(1, sectionCount));
    setSectionPageCounts(new Map());
  }, [sectionCount]);

  const handlePageCountReady = useCallback((sectionIndex: number, pageCount: number) => {
    setSectionPageCounts((prev) => {
      if (prev.get(sectionIndex) === pageCount) {
        return prev;
      }

      const next = new Map(prev);
      next.set(sectionIndex, pageCount);

      return next;
    });
  }, []);

  return { loadedSectionCount, sectionPageCounts, handlePageCountReady };
};

/**
 * Count how many rendered page elements have their top edge below the
 * viewport bottom of the scroll container. Queries the DOM directly via
 * `[data-page-number]` so it works across all sections without extra ref tracking.
 */
const countPagesBelow = (scrollContainer: HTMLDivElement): number => {
  const viewportBottom = scrollContainer.getBoundingClientRect().bottom;
  const pages = scrollContainer.querySelectorAll<HTMLDivElement>('[data-page-number]');
  let count = 0;

  for (const page of pages) {
    if (page.getBoundingClientRect().top >= viewportBottom) {
      count++;
    }
  }

  return count;
};
