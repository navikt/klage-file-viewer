import type { PdfDocumentObject, PdfEngine, Rotation } from '@embedpdf/models';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePdfColorsInverted } from '@/context';
import { PageElement } from '@/files/page-element';
import { findHighlightAt } from '@/files/pdf/highlights/highlight-list';
import { MarkerHighlightLayer } from '@/files/pdf/highlights/marker-highlight-layer';
import type { DocumentMarkerMode } from '@/files/pdf/highlights/marker-style';
import type { StoredHighlight } from '@/files/pdf/highlights/types';
import { PageOcrLayer } from '@/files/pdf/ocr/page-ocr-layer';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';
import { getRotationMatrix } from '@/files/pdf/page/get-rotation-matrix';
import { PdfPageImage } from '@/files/pdf/page/pdf-page-image';
import { PasswordUnlockedOverlay } from '@/files/pdf/password/password-unlocked-overlay';
import { HighlightLayer } from '@/files/pdf/search/highlight-layer';
import type { HighlightRect } from '@/files/pdf/search/types';
import { screenToGlyph } from '@/files/pdf/selection/hit-test';
import { PageSelectionLayer } from '@/files/pdf/selection/page-selection-layer';
import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';
import { PX_PER_PT } from '@/scale/constants';

interface PdfPageProps {
  engine: PdfEngine;
  /** Text layers read from this — the flattened copy when there is one. */
  doc: PdfDocumentObject;
  /** Pages rasterise from this — always the file as opened. */
  renderDoc: PdfDocumentObject;
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
  markerHighlights: StoredHighlight[];
  markerMode: DocumentMarkerMode;
  onRemoveHighlight: (id: string) => void;
  ocrWordsRegistry: React.RefObject<Map<number, OcrWord[]>>;
}

export const PdfPage = ({
  engine,
  doc,
  renderDoc,
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
  markerHighlights,
  markerMode,
  onRemoveHighlight,
  ocrWordsRegistry,
}: PdfPageProps) => {
  const pageNumber = pageIndex + 1;
  const contentRef = useRef<HTMLDivElement>(null);
  const [hoveredHighlightId, setHoveredHighlightId] = useState<string | null>(null);
  const colorsInverted = usePdfColorsInverted();

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
  const renderPage = renderDoc.pages[pageIndex];

  if (page === undefined || renderPage === undefined) {
    return null;
  }

  const scaleFactor = (scale / 100) * PX_PER_PT;
  const baseWidth = page.size.width * scaleFactor;
  const baseHeight = page.size.height * scaleFactor;
  const swapped = rotation === 1 || rotation === 3;
  const width = swapped ? baseHeight : baseWidth;
  const height = swapped ? baseWidth : baseHeight;

  const rotationMatrix = getRotationMatrix(rotation, baseWidth, baseHeight);

  // Removal and hover feedback are only active in marker mode, so ordinary text selection is never blocked.
  const activeHoveredHighlightId = markerMode === 'on' && !isSelecting ? hoveredHighlightId : null;

  const highlightAt = (clientX: number, clientY: number): StoredHighlight | undefined => {
    if (contentRef.current === null || markerHighlights.length === 0) {
      return undefined;
    }

    const rect = contentRef.current.getBoundingClientRect();
    const { x, y } = screenToGlyph(clientX - rect.left, clientY - rect.top, rotation, baseWidth, baseHeight);

    return findHighlightAt(markerHighlights, x / baseWidth, y / baseHeight);
  };

  const handleMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    // Double and triple clicks pass through so word/line selection still works on top of a highlight.
    if (markerMode !== 'on' || e.button !== 0 || e.detail !== 1) {
      return;
    }

    const highlight = highlightAt(e.clientX, e.clientY);

    if (highlight === undefined) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    onRemoveHighlight(highlight.id);
    setHoveredHighlightId(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (markerMode !== 'on' || isSelecting || e.buttons !== 0) {
      return;
    }

    setHoveredHighlightId(highlightAt(e.clientX, e.clientY)?.id ?? null);
  };

  return (
    <PageElement ref={handleRef} pageNumber={pageNumber} onRotate={() => onRotate(pageIndex)}>
      <div
        ref={contentRef}
        className="relative"
        style={{ width, height }}
        data-klage-file-viewer-marker-hover={activeHoveredHighlightId === null ? undefined : true}
        onMouseDownCapture={handleMouseDownCapture}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredHighlightId(null)}
      >
        <div
          data-klage-file-viewer-page-content
          className="relative select-none"
          style={{
            width: baseWidth,
            height: baseHeight,
            transformOrigin: '0 0',
            transform: rotationMatrix,
          }}
        >
          <PdfPageImage engine={engine} doc={renderDoc} page={renderPage} visible={visible} />
          <MarkerHighlightLayer
            highlights={markerHighlights}
            hoveredHighlightId={activeHoveredHighlightId}
            inverted={colorsInverted}
          />
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
            markerMode={markerMode}
          />
          <PageOcrLayer
            engine={engine}
            doc={doc}
            page={page}
            pageIndex={pageIndex}
            visible={visible}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            markerMode={markerMode}
            ocrWordsRegistry={ocrWordsRegistry}
            onOcrDetected={onOcrDetected}
          />
          {highlights !== undefined && highlights.length > 0 ? (
            <HighlightLayer highlights={highlights} currentMatchIndex={currentMatchIndex ?? 0} />
          ) : null}
        </div>
        {showPasswordOverlay === true ? <PasswordUnlockedOverlay /> : null}
      </div>
    </PageElement>
  );
};
