import type { PDFPageProxy } from 'pdfjs-dist';
import { useMemo } from 'react';

interface PagePlaceholderProps {
  page: PDFPageProxy;
  scale: number;
}

/**
 * A lightweight placeholder that matches the dimensions a fully rendered page
 * would occupy. Used for off-screen pages to preserve scroll position and
 * document flow without the memory cost of a canvas backing store.
 *
 * Uses the page's inherent rotation (`page.rotate`) for sizing. User rotation
 * (managed by `RotatablePage` and persisted in localStorage) is not accounted
 * for — when the page scrolls into view and the real component mounts, it will
 * adjust to the stored rotation. This trade-off avoids coupling the placeholder
 * to the rotation storage mechanism.
 */
export const PagePlaceholder = ({ page, scale }: PagePlaceholderProps) => {
  const { width, height } = useMemo(() => {
    const viewport = page.getViewport({ scale: scale / 100, rotation: page.rotate });

    return { width: viewport.width, height: viewport.height };
  }, [page, scale]);

  return <div className="bg-ax-bg-neutral-moderate/30 shadow-ax-dialog" style={{ width, height }} />;
};
