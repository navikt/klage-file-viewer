import { describe, expect, it } from 'bun:test';
import { repairSoftBreakGeometry } from '@/files/pdf/selection/copy/repair-soft-break-geometry';
import type { ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';
import { reorderRunsVisually } from '@/files/pdf/selection/use-page-geometry';

const ADVANCE = 6;
const LINE_HEIGHT = 12;
const LEFT = 50;

/**
 * A run in NATIVE (content-stream) order. Ghost runs are the zero-size carriers
 * PDFium emits at the page origin, so they have no `y` of their own.
 */
type RunSpec = { text: string; y: number; ghost?: false } | { text: string; ghost: true };

/** Build a geometry whose runs are contiguous in `pageText` (no gap characters). */
const build = (specs: RunSpec[]): ScreenPageGeometry => {
  let pageText = '';
  const runs: ScreenRun[] = [];

  for (const spec of specs) {
    const charStart = pageText.length;
    pageText += spec.text;

    const rect =
      spec.ghost === true
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: LEFT, y: spec.y, width: spec.text.length * ADVANCE, height: LINE_HEIGHT };

    const advance = spec.ghost === true ? 0 : ADVANCE;

    runs.push({
      rect,
      charStart,
      glyphs: [...spec.text].map((char, i) => ({
        x: rect.x + i * advance,
        y: rect.y,
        width: advance,
        height: rect.height,
        flags: char === ' ' ? 1 : char === '\r' || char === '\n' ? 2 : 0,
        tightX: undefined,
        tightY: undefined,
        tightWidth: undefined,
        tightHeight: undefined,
      })),
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      fontName: 'Test',
    });
  }

  return { runs, pageText, pageWidth: 600, pageHeight: 800, pageRotation: 0 };
};

// PDFium hoists the first character of a soft-broken line into a zero-size
// carrier run at (0, 0), leaving the visible run to start from the second.
const HEAD = 'Teksten er lang-\r';
const TAIL = 'nkluderer resten.';
const REPAIRED = `${HEAD}i${TAIL}`;

describe('repairSoftBreakGeometry', () => {
  it('splices a carrier ghost back onto the line it was taken from', () => {
    const geo = build([
      { text: '\ni', ghost: true },
      { text: HEAD, y: 120 },
      { text: TAIL, y: 140 },
    ]);

    const repaired = repairSoftBreakGeometry(geo);

    expect(repaired.pageText).toBe(REPAIRED);
    expect(repaired.runs.length).toBe(2);
    expect(repaired.runs.map((run) => run.charStart)).toEqual([0, HEAD.length]);
  });

  it('gives the repaired line a glyph for the recovered character', () => {
    const geo = build([
      { text: '\ni', ghost: true },
      { text: HEAD, y: 120 },
      { text: TAIL, y: 140 },
    ]);

    const repaired = repairSoftBreakGeometry(geo);
    const body = repaired.runs[1];

    // Without the extra glyph the recovered character would be unselectable.
    expect(body?.glyphs.length).toBe(TAIL.length + 1);
    expect(body?.glyphs[0]?.width).toBe(0);
    expect(body?.glyphs[0]?.x).toBe(LEFT);

    const start = body?.charStart ?? 0;
    expect(repaired.pageText?.slice(start, start + (body?.glyphs.length ?? 0))).toBe(`i${TAIL}`);
  });

  it('leaves the geometry untouched when carriers outnumber broken lines', () => {
    const geo = build([
      { text: '\ni', ghost: true },
      { text: '\nf', ghost: true },
      { text: HEAD, y: 120 },
      { text: TAIL, y: 140 },
    ]);

    // Two carriers but only one soft-broken line: the heuristic has misfired.
    expect(repairSoftBreakGeometry(geo)).toBe(geo);
  });

  it('leaves the geometry untouched when there are no carriers', () => {
    const geo = build([
      { text: 'Helt vanlig tekst.', y: 120 },
      { text: 'Enda en linje her.', y: 140 },
    ]);

    expect(repairSoftBreakGeometry(geo)).toBe(geo);
  });

  it('ignores blank-line ghosts whose carried character is another newline', () => {
    const geo = build([
      { text: '\r\n', ghost: true },
      { text: HEAD, y: 120 },
      { text: TAIL, y: 140 },
    ]);

    expect(repairSoftBreakGeometry(geo)).toBe(geo);
  });

  it('still repairs after the runs have been reordered visually', () => {
    // Native order puts the continuation line first, so the reorder rewrites
    // every `charStart` before the repair runs.
    const geo = build([
      { text: '\ni', ghost: true },
      { text: TAIL, y: 140 },
      { text: HEAD, y: 120 },
    ]);

    const reordered = reorderRunsVisually(geo.runs, geo.pageText, 600, 800, 0);

    expect(reordered.runs.map((run) => run.charStart)).not.toEqual(geo.runs.map((run) => run.charStart));
    expect(repairSoftBreakGeometry(reordered).pageText).toBe(REPAIRED);
  });
});
