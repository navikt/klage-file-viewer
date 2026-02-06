import { useCallback, useEffect } from 'react';
import { MAX_SCALE, MIN_SCALE, SCALE_STEP, SCROLL_STEP } from '../constants';
import { isMetaKey, Keys } from '../lib/keys';
import { snapDown, snapUp } from '../lib/snap';

interface UseZoomParams {
  /** Ref to the container element that captures keyboard and wheel events. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** State setter for the current scale value. */
  setScale: React.Dispatch<React.SetStateAction<number>>;
  /** Whether Cmd/Ctrl+F should open search. */
  isSinglePdf: boolean;
  /** Called when the user triggers Cmd/Ctrl+F and `isSinglePdf` is true. */
  onOpenSearch?: () => void;
}

interface UseZoomResult {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

export const useZoom = ({ containerRef, setScale, isSinglePdf, onOpenSearch }: UseZoomParams): UseZoomResult => {
  const handleZoomIn = useCallback(() => {
    setScale((prev) => snapUp(prev, SCALE_STEP, MAX_SCALE));
  }, [setScale]);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => snapDown(prev, SCALE_STEP, MIN_SCALE));
  }, [setScale]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const meta = isMetaKey(event);

      if (meta) {
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
        }
      }
    },
    [handleZoomIn, handleZoomOut, isSinglePdf, onOpenSearch],
  );

  // Ctrl/Cmd + scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
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

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef, setScale]);

  return { handleZoomIn, handleZoomOut, handleKeyDown };
};
