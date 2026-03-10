import { type PDFPageProxy, TextLayer } from 'pdfjs-dist';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import { useEffect, useMemo, useRef } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';
import { observeCanvasResize } from '@/files/pdf/pixel-ratio';
import { processTextItems } from '@/files/pdf/process-text-items';
import { useTextLayerSelection } from '@/files/pdf/text-layer-selection';

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

/** Cancel any in-progress render and text layer tasks, then clear the text layer container. */
const cancelRender = (
  renderTaskRef: React.RefObject<ReturnType<PDFPageProxy['render']> | null>,
  textLayerInstanceRef: React.RefObject<TextLayer | null>,
  textLayerElement: HTMLDivElement,
): void => {
  if (renderTaskRef.current !== null) {
    renderTaskRef.current.cancel();
    renderTaskRef.current = null;
  }

  if (textLayerInstanceRef.current !== null) {
    textLayerInstanceRef.current.cancel();
    textLayerInstanceRef.current = null;
  }

  textLayerElement.innerHTML = '';
};

/** Apply text layer CSS custom properties and dimensions for an unrotated viewport. */
const configureTextLayerDimensions = (
  element: HTMLDivElement,
  scale: number,
  viewport: PageViewport,
  unrotatedW: number,
  unrotatedH: number,
): void => {
  element.style.width = `${unrotatedW}px`;
  element.style.height = `${unrotatedH}px`;
  element.style.setProperty('--scale-factor', scale.toString(10));
  element.style.setProperty('--user-unit', viewport.userUnit.toString(10));
  element.style.setProperty('--total-scale-factor', (scale * viewport.userUnit).toString(10));
};

interface RenderPageContext {
  page: PDFPageProxy;
  scale: number;
  canvas: HTMLCanvasElement;
  textLayerElement: HTMLDivElement;
  viewport: PageViewport;
  renderTaskRef: React.RefObject<ReturnType<PDFPageProxy['render']> | null>;
  textLayerInstanceRef: React.RefObject<TextLayer | null>;
  initSelection: (el: HTMLDivElement) => void;
  isCancelled: () => boolean;
}

/** Render the canvas and text layer for a single PDF page at the given output scale. */
const renderPage = async (ctx: RenderPageContext, outputScale: number): Promise<void> => {
  const { page, scale, canvas, textLayerElement, viewport, renderTaskRef, textLayerInstanceRef, initSelection } = ctx;

  cancelRender(renderTaskRef, textLayerInstanceRef, textLayerElement);

  if (ctx.isCancelled() || page.destroyed) {
    return;
  }

  const canvasContext = canvas.getContext('2d');

  if (canvasContext === null) {
    return;
  }

  // Set canvas backing-store dimensions to match the computed output scale.
  canvas.width = Math.ceil(viewport.width * outputScale);
  canvas.height = Math.ceil(viewport.height * outputScale);

  console.debug(
    `Rendering PDF page at scale ${scale} with output scale ${outputScale} and canvas size ${canvas.width}x${canvas.height} (${canvas.clientWidth}x${canvas.clientHeight})`,
  );

  // PDF.js TextLayer positions text based on unrotated (raw) page coordinates.
  // We create an unrotated viewport for the TextLayer and apply CSS rotation to the container.
  const unrotatedViewport = page.getViewport({
    scale: scale / outputScale,
    rotation: page.rotate, // Only inherent page rotation, no user rotation
  });

  // Get full-scale unrotated dimensions for sizing
  const unrotatedFullViewport = page.getViewport({ scale, rotation: page.rotate });
  const unrotatedW = unrotatedFullViewport.width;
  const unrotatedH = unrotatedFullViewport.height;

  configureTextLayerDimensions(textLayerElement, scale, viewport, unrotatedW, unrotatedH);

  const transform: [number, number, number, number, number, number] | undefined =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  try {
    renderTaskRef.current = page.render({ canvasContext, canvas, viewport, transform });
    await renderTaskRef.current.promise;

    if (ctx.isCancelled()) {
      return;
    }

    const textContent = await page.getTextContent();

    const textLayer = new TextLayer({
      textContentSource: { ...textContent, items: processTextItems(textContent.items) },
      container: textLayerElement,
      viewport: unrotatedViewport,
    });

    textLayerInstanceRef.current = textLayer;
    await textLayer.render();

    if (!ctx.isCancelled()) {
      initSelection(textLayerElement);
    }

    // Override dimensions set by TextLayer.setLayerDimensions to match our calculated sizes.
    // This is necessary because we pass a scaled-down viewport to TextLayer.
    configureTextLayerDimensions(textLayerElement, scale, viewport, unrotatedW, unrotatedH);
  } catch (error) {
    if (error instanceof Error && error.name !== 'RenderingCancelledException') {
      console.error('Error rendering PDF page:', error);
    }
  }
};

export const PdfPage = ({ page, scale, rotation }: PdfPageProps) => {
  const { theme, invertColors } = useFileViewerConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);
  const textLayerStyle = useMemo(() => getTextLayerStyle(rotation), [rotation]);
  const { initSelection } = useTextLayerSelection();

  // Combine page rotation with user rotation for the canvas.
  const totalRotation = ((page.rotate + rotation) % 360) as 0 | 90 | 180 | 270;

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerElement = textLayerRef.current;

    if (canvas === null || textLayerElement === null) {
      return;
    }

    let cancelled = false;

    const viewport = page.getViewport({ scale, rotation: totalRotation });

    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx: RenderPageContext = {
      page,
      scale,
      canvas,
      textLayerElement,
      viewport,
      renderTaskRef,
      textLayerInstanceRef,
      initSelection,
      isCancelled: () => cancelled,
    };

    /**
     * Use a `ResizeObserver` with `devicePixelContentBoxSize` to detect the true physical
     * pixel dimensions the canvas occupies. This is more accurate than `window.devicePixelRatio`
     * which can be stale or incorrect in multi-monitor setups.
     *
     * The observer also automatically re-renders when the effective DPI changes, e.g. when the
     * window is moved between monitors with different scaling factors.
     */
    const observer = observeCanvasResize(canvas, (outputScale) => {
      if (!cancelled && !page.destroyed) {
        renderPage(ctx, outputScale);
      }
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelRender(renderTaskRef, textLayerInstanceRef, textLayerElement);
    };
  }, [page, scale, totalRotation, initSelection]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          // Prevent host-application CSS resets (e.g. Tailwind preflight's
          // `max-width: 100%` on replaced elements) from constraining the
          // canvas display size below what the rendering pipeline expects.
          maxWidth: 'none',
          maxHeight: 'none',
          filter: invertColors && theme === ThemeMode.Dark ? 'hue-rotate(180deg) invert(1)' : 'none',
        }}
      />

      <div ref={textLayerRef} className="textLayer absolute origin-top-left" style={textLayerStyle} />
    </>
  );
};
