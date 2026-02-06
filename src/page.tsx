import { type PDFPageProxy, TextLayer } from 'pdfjs-dist';
import { useEffect, useMemo, useRef } from 'react';
import { usePdfViewerConfig } from './context';
import { processTextItems } from './process-text-items';

interface PdfPageProps {
  page: PDFPageProxy;
  scale: number;
  rotation: number;
}

/**
 * Get the CSS styles for rotating the text layer.
 * PDF.js TextLayer positions text based on unrotated coordinates,
 * so we apply CSS rotation to the container to match the canvas.
 */
const getTextLayerStyle = (rotation: number): React.CSSProperties => {
  switch (rotation) {
    case 0:
      return { left: 0, top: 0 };
    case 90:
      // Rotate 90° clockwise, translate right by unrotated height (100% of width after rotation)
      return { transform: 'rotate(90deg)', left: '100%', top: 0 };
    case 180:
      // Rotate 180°, translate by both width and height
      return { transform: 'rotate(180deg)', left: '100%', top: '100%' };
    case 270:
      // Rotate 270° (or -90°), translate down by unrotated width (100% of height after rotation)
      return { transform: 'rotate(270deg)', left: 0, top: '100%' };
    default:
      // Any other value is invalid.
      return { left: 0, top: 0 };
  }
};

export const PdfPage = ({ page, scale, rotation }: PdfPageProps) => {
  const { invertColors } = usePdfViewerConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);
  const textLayerStyle = useMemo(() => getTextLayerStyle(rotation), [rotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerElement = textLayerRef.current;

    if (canvas === null || textLayerElement === null) {
      return;
    }

    const renderPage = async () => {
      // Cancel any ongoing render
      if (renderTaskRef.current !== null) {
        renderTaskRef.current.cancel();
      }

      // Cancel any ongoing text layer render
      if (textLayerInstanceRef.current !== null) {
        textLayerInstanceRef.current.cancel();
        textLayerInstanceRef.current = null;
      }

      // Clear previous text layer content
      textLayerElement.innerHTML = '';

      // Combine page rotation with user rotation for the canvas
      const totalRotation = ((page.rotate + rotation) % 360) as 0 | 90 | 180 | 270;
      const viewport = page.getViewport({ scale, rotation: totalRotation });
      const canvasContext = canvas.getContext('2d');

      if (canvasContext === null) {
        return;
      }

      // Set canvas dimensions
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      const canvasW = `${viewport.width}px`;
      const canvasH = `${viewport.height}px`;
      canvas.style.width = canvasW;
      canvas.style.height = canvasH;

      // PDF.js TextLayer positions text based on unrotated (raw) page coordinates.
      // We create an unrotated viewport for the TextLayer and apply CSS rotation to the container.
      const unrotatedViewport = page.getViewport({
        scale: scale / outputScale,
        rotation: page.rotate, // Only inherent page rotation, no user rotation
      });

      // Get full-scale unrotated dimensions for sizing
      const unrotatedFullViewport = page.getViewport({
        scale,
        rotation: page.rotate,
      });
      const unrotatedW = unrotatedFullViewport.width;
      const unrotatedH = unrotatedFullViewport.height;

      // Set text layer dimensions to match the unrotated page
      textLayerElement.style.width = `${unrotatedW}px`;
      textLayerElement.style.height = `${unrotatedH}px`;
      textLayerElement.style.setProperty('--scale-factor', scale.toString(10));
      textLayerElement.style.setProperty('--user-unit', viewport.userUnit.toString(10));
      textLayerElement.style.setProperty('--total-scale-factor', (scale * viewport.userUnit).toString(10));

      const transform: [number, number, number, number, number, number] | undefined =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

      try {
        renderTaskRef.current = page.render({ canvasContext, canvas, viewport, transform });
        await renderTaskRef.current.promise;

        const { items, ...rest } = await page.getTextContent();

        const textLayer = new TextLayer({
          textContentSource: { ...rest, items: processTextItems(items) },
          container: textLayerElement,
          viewport: unrotatedViewport,
        });

        textLayerInstanceRef.current = textLayer;
        await textLayer.render();

        // Override dimensions set by TextLayer.setLayerDimensions to match our calculated sizes.
        // This is necessary because we pass a scaled-down viewport to TextLayer.
        textLayerElement.style.width = `${unrotatedW}px`;
        textLayerElement.style.height = `${unrotatedH}px`;
      } catch (error) {
        if (error instanceof Error && error.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page:', error);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current !== null) {
        renderTaskRef.current.cancel();
      }
      if (textLayerInstanceRef.current !== null) {
        textLayerInstanceRef.current.cancel();
      }
    };
  }, [page, scale, rotation]);

  return (
    <>
      <canvas ref={canvasRef} style={{ filter: invertColors ? 'hue-rotate(180deg) invert(1)' : 'none' }} />

      <div ref={textLayerRef} className="textLayer absolute origin-top-left" style={textLayerStyle} />
    </>
  );
};
