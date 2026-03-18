import type { Rotation } from '@embedpdf/models';
import type { ScreenPageGeometry, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';

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
      if (g.flags === GLYPH_FLAG_EMPTY) {
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

      if (g === undefined || g.flags === GLYPH_FLAG_EMPTY) {
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
      if (g.flags === GLYPH_FLAG_EMPTY) {
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
 *  - **Below all text** → last character on the page
 *  - **Above all text** → first character on the page
 *  - **At a line's Y level but horizontally outside** → last char on the
 *    line (if to the right) or first char (if to the left)
 *  - **Between lines vertically** → last char of the line above
 */
export const snapToNearest = (geo: ScreenPageGeometry, x: number, y: number): number => {
  if (geo.runs.length === 0) {
    return -1;
  }

  // Collect line spans: groups of runs that share the same visual row.
  const lines = collectLines(geo);

  if (lines.length === 0) {
    return -1;
  }

  // Find which line the pointer is on or between.
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];

  if (firstLine === undefined || lastLine === undefined) {
    return -1;
  }

  // Above all text → first char.
  if (y < firstLine.top) {
    return firstLine.charStart;
  }

  // Below all text → last char.
  if (y > lastLine.bottom) {
    return lastLine.charEnd;
  }

  // Check if the pointer vertically overlaps a line.
  for (const line of lines) {
    if (y >= line.top && y <= line.bottom) {
      // Horizontally to the right → end of line.
      if (x >= line.right) {
        return line.charEnd;
      }

      // Horizontally to the left → start of line.
      if (x <= line.left) {
        return line.charStart;
      }

      // Inside the line box but glyphAt missed — return closest char end.
      return line.charEnd;
    }
  }

  // Between lines — find the gap and snap to the end of the line above.
  for (let i = 0; i < lines.length - 1; i++) {
    const above = lines[i];
    const below = lines[i + 1];

    if (above === undefined || below === undefined) {
      continue;
    }

    if (y > above.bottom && y < below.top) {
      return above.charEnd;
    }
  }

  // Fallback — shouldn't reach here, but return last char.
  return lastLine.charEnd;
};

/** A visual line: one or more runs that share the same vertical extent. */
interface LineBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
  charStart: number;
  charEnd: number;
}

/**
 * Group runs into visual lines based on vertical overlap.
 * Runs are processed in order; a new line starts when a run's vertical
 * centre is too far from the current line's extent.
 */
const collectLines = (geo: ScreenPageGeometry): LineBounds[] => {
  const lines: LineBounds[] = [];
  let current: LineBounds | null = null;

  for (const run of geo.runs) {
    if (run.glyphs.length === 0) {
      continue;
    }

    // Skip zero-size runs.
    if (run.rect.width === 0 && run.rect.height === 0) {
      continue;
    }

    const runTop = run.rect.y;
    const runBottom = run.rect.y + run.rect.height;
    const runLeft = run.rect.x;
    const runRight = run.rect.x + run.rect.width;
    const runCharEnd = run.charStart + run.glyphs.length - 1;

    if (current === null) {
      current = {
        top: runTop,
        bottom: runBottom,
        left: runLeft,
        right: runRight,
        charStart: run.charStart,
        charEnd: runCharEnd,
      };
      continue;
    }

    // Check vertical overlap with current line.
    const overlapTop = Math.max(current.top, runTop);
    const overlapBottom = Math.min(current.bottom, runBottom);
    const overlap = Math.max(0, overlapBottom - overlapTop);
    const union = Math.max(current.bottom, runBottom) - Math.min(current.top, runTop);

    if (union > 0 && overlap / union >= LINE_OVERLAP_THRESHOLD) {
      // Same line — extend.
      current.top = Math.min(current.top, runTop);
      current.bottom = Math.max(current.bottom, runBottom);
      current.left = Math.min(current.left, runLeft);
      current.right = Math.max(current.right, runRight);
      current.charEnd = Math.max(current.charEnd, runCharEnd);
    } else {
      // New line.
      lines.push(current);
      current = {
        top: runTop,
        bottom: runBottom,
        left: runLeft,
        right: runRight,
        charStart: run.charStart,
        charEnd: runCharEnd,
      };
    }
  }

  if (current !== null) {
    lines.push(current);
  }

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
