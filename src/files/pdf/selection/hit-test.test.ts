import { describe, expect, it } from 'bun:test';
import { snapToNearest } from '@/files/pdf/selection/hit-test';
import type { ScreenPageGeometry, ScreenRun } from '@/files/pdf/selection/types';

const GLYPH_WIDTH = 6;
const LINE_HEIGHT = 12;

const LEFT_COLUMN_X = 50;
const RIGHT_COLUMN_X = 320;

const LEFT_FIRST = 'Venstre kolonne sin aller foerste linje';
const LEFT_SECOND = 'Venstre kolonne sin andre linje i rekka';
const LEFT_THIRD = 'Venstre kolonne sin tredje og siste linje';

const RIGHT_FIRST = 'Hoyre kolonne sin aller foerste linje';
const RIGHT_SECOND = 'Hoyre kolonne sin andre linje i rekka';
const RIGHT_THIRD = 'Hoyre kolonne sin tredje og siste linje';

/** Right edge of the first line in the left column. */
const LEFT_FIRST_RIGHT_EDGE = LEFT_COLUMN_X + LEFT_FIRST.length * GLYPH_WIDTH;
/** Right edge of the last line in the left column. */
const LEFT_THIRD_RIGHT_EDGE = LEFT_COLUMN_X + LEFT_THIRD.length * GLYPH_WIDTH;

const LEFT_COLUMN_CHARS = LEFT_FIRST.length + LEFT_SECOND.length + LEFT_THIRD.length;
const RIGHT_COLUMN_CHARS = RIGHT_FIRST.length + RIGHT_SECOND.length + RIGHT_THIRD.length;

interface RunSpec {
  text: string;
  x: number;
  y: number;
}

/** Two columns in column-major reading order, as `reorderRunsVisually` preserves it. */
const TWO_COLUMNS: RunSpec[] = [
  { text: LEFT_FIRST, x: LEFT_COLUMN_X, y: 0 },
  { text: LEFT_SECOND, x: LEFT_COLUMN_X, y: 20 },
  { text: LEFT_THIRD, x: LEFT_COLUMN_X, y: 40 },
  { text: RIGHT_FIRST, x: RIGHT_COLUMN_X, y: 0 },
  { text: RIGHT_SECOND, x: RIGHT_COLUMN_X, y: 20 },
  { text: RIGHT_THIRD, x: RIGHT_COLUMN_X, y: 40 },
];

const buildGeometry = (specs: RunSpec[]): ScreenPageGeometry => {
  let charStart = 0;

  const runs: ScreenRun[] = specs.map((spec) => {
    const run: ScreenRun = {
      rect: { x: spec.x, y: spec.y, width: spec.text.length * GLYPH_WIDTH, height: LINE_HEIGHT },
      charStart,
      glyphs: [...spec.text].map((char, index) => ({
        x: spec.x + index * GLYPH_WIDTH,
        y: spec.y,
        width: GLYPH_WIDTH,
        height: LINE_HEIGHT,
        flags: char === ' ' ? 1 : 0,
        tightX: undefined,
        tightY: undefined,
        tightWidth: undefined,
        tightHeight: undefined,
      })),
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      fontName: 'Test',
    };

    charStart += spec.text.length;

    return run;
  });

  return {
    runs,
    pageText: specs.map((spec) => spec.text).join(''),
    pageWidth: 600,
    pageHeight: 800,
    pageRotation: 0,
  };
};

describe('snapToNearest on a multi-column page', () => {
  const geo = buildGeometry(TWO_COLUMNS);
  // Middle of the first row of both columns.
  const firstRowY = LINE_HEIGHT / 2;

  it('snaps to the end of the left column line when the pointer is nearest to it', () => {
    const x = LEFT_FIRST_RIGHT_EDGE + 5;

    expect(snapToNearest(geo, x, firstRowY)).toBe(LEFT_FIRST.length - 1);
  });

  it('snaps to the start of the right column line when the pointer is nearest to it', () => {
    const x = RIGHT_COLUMN_X - 5;

    expect(snapToNearest(geo, x, firstRowY)).toBe(LEFT_COLUMN_CHARS);
  });

  it('snaps to the end of the last left column line, not into the right column', () => {
    const x = LEFT_THIRD_RIGHT_EDGE + 5;
    const lastRowY = 40 + LINE_HEIGHT / 2;

    expect(snapToNearest(geo, x, lastRowY)).toBe(LEFT_COLUMN_CHARS - 1);
  });

  it('snaps past the right edge of the page to the end of the right column line', () => {
    const x = 590;

    expect(snapToNearest(geo, x, firstRowY)).toBe(LEFT_COLUMN_CHARS + RIGHT_FIRST.length - 1);
  });

  it('snaps above all text to the first character', () => {
    expect(snapToNearest(geo, LEFT_COLUMN_X, -20)).toBe(0);
  });

  it('snaps below all text to the last character', () => {
    expect(snapToNearest(geo, LEFT_COLUMN_X, 200)).toBe(LEFT_COLUMN_CHARS + RIGHT_COLUMN_CHARS - 1);
  });
});

const LABEL = 'Virksomhetens navn';
const VALUE = 'Test AS';
const NEXT_LABEL = 'Organisasjonsnummer';

/** Right edge of the label in the first row. */
const LABEL_RIGHT_EDGE = LEFT_COLUMN_X + LABEL.length * GLYPH_WIDTH;

/**
 * A flattened form in row-major reading order: label and value of a row are
 * consecutive runs on the same line.
 */
const FORM_ROWS: RunSpec[] = [
  { text: LABEL, x: LEFT_COLUMN_X, y: 0 },
  { text: VALUE, x: RIGHT_COLUMN_X, y: 0 },
  { text: NEXT_LABEL, x: LEFT_COLUMN_X, y: 20 },
];

describe('snapToNearest on a row of side-by-side runs', () => {
  const geo = buildGeometry(FORM_ROWS);
  const firstRowY = LINE_HEIGHT / 2;

  it('snaps to the end of the label when the pointer is nearest to it', () => {
    const x = LABEL_RIGHT_EDGE + 10;

    expect(snapToNearest(geo, x, firstRowY)).toBe(LABEL.length - 1);
  });

  it('snaps to the start of the value when the pointer is nearest to it', () => {
    const x = RIGHT_COLUMN_X - 10;

    expect(snapToNearest(geo, x, firstRowY)).toBe(LABEL.length);
  });

  it('snaps past the value to its end', () => {
    const x = RIGHT_COLUMN_X + VALUE.length * GLYPH_WIDTH + 10;

    expect(snapToNearest(geo, x, firstRowY)).toBe(LABEL.length + VALUE.length - 1);
  });

  it('keeps runs of one line together when only a word-sized gap separates them', () => {
    const gapped = buildGeometry([
      { text: 'Forste del av', x: LEFT_COLUMN_X, y: 0 },
      { text: 'samme linje', x: LEFT_COLUMN_X + 'Forste del av'.length * GLYPH_WIDTH + GLYPH_WIDTH, y: 0 },
    ]);

    // Both runs belong to the same line, so the pointer snaps to the end of the
    // line rather than to the nearer run.
    const x = LEFT_COLUMN_X + 'Forste del av'.length * GLYPH_WIDTH + 2;

    expect(snapToNearest(gapped, x, firstRowY)).toBe('Forste del av'.length + 'samme linje'.length - 1);
  });
});
