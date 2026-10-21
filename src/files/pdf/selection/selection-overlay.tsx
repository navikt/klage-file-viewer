import type { Rotation } from '@embedpdf/models';
import { useCallback, useRef, useState } from 'react';
import { type DocumentMarkerMode, MARKER_CURSOR } from '@/files/pdf/highlights/marker-style';
import { glyphAt, screenToGlyph, snapToNearest } from '@/files/pdf/selection/hit-test';
import { buildSelectionRects } from '@/files/pdf/selection/selection-rects';
import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';

interface SelectionOverlayProps {
  geometry: ScreenPageGeometry | null;
  selectionRange: PageSelectionRange | null;
  pageIndex: number;
  onMouseDown: (pageIndex: number, charIndex: number, detail: number) => void;
  isSelecting: boolean;
  rotation: Rotation;
  baseWidth: number;
  baseHeight: number;
  markerMode: DocumentMarkerMode;
}

export const SelectionOverlay = ({
  geometry,
  selectionRange,
  pageIndex,
  onMouseDown,
  isSelecting,
  rotation,
  baseWidth,
  baseHeight,
  markerMode,
}: SelectionOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isOverText, setIsOverText] = useState(false);

  /** Transform client coordinates to glyph space. */
  const toGlyphCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (geometry === null || geometry.runs.length === 0 || overlayRef.current === null) {
        return null;
      }

      const rect = overlayRef.current.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;

      return screenToGlyph(sx, sy, rotation, baseWidth, baseHeight);
    },
    [geometry, rotation, baseWidth, baseHeight],
  );

  /** Precise glyph hit-test for hover cursor feedback. */
  const glyphHitTest = useCallback(
    (clientX: number, clientY: number): number => {
      if (geometry === null) {
        return -1;
      }

      const coords = toGlyphCoords(clientX, clientY);

      return coords !== null ? glyphAt(geometry, coords.x, coords.y) : -1;
    },
    [geometry, toGlyphCoords],
  );

  /**
   * Hit-test with snap fallback — clicking in whitespace near text starts a
   * selection at the nearest line boundary, matching the drag behaviour.
   */
  const selectionHitTest = useCallback(
    (clientX: number, clientY: number): number => {
      if (geometry === null) {
        return -1;
      }

      const coords = toGlyphCoords(clientX, clientY);

      if (coords === null) {
        return -1;
      }

      const charIndex = glyphAt(geometry, coords.x, coords.y);

      if (charIndex >= 0) {
        return charIndex;
      }

      return snapToNearest(geometry, coords.x, coords.y);
    },
    [geometry, toGlyphCoords],
  );

  /**
   * Use mousedown for click-detail detection. The browser increments
   * `e.detail` on `mousedown` (1 = single, 2 = double, 3 = triple),
   * whereas `pointerdown` always reports `detail === 0` in most browsers.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left button. Documents that cannot be highlighted are not selectable in marker mode.
      if (e.button !== 0 || markerMode === 'unavailable') {
        return;
      }

      const charIndex = selectionHitTest(e.clientX, e.clientY);

      onMouseDown(pageIndex, charIndex, e.detail);
    },
    [selectionHitTest, pageIndex, onMouseDown, markerMode],
  );

  /**
   * Update the text cursor when hovering over glyphs.
   * During an active selection drag, pointer events are handled at the
   * document level by useDocumentPointerTracking, so we only update the
   * cursor here.
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isSelecting) {
        return;
      }

      const charIndex = glyphHitTest(e.clientX, e.clientY);
      setIsOverText(charIndex >= 0);
    },
    [isSelecting, glyphHitTest],
  );

  // Build selection rectangles from runs
  const selectionRects =
    selectionRange !== null && geometry !== null ? buildSelectionRects(geometry, selectionRange) : [];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This is a custom text selection overlay, not a semantic interactive element
    <div
      ref={overlayRef}
      className="absolute inset-0 z-2"
      style={{ cursor: getCursor(isOverText || isSelecting, markerMode) }}
      onMouseDown={handleMouseDown}
      onPointerMove={handlePointerMove}
    >
      {selectionRects.map((r, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Selection rects are ephemeral and position-based
          key={i}
          className="pointer-events-none absolute"
          style={{
            top: r.y,
            left: r.x,
            width: r.width,
            height: r.height,
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
          }}
        />
      ))}
    </div>
  );
};

const getCursor = (overText: boolean, markerMode: DocumentMarkerMode): string => {
  if (!overText) {
    return 'auto';
  }

  return CURSORS[markerMode];
};

const CURSORS: Record<DocumentMarkerMode, string> = { off: 'text', on: MARKER_CURSOR, unavailable: 'not-allowed' };
