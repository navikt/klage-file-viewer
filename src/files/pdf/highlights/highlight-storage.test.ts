import { describe, expect, it } from 'bun:test';
import {
  applyHighlightChanges,
  getHighlightChanges,
  getHighlightsKey,
  mirrorAppliedHighlightChanges,
  validateHighlightChanges,
  validateHighlights,
} from '@/files/pdf/highlights/highlight-storage';
import type { StoredHighlight } from '@/files/pdf/highlights/types';

const HIGHLIGHT: StoredHighlight = {
  id: 'a',
  pageIndex: 2,
  source: 'pdf',
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
  text: 'Hei',
  createdAt: 1_700_000_000_000,
};

describe('validateHighlights', () => {
  it('keeps valid highlights', () => {
    expect(validateHighlights([HIGHLIGHT])).toEqual([HIGHLIGHT]);
  });

  it('keeps reflowed blocks and drops highlights with malformed blocks', () => {
    const withBlocks: StoredHighlight = {
      ...HIGHLIGHT,
      blocks: [
        {
          kind: 'heading',
          spans: [{ text: 'Vedtak', bold: true, italic: false }],
          level: 0,
          headingLevel: 1,
          gapBefore: false,
        },
        {
          kind: 'listItem',
          spans: [{ text: 'Punkt', bold: false, italic: true }],
          level: 1,
          headingLevel: 0,
          gapBefore: true,
        },
      ],
    };
    const malformed = {
      ...HIGHLIGHT,
      id: 'b',
      blocks: [{ kind: 'table', spans: [], level: 0, headingLevel: 0, gapBefore: false }],
    };

    expect(validateHighlights([withBlocks, malformed])).toEqual([withBlocks]);
  });

  it('returns an empty list for values that are not lists', () => {
    expect(validateHighlights(null)).toEqual([]);
    expect(validateHighlights(undefined)).toEqual([]);
    expect(validateHighlights('[]')).toEqual([]);
    expect(validateHighlights({ highlights: [HIGHLIGHT] })).toEqual([]);
  });

  it('drops invalid entries and keeps valid ones', () => {
    const invalid = [
      { ...HIGHLIGHT, id: 1 },
      { ...HIGHLIGHT, pageIndex: -1 },
      { ...HIGHLIGHT, pageIndex: 1.5 },
      { ...HIGHLIGHT, source: 'pen' },
      { ...HIGHLIGHT, rects: [] },
      { ...HIGHLIGHT, rects: [{ x: 0, y: 0, width: 0, height: 0.1 }] },
      { ...HIGHLIGHT, rects: [{ x: 0, y: 0, width: '1', height: 0.1 }] },
      { ...HIGHLIGHT, text: null },
      { ...HIGHLIGHT, createdAt: Number.NaN },
      null,
      'highlight',
    ];

    expect(validateHighlights([...invalid, HIGHLIGHT])).toEqual([HIGHLIGHT]);
  });
});

describe('getHighlightsKey', () => {
  it('keys variants by URL and format', () => {
    const keys = [
      getHighlightsKey({ id: '/a.pdf', format: undefined }),
      getHighlightsKey({ id: '/a.pdf', format: 'ARKIV' }),
      getHighlightsKey({ id: '/a.pdf', format: 'SLADDET' }),
      getHighlightsKey({ id: '/b.pdf', format: 'ARKIV' }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
    expect(getHighlightsKey({ id: '/a.pdf', format: 'ARKIV' })).toBe(
      getHighlightsKey({ id: '/a.pdf', format: 'ARKIV' }),
    );
  });
});

describe('validateHighlightChanges', () => {
  it('keeps the valid parts of changes', () => {
    expect(validateHighlightChanges({ added: [HIGHLIGHT, { id: 'invalid' }], removedIds: ['b', 1] })).toEqual({
      added: [HIGHLIGHT],
      removedIds: ['b'],
    });
    expect(validateHighlightChanges(undefined)).toEqual({ added: [], removedIds: [] });
    expect(validateHighlightChanges({ added: 'a', removedIds: null })).toEqual({ added: [], removedIds: [] });
  });
});

describe('highlight changes', () => {
  it('only includes added and removed highlights', () => {
    const removed = { ...HIGHLIGHT, id: 'removed' };
    const kept = { ...HIGHLIGHT, id: 'kept' };
    const added = { ...HIGHLIGHT, id: 'added' };

    expect(getHighlightChanges([HIGHLIGHT, removed, kept], [{ ...HIGHLIGHT, text: 'Edited' }, kept, added])).toEqual({
      added: [added],
      removedIds: ['removed'],
    });
    expect(getHighlightChanges([kept], [kept])).toEqual({ added: [], removedIds: [] });
  });

  it('applies changes idempotently and never adds removed or present IDs', () => {
    const other = { ...HIGHLIGHT, id: 'other' };
    const added = { ...HIGHLIGHT, id: 'added' };
    const changes = { added: [{ ...HIGHLIGHT, text: 'Edited' }, added, other], removedIds: ['other', 'absent'] };
    const removedIds = new Set(changes.removedIds);
    const applied = mirrorAppliedHighlightChanges([HIGHLIGHT, other], changes.added, removedIds);

    expect(applied).toEqual([HIGHLIGHT, added]);
    expect(mirrorAppliedHighlightChanges(applied, changes.added, removedIds)).toBe(applied);
    expect(HIGHLIGHT.text).toBe('Hei');
  });
});

describe('applyHighlightChanges', () => {
  const at = (id: string, x: number, width: number): StoredHighlight => ({
    ...HIGHLIGHT,
    id,
    rects: [{ x, y: 0.2, width, height: 0.02 }],
  });

  it('adds and removes highlights and records removed IDs', () => {
    const kept = at('kept', 0.1, 0.1);
    const removed = at('removed', 0.3, 0.1);
    const added = at('added', 0.5, 0.1);

    expect(applyHighlightChanges([kept, removed], ['old'], { added: [added], removedIds: ['removed'] })).toEqual({
      highlights: [kept, added],
      removedIds: ['old', 'removed'],
      changes: { added: [added], removedIds: ['removed'] },
    });
  });

  it('rejects covered additions and removes highlights an addition covers', () => {
    const word = at('word', 0.2, 0.1);
    const line = at('line', 0.1, 0.5);
    const duplicate = at('duplicate', 0.1, 0.5);
    const covered = at('covered', 0.3, 0.1);

    expect(applyHighlightChanges([word], [], { added: [line, duplicate, covered], removedIds: [] })).toEqual({
      highlights: [line],
      removedIds: ['word', 'duplicate', 'covered'],
      changes: { added: [line], removedIds: ['word', 'duplicate', 'covered'] },
    });
  });

  it('reports removed IDs that are added again as removed, and ignores retried additions', () => {
    const stored = at('stored', 0.1, 0.1);

    expect(
      applyHighlightChanges([stored], ['removed'], { added: [at('removed', 0.5, 0.1), stored], removedIds: [] }),
    ).toEqual({
      highlights: [stored],
      removedIds: ['removed'],
      changes: { added: [], removedIds: ['removed'] },
    });
  });

  it('leaves out invalid input', () => {
    const invalid = { added: [{ id: 'invalid' }], removedIds: [1] };

    expect(applyHighlightChanges([HIGHLIGHT], [], JSON.parse(JSON.stringify(invalid)))).toEqual({
      highlights: [HIGHLIGHT],
      removedIds: [],
      changes: { added: [], removedIds: [] },
    });
  });
});
