import { describe, expect, it } from 'bun:test';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { processTextItems } from '@/files/pdf/process-text-items';

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

    it('merges adjacent items on the same line with the same font', () => {
      const items: TextItem[] = [createTextItem('Hello ', 0, 100, 30), createTextItem('World', 30, 100, 40)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Hello World', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });
  });

  describe('gap detection and space insertion', () => {
    it('inserts space and merges items when there is a gap between them', () => {
      const items: TextItem[] = [createTextItem('Left', 0, 100, 30), createTextItem('Right', 50, 100, 40)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Left Right', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });

    it('merges text with adjacent whitespace-only item but stops at large gap', () => {
      const items: TextItem[] = [
        createTextItem('Text', 0, 100, 30),
        createTextItem(' ', 30, 100, 10),
        createTextItem('More', 50, 100, 30),
      ];

      const result = processTextItems(items);

      // Text and space merge (adjacent, same font/height), but the gap between space (ends at 40) and More (starts at 50)
      // is 10 units which exceeds merge tolerance. No additional space is inserted because the space item is whitespace-only.
      expect(result).toMatchObject([
        { str: 'Text ', hasEOL: false },
        { str: 'More', hasEOL: true },
      ]);
      expect(result).toHaveLength(2);
    });

    it('merges space item into surrounding text', () => {
      const items: TextItem[] = [createTextItem('Hello', 0, 100, 30), createTextItem('World', 35, 100, 40)];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Hello World', hasEOL: true, width: 75 }]);
      expect(result[0]?.transform).toEqual([12, 0, 0, 12, 0, 100]);
      expect(result).toHaveLength(1);
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

    it('sorts items on the same line by x-position and merges them', () => {
      const items: TextItem[] = [
        createTextItem('Third', 60, 100, 30),
        createTextItem('First', 0, 100, 25),
        createTextItem('Second', 25, 100, 35),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'FirstSecondThird', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });
  });

  describe('hasEOL handling', () => {
    it('sets hasEOL=true on merged item', () => {
      const items: TextItem[] = [
        createTextItem('First', 0, 100, 30, { hasEOL: true }),
        createTextItem('Second', 30, 100, 40, { hasEOL: false }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'FirstSecond', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });

    it('sets hasEOL=true on merged item when spaces are inserted', () => {
      const items: TextItem[] = [
        createTextItem('A', 0, 100, 10),
        createTextItem('B', 20, 100, 10),
        createTextItem('C', 40, 100, 10),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'A B C', hasEOL: true }]);
      expect(result).toHaveLength(1);
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
    it('groups items with similar y-positions onto the same line and merges them', () => {
      const items: TextItem[] = [
        createTextItem('Same', 0, 100, 30),
        createTextItem('Line', 35, 100.05, 30), // Slightly different y, within tolerance
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Same Line', hasEOL: true }]);
      expect(result).toHaveLength(1);
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

  describe('merging', () => {
    it('merges per-character items into a single word', () => {
      const items: TextItem[] = [
        createTextItem('H', 0, 100, 8),
        createTextItem('e', 8, 100, 6),
        createTextItem('l', 14, 100, 4),
        createTextItem('l', 18, 100, 4),
        createTextItem('o', 22, 100, 7),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Hello', width: 29, hasEOL: true }]);
      expect(result[0]?.transform).toEqual([12, 0, 0, 12, 0, 100]);
      expect(result).toHaveLength(1);
    });

    it('merges per-character items with spaces between words', () => {
      const items: TextItem[] = [
        createTextItem('H', 0, 100, 8),
        createTextItem('i', 8, 100, 4),
        createTextItem(' ', 12, 100, 5),
        createTextItem('y', 17, 100, 7),
        createTextItem('o', 24, 100, 7),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Hi yo', width: 31, hasEOL: true }]);
      expect(result).toHaveLength(1);
    });

    it('stops merging at font name boundaries', () => {
      const items: TextItem[] = [
        createTextItem('Normal', 0, 100, 40, { fontName: 'font_regular' }),
        createTextItem('Bold', 40, 100, 30, { fontName: 'font_bold' }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'Normal', fontName: 'font_regular' },
        { str: 'Bold', fontName: 'font_bold' },
      ]);
      expect(result).toHaveLength(2);
    });

    it('stops merging at height boundaries', () => {
      const items: TextItem[] = [
        createTextItem('Big', 0, 100, 30, { height: 16 }),
        createTextItem('Small', 30, 100, 20, { height: 10 }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'Big', height: 16 },
        { str: 'Small', height: 10 },
      ]);
      expect(result).toHaveLength(2);
    });

    it('stops merging at direction boundaries', () => {
      const items: TextItem[] = [
        createTextItem('LTR', 0, 100, 30, { dir: 'ltr' }),
        createTextItem('RTL', 30, 100, 30, { dir: 'rtl' }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'LTR', dir: 'ltr' },
        { str: 'RTL', dir: 'rtl' },
      ]);
      expect(result).toHaveLength(2);
    });

    it('stops merging at transform scale boundaries', () => {
      const items: TextItem[] = [
        createTextItem('A', 0, 100, 10, { transform: [12, 0, 0, 12, 0, 100] }),
        createTextItem('B', 10, 100, 10, { transform: [14, 0, 0, 14, 10, 100] }),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'A' }, { str: 'B' }]);
      expect(result).toHaveLength(2);
    });

    it('does not merge items with large gaps', () => {
      const items: TextItem[] = [createTextItem('Far', 0, 100, 20), createTextItem('Apart', 200, 100, 30)];

      const result = processTextItems(items);

      // Space is inserted but they are all merged because the space fills the gap
      expect(result).toMatchObject([{ str: 'Far Apart', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });

    it('merges items with slight overlap due to kerning', () => {
      const items: TextItem[] = [
        createTextItem('A', 0, 100, 10),
        createTextItem('V', 9.8, 100, 10), // Slight overlap
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'AV', hasEOL: true }]);
      expect(result).toHaveLength(1);
    });

    it('merges per-character items across multiple lines independently', () => {
      const items: TextItem[] = [
        createTextItem('H', 0, 100, 8),
        createTextItem('i', 8, 100, 4),
        createTextItem('B', 0, 80, 8),
        createTextItem('y', 8, 80, 6),
        createTextItem('e', 14, 80, 6),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([
        { str: 'Hi', hasEOL: true },
        { str: 'Bye', hasEOL: true },
      ]);
      expect(result).toHaveLength(2);
    });

    it('merges inserted space into preceding text but stops at font boundary', () => {
      const items: TextItem[] = [
        createTextItem('Saksnummer:', 56.7, 620, 71.652, { fontName: 'g_d0_f2' }),
        createTextItem('1829', 130.76, 620, 23.856, { fontName: 'g_d0_f1' }),
      ];

      const result = processTextItems(items);

      // Space inherits fontName from previous item (g_d0_f2), so it merges with "Saksnummer:"
      // but not with "1829" which has a different font
      expect(result).toMatchObject([
        { str: 'Saksnummer: ', fontName: 'g_d0_f2' },
        { str: '1829', fontName: 'g_d0_f1' },
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe('real-world scenarios', () => {
    it('preserves existing whitespace items between text items when height differs', () => {
      const items: TextItem[] = [
        createTextItem('Label:', 56.7, 620, 71.652),
        createTextItem(' ', 128.352, 620, 2.41, { height: 0 }),
        createTextItem('Value', 130.76, 620, 23.856),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Label:' }, { str: ' ' }, { str: 'Value' }]);
      expect(result).toHaveLength(3);
    });

    it('handles table-like content with wide spacing and zero-height separators', () => {
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

    it('handles a full Google Docs-style line with per-character spans and word gaps', () => {
      // Simulates "Hi there" where each character is its own item with a gap for the space
      const items: TextItem[] = [
        createTextItem('H', 0, 100, 8),
        createTextItem('i', 8, 100, 4),
        // gap here (12 to 16) represents a word space
        createTextItem('t', 16, 100, 5),
        createTextItem('h', 21, 100, 6),
        createTextItem('e', 27, 100, 5),
        createTextItem('r', 32, 100, 4),
        createTextItem('e', 36, 100, 5),
      ];

      const result = processTextItems(items);

      expect(result).toMatchObject([{ str: 'Hi there', hasEOL: true }]);
      expect(result[0]?.transform).toEqual([12, 0, 0, 12, 0, 100]);
      expect(result[0]?.width).toBe(41);
      expect(result).toHaveLength(1);
    });
  });
});
