import type { PdfDocumentObject, PdfEngine, Rotation } from '@embedpdf/models';
import { PadlockLockedFillIcon } from '@navikt/aksel-icons';
import { useCallback, useEffect } from 'react';
import { OcrTextLayer } from '@/files/pdf/ocr/ocr-text-layer';
import { useOcrPage } from '@/files/pdf/ocr/use-ocr-page';
import { PdfPageImage } from '@/files/pdf/pdf-page-image';
import { HighlightLayer } from '@/files/pdf/search/highlight-layer';
import type { HighlightRect } from '@/files/pdf/search/types';
import { SelectionOverlay } from '@/files/pdf/selection/selection-overlay';
import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';
import { usePageGeometry } from '@/files/pdf/selection/use-page-geometry';

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
  onMouseDown: (pageIndex: number, charIndex: number, detail: number) => void;
  onPointerMove: (pageIndex: number, charIndex: number) => void;
  onPointerUp: () => void;
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
  onMouseDown,
  onPointerMove,
  onPointerUp,
  geometryRegistry,
  showPasswordOverlay,
  onOcrDetected,
}: PdfPageProps) => {
  const pageNumber = pageIndex + 1;

  const handleRef = useCallback(
    (el: HTMLDivElement | null) => {
      onRegisterElement(pageNumber, el);
    },
    [onRegisterElement, pageNumber],
  );

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
      <div className="relative" style={{ width, height }}>
        <div
          className="relative select-none"
          style={{
            width: baseWidth,
            height: baseHeight,
            transformOrigin: '0 0',
            transform: rotationMatrix,
          }}
        >
          <PdfPageImage engine={engine} doc={doc} page={page} scale={scale} visible={visible} />
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
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
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

/**
 * Inner component that calls `usePageGeometry` — extracted so the hook is not
 * called conditionally (the early return for `page === undefined` above would
 * violate the rules of hooks if the hook lived in the parent).
 */
interface PageSelectionLayerProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  pageIndex: number;
  page: import('@embedpdf/models').PdfPageObject;
  scale: number;
  rotation: Rotation;
  baseWidth: number;
  baseHeight: number;
  visible: boolean;
  selectionRange: PageSelectionRange | null;
  isSelecting: boolean;
  onMouseDown: (pageIndex: number, charIndex: number, detail: number) => void;
  onPointerMove: (pageIndex: number, charIndex: number) => void;
  onPointerUp: () => void;
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>;
}

const PageSelectionLayer = ({
  engine,
  doc,
  pageIndex,
  page,
  scale,
  rotation,
  baseWidth,
  baseHeight,
  visible,
  selectionRange,
  isSelecting,
  onMouseDown,
  onPointerMove,
  onPointerUp,
  geometryRegistry,
}: PageSelectionLayerProps) => {
  const { geometry } = usePageGeometry(engine, doc, page, scale, visible);

  // Register geometry in the shared registry so useTextSelection can access it for word/line expansion
  useEffect(() => {
    if (geometry !== null) {
      geometryRegistry.current.set(pageIndex, geometry);
    }

    return () => {
      geometryRegistry.current.delete(pageIndex);
    };
  }, [geometry, geometryRegistry, pageIndex]);

  return (
    <SelectionOverlay
      geometry={geometry}
      selectionRange={selectionRange}
      pageIndex={pageIndex}
      onMouseDown={onMouseDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      isSelecting={isSelecting}
      rotation={rotation}
      baseWidth={baseWidth}
      baseHeight={baseHeight}
    />
  );
};

const getRotationMatrix = (rotation: Rotation, width: number, height: number): string => {
  switch (rotation) {
    case 0:
      return 'none';
    case 1:
      return `rotate(90deg) translateY(-${height.toString(10)}px)`;
    case 2:
      return `rotate(180deg) translate(-${width.toString(10)}px, -${height.toString(10)}px)`;
    case 3:
      return `rotate(270deg) translateX(-${width.toString(10)}px)`;
    default:
      return 'none';
  }
};

interface RotateButtonProps {
  pageNumber: number;
  onRotate: () => void;
}

const RotateButton = ({ pageNumber, onRotate }: RotateButtonProps) => (
  <button
    type="button"
    className="absolute top-2 left-2 z-10 cursor-pointer rounded border border-black/20 bg-white/85 px-1.5 py-1 text-base leading-none opacity-50 shadow-sm transition-opacity hover:opacity-100"
    onClick={onRotate}
    title="Roter mot klokken"
    aria-label={`Roter side ${pageNumber.toString(10)} mot klokken`}
  >
    ↺
  </button>
);

interface PageOcrLayerProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: import('@embedpdf/models').PdfPageObject;
  pageIndex: number;
  visible: boolean;
  baseWidth: number;
  baseHeight: number;
  onOcrDetected?: () => void;
}

const PageOcrLayer = ({
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

const PasswordUnlockedOverlay = () => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <PadlockLockedFillIcon
      aria-hidden
      className="h-full max-h-1/2 w-full max-w-1/2 text-ax-text-danger-decoration opacity-50"
    />
  </div>
);
