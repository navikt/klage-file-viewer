import { describe, expect, it } from 'bun:test';
import {
  findHighlightAt,
  groupHighlightsByPage,
  mergeHighlights,
  normalizeRect,
  sortHighlightsByPosition,
} from '@/files/pdf/highlights/highlight-list';
import type { NormalizedRect, StoredHighlight } from '@/files/pdf/highlights/types';

const highlight = (id: string, rects: NormalizedRect[], pageIndex = 0): StoredHighlight => ({
  id,
  pageIndex,
  source: 'pdf',
  rects,
  text: id,
  createdAt: 0,
});

const WORD = { x: 0.2, y: 0.1, width: 0.1, height: 0.02 };
const LINE = { x: 0.1, y: 0.1, width: 0.8, height: 0.02 };

describe('normalizeRect', () => {
  it('converts pixels to rounded page fractions', () => {
    expect(normalizeRect({ x: 50, y: 100, width: 100, height: 1 / 3 }, 200, 400)).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.00083,
    });
  });
});

describe('mergeHighlights', () => {
  it('appends new highlights', () => {
    const existing = [highlight('a', [WORD])];
    const incoming = [highlight('b', [{ ...WORD, y: 0.5 }])];

    expect(mergeHighlights(existing, incoming).map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('ignores a new highlight already covered by an existing one', () => {
    const existing = [highlight('line', [LINE])];

    expect(mergeHighlights(existing, [highlight('word', [WORD])])).toBe(existing);
  });

  it('replaces existing highlights covered by the new one', () => {
    const existing = [highlight('word', [WORD]), highlight('other', [{ ...WORD, y: 0.5 }])];

    expect(mergeHighlights(existing, [highlight('line', [LINE])]).map(({ id }) => id)).toEqual(['other', 'line']);
  });

  it('deduplicates within the incoming highlights', () => {
    const incoming = [highlight('word', [WORD]), highlight('line', [LINE]), highlight('covered', [WORD])];

    expect(mergeHighlights([], incoming).map(({ id }) => id)).toEqual(['line']);
  });

  it('only compares highlights on the same page', () => {
    const existing = [highlight('line', [LINE], 0)];

    expect(mergeHighlights(existing, [highlight('word', [WORD], 1)]).map(({ id }) => id)).toEqual(['line', 'word']);
  });
});

describe('findHighlightAt', () => {
  const highlights = [highlight('line', [LINE]), highlight('word', [WORD])];

  it('returns the most recently added highlight at the point', () => {
    expect(findHighlightAt(highlights, 0.25, 0.11)?.id).toBe('word');
    expect(findHighlightAt(highlights, 0.8, 0.11)?.id).toBe('line');
  });

  it('returns undefined outside all highlights', () => {
    expect(findHighlightAt(highlights, 0.5, 0.5)).toBeUndefined();
  });
});

describe('groupHighlightsByPage', () => {
  it('groups by page index, keeping order', () => {
    const grouped = groupHighlightsByPage([
      highlight('a', [WORD], 1),
      highlight('b', [WORD], 0),
      highlight('c', [WORD], 1),
    ]);

    expect(grouped.get(0)?.map(({ id }) => id)).toEqual(['b']);
    expect(grouped.get(1)?.map(({ id }) => id)).toEqual(['a', 'c']);
  });
});

describe('sortHighlightsByPosition', () => {
  it('sorts by page, then top to bottom, then left to right', () => {
    const highlights = [
      highlight('page-2', [WORD], 1),
      highlight('bottom', [{ ...WORD, y: 0.8 }]),
      highlight('top-right', [{ ...WORD, x: 0.6 }]),
      highlight('top-left', [WORD]),
    ];

    expect(sortHighlightsByPosition(highlights).map(({ id }) => id)).toEqual([
      'top-left',
      'top-right',
      'bottom',
      'page-2',
    ]);
  });

  it('uses the first line of multi-line highlights', () => {
    const highlights = [
      highlight('single', [{ ...WORD, y: 0.3 }]),
      highlight('multi', [
        { ...LINE, y: 0.5 },
        { ...LINE, y: 0.2 },
      ]),
    ];

    expect(sortHighlightsByPosition(highlights).map(({ id }) => id)).toEqual(['multi', 'single']);
  });
});
