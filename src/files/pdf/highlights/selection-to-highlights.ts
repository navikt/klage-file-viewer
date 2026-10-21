import { normalizeRect } from '@/files/pdf/highlights/highlight-list';
import type { NewHighlight } from '@/files/pdf/highlights/types';
import { reflowSelection } from '@/files/pdf/selection/copy/reflow';
import { buildSelectionRects } from '@/files/pdf/selection/selection-rects';
import type { ScreenPageGeometry, TextSelection } from '@/files/pdf/selection/types';

/**
 * Convert a PDF text selection into marker highlights — one per page, with
 * the same line rects the selection overlay draws, normalized to the page.
 */
export const selectionToHighlights = (
  selection: TextSelection,
  geometryRegistry: Map<number, ScreenPageGeometry>,
): NewHighlight[] => {
  const highlights: NewHighlight[] = [];

  for (const range of selection.ranges) {
    const geo = geometryRegistry.get(range.pageIndex);

    if (geo === undefined || geo.pageWidth === undefined || geo.pageHeight === undefined) {
      continue;
    }

    const { pageWidth, pageHeight } = geo;

    if (pageWidth <= 0 || pageHeight <= 0) {
      continue;
    }

    const text = geo.pageText?.slice(range.startCharIndex, range.endCharIndex + 1) ?? '';

    // Highlighting nothing but whitespace is never intended.
    if (geo.pageText !== undefined && text.trim().length === 0) {
      continue;
    }

    const rects = buildSelectionRects(geo, range).map((rect) => normalizeRect(rect, pageWidth, pageHeight));

    if (rects.length === 0) {
      continue;
    }

    const highlight: NewHighlight = { pageIndex: range.pageIndex, source: 'pdf', rects, text };

    // Copying from the highlight list can't reflow later: the page may not be loaded.
    highlights.push(
      geo.pageText === undefined ? highlight : { ...highlight, blocks: reflowSelection(text, geo, range) },
    );
  }

  return highlights;
};
