import { describe, expect, it } from 'bun:test';
import { type ReflowBlock, reflowSelection } from '@/files/pdf/selection/copy/reflow';
import { toHtml, toMarkdown, toPlainText } from '@/files/pdf/selection/copy/serialize';
import type { PageSelectionRange, ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';

const ADVANCE = 6;
const LINE_HEIGHT = 12;

interface LineSpec {
  text: string;
  /** Top Y of the line. */
  y: number;
  /** Left X of the line. */
  left: number;
  /** Font size of the line (defaults to 10). */
  fontSize?: number;
  /** Whether the line is bold (font weight 700). */
  bold?: boolean;
  /** Whether the line is italic. */
  italic?: boolean;
  /** PostScript font name (defaults to "Test"). */
  fontName?: string;
}

/**
 * Build a synthetic horizontal-text geometry from line specs. Glyphs are laid
 * out left-to-right with a fixed advance; lines are separated by `\r\n` in the
 * page text (the break chars are not part of any run, matching how the reflow
 * aligns text lines to runs by char-range overlap).
 */
const buildGeo = (specs: LineSpec[]): { geo: ScreenPageGeometry; range: PageSelectionRange } => {
  let pageText = '';
  const runs: ScreenRun[] = [];

  specs.forEach((spec, index) => {
    if (index > 0) {
      pageText += '\r\n';
    }

    const charStart = pageText.length;
    pageText += spec.text;

    const glyphs: ScreenRunGlyph[] = [...spec.text].map((char, i) => ({
      x: spec.left + i * ADVANCE,
      y: spec.y,
      width: ADVANCE,
      height: LINE_HEIGHT,
      flags: char === ' ' ? 1 : 0,
      tightX: undefined,
      tightY: undefined,
      tightWidth: undefined,
      tightHeight: undefined,
    }));

    runs.push({
      rect: { x: spec.left, y: spec.y, width: spec.text.length * ADVANCE, height: LINE_HEIGHT },
      charStart,
      glyphs,
      fontSize: spec.fontSize ?? 10,
      fontWeight: spec.bold === true ? 700 : 400,
      italic: spec.italic === true,
      fontName: spec.fontName ?? 'Test',
    });
  });

  return {
    geo: { runs, pageText, pageWidth: 600, pageHeight: 800, pageRotation: 0 },
    range: { pageIndex: 0, startCharIndex: 0, endCharIndex: pageText.length - 1 },
  };
};

const reflowBlocks = (specs: LineSpec[]): ReflowBlock[] => {
  const { geo, range } = buildGeo(specs);

  return reflowSelection(geo.pageText ?? '', geo, range);
};

const reflowText = (specs: LineSpec[]): string => toPlainText(reflowBlocks(specs));

describe('reflowSelection', () => {
  it('joins a soft-wrapped line with a space when the next word would not fit', () => {
    const text = reflowText([
      { text: 'This is a long line that fills', y: 0, left: 50 },
      { text: 'the rest here.', y: 20, left: 50 },
    ]);

    expect(text).toBe('This is a long line that fills the rest here.');
  });

  it('keeps an intentional short line break', () => {
    const text = reflowText([
      { text: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', y: 0, left: 50 },
      { text: 'Short', y: 20, left: 50 },
      { text: 'Next', y: 40, left: 50 },
    ]);

    expect(text).toContain('Short\nNext');
  });

  it('inserts a blank line on a large vertical gap', () => {
    const text = reflowText([
      { text: 'Line one here', y: 0, left: 50 },
      { text: 'Line two here', y: 20, left: 50 },
      { text: 'Line three here', y: 40, left: 50 },
      { text: 'Distant paragraph', y: 100, left: 50 },
    ]);

    expect(text).toContain('\n\nDistant paragraph');
  });

  it('indents nested levels by left edge and never joins across levels', () => {
    const text = reflowText([
      { text: 'Intro', y: 0, left: 50 },
      { text: 'Item one', y: 20, left: 80 },
      { text: 'Item two', y: 40, left: 80 },
      { text: 'Sub point', y: 60, left: 110 },
      { text: 'Back to main', y: 80, left: 50 },
    ]);

    expect(text).toBe('Intro\n  Item one\n  Item two\n    Sub point\nBack to main');
  });

  it('detects indentation from the whole page when only the list is selected', () => {
    const { geo } = buildGeo([
      { text: 'Heading that is quite a bit wider here', y: 0, left: 50 },
      { text: 'Item one', y: 20, left: 80 },
      { text: 'Item two', y: 40, left: 80 },
    ]);

    const pageText = geo.pageText ?? '';
    const start = pageText.indexOf('Item one');
    const range: PageSelectionRange = { pageIndex: 0, startCharIndex: start, endCharIndex: pageText.length - 1 };

    expect(toPlainText(reflowSelection(pageText.slice(start), geo, range))).toBe('  Item one\n  Item two');
  });

  it('does not treat a far-right line as a list item', () => {
    // A right-positioned date sits far right but is not an indented list item.
    const blocks = reflowBlocks([
      { text: 'Date on the right', y: 0, left: 500 },
      { text: 'Body paragraph at the left margin here', y: 20, left: 50 },
      { text: 'More body text at the margin here', y: 40, left: 50 },
    ]);

    expect(blocks.every((block) => block.kind !== 'listItem')).toBe(true);
  });

  it('detects a larger line as a heading and serializes it', () => {
    // Body text dominates the page so the baseline is the small size; the large
    // first line is a heading.
    const blocks = reflowBlocks([
      { text: 'Stor tittel', y: 0, left: 50, fontSize: 20 },
      { text: 'Forste linje', y: 20, left: 50, fontSize: 10 },
      { text: 'Andre linje', y: 40, left: 50, fontSize: 10 },
      { text: 'Tredje linje', y: 60, left: 50, fontSize: 10 },
    ]);

    expect(blocks[0]).toMatchObject({ kind: 'heading', headingLevel: 1 });
    expect(blocks[1]?.kind).toBe('paragraph');
    expect(toMarkdown(blocks).startsWith('# Stor tittel\n\n')).toBe(true);
    expect(toHtml(blocks).startsWith('<h1>Stor tittel</h1>')).toBe(true);
  });

  it('marks a bold run as bold in the emphasis spans', () => {
    // All three short lines share the right margin, so they wrap-join into one
    // paragraph; the middle run is bold (weight 700 vs the 400 baseline).
    const markdown = toMarkdown(
      reflowBlocks([
        { text: 'aaaa', y: 0, left: 50 },
        { text: 'bbbb', y: 20, left: 50, bold: true },
        { text: 'cccc', y: 40, left: 50 },
      ]),
    );

    expect(markdown).toBe('aaaa **bbbb** cccc');
  });

  it('detects bold from the font name even when the weight is not set', () => {
    // Many PDFs embed a bold font (name contains "Bold") but report weight 400.
    const markdown = toMarkdown(
      reflowBlocks([
        { text: 'aaaa', y: 0, left: 50 },
        { text: 'bbbb', y: 20, left: 50, fontName: 'HOEPNL+Arial-BoldMT' },
        { text: 'cccc', y: 40, left: 50 },
      ]),
    );

    expect(markdown).toBe('aaaa **bbbb** cccc');
  });

  it('detects italic from the font name even when the italic flag is not set', () => {
    const markdown = toMarkdown(
      reflowBlocks([
        { text: 'aaaa', y: 0, left: 50 },
        { text: 'bbbb', y: 20, left: 50, fontName: 'Times-Oblique' },
        { text: 'cccc', y: 40, left: 50 },
      ]),
    );

    expect(markdown).toBe('aaaa *bbbb* cccc');
  });

  it('produces a nested Markdown list end-to-end from geometry', () => {
    const markdown = toMarkdown(
      reflowBlocks([
        { text: 'Vedtak i saken med en relativt lang overskrift her', y: 0, left: 50 },
        { text: 'Punkt en', y: 20, left: 80 },
        { text: 'Punkt to', y: 40, left: 80 },
        { text: 'Underpunkt a', y: 60, left: 110 },
        { text: 'Underpunkt b', y: 80, left: 110 },
      ]),
    );

    expect(markdown).toBe(
      [
        'Vedtak i saken med en relativt lang overskrift her',
        '',
        '- Punkt en',
        '- Punkt to',
        '  - Underpunkt a',
        '  - Underpunkt b',
      ].join('\n'),
    );
  });

  it('does not reflow rotated pages', () => {
    const { geo, range } = buildGeo([
      { text: 'Line one that is quite wide', y: 0, left: 50 },
      { text: 'Line two', y: 20, left: 50 },
    ]);
    const rotated = { ...geo, pageRotation: 1 as const };
    const blocks = reflowSelection(geo.pageText ?? '', rotated, range);

    expect(blocks.every((block) => block.kind === 'paragraph')).toBe(true);
    expect(toPlainText(blocks)).toBe('Line one that is quite wide\nLine two');
  });
});
