import { useCallback, useEffect } from 'react';
import { useScrollToPage } from '@/hooks/use-scroll-to-page';
import { isMetaKey, Keys } from '@/lib/keys';
import { getMostVisiblePage } from '@/lib/page-scroll';
import { snapDown, snapUp } from '@/lib/snap';
import { MAX_SCALE, MIN_SCALE, SCALE_STEP, SCROLL_STEP } from '@/scale/constants';
import { useToolbarHeight } from '@/toolbar-height-context';

interface UseKeyboardShortcutsParams {
  /** Ref to the scrollable container element that captures keyboard and wheel events. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** State setter for the current scale value. */
  setScale: React.Dispatch<React.SetStateAction<number>>;
  /** Whether Cmd/Ctrl+F should open search. */
  isSinglePdf: boolean;
  /** Called when the user triggers Cmd/Ctrl+F and `isSinglePdf` is true. */
  onOpenSearch?: () => void;
  /** Navigate to the previous document section. `undefined` when unavailable (e.g. single file). */
  onPreviousDocument?: () => void;
  /** Navigate to the next document section. `undefined` when unavailable (e.g. single file). */
  onNextDocument?: () => void;
  /** Whether previous document navigation is disabled (at first document). */
  previousDocumentDisabled?: boolean;
  /** Whether next document navigation is disabled (at last document). */
  nextDocumentDisabled?: boolean;
}

interface UseKeyboardShortcutsResult {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

export const useKeyboardShortcuts = ({
  scrollContainerRef,
  setScale,
  isSinglePdf,
  onOpenSearch,
  onPreviousDocument,
  onNextDocument,
  previousDocumentDisabled,
  nextDocumentDisabled,
}: UseKeyboardShortcutsParams): UseKeyboardShortcutsResult => {
  const scrollToPage = useScrollToPage();
  const toolbarHeight = useToolbarHeight();

  const handleZoomIn = useCallback(() => {
    setScale((prev) => snapUp(prev, SCALE_STEP, MAX_SCALE));
  }, [setScale]);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => snapDown(prev, SCALE_STEP, MIN_SCALE));
  }, [setScale]);

  const navigateToAdjacentPage = useCallback(
    (direction: 'previous' | 'next') => {
      const scrollContainer = scrollContainerRef.current;

      if (scrollContainer === null) {
        return;
      }

      const allPages = Array.from(
        scrollContainer.querySelectorAll<HTMLDivElement>('[data-klage-file-viewer-page-number]'),
      );

      if (allPages.length === 0) {
        return;
      }

      const currentPage = getMostVisiblePage(scrollContainer, toolbarHeight);
      const currentIndex = currentPage === null ? -1 : allPages.indexOf(currentPage);
      const targetIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1;

      const targetPage = allPages[targetIndex];

      if (targetPage === undefined) {
        return;
      }

      scrollToPage(targetPage, scrollContainer, toolbarHeight);
    },
    [scrollContainerRef, toolbarHeight, scrollToPage],
  );

  /**
   * Handles Ctrl/Cmd + Arrow Up/Down for page navigation and
   * Ctrl/Cmd + Shift + Arrow Up/Down for document navigation.
   */
  const handleArrowNavigation = useCallback(
    (direction: 'previous' | 'next', shiftKey: boolean) => {
      if (shiftKey) {
        const callback = direction === 'previous' ? onPreviousDocument : onNextDocument;
        const disabled = direction === 'previous' ? previousDocumentDisabled : nextDocumentDisabled;

        if (callback !== undefined && disabled !== true) {
          callback();
        }
      } else {
        navigateToAdjacentPage(direction);
      }
    },
    [navigateToAdjacentPage, onPreviousDocument, onNextDocument, previousDocumentDisabled, nextDocumentDisabled],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isMetaKey(event)) {
        return;
      }

      switch (event.key) {
        case Keys.Plus:
        case Keys.Equals:
          event.preventDefault();
          handleZoomIn();
          return;
        case Keys.Dash:
          event.preventDefault();
          handleZoomOut();
          return;
        case Keys.F:
          if (isSinglePdf) {
            event.preventDefault();
            onOpenSearch?.();
          }
          return;
        case Keys.ArrowUp:
          event.preventDefault();
          handleArrowNavigation('previous', event.shiftKey);
          return;
        case Keys.ArrowDown:
          event.preventDefault();
          handleArrowNavigation('next', event.shiftKey);
          return;
      }
    },
    [handleZoomIn, handleZoomOut, isSinglePdf, onOpenSearch, handleArrowNavigation],
  );

  // Ctrl/Cmd + scroll wheel zoom
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        if (event.deltaY < 0) {
          setScale((prev) => snapUp(prev, SCROLL_STEP, MAX_SCALE));
        } else {
          setScale((prev) => snapDown(prev, SCROLL_STEP, MIN_SCALE));
        }
      }
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel);
    };
  }, [scrollContainerRef, setScale]);

  return { handleZoomIn, handleZoomOut, handleKeyDown };
};
