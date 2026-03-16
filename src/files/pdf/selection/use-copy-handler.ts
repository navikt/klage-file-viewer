import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { useEffect, useRef } from 'react';
import type { PageSelectionRange, ScreenPageGeometry, ScreenRun, TextSelection } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY } from '@/files/pdf/selection/types';

/**
 * When our custom PDF selection changes, extract the selected text from the
 * engine and place it inside a hidden DOM element with a real browser
 * Selection. This gives us native Ctrl+C and correct context menus.
 *
 * Also intercepts the `copy` event as a fallback for when the browser
 * selection gets lost.
 *
 * Uses page geometry to detect paragraph boundaries and line structure:
 *  - Lines separated by a gap significantly larger than the typical line
 *    spacing are joined with a double newline (paragraph break).
 *  - Short lines (headings, list items, last line of a paragraph) keep a
 *    single newline.
 *  - Full-width lines that wrap to the next line are joined with a space.
 */
export const useCopyHandler = (
  engine: PdfEngine | null,
  doc: PdfDocumentObject | null,
  selection: TextSelection | null,
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>,
): React.RefObject<HTMLDivElement | null> => {
  const hiddenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hiddenRef.current;

    if (el === null) {
      return;
    }

    if (engine === null || doc === null || selection === null || selection.ranges.length === 0) {
      el.textContent = '';

      return;
    }

    const slices = selection.ranges.map((range) => ({
      pageIndex: range.pageIndex,
      charIndex: range.startCharIndex,
      charCount: range.endCharIndex - range.startCharIndex + 1,
    }));

    const task = engine.getTextSlices(doc, slices);

    task.wait(
      (texts) => {
        const pageTexts = texts.map((text, i) => {
          const range = selection.ranges[i];

          if (range === undefined) {
            return text;
          }

          const geo = geometryRegistry.current.get(range.pageIndex);

          return geo === undefined ? text : reflowPageText(text, range, geo);
        });

        el.textContent = pageTexts.join('\n\n');

        selectHiddenElement(el);
      },
      () => {
        el.textContent = '';
      },
    );

    const handleMouseDown = (e: MouseEvent): void => {
      if (el.textContent === null || el.textContent.length === 0) {
        return;
      }

      if (e.button === 2) {
        // Intercept right-click to move the selection under the mouse
        // so the native context menu includes the "Copy" option.
        el.style.setProperty('position', 'fixed');
        el.style.setProperty('top', `${e.clientY}px`);
        el.style.setProperty('left', `${e.clientX}px`);
        el.style.setProperty('z-index', '2147483647');
      } else {
        el.style.setProperty('position', 'absolute');
        el.style.setProperty('top', '-9999px');
        el.style.setProperty('left', '-9999px');
        el.style.setProperty('z-index', 'auto');
      }
    };

    // Fallback: intercept the copy event and set clipboard data synchronously.
    const handleCopy = (e: ClipboardEvent): void => {
      const text = el.textContent;

      if (text.length === 0) {
        return;
      }

      // If there's a native browser text selection elsewhere (e.g. search input), defer.
      const nativeSelection = window.getSelection();
      const nativeText = nativeSelection?.toString() ?? '';

      if (nativeText.length > 0 && nativeText !== text) {
        return;
      }

      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [engine, doc, selection, geometryRegistry]);

  return hiddenRef;
};

/** Create a real browser Selection over the hidden element's text content. */
const selectHiddenElement = (el: HTMLElement): void => {
  const browserSelection = window.getSelection();

  if (browserSelection === null) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(el);
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
};

// ---------------------------------------------------------------------------
// Paragraph-aware text reflow
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

/**
 * Reflow the raw text for a single page selection, replacing soft line breaks
 * (same paragraph) with spaces and keeping paragraph breaks as double newlines.
 * Short lines (that don't reach the right margin) keep a single newline.
 */
const reflowPageText = (rawText: string, range: PageSelectionRange, geo: ScreenPageGeometry): string => {
  const lines = collectLineInfo(range, geo);

  // Not enough geometry data — fall back to the raw text as-is.
  if (lines.length < MIN_LINES_FOR_STATS) {
    return rawText;
  }

  const gaps = computeLineGaps(lines);

  // No measurable gaps — single line or uniform.
  if (gaps.length === 0) {
    return rawText;
  }

  const medianGap = median(gaps);
  const paragraphThreshold = medianGap * PARAGRAPH_GAP_FACTOR;

  // Determine the maximum right edge across ALL runs on the page — not just
  // the selected lines. This gives us the true column width so that short
  // lines (headings, list items, last line of a paragraph) are correctly
  // identified even when the selection only covers a few lines.
  const maxRight = computePageMaxRight(geo);

  return joinLines(rawText, range, lines, gaps, paragraphThreshold, maxRight);
};

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
): string => {
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

/**
 * Split the raw text into per-line segments using character index boundaries
 * from the geometry, then re-join with the appropriate separator for each
 * line boundary.
 *
 * This approach does not rely on PDFium emitting `\n` characters at visual
 * line breaks — it uses the runs' character ranges to determine where each
 * line starts and ends, which correctly handles soft-breaks that PDFium does
 * not represent with a newline character.
 */
const joinLines = (
  rawText: string,
  range: PageSelectionRange,
  lines: LineInfo[],
  gaps: number[],
  paragraphThreshold: number,
  maxRight: number,
): string => {
  const textLines = splitTextByGeometry(rawText, range, lines);

  const parts: string[] = [];

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];

    if (line === undefined) {
      continue;
    }

    if (i > 0) {
      const prevLine = lines[i - 1];

      if (prevLine !== undefined) {
        parts.push(lineSeparator(gaps[i - 1], prevLine, paragraphThreshold, maxRight, line));
      }
    }

    parts.push(line);
  }

  return parts.join('');
};

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
