import { useCallback, useEffect, useRef } from 'react';
import {
  getIndexAttribute,
  getOcrWordSelections,
  OCR_PAGE_INDEX_ATTRIBUTE,
  ocrSelectionToHighlight,
} from '@/files/pdf/highlights/ocr-selection';
import type { NewHighlight } from '@/files/pdf/highlights/types';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';

export interface OcrMarkerDocument {
  pageElementsRef: React.RefObject<Map<number, HTMLElement>>;
  ocrWordsRegistry: React.RefObject<Map<number, OcrWord[]>>;
  addHighlights: (highlights: NewHighlight[]) => void;
}

export type RegisterOcrMarkerDocument = (document: OcrMarkerDocument) => () => void;

/**
 * One capture listener per viewer, shared by its registered PDF documents.
 *
 * OCR text uses the browser's own selection (unlike PDF text, which has a
 * custom selection model). Collect every document before clearing it, including
 * when the mouse is released outside the viewer.
 */
export const useOcrMarkerCapture = (markerMode: boolean): RegisterOcrMarkerDocument => {
  const documentsRef = useRef(new Set<OcrMarkerDocument>());

  const registerDocument = useCallback((document: OcrMarkerDocument) => {
    documentsRef.current.add(document);

    return () => {
      documentsRef.current.delete(document);
    };
  }, []);

  useEffect(() => {
    if (!markerMode) {
      return;
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }

      const selection = window.getSelection();

      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const ranges = getRanges(selection);
      const captures = Array.from(documentsRef.current, ({ pageElementsRef, ocrWordsRegistry, addHighlights }) => ({
        highlights: collectOcrHighlights(ranges, pageElementsRef.current, ocrWordsRegistry.current),
        addHighlights,
      })).filter(({ highlights }) => highlights.length > 0);

      if (captures.length === 0) {
        return;
      }

      for (const { highlights, addHighlights } of captures) {
        addHighlights(highlights);
      }

      selection.removeAllRanges();
    };

    document.addEventListener('mouseup', handleMouseUp);

    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [markerMode]);

  return registerDocument;
};

const collectOcrHighlights = (
  ranges: Range[],
  pageElements: Map<number, HTMLElement>,
  ocrWordsRegistry: Map<number, OcrWord[]>,
): NewHighlight[] => {
  const layers = getOcrLayers(pageElements);

  return ranges.flatMap((range) =>
    layers.flatMap((layer) => {
      if (!range.intersectsNode(layer)) {
        return [];
      }

      const pageIndex = getIndexAttribute(layer, OCR_PAGE_INDEX_ATTRIBUTE);
      const words = pageIndex === null ? undefined : ocrWordsRegistry.get(pageIndex);

      if (pageIndex === null || words === undefined) {
        return [];
      }

      const highlight = ocrSelectionToHighlight(pageIndex, words, getOcrWordSelections(range, layer));

      return highlight === null ? [] : [highlight];
    }),
  );
};

const getRanges = (selection: Selection): Range[] =>
  Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));

const getOcrLayers = (pageElements: Map<number, HTMLElement>): Element[] =>
  Array.from(pageElements.values()).flatMap((pageElement) => {
    const layer = pageElement.querySelector(`[${OCR_PAGE_INDEX_ATTRIBUTE}]`);

    return layer === null ? [] : [layer];
  });
