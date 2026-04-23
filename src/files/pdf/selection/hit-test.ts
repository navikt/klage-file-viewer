import type { Rotation } from '@embedpdf/models';
import type { ScreenPageGeometry, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY, hasGlyphFlag } from '@/files/pdf/selection/types';

// ---------------------------------------------------------------------------
// Glyph bounds helpers
// ---------------------------------------------------------------------------

/** Read the effective bounding box of a glyph, preferring tight bounds. */
const glyphBounds = (g: ScreenRunGlyph): { gx: number; gy: number; gw: number; gh: number } => ({
  gx: g.tightX ?? g.x,
  gy: g.tightY ?? g.y,
  gw: g.tightWidth ?? g.width,
  gh: g.tightHeight ?? g.height,
});

/** Check whether a point falls inside a rectangle. */
const pointInRect = (px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean =>
  px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;

// ---------------------------------------------------------------------------
// Hit-testing — adapted from EmbedPDF's `glyphAt` (two-pass approach)
// ---------------------------------------------------------------------------

/**
 * Default tolerance factor — multiplied by average glyph height to derive
 * the tolerance radius for the second pass. Matches Chromium's
 * `pdfium-page.cc` kTolerance of 1.5.
 */
const DEFAULT_TOLERANCE_FACTOR = 1.5;

/**
 * Two-pass hit-test mirroring PDFium's `FPDFText_GetCharIndexAtPos` /
 * `CPDF_TextPage::GetIndexAtPos`:
 *
 *  1. **Exact match**: return the glyph whose tight bounding box (or loose
 *     bbox if tight is unavailable) contains the point.
 *  2. **Tolerance expansion**: expand each glyph box by `tolerance/2` on
 *     every side, then pick the closest glyph by Manhattan distance.
 *
 * Using runs to quickly skip entire text objects that are nowhere near the
 * click point.
 */
export const glyphAt = (geo: ScreenPageGeometry, x: number, y: number): number => {
  // --- Pass 1: exact bounding-box match using tight bounds ---
  const exact = glyphAtExact(geo, x, y);

  if (exact !== -1) {
    return exact;
  }

  // --- Pass 2: tolerance-expanded match ---
  return glyphAtWithTolerance(geo, x, y, DEFAULT_TOLERANCE_FACTOR);
};

/** Pass 1: find a glyph whose tight bbox contains the point exactly. */
const glyphAtExact = (geo: ScreenPageGeometry, x: number, y: number): number => {
  for (const run of geo.runs) {
    if (!pointInRect(x, y, run.rect.x, run.rect.y, run.rect.width, run.rect.height)) {
      continue;
    }

    const hitIdx = run.glyphs.findIndex((g) => {
      if (hasGlyphFlag(g.flags, GLYPH_FLAG_EMPTY)) {
        return false;
      }

      const { gx, gy, gw, gh } = glyphBounds(g);

      return pointInRect(x, y, gx, gy, gw, gh);
    });

    if (hitIdx !== -1) {
      return run.charStart + hitIdx;
    }
  }

  return -1;
};

/** Pass 2: expand each glyph box by tolerance and pick closest by Manhattan distance. */
const glyphAtWithTolerance = (geo: ScreenPageGeometry, x: number, y: number, toleranceFactor: number): number => {
  const tolerance = computeTolerance(geo, toleranceFactor);

  if (tolerance <= 0) {
    return -1;
  }

  const halfTol = tolerance / 2;
  let bestIndex = -1;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const run of geo.runs) {
    if (
      !pointInRect(
        x,
        y,
        run.rect.x - halfTol,
        run.rect.y - halfTol,
        run.rect.width + tolerance,
        run.rect.height + tolerance,
      )
    ) {
      continue;
    }

    for (let i = 0; i < run.glyphs.length; i++) {
      const g = run.glyphs[i];

      if (g === undefined || hasGlyphFlag(g.flags, GLYPH_FLAG_EMPTY)) {
        continue;
      }

      const { gx, gy, gw, gh } = glyphBounds(g);

      if (!pointInRect(x, y, gx - halfTol, gy - halfTol, gw + tolerance, gh + tolerance)) {
        continue;
      }

      const curXdif = Math.min(Math.abs(x - gx), Math.abs(x - (gx + gw)));
      const curYdif = Math.min(Math.abs(y - gy), Math.abs(y - (gy + gh)));
      const dist = curXdif + curYdif;

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = run.charStart + i;
      }
    }
  }

  return bestIndex;
};

/**
 * Derive a tolerance value from the average non-empty glyph height on the page.
 */
const computeTolerance = (geo: ScreenPageGeometry, factor: number): number => {
  let totalHeight = 0;
  let count = 0;

  for (const run of geo.runs) {
    for (const g of run.glyphs) {
      if (hasGlyphFlag(g.flags, GLYPH_FLAG_EMPTY)) {
        continue;
      }

      totalHeight += g.height;
      count++;
    }
  }

  if (count === 0) {
    return 0;
  }

  return (totalHeight / count) * factor;
};

// ---------------------------------------------------------------------------
// Vertical text bounds — fast check for whether a point is outside all text
// ---------------------------------------------------------------------------

/**
 * Get the vertical extent of all non-empty text runs on a page.
 * Returns `null` when the page contains no visible runs.
 *
 * Used to short-circuit the tolerance-based hit test during selection drags:
 * when the pointer Y is clearly above or below the text content, we skip
 * `glyphAt` (whose tolerance pass would catch nearby glyphs) and go straight
 * to `snapToNearest` for clean boundary snapping.
 */
export const getVerticalTextBounds = (geo: ScreenPageGeometry): { top: number; bottom: number } | null => {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const run of geo.runs) {
    if (run.rect.width === 0 && run.rect.height === 0) {
      continue;
    }

    if (run.glyphs.length === 0) {
      continue;
    }

    top = Math.min(top, run.rect.y);
    bottom = Math.max(bottom, run.rect.y + run.rect.height);
  }

  return top < bottom ? { top, bottom } : null;
};

// ---------------------------------------------------------------------------
// Snap-to-nearest — used during selection drag when glyphAt returns -1
// ---------------------------------------------------------------------------

/**
 * Minimum vertical overlap ratio for a run to be considered on the same line
 * as the pointer's Y position. Matches the threshold used in text selection.
 */
const LINE_OVERLAP_THRESHOLD = 0.5;

/**
 * When the pointer is within a page's bounds but `glyphAt` returns -1
 * (no glyph under the pointer), snap to the nearest character boundary.
 *
 * Mirrors native browser text-selection behaviour:
 *  - **Beyond all text** → first or last character on the page
 *  - **At a line's level but outside on the cross axis** → end or start of
 *    line depending on which side
 *  - **Between lines** → boundary of the nearer line
 *
 * For pages with inherent /Rotate 90°/270°, text lines are vertical
 * columns. The "line" and "cross" axes are swapped accordingly. When
 * the inherent rotation causes reading order to run opposite to the
 * spatial axis direction (/Rotate 90 or 180), boundary snapping accounts
 * for the reversal.
 */
export const snapToNearest = (geo: ScreenPageGeometry, x: number, y: number): number => {
  if (geo.runs.length === 0) {
    return -1;
  }

  const rotated = geo.pageRotation === 1 || geo.pageRotation === 3;
  const lineCoord = rotated ? x : y;
  const crossCoord = rotated ? y : x;

  // Lines are sorted by ascending lineStart (spatial order).
  // For /Rotate 90 and 180, spatial order is the reverse of reading order.
  const lines = collectLines(geo);

  if (lines.length === 0) {
    return -1;
  }

  const firstSpatial = lines[0];
  const lastSpatial = lines[lines.length - 1];

  if (firstSpatial === undefined || lastSpatial === undefined) {
    return -1;
  }

  // Line-axis reversed: for /Rotate 90 (1) and 180 (2), reading order
  // runs opposite to the spatial line-axis direction.
  const lineReversed = geo.pageRotation === 1 || geo.pageRotation === 2;

  // Cross-axis reversed: for /Rotate 180 (2) and 270 (3), within-line
  // reading order runs opposite to the spatial cross-axis direction.
  const crossReversed = geo.pageRotation === 2 || geo.pageRotation === 3;

  // Pointer is below/right of all lines in the spatial sense.
  if (lineCoord > lastSpatial.lineEnd) {
    return lineReversed ? lastSpatial.charStart : lastSpatial.charEnd;
  }

  // Pointer is above/left of all lines in the spatial sense.
  if (lineCoord < firstSpatial.lineStart) {
    return lineReversed ? firstSpatial.charEnd : firstSpatial.charStart;
  }

  return snapToLine(lines, lineCoord, crossCoord, lineReversed, crossReversed) ?? lastSpatial.charEnd;
};

/** Snap to a character boundary when the pointer is within a line's extent on the line axis. */
const snapWithinLine = (line: LineBounds, crossCoord: number, crossReversed: boolean): number => {
  if (crossCoord >= line.crossEnd) {
    return crossReversed ? line.charStart : line.charEnd;
  }

  if (crossCoord <= line.crossStart) {
    return crossReversed ? line.charEnd : line.charStart;
  }

  return line.charEnd;
};

/** Snap to a character boundary when the pointer falls in the gap between two lines. */
const snapBetweenLines = (prev: LineBounds, next: LineBounds, lineCoord: number, lineReversed: boolean): number => {
  const gapMid = (prev.lineEnd + next.lineStart) / 2;

  if (lineCoord <= gapMid) {
    return lineReversed ? prev.charStart : prev.charEnd;
  }

  return lineReversed ? next.charEnd : next.charStart;
};

/** Find the character at the pointer's position within or between lines. */
const snapToLine = (
  lines: LineBounds[],
  lineCoord: number,
  crossCoord: number,
  lineReversed: boolean,
  crossReversed: boolean,
): number | null => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === undefined) {
      continue;
    }

    if (lineCoord >= line.lineStart && lineCoord <= line.lineEnd) {
      return snapWithinLine(line, crossCoord, crossReversed);
    }

    const nextLine = lines[i + 1];

    if (nextLine !== undefined && lineCoord > line.lineEnd && lineCoord < nextLine.lineStart) {
      return snapBetweenLines(line, nextLine, lineCoord, lineReversed);
    }
  }

  return null;
};

/**
 * A visual line: one or more runs that share the same extent on the
 * grouping axis (Y for horizontal text, X for rotated text).
 */
interface LineBounds {
  /** Start of the line on the grouping axis (Y top or X left). */
  lineStart: number;
  /** End of the line on the grouping axis (Y bottom or X right). */
  lineEnd: number;
  /** Start of the line on the cross axis (X left or Y top). */
  crossStart: number;
  /** End of the line on the cross axis (X right or Y bottom). */
  crossEnd: number;
  charStart: number;
  charEnd: number;
}

/**
 * Group runs into visual lines based on overlap on the grouping axis,
 * then sort lines by ascending lineStart (spatial order).
 *
 * For horizontal text (rotation 0/2): groups by Y overlap.
 * For vertical text (rotation 1/3): groups by X overlap.
 */
const collectLines = (geo: ScreenPageGeometry): LineBounds[] => {
  const rotated = geo.pageRotation === 1 || geo.pageRotation === 3;
  const lines: LineBounds[] = [];
  let current: LineBounds | null = null;

  for (const run of geo.runs) {
    if (run.glyphs.length === 0) {
      continue;
    }

    if (run.rect.width === 0 && run.rect.height === 0) {
      continue;
    }

    const linePos = rotated ? run.rect.x : run.rect.y;
    const lineSize = rotated ? run.rect.width : run.rect.height;
    const crossPos = rotated ? run.rect.y : run.rect.x;
    const crossSize = rotated ? run.rect.height : run.rect.width;
    const runCharEnd = run.charStart + run.glyphs.length - 1;

    if (current === null) {
      current = {
        lineStart: linePos,
        lineEnd: linePos + lineSize,
        crossStart: crossPos,
        crossEnd: crossPos + crossSize,
        charStart: run.charStart,
        charEnd: runCharEnd,
      };
      continue;
    }

    const overlapStart = Math.max(current.lineStart, linePos);
    const overlapEnd = Math.min(current.lineEnd, linePos + lineSize);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const union = Math.max(current.lineEnd, linePos + lineSize) - Math.min(current.lineStart, linePos);

    if (union > 0 && overlap / union >= LINE_OVERLAP_THRESHOLD) {
      current.lineStart = Math.min(current.lineStart, linePos);
      current.lineEnd = Math.max(current.lineEnd, linePos + lineSize);
      current.crossStart = Math.min(current.crossStart, crossPos);
      current.crossEnd = Math.max(current.crossEnd, crossPos + crossSize);
      current.charEnd = Math.max(current.charEnd, runCharEnd);
    } else {
      lines.push(current);
      current = {
        lineStart: linePos,
        lineEnd: linePos + lineSize,
        crossStart: crossPos,
        crossEnd: crossPos + crossSize,
        charStart: run.charStart,
        charEnd: runCharEnd,
      };
    }
  }

  if (current !== null) {
    lines.push(current);
  }

  // Sort by lineStart so spatial-order assumptions in snapToNearest hold.
  // Content-stream order may not match spatial order (e.g. /Rotate 90 pages
  // have columns in right-to-left reading order = descending X).
  lines.sort((a, b) => a.lineStart - b.lineStart);

  return lines;
};

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

/**
 * Map screen-space coordinates (relative to the rotated bounding box)
 * back to the untransformed glyph coordinate system.
 *
 * The CSS transforms (with transformOrigin '0 0') produce these mappings
 * from untransformed (gx, gy) → screen AABB (sx, sy):
 *
 *   rotation 0: sx = gx,                sy = gy
 *   rotation 1: sx = baseHeight - gy,   sy = gx
 *   rotation 2: sx = baseWidth - gx,    sy = baseHeight - gy
 *   rotation 3: sx = gy,                sy = baseWidth - gx
 *
 * Inverting:
 *   rotation 0: gx = sx,                gy = sy
 *   rotation 1: gx = sy,                gy = baseHeight - sx
 *   rotation 2: gx = baseWidth - sx,    gy = baseHeight - sy
 *   rotation 3: gx = baseWidth - sy,    gy = sx
 */
export const screenToGlyph = (
  sx: number,
  sy: number,
  rotation: Rotation,
  baseWidth: number,
  baseHeight: number,
): { x: number; y: number } => {
  switch (rotation) {
    case 0:
      return { x: sx, y: sy };
    case 1:
      return { x: sy, y: baseHeight - sx };
    case 2:
      return { x: baseWidth - sx, y: baseHeight - sy };
    case 3:
      return { x: baseWidth - sy, y: sx };
    default:
      return { x: sx, y: sy };
  }
};
