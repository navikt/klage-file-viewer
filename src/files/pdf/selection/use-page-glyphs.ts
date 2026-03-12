import type { PdfDocumentObject, PdfEngine, PdfGlyphObject, PdfPageObject } from '@embedpdf/models';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenGlyph } from '@/files/pdf/selection/types';

interface UsePageGlyphsResult {
  glyphs: ScreenGlyph[] | null;
}

export const usePageGlyphs = (
  engine: PdfEngine,
  doc: PdfDocumentObject,
  page: PdfPageObject,
  scale: number,
  visible: boolean,
): UsePageGlyphsResult => {
  const [rawGlyphs, setRawGlyphs] = useState<PdfGlyphObject[] | null>(null);
  const fetchedPageRef = useRef<number | null>(null);

  // Fetch raw glyph data when visible (cache by page index)
  useEffect(() => {
    if (!visible) {
      return;
    }

    // Already fetched for this page
    if (fetchedPageRef.current === page.index) {
      return;
    }

    let cancelled = false;

    const fetchGlyphs = async () => {
      try {
        const result = await engine.getPageGlyphs(doc, page).toPromise();

        if (!cancelled) {
          fetchedPageRef.current = page.index;
          setRawGlyphs(result);
        }
      } catch {
        // Glyph extraction is best-effort
      }
    };

    void fetchGlyphs();

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, visible]);

  // Transform raw glyphs to screen coordinates whenever raw data, scale, or rotation changes
  const glyphs = useMemo(() => {
    if (rawGlyphs === null) {
      return null;
    }

    return transformGlyphs(rawGlyphs, scale);
  }, [rawGlyphs, scale]);

  return { glyphs };
};

/**
 * Scale glyph rects from the engine to screen coordinates.
 *
 * The engine already returns rects in device-space (origin top-left, Y-down)
 * via `FPDF_PageToDevice`, so we only need to apply the scale factor.
 * User-rotation is handled by the CSS transform on the page container.
 */
const transformGlyphs = (rawGlyphs: PdfGlyphObject[], scale: number): ScreenGlyph[] => {
  const scaleFactor = scale / 100;

  return rawGlyphs.flatMap((glyph, charIndex) => {
    if (glyph === undefined) {
      return [];
    }

    return [
      {
        charIndex,
        x: glyph.origin.x * scaleFactor,
        y: glyph.origin.y * scaleFactor,
        width: glyph.size.width * scaleFactor,
        height: glyph.size.height * scaleFactor,
        isSpace: glyph.isSpace === true,
        isEmpty: glyph.isEmpty === true,
      },
    ];
  });
};
