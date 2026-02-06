import { type PDFPageProxy, TextLayer } from 'pdfjs-dist';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import { useEffect, useMemo, useRef } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';
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

/**
 * The desired output scale at the base zoom level (scale = 1).
 *
 * This value covers the worst-case multi-monitor scenario on Windows: a laptop with
 * `devicePixelRatio ≈ 1.5` driving a 4K monitor in duplicated (mirrored) mode, where the
 * OS performs an additional 2× framebuffer upscale (1.5 × 2 = 3). Neither `devicePixelRatio`
 * nor `devicePixelContentBoxSize` can detect the 4K monitor in this mode.
 *
 * At zoom levels above 1× the effective floor decreases proportionally — text is already
 * physically larger, so fewer canvas pixels per CSS pixel are needed to maintain the same
 * perceived sharpness. This keeps canvas memory roughly constant regardless of zoom level.
 */
const BASE_OUTPUT_SCALE = 3;

/**
 * Get the observed device-to-CSS pixel ratio from a `ResizeObserverEntry`.
 *
 * Uses `devicePixelContentBoxSize` when available to get the **true** physical pixel
 * dimensions the canvas occupies on the current display. This is more reliable than
 * `window.devicePixelRatio` in multi-monitor setups (especially extended displays on
 * Windows) where the reported ratio may not match the monitor the window is actually on.
 *
 * Falls back to `window.devicePixelRatio` when the API is unavailable.
 */
const getDevicePixelRatio = (entry: ResizeObserverEntry): number => {
  const devicePixelSize = entry.devicePixelContentBoxSize?.[0];
  const [cssSize] = entry.contentBoxSize;

  if (devicePixelSize !== undefined && cssSize !== undefined && cssSize.inlineSize > 0 && cssSize.blockSize > 0) {
    // Use the larger axis to ensure sufficient resolution in both dimensions.
    return Math.max(devicePixelSize.inlineSize / cssSize.inlineSize, devicePixelSize.blockSize / cssSize.blockSize);
  }

  return window.devicePixelRatio;
};

/**
 * Compute the canvas output scale given the observed device pixel ratio and the PDF
 * viewer zoom level.
 *
 * The output scale satisfies three constraints:
 * 1. At least `1.0` — so the canvas always has at least as many backing pixels as CSS
 *    pixels. When `outputScale < 1` the browser must upscale the canvas to fill the CSS
 *    layout box. On Edge/Windows with hardware-accelerated compositing and a sub-1.0 DPR
 *    (e.g. 50 % browser zoom on a 150 %-scaled laptop → DPR 0.75) this upscale can use
 *    nearest-neighbour sampling, producing sharply pixelated text. A floor of 1.0
 *    eliminates the upscale entirely. The resulting canvas size at high zoom matches what
 *    a DPR 1.0 user already gets, so the memory cost is not unreasonable.
 * 2. At least the observed device pixel ratio — so canvas pixels ≥ physical pixels on the
 *    current display (handles extended multi-monitor and high-DPI screens).
 * 3. At least `BASE_OUTPUT_SCALE / max(scale, 1)` — maintains enough absolute canvas
 *    resolution for crisp text after OS-level framebuffer upscaling on duplicated displays.
 *    At zoom > 1× text is already large, so the floor decreases proportionally, keeping
 *    canvas memory roughly constant instead of growing quadratically with zoom.
 */
const computeOutputScale = (observedDevicePixelRatio: number, scale: number): number =>
  Math.max(1, observedDevicePixelRatio, BASE_OUTPUT_SCALE / Math.max(scale, 1));

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

/** Observe the canvas for resize / DPI changes using `devicePixelContentBoxSize` when available. */
const observeCanvasResize = (
  canvas: HTMLCanvasElement,
  callback: (entry: ResizeObserverEntry) => void,
): ResizeObserver => {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];

    if (entry !== undefined) {
      callback(entry);
    }
  });

  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    // `device-pixel-content-box` is not supported — fall back to `window.devicePixelRatio`.
    observer.observe(canvas);
  }

  return observer;
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
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);

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
     * which can be stale or incorrect in multi-monitor setups — especially when displays are
     * duplicated on Windows.
     *
     * The observer also automatically re-renders when the effective DPI changes, e.g. when the
     * window is moved between monitors with different scaling factors.
     */
    const observer = observeCanvasResize(canvas, (entry) => {
      if (!cancelled && !page.destroyed) {
        const outputScale = computeOutputScale(getDevicePixelRatio(entry), scale);
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
          filter: invertColors && theme === ThemeMode.Dark ? 'hue-rotate(180deg) invert(1)' : 'none',
        }}
      />

      <div ref={textLayerRef} className="textLayer absolute origin-top-left" style={textLayerStyle} />
    </>
  );
};
