import type { PdfDocumentObject, PdfEngine, Rotation } from '@embedpdf/models';
import { useCallback, useEffect, useRef } from 'react';
import { PageOcrLayer } from '@/files/pdf/ocr/page-ocr-layer';
import { getRotationMatrix } from '@/files/pdf/page/get-rotation-matrix';
import { PdfPageImage } from '@/files/pdf/page/pdf-page-image';
import { RotateButton } from '@/files/pdf/page/rotate-button';
import { PasswordUnlockedOverlay } from '@/files/pdf/password/password-unlocked-overlay';
import { HighlightLayer } from '@/files/pdf/search/highlight-layer';
import type { HighlightRect } from '@/files/pdf/search/types';
import { PageSelectionLayer } from '@/files/pdf/selection/page-selection-layer';
import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';

interface PdfPageProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  pageIndex: number;
  scale: number;
  rotation: Rotation;
  visible: boolean;
  highlights?: HighlightRect[];
  currentMatchIndex?: number;
  onRotate: (pageIndex: number) => void;
  onRegisterElement: (pageNumber: number, element: HTMLDivElement | null) => void;
  selectionRange: PageSelectionRange | null;
  isSelecting: boolean;
  clearSelection: () => void;
  onMouseDown: (pageIndex: number, charIndex: number, detail: number) => void;
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>;
  showPasswordOverlay?: boolean;
  onOcrDetected?: () => void;
}

export const PdfPage = ({
  engine,
  doc,
  pageIndex,
  scale,
  rotation,
  visible,
  highlights,
  currentMatchIndex,
  onRotate,
  onRegisterElement,
  selectionRange,
  isSelecting,
  clearSelection,
  onMouseDown,
  geometryRegistry,
  showPasswordOverlay,
  onOcrDetected,
}: PdfPageProps) => {
  const pageNumber = pageIndex + 1;
  const contentRef = useRef<HTMLDivElement>(null);

  const handleRef = useCallback(
    (el: HTMLDivElement | null) => {
      onRegisterElement(pageNumber, el);
    },
    [onRegisterElement, pageNumber],
  );

  useEffect(() => {
    if (selectionRange === null) {
      return;
    }

    const handleDocumentMouseDown = (e: MouseEvent): void => {
      if (e.button === 0 && !contentRef.current?.contains(e.target as Node)) {
        clearSelection();
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);

    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [selectionRange, clearSelection]);

  const page = doc.pages[pageIndex];

  if (page === undefined) {
    return null;
  }

  const scaleFactor = scale / 100;
  const baseWidth = page.size.width * scaleFactor;
  const baseHeight = page.size.height * scaleFactor;
  const swapped = rotation === 1 || rotation === 3;
  const width = swapped ? baseHeight : baseWidth;
  const height = swapped ? baseWidth : baseHeight;

  const rotationMatrix = getRotationMatrix(rotation, baseWidth, baseHeight);

  return (
    <div
      ref={handleRef}
      data-klage-file-viewer-page-number={pageNumber}
      data-klage-file-viewer-scalable
      className="relative flex w-full justify-center"
    >
      <div ref={contentRef} className="relative" style={{ width, height }}>
        <div
          className="relative select-none"
          style={{
            width: baseWidth,
            height: baseHeight,
            transformOrigin: '0 0',
            transform: rotationMatrix,
          }}
        >
          <PdfPageImage engine={engine} doc={doc} page={page} visible={visible} />
          <PageSelectionLayer
            engine={engine}
            doc={doc}
            pageIndex={pageIndex}
            page={page}
            scale={scale}
            rotation={rotation}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            visible={visible}
            selectionRange={selectionRange}
            isSelecting={isSelecting}
            onMouseDown={onMouseDown}
            geometryRegistry={geometryRegistry}
          />
          <PageOcrLayer
            engine={engine}
            doc={doc}
            page={page}
            pageIndex={pageIndex}
            visible={visible}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            onOcrDetected={onOcrDetected}
          />
          {highlights !== undefined && highlights.length > 0 ? (
            <HighlightLayer highlights={highlights} currentMatchIndex={currentMatchIndex ?? 0} />
          ) : null}
        </div>
        {showPasswordOverlay === true ? <PasswordUnlockedOverlay /> : null}
        <RotateButton pageNumber={pageNumber} onRotate={() => onRotate(pageIndex)} />
      </div>
    </div>
  );
};
