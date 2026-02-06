import { useEffect, useRef, useState } from 'react';
import { clamp } from '@/lib/clamp';
import { computeFitHeightScale, computeFitWidthScale, getFirstScalablePage } from '@/lib/page-measure';
import {
  INITIAL_SCALE,
  KLAGE_FILE_VIEWER_SCALE_MODE_KEY,
  KLAGE_FILE_VIEWER_SCALE_VALUE_KEY,
  MAX_SCALE,
  MIN_SCALE,
} from '@/scale/constants';

export enum KlageFileViewerFitMode {
  PAGE_FIT = 'page-fit',
  PAGE_WIDTH = 'page-width',
  PAGE_HEIGHT = 'page-height',
  CUSTOM = 'custom',
  NONE = 'none',
}

type StoredScale =
  | number
  | KlageFileViewerFitMode.PAGE_FIT
  | KlageFileViewerFitMode.PAGE_WIDTH
  | KlageFileViewerFitMode.PAGE_HEIGHT;

const FIT_MODES_REQUIRING_COMPUTATION = new Set([
  KlageFileViewerFitMode.PAGE_FIT,
  KlageFileViewerFitMode.PAGE_WIDTH,
  KlageFileViewerFitMode.PAGE_HEIGHT,
]);

const ALL_MODE_VALUES: Set<string> = new Set(Object.values(KlageFileViewerFitMode));

const isValidMode = (value: string): value is KlageFileViewerFitMode => ALL_MODE_VALUES.has(value);

const readStoredScale = (): StoredScale => {
  try {
    const mode = localStorage.getItem(KLAGE_FILE_VIEWER_SCALE_MODE_KEY);

    if (mode === null) {
      return INITIAL_SCALE;
    }

    const trimmedMode = mode.trim();

    if (!isValidMode(trimmedMode)) {
      return INITIAL_SCALE;
    }

    if (trimmedMode === KlageFileViewerFitMode.NONE) {
      return INITIAL_SCALE;
    }

    if (trimmedMode === KlageFileViewerFitMode.CUSTOM) {
      const raw = localStorage.getItem(KLAGE_FILE_VIEWER_SCALE_VALUE_KEY);

      if (raw === null) {
        return INITIAL_SCALE;
      }

      const parsed = Number.parseFloat(raw.trim());

      if (Number.isFinite(parsed)) {
        return clamp(Math.round(parsed), MIN_SCALE, MAX_SCALE);
      }

      return INITIAL_SCALE;
    }

    return trimmedMode;
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return INITIAL_SCALE;
};

const computeFitScale = (
  fitMode: KlageFileViewerFitMode.PAGE_FIT | KlageFileViewerFitMode.PAGE_WIDTH | KlageFileViewerFitMode.PAGE_HEIGHT,
  pageElement: HTMLElement,
  scrollContainer: HTMLElement,
  currentScale: number,
  toolbarHeight: number,
): number | null => {
  switch (fitMode) {
    case KlageFileViewerFitMode.PAGE_WIDTH:
      return computeFitWidthScale(pageElement, scrollContainer, currentScale, toolbarHeight);

    case KlageFileViewerFitMode.PAGE_HEIGHT:
      return computeFitHeightScale(pageElement, scrollContainer, currentScale, toolbarHeight);

    case KlageFileViewerFitMode.PAGE_FIT: {
      const fitWidth = computeFitWidthScale(pageElement, scrollContainer, currentScale, toolbarHeight);
      const fitHeight = computeFitHeightScale(pageElement, scrollContainer, currentScale, toolbarHeight);

      if (fitWidth === null || fitHeight === null) {
        return null;
      }

      return Math.min(fitWidth, fitHeight);
    }
  }
};

const isFitModeRequiringComputation = (
  value: StoredScale,
): value is KlageFileViewerFitMode.PAGE_FIT | KlageFileViewerFitMode.PAGE_WIDTH | KlageFileViewerFitMode.PAGE_HEIGHT =>
  typeof value === 'string' && FIT_MODES_REQUIRING_COMPUTATION.has(value);

interface UseInitialScaleResult {
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Reads the initial scale preference from localStorage and applies it.
 *
 * - If the stored mode is `custom`, the stored numeric value is used immediately as the initial scale.
 * - If the stored mode is `page-width`, `page-height`, or `page-fit`,
 *   the hook starts with {@link INITIAL_SCALE} and then applies the fit mode once the first
 *   scalable page element appears in the DOM.
 * - If the stored mode is `none` or missing, {@link INITIAL_SCALE} is used.
 * - This hook never writes back to localStorage.
 * - When `standalone` is `false`, localStorage is ignored and {@link INITIAL_SCALE} is always used.
 */
export const useInitialScale = (
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  standalone: boolean,
  toolbarHeight = 0,
): UseInitialScaleResult => {
  const storedScale = useRef(standalone ? readStoredScale() : INITIAL_SCALE);
  const initialNumericScale = typeof storedScale.current === 'number' ? storedScale.current : INITIAL_SCALE;
  const [scale, setScale] = useState(initialNumericScale);
  const appliedRef = useRef(typeof storedScale.current === 'number');

  useEffect(() => {
    if (appliedRef.current) {
      return;
    }

    const stored = storedScale.current;

    if (typeof stored === 'number') {
      appliedRef.current = true;

      return;
    }

    if (!isFitModeRequiringComputation(stored)) {
      appliedRef.current = true;

      return;
    }

    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    // Try to apply the fit mode immediately if a scalable page already exists.
    const tryApply = (currentScale: number): boolean => {
      const pageElement = getFirstScalablePage(scrollContainer);

      if (pageElement === null) {
        return false;
      }

      const fitScale = computeFitScale(stored, pageElement, scrollContainer, currentScale, toolbarHeight);

      if (fitScale === null) {
        return false;
      }

      setScale(fitScale);
      appliedRef.current = true;

      return true;
    };

    if (tryApply(initialNumericScale)) {
      return;
    }

    // Observe the scroll container for scalable page elements being added.
    const observer = new MutationObserver(() => {
      if (tryApply(initialNumericScale)) {
        observer.disconnect();
      }
    });

    observer.observe(scrollContainer, { childList: true, subtree: true, attributes: true });

    return () => {
      observer.disconnect();
    };
  }, [scrollContainerRef, toolbarHeight, initialNumericScale]);

  return { scale, setScale };
};
