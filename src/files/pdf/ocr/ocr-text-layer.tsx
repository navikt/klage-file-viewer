import { useLayoutEffect, useRef } from 'react';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';

interface OcrTextLayerProps {
  words: OcrWord[];
  baseWidth: number;
  baseHeight: number;
}

/**
 * Renders OCR-detected words as invisible but selectable text positioned over
 * the page image. This enables browser-native text selection (drag / Ctrl+A)
 * and find-in-page (Ctrl+F) for scanned documents.
 *
 * All words on the same line share the Tesseract line bbox for top/height,
 * giving them a uniform fontSize and vertical position. A post-render layout
 * effect measures actual rendered width and applies scaleX to match the OCR
 * bounding box width. Each word includes a trailing space so that copied text
 * has whitespace between words.
 */
export const OcrTextLayer = ({ words, baseWidth, baseHeight }: OcrTextLayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure actual rendered width of each span and apply scaleX to match
  // the OCR bounding box width. Runs synchronously after render (before
  // paint) to prevent a flash of incorrectly sized text.
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const spans = container.querySelectorAll<HTMLSpanElement>('span[data-ocr-word]');

    // Reset transforms so getBoundingClientRect returns unscaled widths.
    for (const span of spans) {
      span.style.transform = 'none';
    }

    for (const span of spans) {
      const targetWidth = Number(span.dataset.targetWidth);

      if (Number.isNaN(targetWidth) || targetWidth <= 0) {
        continue;
      }

      const actualWidth = span.getBoundingClientRect().width;

      if (actualWidth > 0) {
        span.style.transform = `scaleX(${(targetWidth / actualWidth).toString(10)})`;
      }
    }
  });

  return (
    <div ref={containerRef} className="absolute inset-0 z-3 select-text" style={{ overflow: 'hidden', lineHeight: 1 }}>
      {words.map((word, i) => {
        const left = word.x * baseWidth;
        const top = word.lineY * baseHeight;
        const targetWidth = word.width * baseWidth;
        const fontSize = word.lineHeight * baseHeight;

        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: OCR words are static once computed and never reorder
            key={i}
            data-ocr-word=""
            data-target-width={targetWidth}
            style={{
              position: 'absolute',
              left,
              top,
              fontSize: Math.max(fontSize, 1),
              fontFamily: 'sans-serif',
              color: 'transparent',
              whiteSpace: 'pre',
              transformOrigin: 'left top',
            }}
          >
            {word.text}
            {word.endOfLine ? '\n' : ' '}
          </span>
        );
      })}
    </div>
  );
};
