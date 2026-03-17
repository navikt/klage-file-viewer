import type { PdfDocumentObject, PdfEngine, PdfPageObject, Rotation } from '@embedpdf/models';
import { useEffect } from 'react';
import { SelectionOverlay } from '@/files/pdf/selection/selection-overlay';
import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';
import { usePageGeometry } from '@/files/pdf/selection/use-page-geometry';

/**
 * Inner component that calls `usePageGeometry` — extracted so the hook is not
 * called conditionally (the early return for `page === undefined` above would
 * violate the rules of hooks if the hook lived in the parent).
 */
interface PageSelectionLayerProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  pageIndex: number;
  page: PdfPageObject;
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

export const PageSelectionLayer = ({
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
