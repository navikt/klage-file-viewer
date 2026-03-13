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
 * This replaces the older `usePageGlyphs` hook. Instead of a flat
 * `ScreenGlyph[]` array, the caller gets `ScreenPageGeometry` whose `runs`
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
 * engine device-space to screen coordinates.
 *
 * The engine already returns positions in device-space (origin top-left,
 * Y-down) via `FPDF_PageToDevice`, so we only need to multiply by the
 * current zoom factor.
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

  return { runs, pageText };
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
