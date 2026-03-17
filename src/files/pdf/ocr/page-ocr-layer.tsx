import type { PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useEffect } from 'react';
import { OcrTextLayer } from '@/files/pdf/ocr/ocr-text-layer';
import { useOcrPage } from '@/files/pdf/ocr/use-ocr-page';

interface PageOcrLayerProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: PdfPageObject;
  pageIndex: number;
  visible: boolean;
  baseWidth: number;
  baseHeight: number;
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
  onOcrDetected,
}: PageOcrLayerProps) => {
  const { words } = useOcrPage(engine, doc, page, pageIndex, visible);

  useEffect(() => {
    if (words !== null && words.length > 0) {
      onOcrDetected?.();
    }
  }, [words, onOcrDetected]);

  if (words === null || words.length === 0) {
    return null;
  }

  return <OcrTextLayer words={words} baseWidth={baseWidth} baseHeight={baseHeight} />;
};
