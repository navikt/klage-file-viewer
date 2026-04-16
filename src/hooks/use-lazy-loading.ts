import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How far ahead of the viewport (as a percentage of the scroll container height)
 * the sentinel should trigger loading the next section.
 * 300% = 3 viewport heights of lookahead.
 */
const SENTINEL_ROOT_MARGIN = '300% 0px 300% 0px';

/** Minimum total pages to load before relying on the sentinel alone. */
const MIN_INITIAL_PAGES = 5;

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
  /** Ref callback to attach to the sentinel element placed after the last loaded section. */
  sentinelRef: (el: HTMLDivElement | null) => void;
}

export const useLazyLoading = ({ sectionCount, scrollContainerRef }: UseLazyLoadingParams): UseLazyLoadingResult => {
  const [loadedSectionCount, setLoadedSectionCount] = useState(Math.min(1, sectionCount));
  const [sectionPageCounts, setSectionPageCounts] = useState<Map<number, number>>(new Map());

  const sentinelElementRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Derived: total loaded pages
  let totalLoadedPages = 0;

  for (const count of sectionPageCounts.values()) {
    totalLoadedPages += count;
  }

  // Bootstrap phase: keep loading sections until MIN_INITIAL_PAGES is reached.
  // Waits for each loaded section to report its page count before loading the next.
  useEffect(() => {
    if (sectionPageCounts.size < loadedSectionCount) {
      return;
    }

    if (loadedSectionCount >= sectionCount) {
      return;
    }

    if (totalLoadedPages < MIN_INITIAL_PAGES) {
      setLoadedSectionCount((prev) => Math.min(prev + 1, sectionCount));
    }
  }, [sectionPageCounts.size, loadedSectionCount, sectionCount, totalLoadedPages]);

  // Sentinel phase: use IntersectionObserver to load more sections as the user scrolls.
  // Back-pressure: only increment when all loaded sections have reported their page count.
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry === undefined || !entry.isIntersecting) {
          return;
        }

        setLoadedSectionCount((prev) => {
          if (prev >= sectionCount) {
            return prev;
          }

          return prev + 1;
        });
      },
      {
        root: scrollContainer,
        rootMargin: SENTINEL_ROOT_MARGIN,
      },
    );

    observerRef.current = observer;

    if (sentinelElementRef.current !== null) {
      observer.observe(sentinelElementRef.current);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [scrollContainerRef, sectionCount]);

  // Re-observe the sentinel after a new section finishes loading.
  // This handles the case where the sentinel is still in the buffer zone after
  // a section loads — the IO won't re-fire for an already-intersecting element,
  // so we force a re-observe to check again.
  useEffect(() => {
    const observer = observerRef.current;
    const sentinel = sentinelElementRef.current;

    if (observer === null || sentinel === null || loadedSectionCount >= sectionCount) {
      return;
    }

    // Only re-observe once all loaded sections have reported their page counts (back-pressure).
    if (sectionPageCounts.size < loadedSectionCount) {
      return;
    }

    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }, [sectionPageCounts.size, loadedSectionCount, sectionCount]);

  // Callback ref for the sentinel element.
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    const observer = observerRef.current;

    if (observer !== null && sentinelElementRef.current !== null) {
      observer.unobserve(sentinelElementRef.current);
    }

    sentinelElementRef.current = el;

    if (observer !== null && el !== null) {
      observer.observe(el);
    }
  }, []);

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

  return { loadedSectionCount, sectionPageCounts, handlePageCountReady, sentinelRef };
};
