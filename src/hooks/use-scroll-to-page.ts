import { useCallback, useRef } from 'react';
import { useScrollBehavior } from '@/hooks/use-scroll-behavior';
import { scrollToPage as scrollToPageFn } from '@/lib/page-scroll';

/**
 * Hook that provides a `scrollToPage` function that respects the user's smooth
 * scrolling preference.
 *
 * `scrollToPage` defers the scroll to the next animation frame and cancels any
 * previously scheduled scroll, so it is safe to call after state updates that
 * trigger re-renders. The deferral ensures the scroll starts *after* React has
 * flushed the re-render — without this, Chrome cancels the ongoing smooth
 * scroll when a navigation button becomes `disabled` (e.g. at the first/last
 * page), because disabling the focused button shifts focus and fires an
 * internal scroll-into-view that kills the programmatic smooth scroll.
 */
export const useScrollToPage = (): ((
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
  toolbarHeight: number,
) => void) => {
  const behavior = useScrollBehavior();
  const scrollFrameRef = useRef(0);

  const scrollToPage = useCallback(
    (pageElement: HTMLElement, scrollContainer: HTMLElement, toolbarHeight: number) => {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollToPageFn(pageElement, scrollContainer, toolbarHeight, { behavior });
      });
    },
    [behavior],
  );

  return scrollToPage;
};
