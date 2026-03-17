import type { ImageDataLike, PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';

interface PhysicalSize {
  width: number;
  height: number;
  dpr: number;
}

interface PdfPageImageProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: PdfPageObject;
  visible: boolean;
}

export const PdfPageImage = ({ engine, doc, page, visible }: PdfPageImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedRef = useRef(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const { theme, invertColors, antiAliasing } = useFileViewerConfig();
  const [physicalSize, setPhysicalSize] = useState<PhysicalSize | null>(null);

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    if (observerRef.current !== null) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    canvasRef.current = el;

    if (el === null) {
      setPhysicalSize(null);

      return;
    }

    if (!renderedRef.current) {
      clearCanvas(el);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry === undefined) {
        return;
      }

      const size = getPhysicalSize(entry);

      if (size === null) {
        return;
      }

      setPhysicalSize((prev) => (equals(prev, size) ? prev : size));
    });

    try {
      observer.observe(el, { box: 'device-pixel-content-box' });
    } catch {
      observer.observe(el);
    }

    observerRef.current = observer;
  }, []);

  // Clean up observer on unmount.
  useEffect(() => () => observerRef.current?.disconnect(), []);

  useEffect(() => {
    if (!visible) {
      clearCanvas(canvasRef.current);
      renderedRef.current = false;

      return;
    }

    if (physicalSize === null) {
      return;
    }

    let cancelled = false;

    // Render at the exact physical pixel count reported by the browser.
    // Pass dpr: 1 to bypass the engine's Math.max(1, dpr) clamp — the
    // physical dimensions already account for DPR.
    const renderScale = physicalSize.width / page.size.width;

    const task = engine.renderPageRaw(doc, page, { scaleFactor: renderScale, rotation: 0, dpr: 1 });

    task.wait(
      (raw) => {
        if (cancelled) {
          return;
        }

        paintToCanvas(canvasRef.current, raw);
        renderedRef.current = true;

        console.debug(
          `[PdfPageImage] Rendered page ${page.index.toString(10)} with scale ${renderScale} at ${raw.width.toString(10)}×${raw.height.toString(10)}px (physical: ${physicalSize.width.toString(10)}×${physicalSize.height.toString(10)})`,
        );
      },
      () => {
        // Render error — show nothing (placeholder stays)
      },
    );

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, visible, physicalSize]);

  const filterStyle = invertColors && theme === ThemeMode.Dark ? 'hue-rotate(180deg) invert(1)' : 'none';
  const dpr = physicalSize?.dpr ?? window.devicePixelRatio;
  const imageRenderingClass = getImageRenderingClass(dpr, antiAliasing);

  return (
    <canvas
      ref={setCanvasRef}
      className={`h-full w-full ${imageRenderingClass}`}
      style={{ filter: filterStyle, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
    />
  );
};

const paintToCanvas = (canvas: HTMLCanvasElement | null, raw: ImageDataLike): void => {
  if (canvas === null) {
    return;
  }

  canvas.width = raw.width;
  canvas.height = raw.height;

  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    return;
  }

  const imageData = new ImageData(raw.data, raw.width, raw.height, { colorSpace: raw.colorSpace });
  ctx.putImageData(imageData, 0, 0);
};

const clearCanvas = (canvas: HTMLCanvasElement | null): void => {
  if (canvas === null) {
    return;
  }

  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
};

const getImageRenderingClass = (dpr: number, antiAliasing: boolean): string => {
  if (dpr < 1) {
    return 'pixelated';
  }

  return antiAliasing ? 'crisp-edges' : 'pixelated';
};

const getPhysicalSize = (entry: ResizeObserverEntry): PhysicalSize | null => {
  const cssSize = entry.contentBoxSize[0];

  if (cssSize === undefined || cssSize.inlineSize === 0) {
    return null;
  }

  const dpSize = entry.devicePixelContentBoxSize?.[0];

  if (dpSize !== undefined) {
    return {
      width: dpSize.inlineSize,
      height: dpSize.blockSize,
      dpr: dpSize.inlineSize / cssSize.inlineSize,
    };
  }

  // Fallback: compute from CSS size and DPR.
  const dpr = window.devicePixelRatio;

  return {
    width: Math.round(cssSize.inlineSize * dpr),
    height: Math.round(cssSize.blockSize * dpr),
    dpr,
  };
};

const equals = (a: PhysicalSize | null, b: PhysicalSize | null): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  return a.width === b.width && a.height === b.height && a.dpr === b.dpr;
};
