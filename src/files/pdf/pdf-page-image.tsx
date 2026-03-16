import type { ImageDataLike, PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useCallback, useEffect, useRef } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';

interface PdfPageImageProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: PdfPageObject;
  scale: number;
  visible: boolean;
}

export const PdfPageImage = ({ engine, doc, page, scale, visible }: PdfPageImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedRef = useRef(false);
  const { theme, invertColors, antiAliasing } = useFileViewerConfig();

  useEffect(() => {
    if (!visible) {
      clearCanvas(canvasRef.current);
      renderedRef.current = false;

      return;
    }

    let cancelled = false;

    const dpr = window.devicePixelRatio;
    const scaleFactor = scale / 100;
    const renderedWidth = Math.round(page.size.width * scaleFactor * dpr);
    const renderedHeight = Math.round(page.size.height * scaleFactor * dpr);

    console.debug(
      `[PdfPageImage] Rendering page ${page.index.toString(10)} at ${renderedWidth.toString(10)}x${renderedHeight.toString(10)}px (scale: ${scale.toString(10)}%, dpr: ${dpr.toString(10)})`,
    );

    const task = engine.renderPageRaw(doc, page, { scaleFactor, rotation: 0, dpr });

    task.wait(
      (raw) => {
        if (cancelled) {
          return;
        }

        paintToCanvas(canvasRef.current, raw);
        renderedRef.current = true;
      },
      () => {
        // Render error — show nothing (placeholder stays)
      },
    );

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, scale, visible]);

  const filterStyle = invertColors && theme === ThemeMode.Dark ? 'hue-rotate(180deg) invert(1)' : 'none';

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;

    // When React re-mounts the canvas (e.g. key change), re-paint the last rendered frame.
    if (el !== null && !renderedRef.current) {
      clearCanvas(el);
    }
  }, []);

  return (
    <canvas
      ref={setCanvasRef}
      className={`h-full w-full ${antiAliasing ? '' : 'crisp-edges'}`}
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
