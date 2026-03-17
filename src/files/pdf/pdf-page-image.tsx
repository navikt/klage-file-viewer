import type { ImageDataLike, PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';
import { useDpr } from '@/hooks/use-dpr';

interface PdfPageImageProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: PdfPageObject;
  scale: number;
  visible: boolean;
}

interface RenderedSize {
  width: number;
  height: number;
}

export const PdfPageImage = ({ engine, doc, page, scale, visible }: PdfPageImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedRef = useRef(false);
  const { theme, invertColors, antiAliasing } = useFileViewerConfig();
  const dpr = useDpr();
  const [renderedSize, setRenderedSize] = useState<RenderedSize | null>(null);

  useEffect(() => {
    if (!visible) {
      clearCanvas(canvasRef.current);
      renderedRef.current = false;
      setRenderedSize(null);

      return;
    }

    let cancelled = false;

    const scaleFactor = scale / 100;
    const task = engine.renderPageRaw(doc, page, { scaleFactor, rotation: 0, dpr });

    task.wait(
      (raw) => {
        if (cancelled) {
          return;
        }

        paintToCanvas(canvasRef.current, raw);
        renderedRef.current = true;
        setRenderedSize({ width: raw.width, height: raw.height });

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

  // Compute explicit CSS dimensions from the rendered bitmap size and current DPR.
  // This ensures a 1:1 mapping between canvas pixels and physical device pixels,
  // avoiding browser resampling that causes blurriness or uneven text at fractional DPRs.
  const cssWidth = renderedSize !== null ? renderedSize.width / dpr : undefined;
  const cssHeight = renderedSize !== null ? renderedSize.height / dpr : undefined;

  return (
    <canvas
      ref={setCanvasRef}
      className={antiAliasing ? 'crisp-edges' : 'pixelated'}
      style={{
        width: cssWidth !== undefined ? `${cssWidth.toString(10)}px` : '100%',
        height: cssHeight !== undefined ? `${cssHeight.toString(10)}px` : '100%',
        filter: filterStyle,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
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
