import type { PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useEffect, useRef, useState } from 'react';
import { ThemeMode, useFileViewerConfig } from '@/context';

interface PdfPageImageProps {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  page: PdfPageObject;
  scale: number;
  visible: boolean;
}

export const PdfPageImage = ({ engine, doc, page, scale, visible }: PdfPageImageProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const { theme, invertColors, antiAliasing } = useFileViewerConfig();

  useEffect(() => {
    if (!visible) {
      if (prevUrlRef.current !== null) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
        setSrc(null);
      }

      return;
    }

    let cancelled = false;

    const dpr = window.devicePixelRatio * 2;
    const scaleFactor = scale / 100;
    const renderedWidth = Math.round(page.size.width * scaleFactor * dpr);
    const renderedHeight = Math.round(page.size.height * scaleFactor * dpr);

    console.debug(
      `[PdfPageImage] Rendering page ${page.index.toString(10)} at ${renderedWidth.toString(10)}x${renderedHeight.toString(10)}px (scale: ${scale.toString(10)}%, dpr: ${dpr.toString(10)})`,
    );

    const task = engine.renderPage(doc, page, {
      scaleFactor,
      rotation: 0,
      dpr,
      imageType: 'image/webp',
      imageQuality: 0.92,
    });

    task.wait(
      (blob) => {
        if (cancelled) {
          return;
        }

        if (prevUrlRef.current !== null) {
          URL.revokeObjectURL(prevUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setSrc(url);
      },
      () => {
        // Render error — show nothing (placeholder stays)
      },
    );

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, scale, visible]);

  // Revoke blob URL on unmount
  useEffect(
    () => () => {
      if (prevUrlRef.current !== null) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    },
    [],
  );

  if (src === null) {
    return <div className="h-full w-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)]" />;
  }

  const filterStyle = invertColors && theme === ThemeMode.Dark ? 'hue-rotate(180deg) invert(1)' : 'none';

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`h-full w-full ${antiAliasing ? '' : 'crisp-edges'}`}
      style={{ filter: filterStyle, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
    />
  );
};
