import type { PdfDocumentObject, PdfEngine, PdfPageObject, PdfTextRun, Rotation } from '@embedpdf/models';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageGeometry, ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { PX_PER_PT } from '@/scale/constants';

interface UsePageGeometryResult {
  geometry: ScreenPageGeometry | null;
}

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
 * engine device-space to screen coordinates.
 *
 * Runs keep PDFium's native char-index order. PDFium's text page already
 * orders characters in reading order, so the selection char indices map
 * directly onto `pageText` (fetched via `getTextSlices`) and onto the engine
 * for copy — matching how EmbedPDF's selection plugin extracts text.
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

  return {
    runs,
    pageText,
    pageWidth: pageWidth * factor,
    pageHeight: pageHeight * factor,
    pageRotation,
  };
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
