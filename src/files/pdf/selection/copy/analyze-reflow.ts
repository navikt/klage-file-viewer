import type { PageSelectionRange, ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';

// ---------------------------------------------------------------------------
// Intermediate document model
// ---------------------------------------------------------------------------

/**
 * Intermediate document model produced by geometry analysis.
 *
 * This structure captures the semantic layout of the selected text so that
 * multiple output formats (plain text, HTML, and future richer formats) can
 * be derived from the same analysis without re-reading the geometry.
 *
 * Future enrichment ideas:
 *  - `fontSize` / `fontWeight` on lines for heading detection
 *  - `indentLevel` for list items
 *  - `alignment` (left / centre / right)
 */
export interface ReflowParagraph {
  lines: ReflowLine[];
}

export interface ReflowLine {
  text: string;
  /**
   * `true` when this line is a soft-wrap continuation of the previous line
   * (the previous line filled the column width). The formatter should join
   * with a space rather than a line break.
   *
   * Always `false` for the first line in a paragraph.
   */
  softWrap: boolean;
}

export interface PageReflow {
  plain: string;
  html: string;
}

export const EMPTY_REFLOW: PageReflow = { plain: '', html: '' };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of lines needed to compute meaningful line spacing. */
const MIN_LINES_FOR_STATS = 2;

/**
 * Factor by which a gap must exceed the median line spacing to be considered a
 * paragraph break. A value of 1.5 means the gap must be at least 50% larger
 * than the typical line spacing.
 */
const PARAGRAPH_GAP_FACTOR = 1.5;

/**
 * A line whose right edge reaches within this fraction of the maximum line
 * right edge is considered "full width" — its trailing newline is just text
 * wrapping and should be replaced with a space.
 *
 * Lines that end significantly before the right margin are considered
 * intentionally short (headings, list items, last line of a paragraph, etc.)
 * and keep their newline.
 */
const FULL_WIDTH_THRESHOLD = 0.9;

// ---------------------------------------------------------------------------
// Analysis entry point
// ---------------------------------------------------------------------------

/**
 * Build the intermediate {@link ReflowParagraph} model from raw text and
 * page geometry. Large vertical gaps become paragraph boundaries; line
 * width and next-line casing determine soft-wrap vs hard break.
 */
export const analyzePageReflow = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
): ReflowParagraph[] => {
  const lineInfos = collectLineInfo(range, geo);

  if (lineInfos.length < MIN_LINES_FOR_STATS) {
    return [{ lines: [{ text: rawText, softWrap: false }] }];
  }

  const gaps = computeLineGaps(lineInfos);

  if (gaps.length === 0) {
    return [{ lines: [{ text: rawText, softWrap: false }] }];
  }

  const medianGap = median(gaps);
  const paragraphThreshold = medianGap * PARAGRAPH_GAP_FACTOR;
  const maxRight = computePageMaxRight(geo);
  const textLines = splitTextByGeometry(rawText, range, lineInfos);

  const paragraphs: ReflowParagraph[] = [{ lines: [] }];

  for (let i = 0; i < textLines.length; i++) {
    const text = textLines[i];

    if (text === undefined) {
      continue;
    }

    // Determine separator relative to the previous line.
    let sep: '\n\n' | '\n' | ' ' | null = null;

    if (i > 0) {
      const prevLineInfo = lineInfos[i - 1];

      if (prevLineInfo !== undefined) {
        sep = lineSeparator(gaps[i - 1], prevLineInfo, paragraphThreshold, maxRight, text);
      }
    }

    if (sep === '\n\n') {
      paragraphs.push({ lines: [] });
    }

    const currentParagraph = paragraphs[paragraphs.length - 1];

    if (currentParagraph !== undefined) {
      currentParagraph.lines.push({ text, softWrap: sep === ' ' });
    }
  }

  return paragraphs;
};

// ---------------------------------------------------------------------------
// Line collection from geometry
// ---------------------------------------------------------------------------

/** Information about a single visual line within the selection. */
interface LineInfo {
  /** The Y-centre of the line in screen coordinates. */
  yCentre: number;
  /** Average line height of runs on this line. */
  height: number;
  /** The right-most edge (x + width) of all runs on this line. */
  rightEdge: number;
  /** Index of the first character in this line (within the page). */
  charStart: number;
  /** Index of the last character in this line (within the page). */
  charEnd: number;
}

/**
 * Walk the runs that overlap the selection range and group them into visual
 * lines based on their Y position.
 */
const collectLineInfo = (range: PageSelectionRange, geo: ScreenPageGeometry): LineInfo[] => {
  const { startCharIndex, endCharIndex } = range;
  const lines: LineInfo[] = [];

  let currentLineY = Number.NEGATIVE_INFINITY;
  let currentLineHeightSum = 0;
  let currentLineRunCount = 0;
  let currentLineRightEdge = Number.NEGATIVE_INFINITY;
  let currentLineCharStart = 0;
  let currentLineCharEnd = 0;
  let lineTolerance = 0;

  const flushLine = () => {
    if (currentLineRunCount > 0) {
      lines.push({
        yCentre: currentLineY,
        height: currentLineHeightSum / currentLineRunCount,
        rightEdge: currentLineRightEdge,
        charStart: currentLineCharStart,
        charEnd: currentLineCharEnd,
      });
    }
  };

  for (const run of geo.runs) {
    if (!runOverlapsRange(run, startCharIndex, endCharIndex)) {
      continue;
    }

    const runYCentre = run.rect.y + run.rect.height / 2;
    const runRight = run.rect.x + run.rect.width;
    const runCharStart = run.charStart;
    const runCharEnd = runCharStart + run.glyphs.length - 1;

    if (currentLineRunCount === 0 || Math.abs(runYCentre - currentLineY) > lineTolerance) {
      // Start a new line.
      flushLine();
      currentLineY = runYCentre;
      currentLineHeightSum = run.rect.height;
      currentLineRunCount = 1;
      currentLineRightEdge = runRight;
      currentLineCharStart = runCharStart;
      currentLineCharEnd = runCharEnd;
      lineTolerance = run.rect.height / 2;
    } else {
      // Same line — accumulate.
      currentLineHeightSum += run.rect.height;
      currentLineRunCount += 1;
      currentLineRightEdge = Math.max(currentLineRightEdge, runRight);
      currentLineCharEnd = Math.max(currentLineCharEnd, runCharEnd);
    }
  }

  flushLine();

  return lines;
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Compute the maximum right edge across all visible runs on the page.
 *
 * Using all page runs (rather than only the selected lines) gives us the true
 * column width. Without this, selecting a small number of similarly-short
 * lines (e.g. list items or centred text) would make them all appear
 * "full width" relative to each other, causing soft-breaks to be missed.
 */
const computePageMaxRight = (geo: ScreenPageGeometry): number => {
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

  // Skip runs that consist entirely of empty glyphs.
  if (!hasVisibleGlyph) {
    return false;
  }

  const runStart = run.charStart;
  const runEnd = runStart + run.glyphs.length - 1;

  return runEnd >= startCharIndex && runStart <= endCharIndex;
};

/** Compute the vertical gaps between consecutive lines. */
const computeLineGaps = (lines: LineInfo[]): number[] => {
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

// ---------------------------------------------------------------------------
// Line separator heuristics
// ---------------------------------------------------------------------------

/**
 * Determine the separator to place after a line:
 *  - Paragraph break (large vertical gap) → `\n\n`
 *  - Full-width wrapping line → ` ` (space)
 *  - Short line followed by a lowercase start → ` ` (space, likely a
 *    continuation even though the line didn't fill the column)
 *  - Short line followed by uppercase / bullet / number → `\n`
 */
const lineSeparator = (
  gap: number | undefined,
  line: LineInfo,
  paragraphThreshold: number,
  maxRight: number,
  nextLineText: string | undefined,
): '\n\n' | '\n' | ' ' => {
  if (gap !== undefined && gap > paragraphThreshold) {
    return '\n\n';
  }

  const isFullWidth = maxRight > 0 && line.rightEdge >= maxRight * FULL_WIDTH_THRESHOLD;

  if (isFullWidth) {
    return ' ';
  }

  // When the line is short, look at how the next line begins. A lowercase
  // letter is a strong signal that the sentence continues (soft wrap in a
  // narrow column, centred text, etc.).
  if (nextLineText !== undefined && startsWithLowercase(nextLineText)) {
    return ' ';
  }

  return '\n';
};

/** Check whether a text line starts with a lowercase Unicode letter. */
const startsWithLowercase = (text: string): boolean => {
  const firstLetter = text.match(FIRST_LETTER_PATTERN);

  if (firstLetter === null) {
    return false;
  }

  const ch = firstLetter[0];

  return ch === ch.toLowerCase() && ch !== ch.toUpperCase();
};

/** Matches the first Unicode letter in a string, skipping leading whitespace. */
const FIRST_LETTER_PATTERN = /[^\s]/;

// ---------------------------------------------------------------------------
// Text splitting
// ---------------------------------------------------------------------------

/**
 * Split the raw text string into segments corresponding to each geometry line
 * using the character index boundaries tracked in {@link LineInfo}.
 *
 * The raw text returned by `engine.getTextSlices` is indexed starting at
 * `range.startCharIndex`. We map each line's `charStart`/`charEnd` back into
 * offsets within `rawText` and extract the substring. Any `\r` or `\n`
 * characters at the boundary between lines are stripped so they don't end up
 * duplicated in the output.
 */
const splitTextByGeometry = (rawText: string, range: PageSelectionRange, lines: LineInfo[]): string[] => {
  const selectionStart = range.startCharIndex;
  const textLines: string[] = [];

  for (const line of lines) {
    const start = Math.max(line.charStart - selectionStart, 0);
    const end = Math.min(line.charEnd - selectionStart + 1, rawText.length);

    if (start >= rawText.length || end <= start) {
      textLines.push('');
      continue;
    }

    // Strip leading/trailing newline characters that PDFium may have inserted
    // between lines — our separator logic will add the correct ones.
    const segment = rawText.slice(start, end).replace(/^[\r\n]+|[\r\n]+$/g, '');
    textLines.push(segment);
  }

  return textLines;
};

/** Compute the median of a non-empty array of numbers. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const a = sorted[mid - 1];
    const b = sorted[mid];

    return a !== undefined && b !== undefined ? (a + b) / 2 : 0;
  }

  return sorted[mid] ?? 0;
};
