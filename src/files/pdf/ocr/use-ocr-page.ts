import type { PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models';
import { useEffect, useRef, useState } from 'react';
import { getOcrWorker } from '@/files/pdf/ocr/ocr-engine';

export interface OcrWord {
  text: string;
  /** Bounding box as fractions of page dimensions (0–1). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Line-level top as fraction of page height (0–1). */
  lineY: number;
  /** Line-level height as fraction of page height (0–1). */
  lineHeight: number;
  /** Whether this is the last word on its line. */
  endOfLine: boolean;
  confidence: number;
}

interface UseOcrPageResult {
  words: OcrWord[] | null;
  isRunning: boolean;
}

/** Scale factor used when rendering pages for OCR (~216 DPI on A4). */
const OCR_SCALE = 3;

/** Minimum word confidence to include in results. */
const MIN_CONFIDENCE = 30;

/**
 * PDFium can return random Unicode (e.g. CJK + control chars) for pages where
 * the "text" is actually a rasterised image. We look for at least one sequence
 * of 2+ consecutive letters or digits, which any real text will have.
 */
const READABLE_TEXT_PATTERN = /[\p{L}\p{N}]{2,}/u;
const hasReadableText = (text: string): boolean => READABLE_TEXT_PATTERN.test(text);

// Module-level caches shared across component instances.
const ocrResultCache = new Map<string, OcrWord[]>();
const pagesWithTextCache = new Set<string>();

const cacheKey = (docId: string, pageIndex: number): string => `${docId}:${pageIndex.toString(10)}`;

const renderPageToBlob = (engine: PdfEngine, doc: PdfDocumentObject, page: PdfPageObject): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const task = engine.renderPage(doc, page, {
      scaleFactor: OCR_SCALE,
      rotation: 0,
      dpr: 1,
      imageType: 'image/png',
      imageQuality: 1,
    });

    task.wait(resolve, reject);
  });

const extractPageText = (engine: PdfEngine, doc: PdfDocumentObject, pageIndex: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const task = engine.extractText(doc, [pageIndex]);
    task.wait(resolve, reject);
  });

const extractLineWords = (
  lineWords: import('tesseract.js').Word[],
  lineY: number,
  lineHeight: number,
  imageWidth: number,
  imageHeight: number,
): OcrWord[] => {
  const result: OcrWord[] = [];

  for (let wi = 0; wi < lineWords.length; wi++) {
    const word = lineWords[wi];

    if (word === undefined) {
      continue;
    }

    const isLast = wi === lineWords.length - 1;
    const nextWord = isLast ? undefined : lineWords[wi + 1];

    // For non-last words, extend width to the start of the next word
    // so the trailing space character is covered by the scaleX target.
    const width =
      nextWord !== undefined
        ? (nextWord.bbox.x0 - word.bbox.x0) / imageWidth
        : (word.bbox.x1 - word.bbox.x0) / imageWidth;

    result.push({
      text: word.text,
      x: word.bbox.x0 / imageWidth,
      y: word.bbox.y0 / imageHeight,
      width,
      height: (word.bbox.y1 - word.bbox.y0) / imageHeight,
      lineY,
      lineHeight,
      endOfLine: isLast,
      confidence: word.confidence,
    });
  }

  return result;
};

const runOcr = async (imageBlob: Blob, pageWidth: number, pageHeight: number): Promise<OcrWord[]> => {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(imageBlob, {}, { blocks: true });

  if (data.blocks === null) {
    return [];
  }

  const imageWidth = pageWidth * OCR_SCALE;
  const imageHeight = pageHeight * OCR_SCALE;

  const words: OcrWord[] = [];

  for (const block of data.blocks) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const lineY = line.bbox.y0 / imageHeight;
        const lineHeight = (line.bbox.y1 - line.bbox.y0) / imageHeight;
        const lineWords = line.words.filter((w) => w.confidence >= MIN_CONFIDENCE);

        words.push(...extractLineWords(lineWords, lineY, lineHeight, imageWidth, imageHeight));
      }
    }
  }

  return words;
};

export const useOcrPage = (
  engine: PdfEngine | null,
  doc: PdfDocumentObject | null,
  page: PdfPageObject | undefined,
  pageIndex: number,
  visible: boolean,
): UseOcrPageResult => {
  const [words, setWords] = useState<OcrWord[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (engine === null || doc === null || page === undefined || !visible) {
      return;
    }

    const key = cacheKey(doc.id, pageIndex);

    // Already have results for this page
    const cached = ocrResultCache.get(key);

    if (cached !== undefined) {
      setWords(cached);

      return;
    }

    // Already know this page has embedded text
    if (pagesWithTextCache.has(key)) {
      return;
    }

    // Already attempted this page in this component instance
    if (attemptedRef.current === key) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const text = await extractPageText(engine, doc, pageIndex);

        if (hasReadableText(text)) {
          pagesWithTextCache.add(key);
          attemptedRef.current = key;

          return;
        }
      } catch {
        return;
      }

      if (cancelled) {
        return;
      }

      attemptedRef.current = key;
      setIsRunning(true);

      try {
        const blob = await renderPageToBlob(engine, doc, page);

        if (cancelled) {
          return;
        }

        const ocrWords = await runOcr(blob, page.size.width, page.size.height);

        if (cancelled) {
          return;
        }

        ocrResultCache.set(key, ocrWords);
        setWords(ocrWords);
      } catch (err) {
        console.warn('OCR failed for page', pageIndex, err);
      } finally {
        if (!cancelled) {
          setIsRunning(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [engine, doc, page, pageIndex, visible]);

  return { words, isRunning };
};
