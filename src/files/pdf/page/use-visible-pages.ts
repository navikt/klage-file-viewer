import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_NUMBER_ATTR = 'data-klage-file-viewer-page-number';

/** How many viewport heights to extend the observation area in each direction. */
const OVERSCAN_FACTOR = 3;
const ROOT_MARGIN = `${(OVERSCAN_FACTOR * 100).toString(10)}% 0px`;

const getPageNumber = (element: Element): number | null => {
  const attr = element.getAttribute(PAGE_NUMBER_ATTR);

  if (attr === null) {
    return null;
  }

  const pageNumber = Number.parseInt(attr, 10);

  return Number.isNaN(pageNumber) ? null : pageNumber;
};

const applyIntersectionEntries = (
  prev: ReadonlySet<number>,
  entries: IntersectionObserverEntry[],
): ReadonlySet<number> => {
  let changed = false;
  const next = new Set(prev);

  for (const entry of entries) {
    const pageNumber = getPageNumber(entry.target);

    if (pageNumber === null) {
      continue;
    }

    if (entry.isIntersecting && !next.has(pageNumber)) {
      next.add(pageNumber);
      changed = true;
    } else if (!entry.isIntersecting && next.has(pageNumber)) {
      next.delete(pageNumber);
      changed = true;
    }
  }

  return changed ? next : prev;
};

export const useVisiblePages = (
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  pageCount: number,
): {
  visiblePages: ReadonlySet<number>;
  setPageElement: (pageNumber: number, element: HTMLElement | null) => void;
} => {
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(() => new Set<number>());
  const elementsRef = useRef(new Map<number, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null || pageCount === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => applyIntersectionEntries(prev, entries));
      },
      {
        root: scrollContainer,
        rootMargin: ROOT_MARGIN,
      },
    );

    observerRef.current = observer;

    for (const element of elementsRef.current.values()) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [scrollContainerRef, pageCount]);

  const setPageElement = useCallback((pageNumber: number, element: HTMLElement | null) => {
    if (element === null) {
      const existing = elementsRef.current.get(pageNumber);

      if (existing !== undefined) {
        observerRef.current?.unobserve(existing);
        elementsRef.current.delete(pageNumber);
      }
    } else {
      elementsRef.current.set(pageNumber, element);
      observerRef.current?.observe(element);
    }
  }, []);

  return { visiblePages, setPageElement };
};
