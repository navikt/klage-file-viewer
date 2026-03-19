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
  /** Lines of styled spans. Each inner array is one line. */
  lines: ReflowSpan[][];
  role: ParagraphRole;
  /** Heading level 1–3. Only set when `role === 'heading'`. */
  headingLevel?: number | undefined;
  /** List flavour. Only set when `role === 'list-item'`. */
  listKind?: 'ordered' | 'unordered' | undefined;
  /** Text alignment detected from line geometry. */
  alignment: TextAlignment;
}

export type ParagraphRole = 'paragraph' | 'heading' | 'list-item';

export type TextAlignment = 'left' | 'center' | 'right';

/** Internal line representation with geometry fields used only during analysis. */
interface InternalLine {
  spans: ReflowSpan[];
  text: string;
  fontSize: number | undefined;
  leftEdge: number | undefined;
  rightEdge: number | undefined;
}

/** Internal paragraph with InternalLine — stripped before returning. */
interface InternalParagraph extends Omit<ReflowParagraph, 'lines'> {
  lines: InternalLine[];
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

/** Get the full text of a line by concatenating its span texts. */
export const lineText = (line: ReflowSpan[]): string => line.map((s) => s.text).join('');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of lines needed to compute meaningful line spacing. */
const MIN_LINES_FOR_STATS = 2;

/**
 * Factor by which a gap must exceed the baseline line spacing to be considered
 * a paragraph break. Applied to the 25th-percentile gap, which better
 * represents body-text spacing than the median when headings inflate the
 * distribution.
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

/**
 * Minimum font-size ratio between adjacent lines to force a paragraph break.
 * This ensures headings are split from body text even when the vertical gap
 * is the same as normal line spacing.
 */
const FONT_SIZE_BREAK_RATIO = 1.1;

/**
 * When the horizontal gap between two consecutive runs on the same line
 * exceeds this multiple of the average glyph width, insert a space.
 * Typical character gaps are 0–1× glyph width; table columns or signature
 * blocks have gaps of 3× or more.
 */
const HORIZONTAL_GAP_FACTOR = 2;

// ---------------------------------------------------------------------------
// Analysis entry point
// ---------------------------------------------------------------------------

/** Strip internal geometry fields from lines before returning. */
const stripInternalFields = (p: InternalParagraph): ReflowParagraph => ({
  lines: p.lines.map(({ spans }) => spans),
  role: p.role,
  headingLevel: p.headingLevel,
  listKind: p.listKind,
  alignment: p.alignment,
});

/**
 * Build the intermediate {@link ReflowParagraph} model from raw text and
 * page geometry.
 *
 * @param documentMaxFontSize – Optional maximum font size found across all
 *   pages in the document. When provided, heading levels are computed
 *   relative to the range between the baseline body size and this maximum,
 *   giving consistent h1/h2 assignments across pages. When omitted the
 *   page-local maximum is used instead.
 */
export const analyzePageReflow = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
  documentMaxFontSize?: number,
): ReflowParagraph[] => {
  const lineInfos = collectLineInfo(range, geo);
  const baselineWeight = computePageBaselineFontWeight(geo);
  const baselineFontSize = computeBaselineFontSize(geo);
  const baselineLeftEdge = computeBaselineLeftEdge(geo);
  const maxRight = computePageMaxRight(geo);
  const maxFontSize = documentMaxFontSize ?? computePageMaxFontSize(geo);

  let paragraphs: InternalParagraph[];

  if (lineInfos.length < MIN_LINES_FOR_STATS || computeLineGaps(lineInfos).length === 0) {
    paragraphs = buildSingleBlockParagraph(rawText, range, geo, baselineWeight, lineInfos);
  } else {
    paragraphs = buildMultiLineParagraphs(rawText, range, geo, baselineWeight, lineInfos, maxRight, baselineLeftEdge);
  }

  for (const paragraph of paragraphs) {
    paragraph.alignment = detectAlignment(paragraph, maxRight, baselineLeftEdge);
    classifyParagraph(paragraph, baselineFontSize, maxFontSize, baselineLeftEdge);
  }

  return paragraphs.map(stripInternalFields);
};

/** Build a single paragraph when there aren't enough lines for gap analysis. */
const buildSingleBlockParagraph = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
  baselineWeight: number | undefined,
  lineInfos: LineInfo[],
): InternalParagraph[] => {
  const fontSize = lineInfos[0]?.dominantFontSize;
  const leftEdge = lineInfos[0]?.leftEdge;
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
      lines: [{ text: rawText, spans, fontSize, leftEdge, rightEdge: undefined }],
      role: 'paragraph',
      headingLevel: undefined,
      listKind: undefined,
      alignment: 'left',
    },
  ];
};

/** Build paragraphs from multi-line selections with gap and font-size analysis. */
const buildMultiLineParagraphs = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
  baselineWeight: number | undefined,
  lineInfos: LineInfo[],
  maxRight: number,
  baselineLeftEdge: number | undefined,
): InternalParagraph[] => {
  const gaps = computeLineGaps(lineInfos);
  const baselineGap = percentile25(gaps);
  const paragraphThreshold = baselineGap * PARAGRAPH_GAP_FACTOR;
  const textLines = splitTextByGeometry(rawText, range, lineInfos);

  const makeParagraph = (): InternalParagraph => ({
    lines: [],
    role: 'paragraph',
    headingLevel: undefined,
    listKind: undefined,
    alignment: 'left',
  });

  const paragraphs: InternalParagraph[] = [makeParagraph()];

  for (let i = 0; i < textLines.length; i++) {
    const text = textLines[i];
    const lineInfo = lineInfos[i];

    if (text === undefined || lineInfo === undefined) {
      continue;
    }

    let sep: '\n\n' | '\n' | ' ' | null = null;

    if (i > 0) {
      const prevLineInfo = lineInfos[i - 1];

      if (prevLineInfo !== undefined) {
        sep = lineSeparator(gaps[i - 1], prevLineInfo, paragraphThreshold, maxRight);
      }

      sep = refineSeparator(sep, text, lineInfo, lineInfos[i - 1], baselineLeftEdge);
    }

    if (sep === '\n\n') {
      paragraphs.push(makeParagraph());
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

      const lastLine = currentParagraph.lines[currentParagraph.lines.length - 1];

      // Soft-wrap: merge into the previous line with a space.
      if (sep === ' ' && lastLine !== undefined) {
        lastLine.text += ` ${text}`;
        mergeSpansWithSpace(lastLine.spans, spans);
        lastLine.rightEdge = lineInfo.rightEdge;
      } else {
        currentParagraph.lines.push({
          text,
          spans,
          fontSize: lineInfo.dominantFontSize,
          leftEdge: lineInfo.leftEdge,
          rightEdge: lineInfo.rightEdge,
        });
      }
    }
  }

  return paragraphs;
};

/**
 * Check whether a line is indented relative to the page baseline left edge,
 * suggesting it belongs to a list whose bullet/marker is not in the text.
 */
const isIndentedLine = (lineInfo: LineInfo, baselineLeftEdge: number | undefined): boolean => {
  if (baselineLeftEdge === undefined) {
    return false;
  }

  const indent = lineInfo.leftEdge - baselineLeftEdge;

  return indent >= LIST_INDENT_THRESHOLD && indent <= LIST_INDENT_MAX;
};

/**
 * Refine a separator produced by {@link lineSeparator} with additional
 * heuristics for font-size changes and list-item boundaries.
 *
 * Text-based list markers (e.g. "1.", "a)") override even soft-wrap because a
 * marker at the start of a line is unambiguous. Geometry-only detection
 * (indentation) only promotes hard-break lines — a soft-wrapped continuation
 * shares the same indentation as the list item's first line.
 */
const refineSeparator = (
  sep: '\n\n' | '\n' | ' ' | null,
  text: string,
  lineInfo: LineInfo,
  prevLineInfo: LineInfo | undefined,
  baselineLeftEdge: number | undefined,
): '\n\n' | '\n' | ' ' | null => {
  if (sep === '\n\n') {
    return sep;
  }

  if (prevLineInfo !== undefined && hasFontSizeChange(prevLineInfo, lineInfo)) {
    return '\n\n';
  }

  if (detectListMarker(text) !== null) {
    return '\n\n';
  }

  if (sep !== ' ' && isIndentedLine(lineInfo, baselineLeftEdge)) {
    return '\n\n';
  }

  return sep;
};

/**
 * Append `newSpans` to `existing`, inserting a space separator while merging
 * adjacent spans that share the same bold/italic style.
 */
const mergeSpansWithSpace = (existing: ReflowSpan[], newSpans: ReflowSpan[]): void => {
  const lastSpan = existing[existing.length - 1];
  const firstNew = newSpans[0];

  if (
    lastSpan !== undefined &&
    firstNew !== undefined &&
    lastSpan.bold === firstNew.bold &&
    lastSpan.italic === firstNew.italic
  ) {
    lastSpan.text += ` ${firstNew.text}`;
    existing.push(...newSpans.slice(1));
  } else if (lastSpan !== undefined) {
    lastSpan.text += ' ';
    existing.push(...newSpans);
  } else {
    existing.push({ text: ' ', bold: false, italic: false }, ...newSpans);
  }
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

  /** The right edge (x + width) of the last visible run added. */
  let prevRunRight = Number.NEGATIVE_INFINITY;
  /** The average glyph width of the last visible run. */
  let prevAvgGlyphWidth = 0;

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

    insertHorizontalGapSpace(spans, run, prevRunRight, prevAvgGlyphWidth);

    const text = extractRunText(run, charStart, charEnd, rawText, selectionStart);

    if (text === null) {
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

    // Track run position for gap detection.
    prevRunRight = run.rect.x + run.rect.width;
    prevAvgGlyphWidth = run.glyphs.length > 0 ? run.rect.width / run.glyphs.length : 0;
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

/**
 * If a run starts far to the right of the previous run (indicating a table
 * cell or column gap), append a space to the last span in the list.
 */
const insertHorizontalGapSpace = (
  spans: ReflowSpan[],
  run: ScreenRun,
  prevRunRight: number,
  prevAvgGlyphWidth: number,
): void => {
  if (spans.length === 0 || run.rect.width <= 0 || prevAvgGlyphWidth <= 0) {
    return;
  }

  const gap = run.rect.x - prevRunRight;

  if (gap > prevAvgGlyphWidth * HORIZONTAL_GAP_FACTOR) {
    const prev = spans[spans.length - 1];

    if (prev !== undefined) {
      prev.text += ' ';
    }
  }
};

/** Extract and trim text for a run's overlap with a character range. */
const extractRunText = (
  run: ScreenRun,
  charStart: number,
  charEnd: number,
  rawText: string,
  selectionStart: number,
): string | null => {
  const runEnd = run.charStart + run.glyphs.length - 1;
  const overlapStart = Math.max(run.charStart, charStart);
  const overlapEnd = Math.min(runEnd, charEnd);

  const textStart = Math.max(overlapStart - selectionStart, 0);
  const textEnd = Math.min(overlapEnd - selectionStart + 1, rawText.length);

  if (textStart >= rawText.length || textEnd <= textStart) {
    return null;
  }

  const text = rawText.slice(textStart, textEnd).replace(/^[\r\n]+|[\r\n]+$/g, '');

  return text.length > 0 ? text : null;
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
// Alignment detection
// ---------------------------------------------------------------------------

/**
 * Tolerance (in screen pixels) for edge consistency. Lines whose left (or
 * right) edges are within this distance of each other are considered aligned.
 */
const ALIGNMENT_TOLERANCE = 4;

/**
 * Detect the text alignment of a paragraph by comparing the variance of left
 * and right edges across its lines.
 *
 * - **Left-aligned**: left edges are consistent, right edges vary.
 * - **Right-aligned**: right edges are consistent, left edges vary.
 * - **Center-aligned**: both edges vary but the center is consistent.
 *
 * Single-line paragraphs default to `'left'` since there's nothing to compare.
 */
const detectAlignment = (
  paragraph: InternalParagraph,
  maxRight: number,
  baselineLeftEdge: number | undefined,
): TextAlignment => {
  const lines = paragraph.lines.filter((l) => l.leftEdge !== undefined && l.rightEdge !== undefined);

  if (lines.length < 2) {
    // For single-line paragraphs, compare against page-level baselines.
    const line = lines[0];

    if (line !== undefined && baselineLeftEdge !== undefined && maxRight > 0) {
      const leftOffset = (line.leftEdge ?? 0) - baselineLeftEdge;
      const rightOffset = maxRight - (line.rightEdge ?? maxRight);
      const pageWidth = maxRight - baselineLeftEdge;

      // Right-aligned: far from left baseline, close to right edge.
      if (leftOffset > pageWidth * 0.4 && rightOffset <= ALIGNMENT_TOLERANCE) {
        return 'right';
      }

      // Center-aligned: similar offsets on both sides.
      if (leftOffset > ALIGNMENT_TOLERANCE && Math.abs(leftOffset - rightOffset) <= ALIGNMENT_TOLERANCE * 2) {
        return 'center';
      }
    }

    return 'left';
  }

  const leftEdges = lines.map((l) => l.leftEdge ?? 0);
  const rightEdges = lines.map((l) => l.rightEdge ?? maxRight);

  const leftSpread = Math.max(...leftEdges) - Math.min(...leftEdges);
  const rightSpread = Math.max(...rightEdges) - Math.min(...rightEdges);

  const leftConsistent = leftSpread <= ALIGNMENT_TOLERANCE;
  const rightConsistent = rightSpread <= ALIGNMENT_TOLERANCE;

  if (leftConsistent && rightConsistent) {
    return 'left';
  }

  if (rightConsistent && !leftConsistent) {
    return 'right';
  }

  if (leftConsistent && !rightConsistent) {
    return 'left';
  }

  // Both vary — check for center alignment via consistent midpoints.
  const centers = lines.map((l) => ((l.leftEdge ?? 0) + (l.rightEdge ?? maxRight)) / 2);
  const centerSpread = Math.max(...centers) - Math.min(...centers);

  if (centerSpread <= ALIGNMENT_TOLERANCE) {
    return 'center';
  }

  return 'left';
};

// ---------------------------------------------------------------------------
// Paragraph classification — heading, list, or plain paragraph
// ---------------------------------------------------------------------------

/**
 * Minimum indentation (in screen-coordinate pixels) relative to the page
 * baseline left edge for a paragraph to be considered a list item when no
 * text-based marker is found.
 */
const LIST_INDENT_THRESHOLD = 8;

/**
 * Maximum indentation for list detection. Indents beyond this are more likely
 * caused by right/center alignment than by a list bullet.
 */
const LIST_INDENT_MAX = 60;

/** Classify a paragraph's role based on font size, line count, and text patterns. */
const classifyParagraph = (
  paragraph: InternalParagraph,
  baselineFontSize: number | undefined,
  maxFontSize: number | undefined,
  baselineLeftEdge: number | undefined,
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

  // Geometry-based unordered list detection: the paragraph is indented
  // relative to the page baseline left edge, suggesting a bullet rendered
  // outside the text stream. Only applies to left-aligned text — right or
  // center alignment naturally shifts the left edge.
  if (paragraph.alignment === 'left' && isIndentedParagraph(paragraph, baselineLeftEdge)) {
    paragraph.role = 'list-item';
    paragraph.listKind = 'unordered';

    return;
  }

  // --- Heading detection ---
  if (baselineFontSize === undefined || baselineFontSize === 0) {
    return;
  }

  const avgFontSize = computeParagraphAvgFontSize(paragraph);

  if (avgFontSize === undefined) {
    return;
  }

  const ratio = avgFontSize / baselineFontSize;

  if (ratio < HEADING_FONT_SIZE_FACTOR) {
    return;
  }

  // Headings are short — reject paragraphs with many lines.
  if (paragraph.lines.length > HEADING_MAX_LINES) {
    return;
  }

  paragraph.role = 'heading';
  paragraph.headingLevel = headingLevelFromRatio(ratio, baselineFontSize, maxFontSize);
};

/**
 * Check whether a paragraph is indented relative to the page baseline left
 * edge. This detects list items whose bullet glyph is not part of the text
 * stream — the visible text starts further right than normal body text.
 */
const isIndentedParagraph = (paragraph: InternalParagraph, baselineLeftEdge: number | undefined): boolean => {
  if (baselineLeftEdge === undefined) {
    return false;
  }

  const firstLine = paragraph.lines[0];

  if (firstLine?.leftEdge === undefined) {
    return false;
  }

  const indent = firstLine.leftEdge - baselineLeftEdge;

  return indent >= LIST_INDENT_THRESHOLD && indent <= LIST_INDENT_MAX;
};

/**
 * Map a font-size ratio to a heading level (1–3) using adaptive thresholds.
 *
 * When the document's maximum font size is known, heading levels are
 * distributed across the range between the baseline body size and the
 * maximum. This produces consistent h1/h2/h3 assignment regardless of
 * absolute font sizes.
 */
const headingLevelFromRatio = (
  ratio: number,
  baselineFontSize: number | undefined,
  maxFontSize: number | undefined,
): number => {
  if (baselineFontSize !== undefined && maxFontSize !== undefined && maxFontSize > baselineFontSize) {
    const maxRatio = maxFontSize / baselineFontSize;
    const range = maxRatio - 1;

    // Upper third → h1, middle third → h2, lower third → h3.
    if (ratio >= 1 + range * (2 / 3)) {
      return 1;
    }

    if (ratio >= 1 + range * (1 / 3)) {
      return 2;
    }

    return 3;
  }

  // Fallback when no max font size is available.
  if (ratio >= 1.4) {
    return 1;
  }

  return 2;
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

/** Ordered list: digits followed by `.` or `)` with optional space, or single letter followed by `)` (not `.` to avoid matching initials like "D. Smith"). */
const ORDERED_MARKER = /^[\s]*(\d{1,4}[.)]\s*|[a-zA-Z][)]\s*|[ivxlIVXL]{1,6}[.)]\s*)/;

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
const stripListMarker = (paragraph: InternalParagraph, markerLength: number): void => {
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
 * Compute the baseline (body) font size from ALL visible runs on the page.
 *
 * Uses a character-count-weighted mode rounded to 1 decimal. Looking at the
 * entire page (not just the selection) ensures that selecting only a heading
 * still produces the correct body-text baseline for ratio comparison.
 */
const computeBaselineFontSize = (geo: ScreenPageGeometry): number | undefined => {
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
const computePageMaxFontSize = (geo: ScreenPageGeometry): number | undefined => {
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
 * Compute the maximum font size across multiple pages. Call this before
 * per-page analysis and pass the result as `documentMaxFontSize` to
 * {@link analyzePageReflow} for consistent heading level assignment.
 */
export const computeDocumentMaxFontSize = (pages: ScreenPageGeometry[]): number | undefined => {
  let max: number | undefined;

  for (const geo of pages) {
    const pageMax = computePageMaxFontSize(geo);

    if (pageMax !== undefined && (max === undefined || pageMax > max)) {
      max = pageMax;
    }
  }

  return max;
};
const computeParagraphAvgFontSize = (paragraph: InternalParagraph): number | undefined => {
  let sum = 0;
  let count = 0;

  for (const line of paragraph.lines) {
    if (line.fontSize !== undefined) {
      sum += line.fontSize;
      count += 1;
    }
  }

  return count > 0 ? sum / count : undefined;
};

/**
 * Compute the baseline (body) left edge from ALL visible runs on the page.
 *
 * Buckets left edges by pixel position, weighted by character count. The
 * baseline is the leftmost edge that appears with significant frequency
 * (≥5% of total characters). This avoids picking an indented block that
 * happens to have the most text while still filtering out rare outliers.
 */
const computeBaselineLeftEdge = (geo: ScreenPageGeometry): number | undefined => {
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
 * Compute the maximum right edge for full-width detection.
 *
 * When the geometry includes a `pageWidth` (from the PDF page dimensions),
 * we use that so a page with only short lines doesn't falsely treat them
 * as "full width." Falls back to the rightmost text edge when `pageWidth`
 * is not available (e.g. in test fixtures without it).
 */
const computePageMaxRight = (geo: ScreenPageGeometry): number => {
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
 *  - Short line → `\n` (explicit line break)
 */
const lineSeparator = (
  gap: number | undefined,
  line: LineInfo,
  paragraphThreshold: number,
  maxRight: number,
): '\n\n' | '\n' | ' ' => {
  if (gap !== undefined && gap > paragraphThreshold) {
    return '\n\n';
  }

  const isFullWidth = maxRight > 0 && line.rightEdge >= maxRight * FULL_WIDTH_THRESHOLD;

  if (isFullWidth) {
    return ' ';
  }

  return '\n';
};

/**
 * Check whether two adjacent lines have a significant font-size difference,
 * indicating a structural boundary (e.g. heading → body or body → heading).
 */
const hasFontSizeChange = (a: LineInfo, b: LineInfo): boolean => {
  if (a.dominantFontSize === undefined || b.dominantFontSize === undefined) {
    return false;
  }

  const larger = Math.max(a.dominantFontSize, b.dominantFontSize);
  const smaller = Math.min(a.dominantFontSize, b.dominantFontSize);

  if (smaller === 0) {
    return false;
  }

  return larger / smaller >= FONT_SIZE_BREAK_RATIO;
};

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

/**
 * Compute the 25th percentile of a non-empty array of numbers.
 *
 * Using the lower quartile instead of the median better represents
 * body-text line spacing in documents where headings or paragraph gaps
 * inflate the upper half of the distribution.
 */
const percentile25 = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.25);

  return sorted[idx] ?? 0;
};
