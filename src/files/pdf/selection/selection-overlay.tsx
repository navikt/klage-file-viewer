import { useCallback, useRef } from 'react';
import type { PageSelectionRange, ScreenGlyph } from '@/files/pdf/selection/types';

interface SelectionOverlayProps {
  glyphs: ScreenGlyph[] | null;
  selectionRange: PageSelectionRange | null;
  pageIndex: number;
  onPointerDown: (pageIndex: number, charIndex: number, isDoubleClick: boolean) => void;
  onPointerMove: (pageIndex: number, charIndex: number) => void;
  onPointerUp: () => void;
  isSelecting: boolean;
}

export const SelectionOverlay = ({
  glyphs,
  selectionRange,
  pageIndex,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  isSelecting,
}: SelectionOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  const hitTest = useCallback(
    (clientX: number, clientY: number): number => {
      if (glyphs === null || glyphs.length === 0 || overlayRef.current === null) {
        return -1;
      }

      const rect = overlayRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Find the closest glyph by checking containment first, then nearest
      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const glyph of glyphs) {
        if (glyph.isSpace || glyph.isEmpty) {
          continue;
        }

        // Check containment
        if (x >= glyph.x && x <= glyph.x + glyph.width && y >= glyph.y && y <= glyph.y + glyph.height) {
          return glyph.charIndex;
        }

        // Track closest glyph by distance to center
        const cx = glyph.x + glyph.width / 2;
        const cy = glyph.y + glyph.height / 2;
        const dist = Math.abs(x - cx) + Math.abs(y - cy);

        if (dist < closestDistance) {
          closestDistance = dist;
          closestIndex = glyph.charIndex;
        }
      }

      // Only return closest if within a reasonable tolerance (half a line height)
      const tolerance = glyphs[0]?.height ?? 20;

      if (closestDistance <= tolerance * 1.5) {
        return closestIndex;
      }

      return -1;
    },
    [glyphs],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle left button
      if (e.button !== 0) {
        return;
      }

      const charIndex = hitTest(e.clientX, e.clientY);
      const isDoubleClick = e.detail === 2;

      onPointerDown(pageIndex, charIndex, isDoubleClick);

      if (charIndex >= 0) {
        overlayRef.current?.setPointerCapture(e.pointerId);
      }
    },
    [hitTest, pageIndex, onPointerDown],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isSelecting !== true) {
        return;
      }

      const charIndex = hitTest(e.clientX, e.clientY);
      onPointerMove(pageIndex, charIndex);
    },
    [isSelecting, hitTest, pageIndex, onPointerMove],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      overlayRef.current?.releasePointerCapture(e.pointerId);
      onPointerUp();
    },
    [onPointerUp],
  );

  // Build selection rectangles
  const selectionRects = selectionRange !== null && glyphs !== null ? buildSelectionRects(glyphs, selectionRange) : [];

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-2 cursor-text"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {selectionRects.map((rect, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Selection rects are ephemeral and position-based
          key={i}
          className="pointer-events-none absolute"
          style={{
            top: rect.y,
            left: rect.x,
            width: rect.width,
            height: rect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
          }}
        />
      ))}
    </div>
  );
};

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tolerance in pixels for merging adjacent rects on the same line. */
const POSITION_TOLERANCE = 1.5;

const buildSelectionRects = (glyphs: ScreenGlyph[], range: PageSelectionRange): SelectionRect[] => {
  const { startCharIndex, endCharIndex } = range;
  const selected: ScreenGlyph[] = [];

  for (const glyph of glyphs) {
    if (glyph.charIndex >= startCharIndex && glyph.charIndex <= endCharIndex) {
      selected.push(glyph);
    }
  }

  if (selected.length === 0) {
    return [];
  }

  // Sort by y then x for merging
  const sorted = selected.toSorted((a, b) => {
    const yDiff = a.y - b.y;

    if (Math.abs(yDiff) > POSITION_TOLERANCE) {
      return yDiff;
    }

    return a.x - b.x;
  });

  const first = sorted[0];

  if (first === undefined) {
    return [];
  }

  // Merge adjacent glyphs on the same line
  const merged: SelectionRect[] = [{ x: first.x, y: first.y, width: first.width, height: first.height }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];

    if (current === undefined || previous === undefined) {
      continue;
    }

    const sameLine =
      Math.abs(current.y - previous.y) <= POSITION_TOLERANCE &&
      Math.abs(current.height - previous.height) <= POSITION_TOLERANCE;

    const adjacent = current.x <= previous.x + previous.width + POSITION_TOLERANCE;

    if (sameLine && adjacent) {
      const mergedRight = Math.max(previous.x + previous.width, current.x + current.width);
      previous.width = mergedRight - previous.x;
    } else {
      merged.push({ x: current.x, y: current.y, width: current.width, height: current.height });
    }
  }

  return merged;
};
