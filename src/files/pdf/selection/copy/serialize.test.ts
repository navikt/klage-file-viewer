import { describe, expect, it } from 'bun:test';
import type { ReflowBlock, ReflowSpan } from '@/files/pdf/selection/copy/reflow';
import { toHtml, toMarkdown, toPlainText } from '@/files/pdf/selection/copy/serialize';

const span = (text: string, bold = false, italic = false): ReflowSpan => ({ text, bold, italic });

const para = (text: string, gapBefore = false): ReflowBlock => ({
  kind: 'paragraph',
  spans: [span(text)],
  level: 0,
  headingLevel: 0,
  gapBefore,
});

const styledPara = (spans: ReflowSpan[], gapBefore = false): ReflowBlock => ({
  kind: 'paragraph',
  spans,
  level: 0,
  headingLevel: 0,
  gapBefore,
});

const item = (text: string, level: number, gapBefore = false): ReflowBlock => ({
  kind: 'listItem',
  spans: [span(text)],
  level,
  headingLevel: 0,
  gapBefore,
});

const heading = (text: string, headingLevel: number, gapBefore = false): ReflowBlock => ({
  kind: 'heading',
  spans: [span(text)],
  level: 0,
  headingLevel,
  gapBefore,
});

const NESTED = [para('Intro'), item('Item one', 1), item('Item two', 1), item('Sub point', 2), para('Back to main')];

const THREE_LEVELS = [para('Top'), item('A', 1), item('A1', 2), item('A1a', 3), item('A2', 2), item('B', 1)];

const EMPHASIS = [
  span('normal '),
  span('bold', true),
  span(' and '),
  span('italic', false, true),
  span(' and '),
  span('both', true, true),
];

describe('toPlainText', () => {
  it('indents list items by level and separates paragraphs', () => {
    expect(toPlainText([para('Intro'), item('Item one', 1), item('Sub', 2), para('Tail', true)])).toBe(
      'Intro\n  Item one\n    Sub\n\nTail',
    );
  });

  it('drops emphasis markup', () => {
    expect(toPlainText([styledPara(EMPHASIS)])).toBe('normal bold and italic and both');
  });
});

describe('toMarkdown', () => {
  it('renders indented lines as nested bullet lists', () => {
    expect(toMarkdown(NESTED)).toBe(
      ['Intro', '', '- Item one', '- Item two', '  - Sub point', '', 'Back to main'].join('\n'),
    );
  });

  it('renders 3 levels with a multi-level dedent', () => {
    expect(toMarkdown(THREE_LEVELS)).toBe(['Top', '', '- A', '  - A1', '    - A1a', '  - A2', '- B'].join('\n'));
  });

  it('renders headings as #', () => {
    expect(toMarkdown([heading('Tittel', 1), para('Brodtekst', true)])).toBe('# Tittel\n\nBrodtekst');
  });

  it('renders bold and italic spans', () => {
    expect(toMarkdown([styledPara(EMPHASIS)])).toBe('normal **bold** and *italic* and ***both***');
  });
});

describe('toHtml', () => {
  it('renders indented lines as nested ul/li lists', () => {
    expect(toHtml(NESTED)).toBe(
      '<p>Intro</p><ul><li>Item one</li><li>Item two<ul><li>Sub point</li></ul></li></ul><p>Back to main</p>',
    );
  });

  it('renders 3 levels with a multi-level dedent', () => {
    expect(toHtml(THREE_LEVELS)).toBe(
      '<p>Top</p><ul><li>A<ul><li>A1<ul><li>A1a</li></ul></li><li>A2</li></ul></li><li>B</li></ul>',
    );
  });

  it('renders headings as <h1>–<h6>', () => {
    expect(toHtml([heading('Tittel', 2), para('Brodtekst', true)])).toBe('<h2>Tittel</h2><p>Brodtekst</p>');
  });

  it('renders bold and italic spans', () => {
    expect(toHtml([styledPara(EMPHASIS)])).toBe(
      '<p>normal <strong>bold</strong> and <em>italic</em> and <strong><em>both</em></strong></p>',
    );
  });

  it('escapes HTML-significant characters', () => {
    expect(toHtml([para('a < b & "c"')])).toBe('<p>a &lt; b &amp; &quot;c&quot;</p>');
  });
});
