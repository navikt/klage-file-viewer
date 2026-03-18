import type { PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageGeometry, ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';

interface UsePageGeometryResult {
  geometry: ScreenPageGeometry | null;
}

/** Raw data fetched from the engine for a single page — geometry + text. */
interface RawPageData {
  geometry: PageGeometry;
  pageText: string | undefined;
}

/**
 * Fetch page geometry (runs of glyphs grouped by their underlying
 * `CPDF_TextObject`) from the engine and transform to screen coordinates.
 *
 * The caller gets `ScreenPageGeometry` whose `runs`
 * array preserves the structural information that PDFium provides:
 *
 *  - Each run corresponds to a single PDF text object.
 *  - Run boundaries are natural word/line break points.
 *  - Each glyph carries a `flags` field (0 = normal, 1 = space, 2 = empty)
 *    so consumers can detect boundaries without heuristics.
 *  - Glyphs include optional tight bounds (`tightX/Y/Width/Height`) used for
 *    hit-testing that matches Chrome's `FPDFText_GetCharIndexAtPos` behaviour.
 *
 * Additionally fetches the full page text via `engine.getTextSlices` so that
 * `expandToWordBoundary` can perform proper Unicode word-boundary detection
 * (letters vs punctuation) instead of relying solely on glyph flags.
 */
export const usePageGeometry = (
  engine: PdfEngine,
  doc: PdfDocumentObject,
  page: PdfPageObject,
  scale: number,
  visible: boolean,
): UsePageGeometryResult => {
  const [rawData, setRawData] = useState<RawPageData | null>(null);
  const fetchedPageRef = useRef<number | null>(null);

  // Fetch raw geometry + page text when the page becomes visible (cache by page index).
  useEffect(() => {
    if (!visible) {
      return;
    }

    // Already fetched for this page.
    if (fetchedPageRef.current === page.index) {
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        const geometry = await engine.getPageGeometry(doc, page).toPromise();

        if (cancelled) {
          return;
        }

        // Compute total character count from the geometry so we can request
        // the full page text in a single slice.
        const totalChars = getTotalCharCountFromGeometry(geometry);

        let pageText: string | undefined;

        if (totalChars > 0) {
          try {
            const texts = await engine
              .getTextSlices(doc, [{ pageIndex: page.index, charIndex: 0, charCount: totalChars }])
              .toPromise();

            pageText = texts[0];
          } catch {
            // Text extraction is best-effort — word boundary detection
            // falls back to glyph-flag-only mode if this fails.
          }
        }

        if (!cancelled) {
          fetchedPageRef.current = page.index;
          setRawData({ geometry, pageText });
        }
      } catch {
        // Geometry extraction is best-effort — selection simply won't work
        // for this page if it fails.
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, visible]);

  // Transform raw geometry to screen coordinates whenever the raw data or
  // scale changes. Rotation is handled by the CSS transform on the page
  // container, so we only need to apply the scale factor here.
  const geometry = useMemo(() => {
    if (rawData === null) {
      return null;
    }

    return transformGeometry(rawData.geometry, scale, rawData.pageText);
  }, [rawData, scale]);

  return { geometry };
};

// ---------------------------------------------------------------------------
// Pure transformation helpers — no React dependencies
// ---------------------------------------------------------------------------

/**
 * Compute the total number of characters from raw engine geometry.
 */
const getTotalCharCountFromGeometry = (geo: PageGeometry): number => {
  if (geo.runs.length === 0) {
    return 0;
  }

  const lastRun = geo.runs[geo.runs.length - 1];

  if (lastRun === undefined) {
    return 0;
  }

  return lastRun.charStart + lastRun.glyphs.length;
};

/**
 * Scale an entire {@link PageGeometry} (all runs and their glyphs) from
 * engine device-space to screen coordinates, then reorder runs into visual
 * reading order (top-to-bottom, left-to-right).
 *
 * PDF content streams don't guarantee that text objects appear in visual
 * order — headers/footers are often emitted before or between body text.
 * By sorting runs visually and reassigning `charStart` indices we ensure
 * that the character index space matches the visual layout.  This makes
 * forward/backward selection, contiguous range highlighting, and copy all
 * work correctly without special-casing non-visual ordering.
 */
const transformGeometry = (raw: PageGeometry, scale: number, pageText: string | undefined): ScreenPageGeometry => {
  const factor = scale / 100;

  const runs: ScreenRun[] = raw.runs.map((run) => ({
    rect: {
      x: run.rect.x * factor,
      y: run.rect.y * factor,
      width: run.rect.width * factor,
      height: run.rect.height * factor,
    },
    charStart: run.charStart,
    glyphs: run.glyphs.map((g) => transformGlyph(g, factor)),
    fontSize: run.fontSize,
  }));

  return reorderRunsVisually(runs, pageText);
};

const transformGlyph = (
  g: {
    x: number;
    y: number;
    width: number;
    height: number;
    flags: number;
    tightX?: number;
    tightY?: number;
    tightWidth?: number;
    tightHeight?: number;
  },
  factor: number,
): ScreenRunGlyph => ({
  x: g.x * factor,
  y: g.y * factor,
  width: g.width * factor,
  height: g.height * factor,
  flags: g.flags,
  tightX: g.tightX !== undefined ? g.tightX * factor : undefined,
  tightY: g.tightY !== undefined ? g.tightY * factor : undefined,
  tightWidth: g.tightWidth !== undefined ? g.tightWidth * factor : undefined,
  tightHeight: g.tightHeight !== undefined ? g.tightHeight * factor : undefined,
});

// ---------------------------------------------------------------------------
// Visual run reordering
// ---------------------------------------------------------------------------

/**
 * Minimum vertical overlap ratio for two runs to be considered on the same
 * visual line during the sort.
 */
const SAME_LINE_OVERLAP = 0.5;

/**
 * Sort runs into visual reading order (top-to-bottom, left-to-right),
 * reassign `charStart` indices sequentially, and — if the order changed —
 * remap `pageText` and build a `visualToOriginal` mapping.
 *
 * When the content-stream order already matches visual order the function
 * returns early without allocating a mapping array.
 */
const reorderRunsVisually = (runs: ScreenRun[], pageText: string | undefined): ScreenPageGeometry => {
  if (runs.length <= 1) {
    return { runs, pageText, visualToOriginal: undefined };
  }

  // Pair each run with its original array index so we can detect reordering.
  const indexed = runs.map((run, i) => ({ run, originalIdx: i }));

  // Group runs into visual lines, then sort lines top-to-bottom and runs
  // within each line left-to-right.
  const lines = groupIntoLines(indexed.map((e) => e.run));
  const sorted: { run: ScreenRun; originalIdx: number }[] = [];

  for (const line of lines) {
    // Sort runs within the line by X position.
    const lineEntries: { run: ScreenRun; originalIdx: number }[] = [];

    for (const run of line) {
      const entry = indexed.find((e) => e.run === run);

      if (entry !== undefined) {
        lineEntries.push(entry);
      }
    }

    lineEntries.sort((a, b) => a.run.rect.x - b.run.rect.x);

    for (const entry of lineEntries) {
      sorted.push(entry);
    }
  }

  // Fast path: if the sorted order matches the original, no remapping needed.
  const orderChanged = sorted.some((entry, i) => entry.originalIdx !== i);

  if (!orderChanged) {
    return { runs, pageText, visualToOriginal: undefined };
  }

  // Build the visual-to-original char index mapping and reassign charStart.
  const visualToOriginal: number[] = [];
  const reorderedRuns: ScreenRun[] = [];
  let nextCharStart = 0;

  for (const { run } of sorted) {
    const originalCharStart = run.charStart;
    const glyphCount = run.glyphs.length;

    reorderedRuns.push({ ...run, charStart: nextCharStart });

    for (let i = 0; i < glyphCount; i++) {
      visualToOriginal.push(originalCharStart + i);
    }

    nextCharStart += glyphCount;
  }

  // Remap pageText to visual char order.
  let remappedPageText: string | undefined;

  if (pageText !== undefined) {
    const chars: string[] = [];

    for (const originalIdx of visualToOriginal) {
      chars.push(pageText[originalIdx] ?? '');
    }

    remappedPageText = chars.join('');
  }

  return { runs: reorderedRuns, pageText: remappedPageText, visualToOriginal };
};

/**
 * Group runs into visual lines based on vertical overlap, returning lines
 * sorted from top to bottom.
 *
 * Each "line" is a set of runs whose vertical extents overlap significantly.
 * Lines are sorted by their average Y centre.
 */
const groupIntoLines = (runs: ScreenRun[]): ScreenRun[][] => {
  // Sort a working copy by Y centre so we process top-to-bottom.
  const byY = [...runs].sort((a, b) => {
    const aCy = a.rect.y + a.rect.height / 2;
    const bCy = b.rect.y + b.rect.height / 2;

    return aCy - bCy;
  });

  const lines: { runs: ScreenRun[]; top: number; bottom: number }[] = [];

  for (const run of byY) {
    // Skip zero-size runs.
    if (run.rect.width === 0 && run.rect.height === 0) {
      // Still include them — attach to the current line (or start a new one).
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];

        if (lastLine !== undefined) {
          lastLine.runs.push(run);
        }
      } else {
        lines.push({ runs: [run], top: run.rect.y, bottom: run.rect.y });
      }

      continue;
    }

    const runTop = run.rect.y;
    const runBottom = run.rect.y + run.rect.height;

    // Try to attach to an existing line.
    let attached = false;

    for (const line of lines) {
      const overlapTop = Math.max(line.top, runTop);
      const overlapBottom = Math.min(line.bottom, runBottom);
      const overlap = Math.max(0, overlapBottom - overlapTop);
      const union = Math.max(line.bottom, runBottom) - Math.min(line.top, runTop);

      if (union > 0 && overlap / union >= SAME_LINE_OVERLAP) {
        line.runs.push(run);
        line.top = Math.min(line.top, runTop);
        line.bottom = Math.max(line.bottom, runBottom);
        attached = true;
        break;
      }
    }

    if (!attached) {
      lines.push({ runs: [run], top: runTop, bottom: runBottom });
    }
  }

  // Lines are already in top-to-bottom order (we processed by Y centre).
  return lines.map((l) => l.runs);
};
