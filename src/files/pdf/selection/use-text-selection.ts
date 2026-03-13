import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageSelectionRange, ScreenPageGeometry, ScreenRun, TextSelection } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY, GLYPH_FLAG_SPACE } from '@/files/pdf/selection/types';

interface SelectionAnchor {
  pageIndex: number;
  charIndex: number;
}

/**
 * Minimum vertical overlap ratio (0–1) for two runs to be considered on the
 * same visual line. Matches EmbedPDF's `VERTICAL_OVERLAP_THRESHOLD_LINE`.
 *
 * Using a ratio instead of a fixed pixel tolerance makes the check
 * scale-independent — it works correctly regardless of zoom level or font size.
 */
const VERTICAL_OVERLAP_THRESHOLD_LINE = 0.5;

interface UseTextSelectionResult {
  selection: TextSelection | null;
  isSelecting: boolean;
  /** Called on mousedown — receives the browser's click-count via e.detail. */
  handleMouseDown: (pageIndex: number, charIndex: number, detail: number) => void;
  /** Called on pointermove while selecting. */
  handlePointerMove: (pageIndex: number, charIndex: number) => void;
  /** Called on pointerup. */
  handlePointerUp: () => void;
  clearSelection: () => void;
  getPageSelectionRange: (pageIndex: number) => PageSelectionRange | null;
  /** Registry for page geometry — each PdfPage registers its geometry here for word/line selection. */
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>;
}

export const useTextSelection = (): UseTextSelectionResult => {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const anchorRef = useRef<SelectionAnchor | null>(null);
  const geometryRegistry = useRef<Map<number, ScreenPageGeometry>>(new Map());

  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsSelecting(false);
    anchorRef.current = null;
  }, []);

  // Clear selection on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection !== null) {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selection, clearSelection]);

  const buildSelection = useCallback(
    (anchor: SelectionAnchor, current: { pageIndex: number; charIndex: number }): TextSelection => {
      // Determine forward vs backward
      const forward =
        anchor.pageIndex < current.pageIndex ||
        (anchor.pageIndex === current.pageIndex && anchor.charIndex <= current.charIndex);

      const startPage = forward ? anchor.pageIndex : current.pageIndex;
      const endPage = forward ? current.pageIndex : anchor.pageIndex;
      const startChar = forward ? anchor.charIndex : current.charIndex;
      const endChar = forward ? current.charIndex : anchor.charIndex;

      const ranges: PageSelectionRange[] = [];

      for (let pageIdx = startPage; pageIdx <= endPage; pageIdx++) {
        const geo = geometryRegistry.current.get(pageIdx);
        const totalChars = getTotalCharCount(geo);

        if (totalChars === 0) {
          continue;
        }

        const range = buildPageRange(pageIdx, totalChars, startPage, endPage, startChar, endChar);
        ranges.push(range);
      }

      return { ranges };
    },
    [],
  );

  /**
   * Primary handler — receives the browser's click count from `mousedown`
   * (`e.detail`), which correctly increments to 2 for double-click and 3+
   * for triple-click. `pointerdown` always reports `detail === 0` in most
   * browsers, so we must use `mousedown` for multi-click detection.
   */
  const handleMouseDown = useCallback(
    (pageIndex: number, charIndex: number, detail: number) => {
      if (charIndex < 0) {
        clearSelection();
        return;
      }

      const geo = geometryRegistry.current.get(pageIndex);

      // Triple-click (or more) → line selection
      if (detail >= 3) {
        const bounds = expandToLineBoundary(geo, charIndex);

        if (bounds !== null) {
          anchorRef.current = { pageIndex, charIndex: bounds.from };
          setSelection({
            ranges: [{ pageIndex, startCharIndex: bounds.from, endCharIndex: bounds.to }],
          });
          setIsSelecting(false);
          return;
        }
      }

      // Double-click → word selection
      if (detail === 2) {
        const bounds = expandToWordBoundary(geo, charIndex);

        if (bounds !== null) {
          anchorRef.current = { pageIndex, charIndex: bounds.from };
          setSelection({
            ranges: [{ pageIndex, startCharIndex: bounds.from, endCharIndex: bounds.to }],
          });
          setIsSelecting(false);
          return;
        }
      }

      // Single click → start drag selection
      anchorRef.current = { pageIndex, charIndex };
      setSelection(null);
      setIsSelecting(true);
    },
    [clearSelection],
  );

  const handlePointerMove = useCallback(
    (pageIndex: number, charIndex: number) => {
      if (!isSelecting || anchorRef.current === null) {
        return;
      }

      if (charIndex < 0) {
        return;
      }

      const newSelection = buildSelection(anchorRef.current, { pageIndex, charIndex });
      setSelection(newSelection);
    },
    [isSelecting, buildSelection],
  );

  const handlePointerUp = useCallback(() => {
    if (!isSelecting) {
      return;
    }

    setIsSelecting(false);

    // If no movement occurred (click without drag), clear selection
    if (selection === null || selection.ranges.length === 0) {
      anchorRef.current = null;
    }
  }, [isSelecting, selection]);

  const getPageSelectionRange = useCallback(
    (pageIndex: number): PageSelectionRange | null => {
      if (selection === null) {
        return null;
      }

      return selection.ranges.find((r) => r.pageIndex === pageIndex) ?? null;
    },
    [selection],
  );

  return {
    selection,
    isSelecting,
    handleMouseDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    getPageSelectionRange,
    geometryRegistry,
  };
};

// ---------------------------------------------------------------------------
// Pure helper functions — no React dependencies
// ---------------------------------------------------------------------------

// ── Run / glyph resolution ───────────────────────────────────────────────

/**
 * Resolve a global character index to the run and local offset within that
 * run.  Mirrors EmbedPDF's `resolveCharIndex`.
 */
const resolveCharIndex = (geo: ScreenPageGeometry, charIndex: number): { runIdx: number; localIdx: number } | null => {
  for (let r = 0; r < geo.runs.length; r++) {
    const run = geo.runs[r];

    if (run === undefined) {
      continue;
    }

    const localIdx = charIndex - run.charStart;

    if (localIdx >= 0 && localIdx < run.glyphs.length) {
      return { runIdx: r, localIdx };
    }
  }

  return null;
};

/**
 * Total number of characters across all runs in a page geometry.
 */
const getTotalCharCount = (geo: ScreenPageGeometry | undefined): number => {
  if (geo === undefined || geo.runs.length === 0) {
    return 0;
  }

  const lastRun = geo.runs[geo.runs.length - 1];

  if (lastRun === undefined) {
    return 0;
  }

  return lastRun.charStart + lastRun.glyphs.length;
};

// ── Vertical overlap helpers ─────────────────────────────────────────────

/**
 * Check whether two run extents overlap vertically enough to be considered
 * on the same visual line.  Uses the IoU-style ratio from EmbedPDF.
 */
const runsOverlapVertically = (top1: number, bottom1: number, top2: number, bottom2: number): boolean => {
  const unionHeight = Math.max(bottom1, bottom2) - Math.min(top1, top2);
  const intersectHeight = Math.max(0, Math.min(bottom1, bottom2) - Math.max(top1, top2));

  if (unionHeight === 0) {
    return false;
  }

  return intersectHeight / unionHeight >= VERTICAL_OVERLAP_THRESHOLD_LINE;
};

const isZeroSizeRun = (run: ScreenRun): boolean => run.rect.width === 0 && run.rect.height === 0;

// ── Word boundary helpers ────────────────────────────────────────────────

/**
 * Check if a glyph acts as a word boundary (space or empty) based solely on
 * the glyph flag. Used as the fallback when page text is unavailable.
 */
const isGlyphWordBoundary = (flags: number): boolean => flags === GLYPH_FLAG_SPACE || flags === GLYPH_FLAG_EMPTY;

/**
 * Check whether a character is a "word" character — a letter, digit, or
 * underscore — matching the `\w` class from Unicode-aware regular expressions.
 *
 * When `pageText` is available this gives us proper word boundaries that
 * exclude punctuation (commas, periods, quotes, etc.) from the selected word,
 * matching Chrome's behaviour.
 *
 * Uses Unicode property escapes (`\p{L}` for letters, `\p{N}` for numbers)
 * so that characters from all scripts (æøå, àçñ, Cyrillic, CJK, etc.) are
 * correctly treated as word characters.
 */
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

const isWordChar = (ch: string): boolean => WORD_CHAR_RE.test(ch);

/**
 * Determine whether the character at `idx` is a word boundary.
 *
 * Strategy:
 *  1. If `pageText` is available, classify the actual character: anything
 *     that is not a word character (`\w`) is a boundary.
 *  2. Otherwise fall back to glyph flags (space / empty).
 */
const isWordBoundaryAt = (geo: ScreenPageGeometry, idx: number): boolean => {
  // Prefer character-level classification when page text is available.
  if (geo.pageText !== undefined) {
    const ch = geo.pageText[idx];

    if (ch !== undefined) {
      return !isWordChar(ch);
    }
  }

  // Fallback: use glyph flags.
  const resolved = resolveCharIndex(geo, idx);

  if (resolved === null) {
    return true;
  }

  const glyph = geo.runs[resolved.runIdx]?.glyphs[resolved.localIdx];

  return glyph === undefined || isGlyphWordBoundary(glyph.flags);
};

// ── Word boundary expansion ──────────────────────────────────────────────

/**
 * Expand a character index to the word surrounding it.
 *
 * Walks backward and forward from `charIndex` within the page geometry
 * until a word boundary is encountered. When `pageText` is available on the
 * geometry, boundaries are determined by Unicode character classification
 * (letters/digits vs punctuation/spaces), matching Chrome's behaviour.
 * Otherwise falls back to glyph flags (space / empty).
 *
 * Adapted from EmbedPDF's `expandToWordBoundary` with added punctuation
 * awareness inspired by PDFium's `CFDE_TextEditEngine::BoundsForWordAt`.
 *
 * @returns `{ from, to }` inclusive indices, or null if charIndex is invalid.
 */
const expandToWordBoundary = (
  geo: ScreenPageGeometry | undefined,
  charIndex: number,
): { from: number; to: number } | null => {
  if (geo === undefined) {
    return null;
  }

  const resolved = resolveCharIndex(geo, charIndex);

  if (resolved === null) {
    return null;
  }

  const totalChars = getTotalCharCount(geo);

  if (totalChars === 0) {
    return null;
  }

  // If the clicked character is itself a boundary (punctuation / space),
  // select just that single character — matching Chrome's behaviour.
  if (isWordBoundaryAt(geo, charIndex)) {
    return { from: charIndex, to: charIndex };
  }

  // Walk backward
  let from = charIndex;

  while (from > 0) {
    if (isWordBoundaryAt(geo, from - 1)) {
      break;
    }

    from--;
  }

  // Walk forward
  let to = charIndex;

  while (to < totalChars - 1) {
    if (isWordBoundaryAt(geo, to + 1)) {
      break;
    }

    to++;
  }

  return { from, to };
};

// ── Line boundary expansion ──────────────────────────────────────────────

/**
 * Expand a character index to the full visual line (row) it belongs to.
 *
 * Finds all runs whose vertical extent overlaps with the run containing
 * `charIndex`, then returns the first-to-last character span across those
 * runs.
 *
 * Adapted from EmbedPDF's `expandToLineBoundary`.
 *
 * @returns `{ from, to }` inclusive indices, or null if charIndex is invalid.
 */
const expandToLineBoundary = (
  geo: ScreenPageGeometry | undefined,
  charIndex: number,
): { from: number; to: number } | null => {
  if (geo === undefined) {
    return null;
  }

  const resolved = resolveCharIndex(geo, charIndex);

  if (resolved === null) {
    return null;
  }

  const anchorRun = geo.runs[resolved.runIdx];

  if (anchorRun === undefined) {
    return null;
  }

  const anchorTop = anchorRun.rect.y;
  const anchorBottom = anchorRun.rect.y + anchorRun.rect.height;

  let from = anchorRun.charStart;
  let to = anchorRun.charStart + anchorRun.glyphs.length - 1;

  // Expand backward through runs on the same visual row
  for (let r = resolved.runIdx - 1; r >= 0; r--) {
    const run = geo.runs[r];

    if (run === undefined) {
      continue;
    }

    if (isZeroSizeRun(run)) {
      continue;
    }

    if (!runsOverlapVertically(run.rect.y, run.rect.y + run.rect.height, anchorTop, anchorBottom)) {
      break;
    }

    from = run.charStart;
  }

  // Expand forward through runs on the same visual row
  for (let r = resolved.runIdx + 1; r < geo.runs.length; r++) {
    const run = geo.runs[r];

    if (run === undefined) {
      continue;
    }

    if (isZeroSizeRun(run)) {
      continue;
    }

    if (!runsOverlapVertically(run.rect.y, run.rect.y + run.rect.height, anchorTop, anchorBottom)) {
      break;
    }

    to = run.charStart + run.glyphs.length - 1;
  }

  return { from, to };
};

// ── Page range builder ───────────────────────────────────────────────────

const buildPageRange = (
  pageIdx: number,
  totalChars: number,
  startPage: number,
  endPage: number,
  startChar: number,
  endChar: number,
): PageSelectionRange => {
  if (pageIdx === startPage && pageIdx === endPage) {
    return { pageIndex: pageIdx, startCharIndex: startChar, endCharIndex: endChar };
  }

  if (pageIdx === startPage) {
    return { pageIndex: pageIdx, startCharIndex: startChar, endCharIndex: totalChars - 1 };
  }

  if (pageIdx === endPage) {
    return { pageIndex: pageIdx, startCharIndex: 0, endCharIndex: endChar };
  }

  return { pageIndex: pageIdx, startCharIndex: 0, endCharIndex: totalChars - 1 };
};
