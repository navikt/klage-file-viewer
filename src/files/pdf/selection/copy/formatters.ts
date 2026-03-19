import type { ReflowParagraph } from '@/files/pdf/selection/copy/analyze-reflow';

/** Render paragraphs as plain text: lines joined within, `\n\n` between paragraphs. */
export const paragraphsToPlain = (paragraphs: ReflowParagraph[]): string =>
  paragraphs
    .map((p) => {
      const parts: string[] = [];

      for (const line of p.lines) {
        if (parts.length > 0) {
          parts.push(line.softWrap ? ' ' : '\n');
        }

        parts.push(line.text);
      }

      return parts.join('');
    })
    .join('\n\n');

/** Render paragraphs as HTML: each paragraph is a `<p>`, hard breaks are `<br>`. */
export const paragraphsToHtml = (paragraphs: ReflowParagraph[]): string =>
  paragraphs
    .map((p) => {
      const parts: string[] = [];

      for (const line of p.lines) {
        if (parts.length > 0) {
          parts.push(line.softWrap ? ' ' : '<br>');
        }

        parts.push(escapeHtml(line.text));
      }

      return `<p>${parts.join('')}</p>`;
    })
    .join('');

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
