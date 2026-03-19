import type { LineInfo } from './line-info';
import type { InternalParagraph, TextAlignment } from './reflow-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tolerance (in screen pixels) for edge consistency. Lines whose left (or
 * right) edges are within this distance of each other are considered aligned.
 */
const ALIGNMENT_TOLERANCE = 4;

/**
 * A line whose dominant font size exceeds the baseline body size by at least
 * this factor is a heading candidate.
 */
const HEADING_FONT_SIZE_FACTOR = 1.15;

/** Maximum number of non-soft-wrapped lines for a paragraph to be a heading. */
const HEADING_MAX_LINES = 3;

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

// ---------------------------------------------------------------------------
// Alignment detection
// ---------------------------------------------------------------------------

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
export const detectAlignment = (
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

/** Classify a paragraph's role based on font size, line count, and text patterns. */
export const classifyParagraph = (
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
 * Check whether a line is indented relative to the page baseline left edge,
 * suggesting it belongs to a list whose bullet/marker is not in the text.
 */
export const isIndentedLine = (lineInfo: LineInfo, baselineLeftEdge: number | undefined): boolean => {
  if (baselineLeftEdge === undefined) {
    return false;
  }

  const indent = lineInfo.leftEdge - baselineLeftEdge;

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

export const detectListMarker = (text: string): ListMarkerMatch | null => {
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
