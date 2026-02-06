import { describe, expect, it } from 'bun:test';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { processTextItems } from './process-text-items';

const createTextItem = (str: string, x: number, y: number, width: number, overrides?: Partial<TextItem>): TextItem => ({
  str,
  dir: 'ltr',
  width,
  height: 12,
  transform: [12, 0, 0, 12, x, y],
  fontName: 'g_d0_f1',
  hasEOL: false,
  ...overrides,
});

describe('processTextItems', () => {
  describe('basic functionality', () => {
    it('returns empty array for empty input', () => {
      expect(processTextItems([])).toEqual([]);
    });

    it('returns single item with hasEOL set to true', () => {
      const result = processTextItems([createTextItem('Hello', 0, 100, 50)]);

      expect(result).toMatchObject([{ str: 'Hello', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });

    it('keeps adjacent items on the same line separate', () => {
      const items: TextItem[] = [createTextItem('Hello ', 0, 100, 30), createTextItem('World', 30, 100, 40)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Hello ' }, { str: 'World' }]);
      expect(result).toHaveLength(2);
    });
  });

  describe('gap detection and space insertion', () => {
    it('inserts space item when there is a gap between items', () => {
      const items: TextItem[] = [createTextItem('Left', 0, 100, 30), createTextItem('Right', 50, 100, 40)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Left' }, { str: ' ', width: 20 }, { str: 'Right' }]);
      expect(result).toHaveLength(3);
    });

    it('does not insert space between items when one is whitespace-only', () => {
      const items: TextItem[] = [
        createTextItem('Text', 0, 100, 30),
        createTextItem(' ', 30, 100, 10),
        createTextItem('More', 50, 100, 30),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Text' }, { str: ' ' }, { str: 'More' }]);
      expect(result).toHaveLength(3);
    });

    it('calculates correct position for inserted space item', () => {
      const items: TextItem[] = [createTextItem('Hello', 0, 100, 30), createTextItem('World', 35, 100, 40)];

      const result = processTextItems(items);
      const spaceItem = result[1];

      expect(spaceItem).toMatchObject({
        str: ' ',
        width: 5,
        transform: [12, 0, 0, 12, 30, 100],
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('sorting', () => {
    it('sorts items by y-position descending (top to bottom in PDF)', () => {
      const items: TextItem[] = [
        createTextItem('Bottom', 0, 50, 50),
        createTextItem('Top', 0, 100, 50),
        createTextItem('Middle', 0, 75, 50),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Top' }, { str: 'Middle' }, { str: 'Bottom' }]);
      expect(result).toHaveLength(3);
    });

    it('sorts items on the same line by x-position', () => {
      const items: TextItem[] = [
        createTextItem('Third', 60, 100, 30),
        createTextItem('First', 0, 100, 25),
        createTextItem('Second', 25, 100, 35),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'First' }, { str: 'Second' }, { str: 'Third' }]);
      expect(result).toHaveLength(3);
    });
  });

  describe('hasEOL handling', () => {
    it('sets hasEOL=true only on last item of each line', () => {
      const items: TextItem[] = [
        createTextItem('First', 0, 100, 30, { hasEOL: true }),
        createTextItem('Second', 30, 100, 40, { hasEOL: false }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'First', hasEOL: false },
        { str: 'Second', hasEOL: true },
      ]);
      expect(result).toHaveLength(2);
    });

    it('sets hasEOL=true on last item when spaces are inserted', () => {
      const items: TextItem[] = [
        createTextItem('A', 0, 100, 10),
        createTextItem('B', 20, 100, 10),
        createTextItem('C', 40, 100, 10),
      ];

      const result = processTextItems(items);

      // A, space, B, space, C
      expect(result).toMatchObject([
        { str: 'A', hasEOL: false },
        { str: ' ', hasEOL: false },
        { str: 'B', hasEOL: false },
        { str: ' ', hasEOL: false },
        { str: 'C', hasEOL: true },
      ]);
      expect(result).toHaveLength(5);
    });
  });

  describe('filtering', () => {
    it('skips zero-width items', () => {
      const items: TextItem[] = [createTextItem('', 0, 100, 0), createTextItem('Content', 0, 100, 50)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Content' }]);
      expect(result).toHaveLength(1);
    });

    it('skips marked content items', () => {
      const items = [{ id: 'mcid_1', type: 'beginMarkedContent' }, createTextItem('Content', 0, 100, 50)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Content' }]);
      expect(result).toHaveLength(1);
    });
  });

  describe('line grouping', () => {
    it('groups items with similar y-positions onto the same line', () => {
      const items: TextItem[] = [
        createTextItem('Same', 0, 100, 30),
        createTextItem('Line', 35, 100.05, 30), // Slightly different y, within tolerance
      ];

      const result = processTextItems(items);

      // Should be grouped and have space inserted
      expect(result).toMatchObject([{ str: 'Same' }, { str: ' ' }, { str: 'Line' }]);
      expect(result).toHaveLength(3);
    });

    it('keeps items on different lines separate', () => {
      const items: TextItem[] = [createTextItem('Line 1', 0, 100, 50), createTextItem('Line 2', 0, 80, 50)];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'Line 1', hasEOL: true },
        { str: 'Line 2', hasEOL: true },
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe('real-world scenarios', () => {
    it('handles label-value pairs with gaps', () => {
      const items: TextItem[] = [
        createTextItem('Saksnummer:', 56.7, 620, 71.652, { fontName: 'g_d0_f2' }),
        createTextItem('1829', 130.76, 620, 23.856, { fontName: 'g_d0_f1' }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Saksnummer:' }, { str: ' ' }, { str: '1829' }]);
      expect(result).toHaveLength(3);
    });

    it('preserves existing whitespace items between text items', () => {
      const items: TextItem[] = [
        createTextItem('Label:', 56.7, 620, 71.652),
        createTextItem(' ', 128.352, 620, 2.41, { height: 0 }),
        createTextItem('Value', 130.76, 620, 23.856),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Label:' }, { str: ' ' }, { str: 'Value' }]);
      expect(result).toHaveLength(3);
    });

    it('handles table-like content with wide spacing', () => {
      const items: TextItem[] = [
        createTextItem('Col1', 60, 544, 17),
        createTextItem(' ', 77, 544, 143, { height: 0 }),
        createTextItem('Col2', 220, 544, 17),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'Col1', transform: [12, 0, 0, 12, 60, 544] },
        { str: ' ', width: 143, transform: [12, 0, 0, 12, 77, 544] },
        { str: 'Col2', transform: [12, 0, 0, 12, 220, 544] },
      ]);
      expect(result).toHaveLength(3);
    });
  });
});
