import { useLayoutEffect, useMemo, useRef } from 'react';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';

interface OcrLine {
  words: OcrWord[];
  lineY: number;
  lineHeight: number;
  /** Left edge of the first word (0–1 fraction). */
  left: number;
  /** Width from first word's left to last word's right (0–1 fraction). */
  width: number;
}

const groupIntoLines = (words: OcrWord[]): OcrLine[] => {
  const lines: OcrLine[] = [];
  let current: OcrWord[] = [];
  let currentY = -1;

  for (const word of words) {
    if (word.lineY !== currentY) {
      if (current.length > 0) {
        lines.push(buildLine(current));
      }

      current = [word];
      currentY = word.lineY;
    } else {
      current.push(word);
    }
  }

  if (current.length > 0) {
    lines.push(buildLine(current));
  }

  return lines;
};

const buildLine = (words: OcrWord[]): OcrLine => {
  const first = words[0];
  const last = words[words.length - 1];

  if (first === undefined || last === undefined) {
    return { words, lineY: 0, lineHeight: 0, left: 0, width: 0 };
  }

  return {
    words,
    lineY: first.lineY,
    lineHeight: first.lineHeight,
    left: first.x,
    width: last.x + last.width - first.x,
  };
};

interface OcrTextLayerProps {
  words: OcrWord[];
  baseWidth: number;
  baseHeight: number;
}

/**
 * Renders OCR-detected words as invisible but selectable text positioned over
 * the page image. Words are grouped into block-level line `<div>`s so that
 * triple-click selects a line, and block boundaries produce line breaks when
 * copying. A post-render layout effect measures each line's natural width and
 * applies scaleX to match the OCR bounding box.
 */
export const OcrTextLayer = ({ words, baseWidth, baseHeight }: OcrTextLayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => groupIntoLines(words), [words]);

  // Measure each line div's natural width and apply scaleX to match the
  // OCR line width. Runs before paint to prevent a flash of wrong width.
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const lineDivs = container.querySelectorAll<HTMLDivElement>('div[data-ocr-line]');

    for (const div of lineDivs) {
      div.style.transform = 'none';
    }

    for (const div of lineDivs) {
      const targetWidth = Number(div.dataset.targetWidth);

      if (Number.isNaN(targetWidth) || targetWidth <= 0) {
        continue;
      }

      // Use offsetWidth instead of getBoundingClientRect().width because
      // getBoundingClientRect includes ancestor CSS transforms (rotation),
      // which swaps width/height and produces incorrect scaleX values.
      const actualWidth = div.offsetWidth;

      if (actualWidth > 0) {
        div.style.transform = `scaleX(${(targetWidth / actualWidth).toString(10)})`;
      }
    }
  });

  return (
    <div ref={containerRef} className="absolute inset-0 z-3 select-text" style={{ overflow: 'hidden' }}>
      {lines.map((line, li) => {
        const top = line.lineY * baseHeight;
        const left = line.left * baseWidth;
        const targetWidth = line.width * baseWidth;
        const fontSize = line.lineHeight * baseHeight;

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: OCR lines are static once computed and never reorder
            key={li}
            data-ocr-line=""
            data-target-width={targetWidth}
            style={{
              position: 'absolute',
              left,
              top,
              fontSize: Math.max(fontSize, 1),
              fontFamily: 'sans-serif',
              color: 'transparent',
              whiteSpace: 'nowrap',
              lineHeight: 1,
              transformOrigin: 'left top',
            }}
          >
            {line.words.map((word, wi) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: OCR words are static once computed and never reorder
              <span key={wi}>
                {word.text}
                {word.endOfLine ? '\n' : ' '}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};
