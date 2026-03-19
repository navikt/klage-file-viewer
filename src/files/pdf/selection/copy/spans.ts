import type { ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';
import { isBoldRun, isItalicRun } from './font-detection';
import type { ReflowSpan } from './reflow-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * When the horizontal gap between two consecutive runs on the same line
 * exceeds this multiple of the average glyph width, insert a space.
 * Typical character gaps are 0–1× glyph width; table columns or signature
 * blocks have gaps of 3× or more.
 */
const HORIZONTAL_GAP_FACTOR = 2;

// ---------------------------------------------------------------------------
// Span extraction — build styled spans from run boundaries within a line
// ---------------------------------------------------------------------------

/**
 * Build styled spans for a character range by walking the geometry runs that
 * overlap the range and extracting text + font style for each.
 */
export const buildSpansForRange = (
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

/**
 * Append `newSpans` to `existing`, inserting a space separator while merging
 * adjacent spans that share the same bold/italic style.
 */
export const mergeSpansWithSpace = (existing: ReflowSpan[], newSpans: ReflowSpan[]): void => {
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
