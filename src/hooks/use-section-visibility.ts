import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSectionVisibilityParams {
  /** Total number of PDF sections. */
  sectionCount: number;
  /** Ref to the scrollable container used as the IntersectionObserver root. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseSectionVisibilityResult {
  /** Index of the most-visible document section. */
  currentDocumentIndex: number;
  /** Callback to register/unregister a section element by index. */
  setSectionRef: (index: number, element: HTMLElement | null) => void;
}

export const useSectionVisibility = ({
  sectionCount,
  scrollContainerRef,
}: UseSectionVisibilityParams): UseSectionVisibilityResult => {
  const [currentDocumentIndex, setCurrentDocumentIndex] = useState(0);
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

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

  return { currentDocumentIndex, setSectionRef };
};
