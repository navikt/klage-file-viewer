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
