import type { Rotation } from '@embedpdf/models';
import { useCallback, useRef, useState } from 'react';
import { glyphAt, screenToGlyph } from '@/files/pdf/selection/hit-test';
import type { PageSelectionRange, ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';

interface SelectionOverlayProps {
  geometry: ScreenPageGeometry | null;
  selectionRange: PageSelectionRange | null;
  pageIndex: number;
  onMouseDown: (pageIndex: number, charIndex: number, detail: number) => void;
  isSelecting: boolean;
  rotation: Rotation;
  baseWidth: number;
  baseHeight: number;
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
}: SelectionOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isOverText, setIsOverText] = useState(false);

  const hitTest = useCallback(
    (clientX: number, clientY: number): number => {
      if (geometry === null || geometry.runs.length === 0 || overlayRef.current === null) {
        return -1;
      }

      const rect = overlayRef.current.getBoundingClientRect();

      // When the page is rotated via CSS transform, getBoundingClientRect()
      // returns the axis-aligned bounding box in screen space. The coordinates
      // (clientX - rect.left, clientY - rect.top) are therefore in the
      // *rotated* screen space. We need to map them back into the
      // untransformed coordinate space where glyph positions live.
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;

      const { x, y } = screenToGlyph(sx, sy, rotation, baseWidth, baseHeight);

      return glyphAt(geometry, x, y);
    },
    [geometry, rotation, baseWidth, baseHeight],
  );

  /**
   * Use mousedown for click-detail detection. The browser increments
   * `e.detail` on `mousedown` (1 = single, 2 = double, 3 = triple),
   * whereas `pointerdown` always reports `detail === 0` in most browsers.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left button
      if (e.button !== 0) {
        return;
      }

      const charIndex = hitTest(e.clientX, e.clientY);

      onMouseDown(pageIndex, charIndex, e.detail);
    },
    [hitTest, pageIndex, onMouseDown],
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

      const charIndex = hitTest(e.clientX, e.clientY);
      setIsOverText(charIndex >= 0);
    },
    [isSelecting, hitTest],
  );

  // Build selection rectangles from runs
  const selectionRects =
    selectionRange !== null && geometry !== null ? buildSelectionRects(geometry, selectionRange) : [];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This is a custom text selection overlay, not a semantic interactive element
    <div
      ref={overlayRef}
      className="absolute inset-0 z-2"
      style={{ cursor: isOverText || isSelecting ? 'text' : 'auto' }}
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

// ---------------------------------------------------------------------------
// Selection rect building — adapted from EmbedPDF's `rectsWithinSlice` +
// Chromium's `MergeAdjacentRects`
// ---------------------------------------------------------------------------

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maximum gap between consecutive glyphs (as a multiple of average glyph
 * width in the sub-run) before a new sub-run rect is flushed. This prevents
 * a single selection highlight from spanning a large horizontal gap (e.g.
 * across columns). Matches EmbedPDF's `CHAR_DISTANCE_FACTOR`.
 */
const CHAR_DISTANCE_FACTOR = 2.5;

/**
 * Minimum vertical overlap ratio for two text run rects to be merged into a
 * single highlight band. Matches EmbedPDF/Chromium's threshold.
 */
const VERTICAL_OVERLAP_THRESHOLD_MERGE = 0.8;

/**
 * Maximum font-size ratio between two runs before they are considered too
 * different to merge. Matches Chromium's `FONT_SIZE_RATIO_THRESHOLD`.
 */
const FONT_SIZE_RATIO_THRESHOLD = 1.5;

interface TextRunInfo {
  rect: SelectionRect;
  charCount: number;
  fontSize: number | undefined;
}

/**
 * Build the set of highlight rectangles for a selection range within one page.
 *
 * Iterates through runs, extracts sub-run rects for the selected glyph
 * slice, then merges adjacent sub-runs that share the same visual line
 * using Chromium's horizontal-overlap heuristic.
 */
const buildSelectionRects = (geo: ScreenPageGeometry, range: PageSelectionRange): SelectionRect[] => {
  const { startCharIndex, endCharIndex } = range;
  const textRuns: TextRunInfo[] = [];

  for (const run of geo.runs) {
    const runStart = run.charStart;
    const runEnd = runStart + run.glyphs.length - 1;

    // Skip runs entirely outside the selection
    if (runEnd < startCharIndex || runStart > endCharIndex) {
      continue;
    }

    // Determine the slice of this run that is selected
    const sIdx = Math.max(startCharIndex, runStart) - runStart;
    const eIdx = Math.min(endCharIndex, runEnd) - runStart;

    collectSubRunRects(run, sIdx, eIdx, textRuns);
  }

  if (textRuns.length === 0) {
    return [];
  }

  return mergeAdjacentRects(textRuns);
};

/**
 * Walk through the selected slice of a run, flushing a new sub-run rect
 * whenever a large horizontal gap is encountered (indicating a column break
 * or similar structural discontinuity).
 */
const collectSubRunRects = (run: ScreenRun, sIdx: number, eIdx: number, out: TextRunInfo[]): void => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let charCount = 0;
  let widthSum = 0;
  let prevRight = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (minX !== Number.POSITIVE_INFINITY && charCount > 0) {
      out.push({
        rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        charCount,
        fontSize: run.fontSize,
      });
    }

    minX = Number.POSITIVE_INFINITY;
    maxX = Number.NEGATIVE_INFINITY;
    minY = Number.POSITIVE_INFINITY;
    maxY = Number.NEGATIVE_INFINITY;
    charCount = 0;
    widthSum = 0;
    prevRight = Number.NEGATIVE_INFINITY;
  };

  for (let i = sIdx; i <= eIdx; i++) {
    const g = run.glyphs[i];

    if (g === undefined || g.flags === GLYPH_FLAG_EMPTY) {
      continue;
    }

    // If there's a large horizontal gap, flush the current sub-run
    if (charCount > 0 && prevRight > Number.NEGATIVE_INFINITY) {
      const gap = Math.abs(g.x - prevRight);
      const avgWidth = widthSum / charCount;

      if (avgWidth > 0 && gap > CHAR_DISTANCE_FACTOR * avgWidth) {
        flush();
      }
    }

    minX = Math.min(minX, g.x);
    maxX = Math.max(maxX, g.x + g.width);
    minY = Math.min(minY, g.y);
    maxY = Math.max(maxY, g.y + g.height);

    charCount++;
    widthSum += g.width;
    prevRight = g.x + g.width;
  }

  flush();
};

// ---------------------------------------------------------------------------
// Chromium-style rectangle merging
// ---------------------------------------------------------------------------

/**
 * Returns a ratio between [0, 1] representing vertical overlap of two rects.
 * A value of 1 means one rect fully contains the other vertically.
 */
const getVerticalOverlap = (a: SelectionRect, b: SelectionRect): number => {
  if (a.height <= 0 || b.height <= 0) {
    return 0;
  }

  const unionTop = Math.min(a.y, b.y);
  const unionBottom = Math.max(a.y + a.height, b.y + b.height);
  const unionHeight = unionBottom - unionTop;

  if (unionHeight === a.height || unionHeight === b.height) {
    return 1.0;
  }

  const intersectTop = Math.max(a.y, b.y);
  const intersectBottom = Math.min(a.y + a.height, b.y + b.height);
  const intersectHeight = Math.max(0, intersectBottom - intersectTop);

  return intersectHeight / unionHeight;
};

/**
 * Determine whether two text-run rects should be merged into a single
 * highlight band. Checks font-size compatibility, vertical overlap, and
 * horizontal proximity. Adapted from Chromium's `shouldMergeHorizontalRects`.
 */
const shouldMerge = (a: TextRunInfo, b: TextRunInfo): boolean => {
  // Font-size guard
  if (a.fontSize !== undefined && b.fontSize !== undefined && a.fontSize > 0 && b.fontSize > 0) {
    const ratio = Math.max(a.fontSize, b.fontSize) / Math.min(a.fontSize, b.fontSize);

    if (ratio > FONT_SIZE_RATIO_THRESHOLD) {
      return false;
    }
  }

  // Vertical overlap check
  if (getVerticalOverlap(a.rect, b.rect) < VERTICAL_OVERLAP_THRESHOLD_MERGE) {
    return false;
  }

  // Horizontal proximity — expand each rect by one average-character-width
  // on each side and check if they overlap.
  const avgWidthA = a.rect.width / a.charCount;
  const avgWidthB = b.rect.width / b.charCount;

  const aLeft = a.rect.x - avgWidthA;
  const aRight = a.rect.x + a.rect.width + avgWidthA;
  const bLeft = b.rect.x - avgWidthB;
  const bRight = b.rect.x + b.rect.width + avgWidthB;

  return aLeft < bRight && aRight > bLeft;
};

/**
 * Merge adjacent text-run rects that share the same visual line.
 * Adapted from Chromium's `MergeAdjacentRects` (pdfium_range.cc).
 */
const mergeAdjacentRects = (textRuns: TextRunInfo[]): SelectionRect[] => {
  const results: SelectionRect[] = [];
  let prevRun: TextRunInfo | null = null;
  let currentRect: SelectionRect | null = null;

  for (const textRun of textRuns) {
    if (prevRun !== null && currentRect !== null && shouldMerge(prevRun, textRun)) {
      // Union the current accumulated rect with the new run's rect
      const left = Math.min(currentRect.x, textRun.rect.x);
      const top = Math.min(currentRect.y, textRun.rect.y);
      const right = Math.max(currentRect.x + currentRect.width, textRun.rect.x + textRun.rect.width);
      const bottom = Math.max(currentRect.y + currentRect.height, textRun.rect.y + textRun.rect.height);

      currentRect = { x: left, y: top, width: right - left, height: bottom - top };
    } else {
      if (currentRect !== null && currentRect.width > 0 && currentRect.height > 0) {
        results.push(currentRect);
      }

      currentRect = { ...textRun.rect };
    }

    prevRun = textRun;
  }

  if (currentRect !== null && currentRect.width > 0 && currentRect.height > 0) {
    results.push(currentRect);
  }

  return results;
};
