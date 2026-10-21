import { useCallback, useEffect, useRef } from 'react';
import { getMarkerPalette } from '@/files/pdf/highlights/marker-style';
import { useScrollBehavior } from '@/hooks/use-scroll-behavior';
import { useToolbarHeight } from '@/toolbar-height-context';

/** Max time to wait for earlier sections to load (and stop shifting the layout) before scrolling anyway. */
const SETTLE_TIMEOUT_MS = 3_000;
/** Give up if the highlight hasn't been rendered by then (e.g. the document failed to load). */
const GIVE_UP_TIMEOUT_MS = 15_000;
/** Minimum space between the highlight and the edges of the visible area. */
const MARGIN = 16;
/** Roughly how long a smooth scroll takes, so the pulse is visible after arriving. */
const SMOOTH_SCROLL_DELAY_MS = 300;

interface UseNavigateToHighlightParams {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Load all sections up to and including the given index. */
  loadSection: (sectionIndex: number) => void;
  /** Page counts reported by loaded sections. A section's size is final once it has reported. */
  sectionPageCounts: Map<number, number>;
}

/**
 * Scroll a marker highlight into the middle of the view and pulse it.
 *
 * The highlight's section may not be loaded yet, so this loads it and waits
 * for the highlight to render — and for earlier sections to get their final
 * size — before scrolling. It retries when the DOM or the page counts change.
 */
export const useNavigateToHighlight = ({
  scrollContainerRef,
  loadSection,
  sectionPageCounts,
}: UseNavigateToHighlightParams): ((sectionIndex: number, highlightId: string) => void) => {
  const toolbarHeight = useToolbarHeight();
  const scrollBehavior = useScrollBehavior();
  const sectionPageCountsRef = useRef(sectionPageCounts);
  const pendingRef = useRef<PendingNavigation | null>(null);

  // A section reporting its page count may be what the pending navigation is waiting for.
  useEffect(() => {
    sectionPageCountsRef.current = sectionPageCounts;
    pendingRef.current?.attempt();
  }, [sectionPageCounts]);

  useEffect(() => () => stopPending(pendingRef), []);

  return useCallback(
    (sectionIndex: number, highlightId: string) => {
      stopPending(pendingRef);
      loadSection(sectionIndex);

      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null) {
        return;
      }

      const startedAt = performance.now();

      const attempt = () => {
        const elements = findHighlightElements(scrollContainer, sectionIndex, highlightId);
        const settled =
          areEarlierSectionsLoaded(sectionPageCountsRef.current, sectionIndex) ||
          performance.now() - startedAt >= SETTLE_TIMEOUT_MS;

        if (elements.length === 0 || !settled) {
          return;
        }

        stopPending(pendingRef);
        scrollToElements(scrollContainer, elements, toolbarHeight, scrollBehavior);
        pulse(elements, scrollBehavior === 'smooth' ? SMOOTH_SCROLL_DELAY_MS : 0);
      };

      // Retry whenever the section content renders, instead of polling.
      const observer = new MutationObserver(attempt);
      observer.observe(scrollContainer, { childList: true, subtree: true });
      const settleTimer = setTimeout(attempt, SETTLE_TIMEOUT_MS);
      const giveUpTimer = setTimeout(() => stopPending(pendingRef), GIVE_UP_TIMEOUT_MS);

      pendingRef.current = {
        attempt,
        stop: () => {
          observer.disconnect();
          clearTimeout(settleTimer);
          clearTimeout(giveUpTimer);
        },
      };

      attempt();
    },
    [scrollContainerRef, loadSection, toolbarHeight, scrollBehavior],
  );
};

interface PendingNavigation {
  attempt: () => void;
  stop: () => void;
}

const stopPending = (pendingRef: React.RefObject<PendingNavigation | null>) => {
  pendingRef.current?.stop();
  pendingRef.current = null;
};

const findHighlightElements = (scrollContainer: HTMLElement, sectionIndex: number, highlightId: string) =>
  Array.from(
    scrollContainer.querySelectorAll<HTMLElement>(
      `[data-klage-file-viewer-section-index="${sectionIndex.toString(10)}"] [data-klage-file-viewer-marker-highlight="${CSS.escape(highlightId)}"]`,
    ),
  );

const areEarlierSectionsLoaded = (sectionPageCounts: Map<number, number>, sectionIndex: number): boolean =>
  Array.from({ length: sectionIndex }, (_, index) => index).every((index) => sectionPageCounts.has(index));

const scrollToElements = (
  scrollContainer: HTMLElement,
  elements: HTMLElement[],
  toolbarHeight: number,
  behavior: ScrollBehavior,
) => {
  const bounds = getBounds(elements);
  const containerRect = scrollContainer.getBoundingClientRect();
  const visibleHeight = scrollContainer.clientHeight - toolbarHeight;
  const offsetTop = Math.max(MARGIN, (visibleHeight - bounds.height) / 2);
  const offsetLeft = Math.max(MARGIN, (scrollContainer.clientWidth - bounds.width) / 2);

  scrollContainer.scrollTo({
    top: scrollContainer.scrollTop + bounds.top - containerRect.top - toolbarHeight - offsetTop,
    left: scrollContainer.scrollLeft + bounds.left - containerRect.left - offsetLeft,
    behavior,
  });
};

const getBounds = (elements: HTMLElement[]) => {
  const rects = elements.map((element) => element.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const right = Math.max(...rects.map((rect) => rect.right));

  return { top, left, width: right - left, height: bottom - top };
};

/** Lifts the highlight above overlapping highlights while pulsing — only for the duration of the animation. */
const PULSE_Z_INDEX = 1;

const pulse = (elements: HTMLElement[], delay: number) => {
  for (const element of elements) {
    const { flash } = getMarkerPalette(isInInvertedLayer(element));

    element.animate(
      [
        { zIndex: PULSE_Z_INDEX, boxShadow: `0 0 0 0 ${flash}` },
        { zIndex: PULSE_Z_INDEX, boxShadow: `0 0 0 4px ${flash}`, backgroundColor: flash },
        { zIndex: PULSE_Z_INDEX, boxShadow: `0 0 0 0 ${flash}` },
      ],
      { duration: 800, delay, easing: 'ease-in-out' },
    );
  }
};

const isInInvertedLayer = (element: HTMLElement): boolean =>
  element.closest('[data-klage-file-viewer-marker-layer="inverted"]') !== null;
