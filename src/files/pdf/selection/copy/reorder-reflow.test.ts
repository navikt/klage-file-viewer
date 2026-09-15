import { describe, expect, it } from 'bun:test';
import { reflowSelection } from '@/files/pdf/selection/copy/reflow';
import { repairSoftBreakGeometry } from '@/files/pdf/selection/copy/repair-soft-break-geometry';
import { toMarkdown } from '@/files/pdf/selection/copy/serialize';
import type { PageSelectionRange, ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { reorderRunsVisually } from '@/files/pdf/selection/use-page-geometry';

const ADVANCE = 6;
const DEFAULT_FONT_SIZE = 10;
/** Rendered line height as a multiple of the font size. */
const LINE_HEIGHT_RATIO = 1.2;
const LINE_HEIGHT = DEFAULT_FONT_SIZE * LINE_HEIGHT_RATIO;

interface RunSpec {
  text: string;
  y: number;
  left: number;
  fontSize?: number;
}

/**
 * Build a geometry from runs given in NATIVE (content-stream) order. Line
 * breaks are modelled as `lineBreak`:
 *  - 'gap':   `\r\n` lives in `pageText` between runs, not in any glyph
 *             (common — PDFium often emits line breaks as non-glyph chars).
 *  - 'glyph': `\r\n` is appended to the run as two glyphs (contiguous runs).
 */
const buildNative = (specs: RunSpec[], lineBreak: 'gap' | 'glyph'): ScreenPageGeometry => {
  let pageText = '';
  const runs: ScreenRun[] = [];

  specs.forEach((spec, index) => {
    if (lineBreak === 'gap' && index > 0) {
      pageText += '\r\n';
    }

    const glyphText = spec.text + (lineBreak === 'glyph' ? '\r\n' : '');
    const charStart = pageText.length;
    pageText += glyphText;

    const fontSize = spec.fontSize ?? DEFAULT_FONT_SIZE;
    // The reflow sizes lines by their rendered height, so the synthetic
    // geometry has to scale with the requested font size.
    const lineHeight = fontSize * LINE_HEIGHT_RATIO;

    const glyphs: ScreenRunGlyph[] = [...glyphText].map((char, i) => ({
      x: spec.left + i * ADVANCE,
      y: spec.y,
      width: ADVANCE,
      height: lineHeight,
      flags: char === ' ' ? 1 : char === '\r' || char === '\n' ? 2 : 0,
      tightX: undefined,
      tightY: undefined,
      tightWidth: undefined,
      tightHeight: undefined,
    }));

    runs.push({
      rect: { x: spec.left, y: spec.y, width: spec.text.length * ADVANCE, height: lineHeight },
      charStart,
      glyphs,
      fontSize,
      fontWeight: 400,
      italic: false,
      fontName: 'Test',
    });
  });

  return { runs, pageText, pageWidth: 600, pageHeight: 800, pageRotation: 0 };
};

const reorderAndReflow = (geo: ScreenPageGeometry): string => {
  const reordered = repairSoftBreakGeometry(
    reorderRunsVisually(geo.runs, geo.pageText, geo.pageWidth ?? 0, geo.pageHeight ?? 0, geo.pageRotation ?? 0),
  );
  const range: PageSelectionRange = {
    pageIndex: 0,
    startCharIndex: 0,
    endCharIndex: (reordered.pageText ?? '').length - 1,
  };

  return toMarkdown(reflowSelection(reordered.pageText ?? '', reordered, range));
};

// Visual layout: heading (y0) / paragraph (y20) / indented list item (y40) / paragraph (y60).
// Given here in scrambled native order.
const SCRAMBLED: RunSpec[] = [
  { text: 'Et avsluttende avsnitt nederst', y: 60, left: 50 },
  { text: 'Et punkt i en liste som er indentert', y: 40, left: 80 },
  { text: 'Et vanlig avsnitt med tekst her', y: 20, left: 50 },
  { text: 'Overskrift', y: 0, left: 50, fontSize: 20 },
];

const EXPECTED = [
  '# Overskrift',
  '',
  'Et vanlig avsnitt med tekst her',
  '',
  '- Et punkt i en liste som er indentert',
  '',
  'Et avsluttende avsnitt nederst',
].join('\n');

// Two columns whose native order is already correct column-major reading order.
const TWO_COLUMN: RunSpec[] = [
  { text: 'Venstre linje en', y: 0, left: 50 },
  { text: 'Venstre linje to', y: 20, left: 50 },
  { text: 'Hoyre linje en', y: 0, left: 350 },
  { text: 'Hoyre linje to', y: 20, left: 350 },
];

// Two columns under a full-width intro that wraps past the gutter. Mirrors the
// veiledning pages of `pdf-skjema.pdf`.
const TWO_COLUMN_UNDER_INTRO: RunSpec[] = [
  // 47 characters wide => spans from x=50 to x=332, across the gutter.
  { text: 'En innledning som gaar tvers over hele siden og', y: 0, left: 50 },
  // Same visual line, but starts to the right of the gutter.
  { text: 'fortsetter her', y: 0, left: 332 },
  { text: 'Venstre kolonne sin foerste linje', y: 30, left: 50 },
  { text: 'Venstre kolonne sin andre linje', y: 45, left: 50 },
  { text: 'Venstre kolonne sin tredje linje', y: 60, left: 50 },
  { text: 'Hoyre kolonne sin foerste linje', y: 30, left: 350 },
  { text: 'Hoyre kolonne sin andre linje', y: 45, left: 350 },
  { text: 'Hoyre kolonne sin tredje linje', y: 60, left: 350 },
];

describe('reorderRunsVisually + reflow', () => {
  it('reorders and reflows when line breaks are gap characters', () => {
    expect(reorderAndReflow(buildNative(SCRAMBLED, 'gap'))).toBe(EXPECTED);
  });

  it('reorders and reflows when line breaks are glyphs', () => {
    expect(reorderAndReflow(buildNative(SCRAMBLED, 'glyph'))).toBe(EXPECTED);
  });

  it('does not split a word whose runs are contiguous across visual lines', () => {
    // Two runs on different visual lines but contiguous in native char order
    // (a hyphenated word PDFium merged): no break must be inserted between them.
    const first = 'Her er ordet: a';
    const second = 'ordningen slutter setningen';
    const geo: ScreenPageGeometry = {
      runs: [
        {
          rect: { x: 50, y: 0, width: first.length * ADVANCE, height: LINE_HEIGHT },
          charStart: 0,
          glyphs: [...first].map((char, i) => ({
            x: 50 + i * ADVANCE,
            y: 0,
            width: ADVANCE,
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
        },
        {
          rect: { x: 50, y: 20, width: second.length * ADVANCE, height: LINE_HEIGHT },
          charStart: first.length,
          glyphs: [...second].map((char, i) => ({
            x: 50 + i * ADVANCE,
            y: 20,
            width: ADVANCE,
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
        },
      ],
      pageText: first + second,
      pageWidth: 600,
      pageHeight: 800,
      pageRotation: 0,
    };

    expect(reorderAndReflow(geo)).toBe('Her er ordet: aordningen slutter setningen');
  });

  it('keeps native order when the page text is unavailable', () => {
    const geo = buildNative(SCRAMBLED, 'gap');
    const result = reorderRunsVisually(geo.runs, undefined, 600, 800, 0);

    expect(result.runs).toBe(geo.runs);
    expect(result.runs.map((run) => run.charStart)).toEqual(geo.runs.map((run) => run.charStart));
  });

  it('keeps native order on a multi-column page', () => {
    const geo = buildNative(TWO_COLUMN, 'gap');
    const result = reorderRunsVisually(geo.runs, geo.pageText, 600, 800, 0);

    expect(result.runs).toBe(geo.runs);
    expect(result.pageText).toBe(geo.pageText);
  });

  it('keeps native column order when a full-width line wraps past the gutter', () => {
    const geo = buildNative(TWO_COLUMN_UNDER_INTRO, 'gap');
    const result = reorderRunsVisually(geo.runs, geo.pageText, 600, 800, 0);

    expect(result.runs).toBe(geo.runs);
    expect(result.pageText).toBe(geo.pageText);
  });

  it('still reorders when only a single line has a wide gap', () => {
    const geo = buildNative(
      [
        { text: 'Navn', y: 40, left: 50 },
        { text: 'Dato', y: 40, left: 400 },
        { text: 'Tittel', y: 0, left: 50 },
        { text: 'Avsnitt en', y: 20, left: 50 },
      ],
      'gap',
    );
    const result = reorderRunsVisually(geo.runs, geo.pageText, 600, 800, 0);

    expect(result.pageText).toBe('Tittel\nAvsnitt en\nNavnDato');
  });

  it('reorders a flattened form whose values are appended after the labels', () => {
    // Mirrors `pdf-skjema.pdf`, where flattening writes every field value to
    // the end of the content stream.
    const geo = buildNative(
      [
        { text: 'Navn', y: 224, left: 46 },
        { text: 'Fodselsdato', y: 224, left: 414 },
        { text: 'Adresse', y: 252, left: 46 },
        { text: 'Ola Nordmann', y: 237, left: 44 },
        { text: '01.01.1970', y: 237, left: 414 },
        { text: 'Adresseveien 1', y: 265, left: 44 },
      ],
      'gap',
    );
    const result = reorderRunsVisually(geo.runs, geo.pageText, 600, 800, 0);
    const text = result.pageText ?? '';

    expect(text).toBe('NavnFodselsdato\nOla Nordmann01.01.1970\nAdresse\nAdresseveien 1');
    expect(text.indexOf('Ola Nordmann') - text.indexOf('Navn')).toBeLessThan(20);
  });
});
