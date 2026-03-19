import type { ParagraphRole, ReflowParagraph, ReflowSpan } from '@/files/pdf/selection/copy/analyze-reflow';

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

/** Render paragraphs as plain text: lines joined within, `\n\n` between paragraphs. */
export const paragraphsToPlain = (paragraphs: ReflowParagraph[]): string =>
  paragraphs
    .map((p) => {
      const prefix = p.role === 'list-item' ? (p.listKind === 'ordered' ? '  1. ' : '  - ') : '';
      const parts: string[] = [];

      for (const line of p.lines) {
        if (parts.length > 0) {
          parts.push(line.softWrap ? ' ' : '\n');
        }

        parts.push(line.text);
      }

      return prefix + parts.join('');
    })
    .join('\n\n');

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Render paragraphs as HTML with semantic elements. */
export const paragraphsToHtml = (paragraphs: ReflowParagraph[]): string => {
  const parts: string[] = [];
  let currentListKind: 'ordered' | 'unordered' | null = null;

  for (const p of paragraphs) {
    if (p.role === 'list-item') {
      currentListKind = openListIfNeeded(parts, currentListKind, p.listKind ?? 'unordered');
      parts.push(`<li>${formatLineContents(p)}</li>`);
    } else {
      currentListKind = closeListIfOpen(parts, currentListKind);
      parts.push(formatBlock(p));
    }
  }

  closeListIfOpen(parts, currentListKind);

  return parts.join('');
};

/** Open a new list (closing any mismatched open list first). Returns the now-active list kind. */
const openListIfNeeded = (
  parts: string[],
  currentKind: 'ordered' | 'unordered' | null,
  neededKind: 'ordered' | 'unordered',
): 'ordered' | 'unordered' => {
  if (currentKind === neededKind) {
    return currentKind;
  }

  if (currentKind !== null) {
    parts.push(listCloseTag(currentKind));
  }

  parts.push(neededKind === 'ordered' ? '<ol>' : '<ul>');

  return neededKind;
};

/** Close the currently-open list (if any). Returns `null`. */
const closeListIfOpen = (parts: string[], currentKind: 'ordered' | 'unordered' | null): null => {
  if (currentKind !== null) {
    parts.push(listCloseTag(currentKind));
  }

  return null;
};

const listCloseTag = (kind: 'ordered' | 'unordered'): string => (kind === 'ordered' ? '</ol>' : '</ul>');

/** Wrap line contents in the appropriate block-level element. */
const formatBlock = (p: ReflowParagraph): string => {
  const inner = formatLineContents(p);

  if (p.role === 'heading') {
    const level = p.headingLevel ?? 3;

    return `<h${String(level)}>${inner}</h${String(level)}>`;
  }

  return `<p>${inner}</p>`;
};

/** Format the inner content of a block element (lines + spans with inline styling). */
const formatLineContents = (paragraph: ReflowParagraph): string => {
  const parts: string[] = [];

  for (const line of paragraph.lines) {
    if (parts.length > 0) {
      parts.push(line.softWrap ? ' ' : '<br>');
    }

    parts.push(formatSpans(line.spans, paragraph.role));
  }

  return parts.join('');
};

/** Render a line's spans with `<strong>` and `<em>` wrappers. */
const formatSpans = (spans: ReflowSpan[], role: ParagraphRole): string =>
  spans
    .map((span) => {
      let html = escapeHtml(span.text);

      if (span.italic) {
        html = `<em>${html}</em>`;
      }

      if (span.bold && role !== 'heading') {
        html = `<strong>${html}</strong>`;
      }

      return html;
    })
    .join('');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
