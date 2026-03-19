import type { ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';
import type { DocumentStats } from './reflow-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum valid CSS font weight. PDFium sometimes reports values like 1496
 * for every run in a document — weights above 900 are ignored and bold
 * detection falls back to font-name parsing.
 */
const MAX_VALID_FONT_WEIGHT = 900;

/**
 * Minimum weight difference from the page baseline to consider a run bold.
 * Using a relative comparison instead of an absolute threshold handles
 * documents where the body weight isn't the standard 400.
 */
const BOLD_WEIGHT_DELTA = 150;

/** Patterns in PostScript font names that indicate bold. */
const BOLD_NAME_PATTERN = /bold|heavy|black|semibold|demibold/i;

/** Patterns in PostScript font names that indicate italic. */
const ITALIC_NAME_PATTERN = /italic|oblique/i;

// ---------------------------------------------------------------------------
// Bold / italic detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a run should be treated as bold.
 *
 * 1. Font name containing "Bold" / "Heavy" / "Black" etc. — always reliable.
 * 2. Numeric weight in the valid 100–900 range AND significantly above the
 *    page baseline — relative comparison avoids false positives on documents
 *    where PDFium reports a single nonsensical weight for every run (e.g. 1496).
 */
export const isBoldRun = (run: ScreenRun, baselineWeight: number | undefined): boolean => {
  if (run.fontName !== undefined && BOLD_NAME_PATTERN.test(run.fontName)) {
    return true;
  }

  if (
    run.fontWeight !== undefined &&
    run.fontWeight <= MAX_VALID_FONT_WEIGHT &&
    baselineWeight !== undefined &&
    baselineWeight <= MAX_VALID_FONT_WEIGHT
  ) {
    return run.fontWeight >= baselineWeight + BOLD_WEIGHT_DELTA;
  }

  return false;
};

/** Determine whether a run should be treated as italic. */
export const isItalicRun = (run: ScreenRun): boolean => {
  if (run.italic === true) {
    return true;
  }

  if (run.fontName !== undefined && ITALIC_NAME_PATTERN.test(run.fontName)) {
    return true;
  }

  return false;
};

// ---------------------------------------------------------------------------
// Page-level font statistics
// ---------------------------------------------------------------------------

/**
 * Compute the baseline (body) font weight from ALL visible runs on the page.
 *
 * Uses a character-count-weighted mode bucketed to the nearest 100 (the
 * standard weight scale). Weights above {@link MAX_VALID_FONT_WEIGHT} are
 * excluded as unreliable.
 */
export const computePageBaselineFontWeight = (geo: ScreenPageGeometry): number | undefined => {
  const weightCounts = new Map<number, number>();

  for (const run of geo.runs) {
    if (run.fontWeight === undefined || run.fontWeight > MAX_VALID_FONT_WEIGHT) {
      continue;
    }

    const hasVisible = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisible) {
      continue;
    }

    const bucketed = Math.round(run.fontWeight / 100) * 100;
    const charCount = run.glyphs.length;
    weightCounts.set(bucketed, (weightCounts.get(bucketed) ?? 0) + charCount);
  }

  if (weightCounts.size === 0) {
    return undefined;
  }

  let maxCount = 0;
  let mode: number | undefined;

  for (const [weight, count] of weightCounts) {
    if (count > maxCount) {
      maxCount = count;
      mode = weight;
    }
  }

  return mode;
};

/**
 * Compute the baseline (body) font size from ALL visible runs on the page.
 *
 * Uses a character-count-weighted mode rounded to 1 decimal. Looking at the
 * entire page (not just the selection) ensures that selecting only a heading
 * still produces the correct body-text baseline for ratio comparison.
 */
export const computeBaselineFontSize = (geo: ScreenPageGeometry): number | undefined => {
  const sizeCounts = new Map<number, number>();

  for (const run of geo.runs) {
    if (run.fontSize === undefined) {
      continue;
    }

    const hasVisible = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisible) {
      continue;
    }

    const rounded = Math.round(run.fontSize * 10) / 10;
    const charCount = run.glyphs.length;
    sizeCounts.set(rounded, (sizeCounts.get(rounded) ?? 0) + charCount);
  }

  if (sizeCounts.size === 0) {
    return undefined;
  }

  let maxCount = 0;
  let mode: number | undefined;

  for (const [size, count] of sizeCounts) {
    if (count > maxCount) {
      maxCount = count;
      mode = size;
    }
  }

  return mode;
};

/** Find the maximum font size among visible runs on a single page. */
export const computePageMaxFontSize = (geo: ScreenPageGeometry): number | undefined => {
  let max: number | undefined;

  for (const run of geo.runs) {
    if (run.fontSize === undefined || run.fontSize <= 1) {
      continue;
    }

    const hasVisible = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisible) {
      continue;
    }

    if (max === undefined || run.fontSize > max) {
      max = run.fontSize;
    }
  }

  return max;
};

/**
 * Compute document-wide statistics from all selected page geometries.
 *
 * Call this once before per-page analysis and pass the result as
 * `documentStats` to {@link analyzePageReflow} for consistent heading
 * levels across pages.
 */
export const computeDocumentStats = (pages: ScreenPageGeometry[]): DocumentStats => {
  let maxFontSize: number | undefined;

  for (const geo of pages) {
    const pageMax = computePageMaxFontSize(geo);

    if (pageMax !== undefined && (maxFontSize === undefined || pageMax > maxFontSize)) {
      maxFontSize = pageMax;
    }
  }

  return { maxFontSize };
};

/**
 * Compute the baseline (body) left edge from ALL visible runs on the page.
 *
 * Buckets left edges by pixel position, weighted by character count. The
 * baseline is the leftmost edge that appears with significant frequency
 * (≥5% of total characters). This avoids picking an indented block that
 * happens to have the most text while still filtering out rare outliers.
 */
export const computeBaselineLeftEdge = (geo: ScreenPageGeometry): number | undefined => {
  const edgeCounts = new Map<number, number>();
  let totalChars = 0;

  for (const run of geo.runs) {
    const hasVisible = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisible) {
      continue;
    }

    const rounded = Math.round(run.rect.x);
    const charCount = run.glyphs.length;
    edgeCounts.set(rounded, (edgeCounts.get(rounded) ?? 0) + charCount);
    totalChars += charCount;
  }

  if (edgeCounts.size === 0 || totalChars === 0) {
    return undefined;
  }

  const significanceThreshold = totalChars * 0.05;
  let minSignificantEdge: number | undefined;

  for (const [edge, count] of edgeCounts) {
    if (count >= significanceThreshold) {
      if (minSignificantEdge === undefined || edge < minSignificantEdge) {
        minSignificantEdge = edge;
      }
    }
  }

  return minSignificantEdge;
};
