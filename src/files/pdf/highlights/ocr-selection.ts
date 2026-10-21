import { roundRect } from '@/files/pdf/highlights/highlight-list';
import type { NewHighlight } from '@/files/pdf/highlights/types';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';

/** The selected part of one OCR word, as character offsets into `word.text` (`to` exclusive). */
export interface OcrWordSelection {
  wordIndex: number;
  from: number;
  to: number;
}

/** Attribute on each OCR word `<span>` holding its index in the page's word list. */
const OCR_WORD_INDEX_ATTRIBUTE = 'data-ocr-word-index';
/** Attribute on each OCR text layer holding its page index. */
export const OCR_PAGE_INDEX_ATTRIBUTE = 'data-ocr-page-index';

/**
 * Find which OCR words (and which characters within them) a DOM range covers.
 *
 * Each word span renders as `<span>{text}{separator}</span>`, so the first
 * child is the word's text node. Offsets inside that node are taken directly;
 * otherwise the word is either wholly inside or wholly outside the range.
 */
export const getOcrWordSelections = (range: Range, container: Element): OcrWordSelection[] => {
  const selections: OcrWordSelection[] = [];

  for (const span of container.querySelectorAll(`[${OCR_WORD_INDEX_ATTRIBUTE}]`)) {
    if (!range.intersectsNode(span)) {
      continue;
    }

    const wordIndex = getIndexAttribute(span, OCR_WORD_INDEX_ATTRIBUTE);
    const textNode = span.firstChild;

    if (wordIndex === null || textNode === null || textNode.nodeType !== textNode.TEXT_NODE) {
      continue;
    }

    const length = textNode.textContent?.length ?? 0;
    const from = range.startContainer === textNode ? range.startOffset : startOutsideWord(range, textNode, length);
    const to = range.endContainer === textNode ? range.endOffset : endOutsideWord(range, textNode, length);

    if (from < to) {
      selections.push({ wordIndex, from, to });
    }
  }

  return selections;
};

/**
 * Build one highlight from selected OCR words.
 *
 * Partially selected words are estimated proportionally from the character
 * offsets — each line is already scaled to the OCR bounding box, so glyph
 * widths are close to uniform. Consecutive words on the same line merge into
 * one rect spanning the full OCR line height, like a marker stroke.
 */
export const ocrSelectionToHighlight = (
  pageIndex: number,
  words: OcrWord[],
  selections: OcrWordSelection[],
): NewHighlight | null => {
  const lines: SelectedLine[] = [];

  for (const { wordIndex, from, to } of selections) {
    const word = words[wordIndex];

    if (word === undefined || word.text.length === 0) {
      continue;
    }

    const start = Math.max(0, Math.min(from, word.text.length));
    const end = Math.max(start, Math.min(to, word.text.length));

    if (start === end) {
      continue;
    }

    // Non-last words are widened to reach the next word, so their box also
    // covers the trailing space character.
    const charCount = word.endOfLine ? word.text.length : word.text.length + 1;
    const left = word.x + (word.width * start) / charCount;
    const right = word.x + (word.width * end) / charCount;
    const text = word.text.slice(start, end);
    const line = lines.at(-1);

    if (line !== undefined && line.lineY === word.lineY) {
      line.left = Math.min(line.left, left);
      line.right = Math.max(line.right, right);
      line.parts.push(text);
    } else {
      lines.push({ lineY: word.lineY, lineHeight: word.lineHeight, left, right, parts: [text] });
    }
  }

  const visibleLines = lines.filter((line) => line.right > line.left && line.lineHeight > 0);

  if (visibleLines.length === 0) {
    return null;
  }

  return {
    pageIndex,
    source: 'ocr',
    rects: visibleLines.map((line) =>
      roundRect({ x: line.left, y: line.lineY, width: line.right - line.left, height: line.lineHeight }),
    ),
    text: visibleLines.map((line) => line.parts.join(' ')).join('\n'),
  };
};

interface SelectedLine {
  lineY: number;
  lineHeight: number;
  left: number;
  right: number;
  parts: string[];
}

/** The range starts outside this text node: either before it (whole word) or after it (none). */
const startOutsideWord = (range: Range, textNode: Node, length: number): number =>
  range.comparePoint(textNode, 0) >= 0 ? 0 : length;

/** The range ends outside this text node: either after it (whole word) or before it (none). */
const endOutsideWord = (range: Range, textNode: Node, length: number): number =>
  range.comparePoint(textNode, length) <= 0 ? length : 0;

/** Parse an integer `data-*` index attribute. Returns `null` when it is missing or invalid. */
export const getIndexAttribute = (element: Element, name: string): number | null => {
  const value = element.getAttribute(name);

  if (value === null || value.length === 0) {
    return null;
  }

  const index = Number.parseInt(value, 10);

  return Number.isNaN(index) ? null : index;
};
