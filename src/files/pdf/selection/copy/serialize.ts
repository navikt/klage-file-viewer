import type { ReflowBlock, ReflowSpan } from '@/files/pdf/selection/copy/reflow';

/** Plain-text indentation emitted per list-nesting level. */
const INDENT_UNIT = '  ';

const EXCESS_NEWLINES = /\n{3,}/g;
const MAX_HEADING_LEVEL = 6;

const blockText = (block: ReflowBlock): string => block.spans.map((span) => span.text).join('');

/** Render blocks as indented plain text (paragraphs, list nesting; no markup). */
export const toPlainText = (blocks: ReflowBlock[]): string => {
  let out = '';

  blocks.forEach((block, index) => {
    if (index > 0) {
      out += block.gapBefore ? '\n\n' : '\n';
    }

    out += INDENT_UNIT.repeat(block.level) + blockText(block);
  });

  return out;
};

/**
 * Render blocks as Markdown: headings as `#`, indented items as nested `-`
 * bullets, paragraphs as prose, with `**bold**`/`*italic*` emphasis. Blank
 * lines surround headings and lists.
 */
export const toMarkdown = (blocks: ReflowBlock[]): string => {
  const lines: string[] = [];
  let prevKind: 'heading' | 'list' | 'prose' | null = null;

  for (const block of blocks) {
    const kind = groupKind(block);
    const needsBlank =
      lines.length > 0 &&
      (block.gapBefore || kind === 'heading' || prevKind === 'heading' || (kind === 'list') !== (prevKind === 'list'));

    if (needsBlank) {
      lines.push('');
    }

    lines.push(markdownLine(block));
    prevKind = kind;
  }

  return lines.join('\n').replace(EXCESS_NEWLINES, '\n\n').trim();
};

const markdownLine = (block: ReflowBlock): string => {
  if (block.kind === 'heading') {
    return `${'#'.repeat(Math.min(MAX_HEADING_LEVEL, block.headingLevel))} ${blockText(block)}`;
  }

  if (block.kind === 'listItem') {
    return `${'  '.repeat(block.level - 1)}- ${markdownSpans(block.spans)}`;
  }

  return markdownSpans(block.spans);
};

const markdownSpans = (spans: ReflowSpan[]): string => spans.map((span) => markdownSpan(span)).join('');

const markdownSpan = (span: ReflowSpan): string => {
  if (!span.bold && !span.italic) {
    return span.text;
  }

  const core = span.text.trim();

  if (core === '') {
    return span.text;
  }

  // Markdown emphasis can't wrap surrounding whitespace, so keep it outside.
  const leading = span.text.slice(0, span.text.length - span.text.trimStart().length);
  const trailing = span.text.slice(span.text.trimEnd().length);
  const marker = span.bold && span.italic ? '***' : span.bold ? '**' : '*';

  return `${leading}${marker}${core}${marker}${trailing}`;
};

/**
 * Render blocks as HTML: headings as `<h1>`–`<h6>`, indented items as nested
 * `<ul>`/`<li>`, paragraphs grouped into `<p>` (separated by `<br>`), with
 * `<strong>`/`<em>` emphasis.
 */
export const toHtml = (blocks: ReflowBlock[]): string => {
  const parts: string[] = [];
  const prose: string[] = [];
  let depth = 0;

  const flushProse = (): void => {
    if (prose.length > 0) {
      parts.push(`<p>${prose.join('<br>')}</p>`);
      prose.length = 0;
    }
  };

  const closeLists = (): void => {
    while (depth > 0) {
      parts.push('</li></ul>');
      depth--;
    }
  };

  for (const block of blocks) {
    if (block.kind === 'heading') {
      flushProse();
      closeLists();

      const level = Math.min(MAX_HEADING_LEVEL, Math.max(1, block.headingLevel));
      parts.push(`<h${level}>${escapeHtml(blockText(block))}</h${level}>`);
      continue;
    }

    if (block.kind === 'paragraph') {
      closeLists();

      if (block.gapBefore) {
        flushProse();
      }

      prose.push(htmlSpans(block.spans));
      continue;
    }

    // List item — open/close nested <ul>/<li> to reach this block's level.
    flushProse();

    if (block.level > depth) {
      while (depth < block.level) {
        parts.push('<ul>');
        depth++;

        // An intermediate (skipped) level needs an <li> to host the deeper <ul>.
        if (depth < block.level) {
          parts.push('<li>');
        }
      }
    } else if (block.level < depth) {
      while (depth > block.level) {
        parts.push('</li></ul>');
        depth--;
      }

      parts.push('</li>');
    } else {
      parts.push('</li>');
    }

    parts.push(`<li>${htmlSpans(block.spans)}`);
  }

  flushProse();
  closeLists();

  return parts.join('');
};

const htmlSpans = (spans: ReflowSpan[]): string => spans.map((span) => htmlSpan(span)).join('');

const htmlSpan = (span: ReflowSpan): string => {
  let html = escapeHtml(span.text);

  if (span.italic) {
    html = `<em>${html}</em>`;
  }

  if (span.bold) {
    html = `<strong>${html}</strong>`;
  }

  return html;
};

const groupKind = (block: ReflowBlock): 'heading' | 'list' | 'prose' => {
  if (block.kind === 'heading') {
    return 'heading';
  }

  return block.kind === 'listItem' ? 'list' : 'prose';
};

/** Escape HTML-significant characters for safe insertion into clipboard HTML. */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
