import type { ImageDataLike, PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useCallback, useEffect, useRef } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';
import { useDpr } from '@/hooks/use-dpr';

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
  const dpr = useDpr();

  useEffect(() => {
    if (!visible) {
      clearCanvas(canvasRef.current);
      renderedRef.current = false;

      return;
    }

    let cancelled = false;

    const scaleFactor = scale / 100;

    // The engine clamps DPR to Math.max(1, dpr). To render at the exact
    // physical pixel count when DPR < 1, we fold the DPR into scaleFactor
    // so the engine produces: pageSize × scaleFactor × dpr pixels — a 1:1
    // match for the CSS container's physical size. No browser scaling needed.
    const engineScale = dpr < 1 ? scaleFactor * dpr : scaleFactor;
    const engineDpr = dpr < 1 ? 1 : dpr;

    const task = engine.renderPageRaw(doc, page, { scaleFactor: engineScale, rotation: 0, dpr: engineDpr });

    task.wait(
      (raw) => {
        if (cancelled) {
          return;
        }

        paintToCanvas(canvasRef.current, raw);
        renderedRef.current = true;

        console.debug(
          `[PdfPageImage] Rendering page ${page.index.toString(10)} at ${raw.width.toString(10)}x${raw.height.toString(10)}px (scale: ${scale.toString(10)}%, dpr: ${dpr.toString(10)})`,
        );
      },
      () => {
        // Render error — show nothing (placeholder stays)
      },
    );

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, scale, visible, dpr]);

  const filterStyle = invertColors && theme === ThemeMode.Dark ? 'hue-rotate(180deg) invert(1)' : 'none';

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;

    // When React re-mounts the canvas (e.g. key change), re-paint the last rendered frame.
    if (el !== null && !renderedRef.current) {
      clearCanvas(el);
    }
  }, []);

  const imageRenderingClass = dpr < 1 ? 'pixelated' : antiAliasing ? 'crisp-edges' : 'pixelated';

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
