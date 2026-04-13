import type { PdfDocumentObject, Rotation } from '@embedpdf/models';
import { useEffect, useRef } from 'react';
import { getVerticalTextBounds, glyphAt, screenToGlyph, snapToNearest } from '@/files/pdf/selection/hit-test';
import type { ScreenPageGeometry } from '@/files/pdf/selection/types';
import { PX_PER_PT } from '@/scale/constants';

// Cache outer page element → inner content element to avoid querySelector on every pointermove.
const innerElementCache = new WeakMap<HTMLElement, HTMLElement | null>();

const getCachedInnerElement = (outer: HTMLElement): HTMLElement | null => {
  let inner = innerElementCache.get(outer);

  if (inner === undefined) {
    inner = outer.querySelector<HTMLElement>('[data-klage-file-viewer-page-content]');
    innerElementCache.set(outer, inner);
  }

  return inner ?? null;
};

interface PageInfo {
  /** The registered DOM element for the page (outer wrapper with data-klage-file-viewer-page-number). */
  element: HTMLElement;
  pageIndex: number;
}

interface UseDocumentPointerTrackingArgs {
  isSelecting: boolean;
  doc: PdfDocumentObject | null;
  scale: number;
  rotations: Map<number, Rotation>;
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>;
  /** Map of pageNumber (1-based) → registered DOM element. */
  pageElementsRef: React.RefObject<Map<number, HTMLElement>>;
  onPointerMove: (pageIndex: number, charIndex: number) => void;
  onPointerUp: () => void;
}

/**
 * Document-level pointer tracking for cross-page text selection.
 *
 * When `isSelecting` is true, attaches `pointermove` and `pointerup`
 * listeners to `document` and resolves pointer positions to
 * `(pageIndex, charIndex)` by checking which page element the pointer
 * is over (or nearest to for gap regions).
 */
export const useDocumentPointerTracking = ({
  isSelecting,
  doc,
  scale,
  rotations,
  geometryRegistry,
  pageElementsRef,
  onPointerMove,
  onPointerUp,
}: UseDocumentPointerTrackingArgs): void => {
  // Keep callback refs stable to avoid re-attaching listeners on every render.
  const onPointerMoveRef = useRef(onPointerMove);
  const onPointerUpRef = useRef(onPointerUp);

  useEffect(() => {
    onPointerMoveRef.current = onPointerMove;
  }, [onPointerMove]);

  useEffect(() => {
    onPointerUpRef.current = onPointerUp;
  }, [onPointerUp]);

  useEffect(() => {
    if (!isSelecting || doc === null) {
      return;
    }

    const handlePointerMove = (e: PointerEvent): void => {
      const result = resolvePointerToChar(
        e.clientX,
        e.clientY,
        doc,
        scale,
        rotations,
        geometryRegistry.current,
        pageElementsRef.current,
      );

      if (result !== null) {
        onPointerMoveRef.current(result.pageIndex, result.charIndex);
      }
    };

    const handlePointerUp = (): void => {
      onPointerUpRef.current();
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isSelecting, doc, scale, rotations, geometryRegistry, pageElementsRef]);
};

// ---------------------------------------------------------------------------
// Cross-page pointer resolution
// ---------------------------------------------------------------------------

interface CharResult {
  pageIndex: number;
  charIndex: number;
}

/**
 * Resolve a pointer position to (pageIndex, charIndex) by checking all
 * registered page elements.
 *
 * 1. If the pointer is directly over a page, hit-test against that page's
 *    geometry.
 * 2. If the pointer is in a gap between pages (or above/below all pages),
 *    snap to the nearest page boundary (last char of page above or first
 *    char of page below).
 */
const resolvePointerToChar = (
  clientX: number,
  clientY: number,
  doc: PdfDocumentObject,
  scale: number,
  rotations: Map<number, Rotation>,
  geometryMap: Map<number, ScreenPageGeometry>,
  pageElements: Map<number, HTMLElement>,
): CharResult | null => {
  // Build a sorted list of page info by vertical position.
  const pages = buildSortedPages(pageElements);

  if (pages.length === 0) {
    return null;
  }

  // Try direct hit on each page element.
  for (const pageInfo of pages) {
    const rect = pageInfo.element.getBoundingClientRect();

    if (clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right) {
      return hitTestPage(clientX, clientY, pageInfo.pageIndex, pageInfo.element, doc, scale, rotations, geometryMap);
    }
  }

  // Pointer is not directly over any page — find the nearest page boundary.
  return resolveGapPosition(clientX, clientY, pages, doc, scale, rotations, geometryMap);
};

/**
 * Build a list of pages sorted by their vertical position on screen.
 */
const buildSortedPages = (pageElements: Map<number, HTMLElement>): PageInfo[] => {
  const pages: PageInfo[] = [];

  for (const [pageNumber, element] of pageElements) {
    pages.push({ element, pageIndex: pageNumber - 1 });
  }

  // Sort by vertical position (top of element).
  pages.sort((a, b) => {
    const rectA = a.element.getBoundingClientRect();
    const rectB = b.element.getBoundingClientRect();

    return rectA.top - rectB.top;
  });

  return pages;
};

/**
 * Hit-test a specific page given client coordinates.
 *
 * Uses the inner content element's `getBoundingClientRect()` for coordinate
 * mapping. This correctly handles horizontal scroll, centering, and any
 * CSS transforms — matching what `SelectionOverlay.toGlyphCoords` does.
 */
const hitTestPage = (
  clientX: number,
  clientY: number,
  pageIndex: number,
  pageElement: HTMLElement,
  doc: PdfDocumentObject,
  scale: number,
  rotations: Map<number, Rotation>,
  geometryMap: Map<number, ScreenPageGeometry>,
): CharResult | null => {
  const geo = geometryMap.get(pageIndex);

  if (geo === undefined) {
    return null;
  }

  const page = doc.pages[pageIndex];

  if (page === undefined) {
    return null;
  }

  const rotation = rotations.get(pageIndex) ?? 0;
  const scaleFactor = (scale / 100) * PX_PER_PT;
  const baseWidth = page.size.width * scaleFactor;
  const baseHeight = page.size.height * scaleFactor;

  // Use the inner content element's bounding rect for accurate coordinate
  // mapping. This accounts for scroll offset, centering, and CSS transforms.
  const innerEl = getCachedInnerElement(pageElement);
  let sx: number;
  let sy: number;

  if (innerEl !== null) {
    const innerRect = innerEl.getBoundingClientRect();
    sx = clientX - innerRect.left;
    sy = clientY - innerRect.top;
  } else {
    // Fallback: centering formula (may be inaccurate with horizontal scroll).
    const pageRect = pageElement.getBoundingClientRect();
    const swapped = rotation === 1 || rotation === 3;
    const contentWidth = swapped ? baseHeight : baseWidth;
    const contentHeight = swapped ? baseWidth : baseHeight;
    const contentLeft = pageRect.left + (pageRect.width - contentWidth) / 2;
    const contentTop = pageRect.top + (pageRect.height - contentHeight) / 2;
    sx = clientX - contentLeft;
    sy = clientY - contentTop;
  }

  const { x, y } = screenToGlyph(sx, sy, rotation, baseWidth, baseHeight);

  // When the cursor Y is outside the vertical extent of all text on the
  // page, skip `glyphAt` entirely and go straight to `snapToNearest`.
  //
  // Without this check, `glyphAt`'s tolerance pass (~12px expansion) catches
  // glyphs on the nearest line even though the cursor is clearly above or
  // below the text. That causes the selection to extend to a mid-line
  // character (directly above the cursor) instead of snapping to the line
  // boundary, which is the expected behaviour when dragging past text.
  const textBounds = getVerticalTextBounds(geo);

  if (textBounds !== null && (y < textBounds.top || y > textBounds.bottom)) {
    const snapped = snapToNearest(geo, x, y);

    return snapped >= 0 ? { pageIndex, charIndex: snapped } : null;
  }

  // Within the vertical text extent — use precise glyph-level hit testing.
  const charIndex = glyphAt(geo, x, y);

  // Even within text bounds, glyphAt can miss (e.g. cursor is in a gap
  // between columns or in whitespace between lines). Fall back to snap.
  if (charIndex < 0) {
    const snapped = snapToNearest(geo, x, y);

    return snapped >= 0 ? { pageIndex, charIndex: snapped } : null;
  }

  return { pageIndex, charIndex };
};

/**
 * When the pointer is in a gap between pages, snap to the nearest page edge.
 *
 * - If the pointer is above all pages → first char of first page.
 * - If the pointer is below all pages → last char of last page.
 * - If between two pages → last char of page above if closer to it,
 *   first char of page below otherwise.
 */
const resolveGapPosition = (
  clientX: number,
  clientY: number,
  sortedPages: PageInfo[],
  doc: PdfDocumentObject,
  scale: number,
  rotations: Map<number, Rotation>,
  geometryMap: Map<number, ScreenPageGeometry>,
): CharResult | null => {
  const first = sortedPages[0];
  const last = sortedPages[sortedPages.length - 1];

  if (first === undefined || last === undefined) {
    return null;
  }

  const firstRect = first.element.getBoundingClientRect();
  const lastRect = last.element.getBoundingClientRect();

  // Above all pages — snap to first char of first page.
  if (clientY < firstRect.top) {
    return { pageIndex: first.pageIndex, charIndex: 0 };
  }

  // Below all pages — snap to last char of last page.
  if (clientY > lastRect.bottom) {
    const totalChars = getTotalCharsForPage(last.pageIndex, geometryMap);

    return { pageIndex: last.pageIndex, charIndex: Math.max(0, totalChars - 1) };
  }

  // Between two pages — find the gap.
  for (let i = 0; i < sortedPages.length - 1; i++) {
    const above = sortedPages[i];
    const below = sortedPages[i + 1];

    if (above === undefined || below === undefined) {
      continue;
    }

    const aboveRect = above.element.getBoundingClientRect();
    const belowRect = below.element.getBoundingClientRect();

    if (clientY > aboveRect.bottom && clientY < belowRect.top) {
      const gapMid = (aboveRect.bottom + belowRect.top) / 2;

      if (clientY <= gapMid) {
        // Closer to page above — snap to its last char.
        const totalChars = getTotalCharsForPage(above.pageIndex, geometryMap);

        return { pageIndex: above.pageIndex, charIndex: Math.max(0, totalChars - 1) };
      }

      // Closer to page below — snap to its first char.
      return { pageIndex: below.pageIndex, charIndex: 0 };
    }
  }

  // Pointer is horizontally outside page bounds but vertically within a page row.
  // Try the nearest page by vertical overlap.
  for (const pageInfo of sortedPages) {
    const rect = pageInfo.element.getBoundingClientRect();

    if (clientY >= rect.top && clientY <= rect.bottom) {
      return hitTestPage(clientX, clientY, pageInfo.pageIndex, pageInfo.element, doc, scale, rotations, geometryMap);
    }
  }

  return null;
};

/**
 * Get total character count for a page from its geometry in the registry.
 */
const getTotalCharsForPage = (pageIndex: number, geometryMap: Map<number, ScreenPageGeometry>): number => {
  const geo = geometryMap.get(pageIndex);

  if (geo === undefined || geo.runs.length === 0) {
    return 0;
  }

  const lastRun = geo.runs[geo.runs.length - 1];

  if (lastRun === undefined) {
    return 0;
  }

  return lastRun.charStart + lastRun.glyphs.length;
};
