import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSectionVisibilityParams {
  /** Total number of file sections. */
  sectionCount: number;
  /** Ref to the scrollable container used as the IntersectionObserver root. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseSectionVisibilityResult {
  /** Index of the most-visible document section. */
  currentDocumentIndex: number;
  /** Debounced target index – stable across scroll transitions, for disabled-state rendering. */
  targetDocumentIndex: number;
  /** Callback to register/unregister a section element by index. */
  setSectionRef: (index: number, element: HTMLElement | null) => void;
  /** Scroll to the section at `index` with smooth scrolling. */
  navigateToSection: (index: number) => void;
  /** Navigate to the previous section, reading the target from a ref so rapid clicks accumulate. */
  navigateToPreviousSection: () => void;
  /** Navigate to the next section, reading the target from a ref so rapid clicks accumulate. */
  navigateToNextSection: () => void;
}

export const useSectionVisibility = ({
  sectionCount,
  scrollContainerRef,
}: UseSectionVisibilityParams): UseSectionVisibilityResult => {
  const [currentDocumentIndex, setCurrentDocumentIndex] = useState(0);
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

  // --- stable target tracking (same pattern as page navigation) ---
  const [targetDocumentIndex, setTargetDocumentIndex] = useState(0);
  const targetDocumentIndexRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setSectionRef = useCallback((index: number, element: HTMLElement | null) => {
    if (element === null) {
      sectionRefs.current.delete(index);
    } else {
      sectionRefs.current.set(index, element);
    }
  }, []);

  // Reset current index when the number of sections changes.
  useEffect(() => {
    setCurrentDocumentIndex((prev) => Math.min(prev, Math.max(0, sectionCount - 1)));
  }, [sectionCount]);

  // Debounced sync: after scrolling settles, align targetDocumentIndex with currentDocumentIndex.
  useEffect(() => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      targetDocumentIndexRef.current = currentDocumentIndex;
      setTargetDocumentIndex(currentDocumentIndex);
    }, 150);

    return () => clearTimeout(syncTimerRef.current);
  }, [currentDocumentIndex]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null || sectionCount <= 1) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let maxVisibility = 0;
        let mostVisibleIndex = currentDocumentIndex;

        for (const entry of entries) {
          const sectionIndex = Number.parseInt(entry.target.getAttribute('data-section-index') ?? '0', 10);

          if (entry.intersectionRatio > maxVisibility) {
            maxVisibility = entry.intersectionRatio;
            mostVisibleIndex = sectionIndex;
          }
        }

        if (maxVisibility > 0) {
          setCurrentDocumentIndex(mostVisibleIndex);
        }
      },
      {
        root: scrollContainer,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const sectionEl of sectionRefs.current.values()) {
      observer.observe(sectionEl);
    }

    return () => observer.disconnect();
  }, [sectionCount, currentDocumentIndex, scrollContainerRef]);

  const navigateToSection = useCallback(
    (index: number) => {
      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null) {
        return;
      }

      const clamped = Math.max(0, Math.min(index, sectionCount - 1));

      if (clamped === targetDocumentIndexRef.current) {
        return;
      }

      targetDocumentIndexRef.current = clamped;
      setTargetDocumentIndex(clamped);

      // Cancel any pending debounced sync so it does not overwrite
      // the target we just set.
      clearTimeout(syncTimerRef.current);

      const sectionElement = sectionRefs.current.get(clamped);

      if (sectionElement === undefined) {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const sectionRect = sectionElement.getBoundingClientRect();
      const top = sectionRect.top - containerRect.top + scrollContainer.scrollTop;

      scrollContainer.scrollTo({ top, behavior: 'smooth' });
    },
    [sectionCount, scrollContainerRef],
  );

  const navigateToPreviousSection = useCallback(() => {
    navigateToSection(targetDocumentIndexRef.current - 1);
  }, [navigateToSection]);

  const navigateToNextSection = useCallback(() => {
    navigateToSection(targetDocumentIndexRef.current + 1);
  }, [navigateToSection]);

  return {
    currentDocumentIndex,
    targetDocumentIndex,
    setSectionRef,
    navigateToSection,
    navigateToPreviousSection,
    navigateToNextSection,
  };
};
