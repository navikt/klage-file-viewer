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
  /**
   * Centre of the line on the grouping axis (Y for horizontal text,
   * X for rotated text where lines are vertical columns).
   */
  lineCentre: number;
  /** Size of the line on the grouping axis (height for horizontal, width for rotated). */
  lineSize: number;
  /**
   * Start edge on the cross axis — the "left" edge in reading direction.
   * For /Rotate 0: X of leftmost glyph.  For /Rotate 90: Y of topmost glyph.
   */
  crossStart: number;
  /**
   * End edge on the cross axis — the "right" edge in reading direction.
   * For /Rotate 0: X + width of rightmost glyph.  For /Rotate 90: Y + height of bottommost glyph.
   */
  crossEnd: number;
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
 * lines based on their position on the line-grouping axis (Y for horizontal
 * text, X for rotated text where lines are vertical columns).
 */
export const collectLineInfo = (range: PageSelectionRange, geo: ScreenPageGeometry): LineInfo[] => {
  const { startCharIndex, endCharIndex } = range;
  const rotated = geo.pageRotation === 1 || geo.pageRotation === 3;
  const lines: LineInfo[] = [];

  let currentLineCentre = Number.NEGATIVE_INFINITY;
  let currentLineSizeSum = 0;
  let currentLineRunCount = 0;
  let currentLineCrossEnd = Number.NEGATIVE_INFINITY;
  let currentLineCrossStart = Number.POSITIVE_INFINITY;
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
        lineCentre: currentLineCentre,
        lineSize: currentLineSizeSum / currentLineRunCount,
        crossEnd: currentLineCrossEnd,
        crossStart: currentLineCrossStart,
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

    // Line-grouping axis: Y for horizontal text, X for rotated text.
    const runLineAxisCentre = rotated ? run.rect.x + run.rect.width / 2 : run.rect.y + run.rect.height / 2;
    const runLineAxisSize = rotated ? run.rect.width : run.rect.height;

    // Cross axis: X for horizontal text, Y for rotated text.
    const runCrossStart = rotated ? run.rect.y : run.rect.x;
    const runCrossEnd = rotated ? run.rect.y + run.rect.height : run.rect.x + run.rect.width;

    const runCharStart = run.charStart;
    const runCharEnd = runCharStart + run.glyphs.length - 1;
    const glyphCount = run.glyphs.length;

    if (currentLineRunCount === 0 || Math.abs(runLineAxisCentre - currentLineCentre) > lineTolerance) {
      // Start a new line.
      flushLine();
      resetFontAccumulators();
      currentLineCentre = runLineAxisCentre;
      currentLineSizeSum = runLineAxisSize;
      currentLineRunCount = 1;
      currentLineCrossEnd = runCrossEnd;
      currentLineCrossStart = runCrossStart;
      currentLineCharStart = runCharStart;
      currentLineCharEnd = runCharEnd;
      lineTolerance = runLineAxisSize / 2;
    } else {
      // Same line — accumulate.
      currentLineSizeSum += runLineAxisSize;
      currentLineRunCount += 1;
      currentLineCrossEnd = Math.max(currentLineCrossEnd, runCrossEnd);
      currentLineCrossStart = Math.min(currentLineCrossStart, runCrossStart);
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
 * Compute the maximum cross-axis extent for full-width detection.
 *
 * For horizontal text: the page width (or max X+width from runs).
 * For rotated text: the page height (or max Y+height from runs).
 *
 * When the geometry includes page dimensions, we use those so a page
 * with only short lines doesn't falsely treat them as "full width."
 */
export const computePageMaxRight = (geo: ScreenPageGeometry): number => {
  const rotated = geo.pageRotation === 1 || geo.pageRotation === 3;

  const pageDimension = rotated ? geo.pageHeight : geo.pageWidth;

  if (pageDimension !== undefined && pageDimension > 0) {
    return pageDimension;
  }

  let maxCross = 0;

  for (const run of geo.runs) {
    const hasVisibleGlyph = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisibleGlyph) {
      continue;
    }

    const runCrossEnd = rotated ? run.rect.y + run.rect.height : run.rect.x + run.rect.width;
    maxCross = Math.max(maxCross, runCrossEnd);
  }

  return maxCross;
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

/** Compute the gaps between consecutive lines on the grouping axis. */
export const computeLineGaps = (lines: LineInfo[]): number[] => {
  const gaps: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const curr = lines[i];

    if (prev === undefined || curr === undefined) {
      continue;
    }

    const gap = Math.abs(curr.lineCentre - prev.lineCentre);
    gaps.push(gap);
  }

  return gaps;
};
