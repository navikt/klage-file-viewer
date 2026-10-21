import { describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { getOcrWordSelections, ocrSelectionToHighlight } from '@/files/pdf/highlights/ocr-selection';
import type { OcrWord } from '@/files/pdf/ocr/use-ocr-page';

const word = (text: string, x: number, width: number, lineY: number, endOfLine: boolean): OcrWord => ({
  text,
  x,
  y: lineY,
  width,
  height: 0.02,
  lineY,
  lineHeight: 0.03,
  endOfLine,
  confidence: 90,
});

// "abcd efgh" on line one, "ijkl" on line two. Word widths include the trailing space.
const WORDS = [
  word('abcd', 0.1, 0.1, 0.1, false),
  word('efgh', 0.2, 0.08, 0.1, true),
  word('ijkl', 0.1, 0.08, 0.2, true),
];

describe('ocrSelectionToHighlight', () => {
  it('merges words on the same line into one rect', () => {
    const highlight = ocrSelectionToHighlight(3, WORDS, [
      { wordIndex: 0, from: 0, to: 4 },
      { wordIndex: 1, from: 0, to: 4 },
    ]);

    expect(highlight).toEqual({
      pageIndex: 3,
      source: 'ocr',
      rects: [{ x: 0.1, y: 0.1, width: 0.18, height: 0.03 }],
      text: 'abcd efgh',
    });
  });

  it('estimates partial words proportionally and splits lines', () => {
    const highlight = ocrSelectionToHighlight(0, WORDS, [
      { wordIndex: 0, from: 2, to: 4 },
      { wordIndex: 2, from: 0, to: 2 },
    ]);

    // "abcd" + trailing space = 5 chars over 0.1 → 0.02 per char.
    expect(highlight?.rects).toEqual([
      { x: 0.14, y: 0.1, width: 0.04, height: 0.03 },
      { x: 0.1, y: 0.2, width: 0.04, height: 0.03 },
    ]);
    expect(highlight?.text).toBe('cd\nij');
  });

  it('returns null when nothing visible is selected', () => {
    expect(ocrSelectionToHighlight(0, WORDS, [])).toBeNull();
    expect(ocrSelectionToHighlight(0, WORDS, [{ wordIndex: 9, from: 0, to: 2 }])).toBeNull();
  });
});

describe('getOcrWordSelections', () => {
  // Mirrors OcrTextLayer: React renders `{word.text}{separator}` as two text nodes.
  const { document } = new JSDOM('').window;
  const layer = document.createElement('div');

  for (const [index, { text, endOfLine }] of WORDS.entries()) {
    const span = document.createElement('span');
    span.setAttribute('data-ocr-word-index', index.toString(10));
    span.append(document.createTextNode(text), document.createTextNode(endOfLine ? '\n' : ' '));
    layer.append(span);
  }

  document.body.append(layer);

  const textOf = (index: number): Node => {
    const node = layer.children.item(index)?.firstChild;

    if (node === null || node === undefined) {
      throw new Error(`Missing word ${index.toString(10)}`);
    }

    return node;
  };

  const separatorOf = (index: number): Node => {
    const node = layer.children.item(index)?.lastChild;

    if (node === null || node === undefined) {
      throw new Error(`Missing separator ${index.toString(10)}`);
    }

    return node;
  };

  it('returns character offsets for partially and fully selected words', () => {
    const range = document.createRange();
    range.setStart(textOf(0), 2);
    range.setEnd(textOf(2), 3);

    expect(getOcrWordSelections(range, layer)).toEqual([
      { wordIndex: 0, from: 2, to: 4 },
      { wordIndex: 1, from: 0, to: 4 },
      { wordIndex: 2, from: 0, to: 3 },
    ]);
  });

  it('skips words where only the separator is selected', () => {
    const range = document.createRange();
    range.setStart(separatorOf(0), 0);
    range.setEnd(textOf(1), 2);

    expect(getOcrWordSelections(range, layer)).toEqual([{ wordIndex: 1, from: 0, to: 2 }]);
  });

  it('includes whole words when the range starts or ends outside the word text', () => {
    const range = document.createRange();
    range.setStart(layer, 0);
    range.setEnd(separatorOf(1), 1);

    expect(getOcrWordSelections(range, layer)).toEqual([
      { wordIndex: 0, from: 0, to: 4 },
      { wordIndex: 1, from: 0, to: 4 },
    ]);
  });
});
