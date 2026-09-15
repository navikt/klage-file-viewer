import type { PdfDocumentObject, PdfEngine, PdfPageObject, PdfTextRun, Rotation } from '@embedpdf/models';
import { useEffect, useMemo, useRef, useState } from 'react';
import { repairSoftBreakGeometry } from '@/files/pdf/selection/copy/repair-soft-break-geometry';
import type { PageGeometry, ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { PX_PER_PT } from '@/scale/constants';

interface UsePageGeometryResult {
  geometry: ScreenPageGeometry | null;
}

/** Matches a trailing carriage return or line feed. */
const LINE_BREAK_END = /[\r\n]$/;

/** Raw data fetched from the engine for a single page — geometry + text + font info. */
interface RawPageData {
  geometry: PageGeometry;
  pageText: string | undefined;
  textRuns: PdfTextRun[];
  /** Page width in engine units (before scaling). */
  pageWidth: number;
  /** Page height in engine units (before scaling). */
  pageHeight: number;
  /** Inherent page rotation from the PDF /Rotate attribute. */
  pageRotation: Rotation;
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
        const [geometry, textRunsResult] = await Promise.all([
          engine.getPageGeometry(doc, page).toPromise(),
          engine
            .getPageTextRuns(doc, page)
            .toPromise()
            .catch(() => ({ runs: [] as PdfTextRun[] })),
        ]);

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
          setRawData({
            geometry,
            pageText,
            textRuns: textRunsResult.runs,
            pageWidth: page.size.width,
            pageHeight: page.size.height,
            pageRotation: page.rotation,
          });
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

    return transformGeometry(
      rawData.geometry,
      scale,
      rawData.pageText,
      rawData.textRuns,
      rawData.pageWidth,
      rawData.pageHeight,
      rawData.pageRotation,
    );
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
 * reading order and repair PDFium's soft-break geometry.
 *
 * PDF content streams don't guarantee that text objects appear in visual
 * order — headers/footers and other content are often emitted out of stream
 * order. Sorting runs visually and reassigning `charStart` makes the character
 * index space match the visual layout, so a drag-selection maps to a single
 * contiguous range instead of catching content from elsewhere on the page.
 * `repairSoftBreakGeometry` then splices PDFium's relocated soft-break
 * characters back into their lines so the reorder doesn't strand them.
 */
const transformGeometry = (
  raw: PageGeometry,
  scale: number,
  pageText: string | undefined,
  textRuns: PdfTextRun[],
  pageWidth: number,
  pageHeight: number,
  pageRotation: Rotation,
): ScreenPageGeometry => {
  const factor = (scale / 100) * PX_PER_PT;
  const fontLookup = buildFontLookup(textRuns);

  const runs: ScreenRun[] = raw.runs.map((run) => {
    const fontInfo = fontLookup(run.charStart);

    return {
      rect: {
        x: run.rect.x * factor,
        y: run.rect.y * factor,
        width: run.rect.width * factor,
        height: run.rect.height * factor,
      },
      charStart: run.charStart,
      glyphs: run.glyphs.map((g) => transformGlyph(g, factor)),
      fontSize: run.fontSize,
      fontWeight: fontInfo?.weight,
      italic: fontInfo?.italic,
      fontName: fontInfo?.name,
    };
  });

  return repairSoftBreakGeometry(
    reorderRunsVisually(runs, pageText, pageWidth * factor, pageHeight * factor, pageRotation),
  );
};

/**
 * Build a lookup function that maps a character index to its font info from
 * the text-run data. Text runs are sorted by `charIndex`, so we can scan
 * linearly (with a cursor) for efficient sequential lookups.
 */
const buildFontLookup = (
  textRuns: PdfTextRun[],
): ((charStart: number) => { weight: number; italic: boolean; name: string } | undefined) => {
  if (textRuns.length === 0) {
    return () => undefined;
  }

  return (charStart: number) => {
    for (const tr of textRuns) {
      if (charStart >= tr.charIndex && charStart < tr.charIndex + tr.charCount) {
        return { weight: tr.font.weight, italic: tr.font.italic, name: tr.font.name };
      }
    }

    return undefined;
  };
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
 * Sort runs into visual reading order and reassign `charStart` indices
 * sequentially, remapping `pageText` to match so the character index space
 * follows the visual layout.
 *
 * Reading order depends on the page's inherent /Rotate:
 *  - 0:   lines by Y top→bottom, within line X left→right
 *  - 90:  columns by X right→left, within column Y top→bottom
 *  - 180: lines by Y bottom→top, within line X right→left
 *  - 270: columns by X left→right, within column Y bottom→top
 *
 * When the content-stream order already matches visual order the function
 * returns early without remapping. Order is also left untouched when there is
 * no `pageText` to remap, or when the page reads as columns natively.
 */
export const reorderRunsVisually = (
  runs: ScreenRun[],
  pageText: string | undefined,
  pageWidth: number,
  pageHeight: number,
  pageRotation: Rotation,
): ScreenPageGeometry => {
  const native: ScreenPageGeometry = { runs, pageText, pageWidth, pageHeight, pageRotation };

  // `useCopyHandler` falls back to `engine.getTextSlices` when there is no page
  // text, and the engine only understands PDFium's native char indices.
  if (runs.length <= 1 || pageText === undefined) {
    return native;
  }

  // For /Rotate 90 and 270 the "line" axis is X (columns); otherwise Y.
  const useX = pageRotation === 1 || pageRotation === 3;
  const lines = groupIntoLines(runs, useX);

  // A gutter only means columns if the content stream reads them as columns;
  // in a form or table it just separates a label from its value.
  const gutter = findColumnGutter(lines, useX);

  if (gutter !== null && isColumnMajorNative(runs, lines, gutter, useX)) {
    return native;
  }

  // groupIntoLines returns lines sorted by ascending grouping-axis centre.
  // For /Rotate 90 (1) and 180 (2) reading order runs in the opposite
  // direction, so we reverse.
  if (pageRotation === 1 || pageRotation === 2) {
    lines.reverse();
  }

  // Within each line, sort runs by the cross-axis in reading order.
  // Ascending for /Rotate 0 and 90; descending for 180 and 270.
  const crossSign = pageRotation === 2 || pageRotation === 3 ? -1 : 1;

  const sortedLines = lines.map((line) =>
    [...line].sort((a, b) => crossSign * ((useX ? a.rect.y : a.rect.x) - (useX ? b.rect.y : b.rect.x))),
  );

  // Fast path: if the sorted order matches the original, no remapping needed.
  const flat = sortedLines.flat();
  const orderChanged = flat.some((run, i) => run !== runs[i]);

  if (!orderChanged) {
    return native;
  }

  // Reassign charStart and remap pageText to the new visual order, copying each
  // run's glyph characters and inserting a line break between visual lines.
  // Line breaks are often gap characters (not glyphs), so they must be re-added
  // at the new line boundaries rather than carried along with a run — otherwise
  // the page collapses into a single line.
  const reorderedRuns: ScreenRun[] = [];
  const parts: string[] = [];
  let nextCharStart = 0;

  sortedLines.forEach((line, lineIndex) => {
    for (const run of line) {
      reorderedRuns.push({ ...run, charStart: nextCharStart });
      parts.push(pageText.slice(run.charStart, run.charStart + run.glyphs.length));
      nextCharStart += run.glyphs.length;
    }

    // Separate visual lines with a line break, unless:
    //  - the line's text already ends with one (break emitted as glyphs), or
    //  - the next line's first run is contiguous in native char order with this
    //    line's last run — i.e. PDFium did NOT put a break between them, so the
    //    two visual lines are one logical line (a hyphenated word split across
    //    lines). Inserting a break there would wrongly split the word.
    if (lineIndex < sortedLines.length - 1) {
      const last = parts[parts.length - 1] ?? '';
      const lastRun = line[line.length - 1];
      const nextFirstRun = sortedLines[lineIndex + 1]?.[0];
      const contiguous =
        lastRun !== undefined &&
        nextFirstRun !== undefined &&
        nextFirstRun.charStart === lastRun.charStart + lastRun.glyphs.length;

      if (!LINE_BREAK_END.test(last) && !contiguous) {
        parts.push('\n');
        nextCharStart += 1;
      }
    }
  });

  return { runs: reorderedRuns, pageText: parts.join(''), pageWidth, pageHeight, pageRotation };
};

/** Minimum gap between two runs on a line, as a multiple of line thickness, to count as a gutter. */
const GUTTER_THICKNESS_RATIO = 1.5;

/** Number of lines that must share a gutter before it counts as a column boundary. */
const MIN_GUTTER_LINES = 2;

interface Gap {
  start: number;
  end: number;
}

/** The gutter band shared by the most lines, or `null` if none reaches {@link MIN_GUTTER_LINES}. */
const findColumnGutter = (lines: ScreenRun[][], useX: boolean): Gap | null => {
  const bands: { start: number; end: number; count: number }[] = [];

  for (const line of lines) {
    for (const gap of findLineGaps(line, useX)) {
      const band = bands.find((b) => gap.start < b.end && b.start < gap.end);

      if (band === undefined) {
        bands.push({ start: gap.start, end: gap.end, count: 1 });
        continue;
      }

      // Narrow the band to the part all its lines agree on.
      band.start = Math.max(band.start, gap.start);
      band.end = Math.min(band.end, gap.end);
      band.count += 1;
    }
  }

  let best: { start: number; end: number; count: number } | null = null;

  for (const band of bands) {
    if (band.count >= MIN_GUTTER_LINES && (best === null || band.count > best.count)) {
      best = band;
    }
  }

  return best === null ? null : { start: best.start, end: best.end };
};

/**
 * Whether the content stream already reads the gutter's two sides as columns.
 * A table crosses the gutter once per row and a flattened form once per field,
 * so only a single crossing means real columns.
 */
const isColumnMajorNative = (runs: ScreenRun[], lines: ScreenRun[][], gutter: Gap, useX: boolean): boolean => {
  const cut = (gutter.start + gutter.end) / 2;
  const fullWidth = collectFullWidthRuns(lines, cut, useX);
  let previous: boolean | null = null;
  let changes = 0;

  for (const run of runs) {
    if (run.rect.width === 0 && run.rect.height === 0) {
      continue;
    }

    // Full-width lines (titles, intros, footers) belong to neither column.
    if (fullWidth.has(run)) {
      continue;
    }

    const side = crossStart(run, useX) >= cut;

    if (previous !== null && side !== previous) {
      changes += 1;
    }

    previous = side;
  }

  return changes <= 1;
};

/**
 * Every run on a visual line that crosses the gutter. A full-width line is
 * usually several runs, and the ones starting past the gutter would otherwise
 * look like a jump from one column to the other.
 */
const collectFullWidthRuns = (lines: ScreenRun[][], cut: number, useX: boolean): Set<ScreenRun> => {
  const fullWidth = new Set<ScreenRun>();

  for (const line of lines) {
    const crosses = line.some((run) => crossStart(run, useX) < cut && crossEnd(run, useX) > cut);

    if (!crosses) {
      continue;
    }

    for (const run of line) {
      fullWidth.add(run);
    }
  }

  return fullWidth;
};

/** Gutter-sized cross-axis gaps between the runs of a single visual line. */
const findLineGaps = (line: ScreenRun[], useX: boolean): Gap[] => {
  // Zero-size ghost runs would register as a gutter against every real run.
  const sized = line.filter((run) => run.rect.width > 0 && run.rect.height > 0);

  if (sized.length < 2) {
    return [];
  }

  const sorted = [...sized].sort((a, b) => crossStart(a, useX) - crossStart(b, useX));
  const gaps: Gap[] = [];
  let reach: number | null = null;

  for (const run of sorted) {
    const start = crossStart(run, useX);

    if (reach !== null && start - reach >= lineThickness(run, useX) * GUTTER_THICKNESS_RATIO) {
      gaps.push({ start: reach, end: start });
    }

    reach = reach === null ? crossEnd(run, useX) : Math.max(reach, crossEnd(run, useX));
  }

  return gaps;
};

/** Leading edge of a run along the reading axis within a line. */
const crossStart = (run: ScreenRun, useX: boolean): number => (useX ? run.rect.y : run.rect.x);

/** Trailing edge of a run along the reading axis within a line. */
const crossEnd = (run: ScreenRun, useX: boolean): number =>
  useX ? run.rect.y + run.rect.height : run.rect.x + run.rect.width;

/** Extent of a run across the line — its rendered line height. */
const lineThickness = (run: ScreenRun, useX: boolean): number => (useX ? run.rect.width : run.rect.height);

/**
 * Group runs into visual lines based on overlap on a grouping axis, returning
 * lines sorted by ascending axis centre.
 *
 * @param useX When `true`, group by X overlap (columns for rotated pages).
 *             When `false`, group by Y overlap (lines for normal text).
 */
const groupIntoLines = (runs: ScreenRun[], useX: boolean): ScreenRun[][] => {
  const sorted = [...runs].sort((a, b) => {
    const aC = useX ? a.rect.x + a.rect.width / 2 : a.rect.y + a.rect.height / 2;
    const bC = useX ? b.rect.x + b.rect.width / 2 : b.rect.y + b.rect.height / 2;

    return aC - bC;
  });

  const lines: { runs: ScreenRun[]; start: number; end: number }[] = [];

  for (const run of sorted) {
    // Zero-size runs (e.g. soft-break ghosts) carry no extent — attach them to
    // the current line, or start a new one.
    if (run.rect.width === 0 && run.rect.height === 0) {
      const lastLine = lines[lines.length - 1];

      if (lastLine !== undefined) {
        lastLine.runs.push(run);
      } else {
        const pos = useX ? run.rect.x : run.rect.y;
        lines.push({ runs: [run], start: pos, end: pos });
      }

      continue;
    }

    const runStart = useX ? run.rect.x : run.rect.y;
    const runEnd = useX ? run.rect.x + run.rect.width : run.rect.y + run.rect.height;

    let attached = false;

    for (const line of lines) {
      const overlapStart = Math.max(line.start, runStart);
      const overlapEnd = Math.min(line.end, runEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const union = Math.max(line.end, runEnd) - Math.min(line.start, runStart);

      if (union > 0 && overlap / union >= SAME_LINE_OVERLAP) {
        line.runs.push(run);
        line.start = Math.min(line.start, runStart);
        line.end = Math.max(line.end, runEnd);
        attached = true;
        break;
      }
    }

    if (!attached) {
      lines.push({ runs: [run], start: runStart, end: runEnd });
    }
  }

  return lines.map((line) => line.runs);
};
