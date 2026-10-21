import type { StoredHighlight } from '@/files/pdf/highlights/types';
import type { ReflowBlock, ReflowSpan } from '@/files/pdf/selection/copy/reflow';

/** Indentation per list-nesting level. */
const LIST_INDENT_EM = 1;
const BULLET = '• ';

interface HighlightTextProps {
  highlight: StoredHighlight;
}

/**
 * The highlighted text with the paragraphs, list items, headings and emphasis it
 * had in the document. Rendered as spans, since it is placed inside a button.
 * Highlights without reflowed blocks (OCR, older highlights) are shown as plain text.
 */
export const HighlightText = ({ highlight }: HighlightTextProps) => {
  const text = highlight.text.trim();

  if (text.length === 0) {
    return 'Uten tekst';
  }

  const { blocks } = highlight;

  if (blocks === undefined || blocks.length === 0) {
    return text;
  }

  return blocks.map((block, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Blocks are static once highlighted and never reorder
    <HighlightBlock key={index} block={block} isFirst={index === 0} />
  ));
};

interface HighlightBlockProps {
  block: ReflowBlock;
  isFirst: boolean;
}

const HighlightBlock = ({ block, isFirst }: HighlightBlockProps) => (
  <span
    className={`block ${block.kind === 'heading' ? 'font-semibold' : ''} ${block.gapBefore && !isFirst ? 'mt-1' : ''}`}
    style={block.kind === 'listItem' ? { paddingLeft: `${(block.level * LIST_INDENT_EM).toString(10)}em` } : undefined}
  >
    {block.kind === 'listItem' ? <span aria-hidden>{BULLET}</span> : null}
    {block.spans.map((span, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: Spans are static once highlighted and never reorder
      <HighlightSpan key={index} span={span} />
    ))}
  </span>
);

const HighlightSpan = ({ span }: { span: ReflowSpan }) => {
  const content = span.italic ? <em>{span.text}</em> : span.text;

  return span.bold ? <strong className="font-semibold">{content}</strong> : content;
};
