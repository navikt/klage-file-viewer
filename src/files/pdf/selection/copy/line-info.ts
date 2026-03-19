import type { PageSelectionRange, ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of lines needed to compute meaningful line spacing. */
export const MIN_LINES_FOR_STATS = 2;

// ---------------------------------------------------------------------------
// Line info types
// ---------------------------------------------------------------------------

/** Information about a single visual line within the selection. */
export interface LineInfo {
  /** The Y-centre of the line in screen coordinates. */
  yCentre: number;
  /** Average line height of runs on this line. */
  height: number;
  /** The right-most edge (x + width) of all runs on this line. */
  rightEdge: number;
  /** The left-most edge of all runs on this line. */
  leftEdge: number;
  /** Index of the first character in this line (within the page). */
  charStart: number;
  /** Index of the last character in this line (within the page). */
  charEnd: number;
  /** Dominant (character-count-weighted) font size of this line. */
  dominantFontSize: number | undefined;
  /** Dominant font weight of this line. */
  dominantFontWeight: number | undefined;
  /** Whether the dominant style on this line is italic. */
  dominantItalic: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Line collection from geometry
// ---------------------------------------------------------------------------

/**
 * Walk the runs that overlap the selection range and group them into visual
 * lines based on their Y position.
 */
export const collectLineInfo = (range: PageSelectionRange, geo: ScreenPageGeometry): LineInfo[] => {
  const { startCharIndex, endCharIndex } = range;
  const lines: LineInfo[] = [];

  let currentLineY = Number.NEGATIVE_INFINITY;
  let currentLineHeightSum = 0;
  let currentLineRunCount = 0;
  let currentLineRightEdge = Number.NEGATIVE_INFINITY;
  let currentLineLeftEdge = Number.POSITIVE_INFINITY;
  let currentLineCharStart = 0;
  let currentLineCharEnd = 0;
  let lineTolerance = 0;

  // Accumulators for font stats (weighted by character count).
  let fontSizeWeightedSum = 0;
  let fontWeightWeightedSum = 0;
  let italicCharCount = 0;
  let totalFontChars = 0;

  const flushLine = () => {
    if (currentLineRunCount > 0) {
      lines.push({
        yCentre: currentLineY,
        height: currentLineHeightSum / currentLineRunCount,
        rightEdge: currentLineRightEdge,
        leftEdge: currentLineLeftEdge,
        charStart: currentLineCharStart,
        charEnd: currentLineCharEnd,
        dominantFontSize: totalFontChars > 0 ? fontSizeWeightedSum / totalFontChars : undefined,
        dominantFontWeight: totalFontChars > 0 ? fontWeightWeightedSum / totalFontChars : undefined,
        dominantItalic: totalFontChars > 0 ? italicCharCount > totalFontChars / 2 : undefined,
      });
    }
  };

  const resetFontAccumulators = () => {
    fontSizeWeightedSum = 0;
    fontWeightWeightedSum = 0;
    italicCharCount = 0;
    totalFontChars = 0;
  };

  for (const run of geo.runs) {
    if (!runOverlapsRange(run, startCharIndex, endCharIndex)) {
      continue;
    }

    const runYCentre = run.rect.y + run.rect.height / 2;
    const runRight = run.rect.x + run.rect.width;
    const runLeft = run.rect.x;
    const runCharStart = run.charStart;
    const runCharEnd = runCharStart + run.glyphs.length - 1;
    const glyphCount = run.glyphs.length;

    if (currentLineRunCount === 0 || Math.abs(runYCentre - currentLineY) > lineTolerance) {
      // Start a new line.
      flushLine();
      resetFontAccumulators();
      currentLineY = runYCentre;
      currentLineHeightSum = run.rect.height;
      currentLineRunCount = 1;
      currentLineRightEdge = runRight;
      currentLineLeftEdge = runLeft;
      currentLineCharStart = runCharStart;
      currentLineCharEnd = runCharEnd;
      lineTolerance = run.rect.height / 2;
    } else {
      // Same line — accumulate.
      currentLineHeightSum += run.rect.height;
      currentLineRunCount += 1;
      currentLineRightEdge = Math.max(currentLineRightEdge, runRight);
      currentLineLeftEdge = Math.min(currentLineLeftEdge, runLeft);
      currentLineCharEnd = Math.max(currentLineCharEnd, runCharEnd);
    }

    // Accumulate font stats.
    if (run.fontSize !== undefined) {
      fontSizeWeightedSum += run.fontSize * glyphCount;
    }

    if (run.fontWeight !== undefined) {
      fontWeightWeightedSum += run.fontWeight * glyphCount;
    }

    if (run.italic === true) {
      italicCharCount += glyphCount;
    }

    totalFontChars += glyphCount;
  }

  flushLine();

  return lines;
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Compute the maximum right edge for full-width detection.
 *
 * When the geometry includes a `pageWidth` (from the PDF page dimensions),
 * we use that so a page with only short lines doesn't falsely treat them
 * as "full width." Falls back to the rightmost text edge when `pageWidth`
 * is not available (e.g. in test fixtures without it).
 */
export const computePageMaxRight = (geo: ScreenPageGeometry): number => {
  if (geo.pageWidth !== undefined && geo.pageWidth > 0) {
    return geo.pageWidth;
  }

  let maxRight = 0;

  for (const run of geo.runs) {
    const hasVisibleGlyph = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisibleGlyph) {
      continue;
    }

    const runRight = run.rect.x + run.rect.width;
    maxRight = Math.max(maxRight, runRight);
  }

  return maxRight;
};

/** Check whether a run overlaps a character index range. */
const runOverlapsRange = (run: ScreenRun, startCharIndex: number, endCharIndex: number): boolean => {
  const hasVisibleGlyph = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

  if (!hasVisibleGlyph) {
    return false;
  }

  const runStart = run.charStart;
  const runEnd = runStart + run.glyphs.length - 1;

  return runEnd >= startCharIndex && runStart <= endCharIndex;
};

/** Compute the vertical gaps between consecutive lines. */
export const computeLineGaps = (lines: LineInfo[]): number[] => {
  const gaps: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const curr = lines[i];

    if (prev === undefined || curr === undefined) {
      continue;
    }

    const gap = Math.abs(curr.yCentre - prev.yCentre);
    gaps.push(gap);
  }

  return gaps;
};
