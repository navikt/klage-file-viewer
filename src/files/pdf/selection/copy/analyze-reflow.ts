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
 */
export interface ReflowParagraph {
  lines: ReflowLine[];
  role: ParagraphRole;
  /** Heading level 1–6. Only set when `role === 'heading'`. */
  headingLevel: number | undefined;
  /** List flavour. Only set when `role === 'list-item'`. */
  listKind: 'ordered' | 'unordered' | undefined;
}

export type ParagraphRole = 'paragraph' | 'heading' | 'list-item';

export interface ReflowLine {
  /** Full text of the line (convenience — concatenation of all span texts). */
  text: string;
  /** Styled spans within the line. */
  spans: ReflowSpan[];
  /**
   * `true` when this line is a soft-wrap continuation of the previous line
   * (the previous line filled the column width). The formatter should join
   * with a space rather than a line break.
   *
   * Always `false` for the first line in a paragraph.
   */
  softWrap: boolean;
}

export interface ReflowSpan {
  text: string;
  bold: boolean;
  italic: boolean;
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
 * paragraph break.
 */
const PARAGRAPH_GAP_FACTOR = 1.5;

/**
 * A line whose right edge reaches within this fraction of the maximum line
 * right edge is considered "full width".
 */
const FULL_WIDTH_THRESHOLD = 0.9;

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

/**
 * A line whose dominant font size exceeds the baseline body size by at least
 * this factor is a heading candidate.
 */
const HEADING_FONT_SIZE_FACTOR = 1.15;

/** Maximum number of non-soft-wrapped lines for a paragraph to be a heading. */
const HEADING_MAX_LINES = 3;

// ---------------------------------------------------------------------------
// Analysis entry point
// ---------------------------------------------------------------------------

/**
 * Build the intermediate {@link ReflowParagraph} model from raw text and
 * page geometry.
 */
export const analyzePageReflow = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
): ReflowParagraph[] => {
  const lineInfos = collectLineInfo(range, geo);
  const baselineWeight = computePageBaselineFontWeight(geo);

  if (lineInfos.length < MIN_LINES_FOR_STATS) {
    const spans = buildSpansForRange(
      range.startCharIndex,
      range.endCharIndex,
      rawText,
      range.startCharIndex,
      geo,
      baselineWeight,
    );

    return [
      {
        lines: [{ text: rawText, spans, softWrap: false }],
        role: 'paragraph',
        headingLevel: undefined,
        listKind: undefined,
      },
    ];
  }

  const gaps = computeLineGaps(lineInfos);

  if (gaps.length === 0) {
    const spans = buildSpansForRange(
      range.startCharIndex,
      range.endCharIndex,
      rawText,
      range.startCharIndex,
      geo,
      baselineWeight,
    );

    return [
      {
        lines: [{ text: rawText, spans, softWrap: false }],
        role: 'paragraph',
        headingLevel: undefined,
        listKind: undefined,
      },
    ];
  }

  const medianGap = median(gaps);
  const paragraphThreshold = medianGap * PARAGRAPH_GAP_FACTOR;
  const maxRight = computePageMaxRight(geo);
  const textLines = splitTextByGeometry(rawText, range, lineInfos);

  // Compute baseline (body) font size — the mode across all selected lines.
  const baselineFontSize = computeBaselineFontSize(lineInfos);

  const paragraphs: ReflowParagraph[] = [
    { lines: [], role: 'paragraph', headingLevel: undefined, listKind: undefined },
  ];

  for (let i = 0; i < textLines.length; i++) {
    const text = textLines[i];
    const lineInfo = lineInfos[i];

    if (text === undefined || lineInfo === undefined) {
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
      paragraphs.push({ lines: [], role: 'paragraph', headingLevel: undefined, listKind: undefined });
    }

    const currentParagraph = paragraphs[paragraphs.length - 1];

    if (currentParagraph !== undefined) {
      const spans = buildSpansForRange(
        lineInfo.charStart,
        lineInfo.charEnd,
        rawText,
        range.startCharIndex,
        geo,
        baselineWeight,
      );

      currentParagraph.lines.push({ text, spans, softWrap: sep === ' ' });
    }
  }

  // Classify each paragraph as heading, list-item, or plain paragraph.
  for (const paragraph of paragraphs) {
    classifyParagraph(paragraph, baselineFontSize, lineInfos, range, maxRight);
  }

  return paragraphs;
};

// ---------------------------------------------------------------------------
// Span extraction — build styled spans from run boundaries within a line
// ---------------------------------------------------------------------------

/**
 * Build styled spans for a character range by walking the geometry runs that
 * overlap the range and extracting text + font style for each.
 */
const buildSpansForRange = (
  charStart: number,
  charEnd: number,
  rawText: string,
  selectionStart: number,
  geo: ScreenPageGeometry,
  baselineWeight: number | undefined,
): ReflowSpan[] => {
  const spans: ReflowSpan[] = [];

  for (const run of geo.runs) {
    const runEnd = run.charStart + run.glyphs.length - 1;

    // Skip runs outside the range.
    if (runEnd < charStart || run.charStart > charEnd) {
      continue;
    }

    // Only consider visible glyphs.
    const hasVisible = run.glyphs.some((g) => g.flags !== GLYPH_FLAG_EMPTY);

    if (!hasVisible) {
      continue;
    }

    // Clamp to the overlap between the run and the requested range.
    const overlapStart = Math.max(run.charStart, charStart);
    const overlapEnd = Math.min(runEnd, charEnd);

    const textStart = Math.max(overlapStart - selectionStart, 0);
    const textEnd = Math.min(overlapEnd - selectionStart + 1, rawText.length);

    if (textStart >= rawText.length || textEnd <= textStart) {
      continue;
    }

    const text = rawText.slice(textStart, textEnd).replace(/^[\r\n]+|[\r\n]+$/g, '');

    if (text.length === 0) {
      continue;
    }

    const bold = isBoldRun(run, baselineWeight);
    const italic = isItalicRun(run);

    // Merge with previous span if same style.
    const prev = spans.length > 0 ? spans[spans.length - 1] : undefined;

    if (prev !== undefined && prev.bold === bold && prev.italic === italic) {
      prev.text += text;
    } else {
      spans.push({ text, bold, italic });
    }
  }

  // Fallback: if no spans were produced (e.g. no overlapping runs), create
  // a single unstyled span from the raw text.
  if (spans.length === 0) {
    const start = Math.max(charStart - selectionStart, 0);
    const end = Math.min(charEnd - selectionStart + 1, rawText.length);
    const text = rawText.slice(start, end).replace(/^[\r\n]+|[\r\n]+$/g, '');

    if (text.length > 0) {
      spans.push({ text, bold: false, italic: false });
    }
  }

  return spans;
};

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
const isBoldRun = (run: ScreenRun, baselineWeight: number | undefined): boolean => {
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
const isItalicRun = (run: ScreenRun): boolean => {
  if (run.italic === true) {
    return true;
  }

  if (run.fontName !== undefined && ITALIC_NAME_PATTERN.test(run.fontName)) {
    return true;
  }

  return false;
};

/**
 * Compute the baseline (body) font weight from ALL visible runs on the page.
 *
 * Uses a character-count-weighted mode bucketed to the nearest 100 (the
 * standard weight scale). Weights above {@link MAX_VALID_FONT_WEIGHT} are
 * excluded as unreliable.
 */
const computePageBaselineFontWeight = (geo: ScreenPageGeometry): number | undefined => {
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

// ---------------------------------------------------------------------------
// Paragraph classification — heading, list, or plain paragraph
// ---------------------------------------------------------------------------

/** Classify a paragraph's role based on font size, line count, and text patterns. */
const classifyParagraph = (
  paragraph: ReflowParagraph,
  baselineFontSize: number | undefined,
  allLineInfos: LineInfo[],
  range: PageSelectionRange,
  maxRight: number,
): void => {
  if (paragraph.lines.length === 0) {
    return;
  }

  const firstLine = paragraph.lines[0];

  if (firstLine === undefined) {
    return;
  }

  // --- List detection (check first) ---
  const listMatch = detectListMarker(firstLine.text);

  if (listMatch !== null) {
    paragraph.role = 'list-item';
    paragraph.listKind = listMatch.kind;
    stripListMarker(paragraph, listMatch.markerLength);

    return;
  }

  // --- Heading detection ---
  if (baselineFontSize === undefined || baselineFontSize === 0) {
    return;
  }

  // Find the LineInfo entries that belong to this paragraph.
  const paragraphLineInfos = findParagraphLineInfos(paragraph, allLineInfos, range);
  const avgFontSize = computeAvgFontSize(paragraphLineInfos);

  if (avgFontSize === undefined) {
    return;
  }

  const ratio = avgFontSize / baselineFontSize;

  if (ratio < HEADING_FONT_SIZE_FACTOR) {
    return;
  }

  // Headings are short — reject paragraphs with many hard-break lines.
  const hardLines = paragraph.lines.filter((l) => !l.softWrap).length;

  if (hardLines > HEADING_MAX_LINES) {
    return;
  }

  // Headings don't fill the column width across many wrapped lines.
  const isFullWidth = paragraphLineInfos.some((li) => maxRight > 0 && li.rightEdge >= maxRight * FULL_WIDTH_THRESHOLD);

  if (isFullWidth && paragraph.lines.length > HEADING_MAX_LINES) {
    return;
  }

  paragraph.role = 'heading';
  paragraph.headingLevel = headingLevelFromRatio(ratio);
};

/** Map a font-size ratio to a heading level (1–6). */
const headingLevelFromRatio = (ratio: number): number => {
  if (ratio >= 2.0) {
    return 1;
  }

  if (ratio >= 1.6) {
    return 2;
  }

  if (ratio >= 1.35) {
    return 3;
  }

  if (ratio >= 1.25) {
    return 4;
  }

  if (ratio >= 1.15) {
    return 5;
  }

  return 6;
};

// ---------------------------------------------------------------------------
// List marker detection
// ---------------------------------------------------------------------------

interface ListMarkerMatch {
  kind: 'ordered' | 'unordered';
  markerLength: number;
}

/** Common unordered list bullet characters. */
const UNORDERED_MARKER =
  /^[\s]*([\u2022\u2023\u2043\u25AA\u25AB\u25B8\u25BA\u25CB\u25CF\u25E6\u2013\u2014\u2015\u2219\u27A2\u2010\-*\u00B7])\s+/;

/** Ordered list: digits, letters, or roman numerals followed by `.` or `)`. */
const ORDERED_MARKER = /^[\s]*(\d{1,4}[.)]|[a-zA-Z][.)]|[ivxlIVXL]{1,6}[.)])\s+/;

const detectListMarker = (text: string): ListMarkerMatch | null => {
  const unordered = text.match(UNORDERED_MARKER);

  if (unordered !== null) {
    return { kind: 'unordered', markerLength: unordered[0].length };
  }

  const ordered = text.match(ORDERED_MARKER);

  if (ordered !== null) {
    return { kind: 'ordered', markerLength: ordered[0].length };
  }

  return null;
};

/** Remove the list marker from the first span of the paragraph. */
const stripListMarker = (paragraph: ReflowParagraph, markerLength: number): void => {
  const firstLine = paragraph.lines[0];

  if (firstLine === undefined) {
    return;
  }

  // Strip from the line's full text.
  firstLine.text = firstLine.text.slice(markerLength);

  // Strip from spans — consume markerLength characters from the front.
  let remaining = markerLength;

  while (remaining > 0 && firstLine.spans.length > 0) {
    const span = firstLine.spans[0];

    if (span === undefined) {
      break;
    }

    if (span.text.length <= remaining) {
      remaining -= span.text.length;
      firstLine.spans.shift();
    } else {
      span.text = span.text.slice(remaining);
      remaining = 0;
    }
  }
};

// ---------------------------------------------------------------------------
// Heading / font-size helpers
// ---------------------------------------------------------------------------

/**
 * Compute the baseline (body) font size as the mode of all line font sizes.
 * This is the most common font size, which represents body text.
 */
const computeBaselineFontSize = (lineInfos: LineInfo[]): number | undefined => {
  const sizes: number[] = [];

  for (const line of lineInfos) {
    if (line.dominantFontSize !== undefined) {
      // Round to 1 decimal to group similar sizes.
      sizes.push(Math.round(line.dominantFontSize * 10) / 10);
    }
  }

  if (sizes.length === 0) {
    return undefined;
  }

  // Mode — the most frequent font size.
  const counts = new Map<number, number>();
  let maxCount = 0;
  let modeSize = sizes[0];

  for (const s of sizes) {
    const c = (counts.get(s) ?? 0) + 1;
    counts.set(s, c);

    if (c > maxCount) {
      maxCount = c;
      modeSize = s;
    }
  }

  return modeSize;
};

/** Compute the average font size across a set of LineInfos. */
const computeAvgFontSize = (lineInfos: LineInfo[]): number | undefined => {
  let sum = 0;
  let count = 0;

  for (const li of lineInfos) {
    if (li.dominantFontSize !== undefined) {
      sum += li.dominantFontSize;
      count += 1;
    }
  }

  return count > 0 ? sum / count : undefined;
};

/** Find the LineInfo entries whose char ranges overlap a paragraph's lines. */
const findParagraphLineInfos = (
  paragraph: ReflowParagraph,
  allLineInfos: LineInfo[],
  range: PageSelectionRange,
): LineInfo[] => {
  const result: LineInfo[] = [];
  let lineIdx = 0;

  for (const li of allLineInfos) {
    if (lineIdx >= paragraph.lines.length) {
      break;
    }

    // Skip lines outside the selection range.
    if (li.charEnd < range.startCharIndex || li.charStart > range.endCharIndex) {
      continue;
    }

    const pLine = paragraph.lines[lineIdx];

    if (pLine !== undefined && pLine.text.length > 0) {
      result.push(li);
      lineIdx += 1;
    }
  }

  return result;
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
 * Compute the maximum right edge across all visible runs on the page.
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
 *  - Short line followed by a lowercase start → ` ` (space)
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

const FIRST_LETTER_PATTERN = /[^\s]/;

// ---------------------------------------------------------------------------
// Text splitting
// ---------------------------------------------------------------------------

/**
 * Split the raw text string into segments corresponding to each geometry line.
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
