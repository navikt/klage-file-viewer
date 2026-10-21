import type { PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useEffect } from 'react';
import type { DocumentMarkerMode } from '@/files/pdf/highlights/marker-style';
import { OcrTextLayer } from '@/files/pdf/ocr/ocr-text-layer';
import { type OcrWord, useOcrPage } from '@/files/pdf/ocr/use-ocr-page';

interface PageOcrLayerProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: PdfPageObject;
  pageIndex: number;
  visible: boolean;
  baseWidth: number;
  baseHeight: number;
  markerMode: DocumentMarkerMode;
  ocrWordsRegistry: React.RefObject<Map<number, OcrWord[]>>;
  onOcrDetected?: () => void;
}

export const PageOcrLayer = ({
  engine,
  doc,
  page,
  pageIndex,
  visible,
  baseWidth,
  baseHeight,
  markerMode,
  ocrWordsRegistry,
  onOcrDetected,
}: PageOcrLayerProps) => {
  const { words } = useOcrPage(engine, doc, page, pageIndex, visible);

  useEffect(() => {
    if (words !== null && words.length > 0) {
      onOcrDetected?.();
    }
  }, [words, onOcrDetected]);

  // Register the words so marker highlights can map a DOM selection back to word boxes.
  useEffect(() => {
    if (words === null || words.length === 0) {
      return;
    }

    ocrWordsRegistry.current.set(pageIndex, words);

    return () => {
      ocrWordsRegistry.current.delete(pageIndex);
    };
  }, [words, ocrWordsRegistry, pageIndex]);

  if (words === null || words.length === 0) {
    return null;
  }

  return (
    <OcrTextLayer
      words={words}
      pageIndex={pageIndex}
      baseWidth={baseWidth}
      baseHeight={baseHeight}
      markerMode={markerMode}
    />
  );
};
