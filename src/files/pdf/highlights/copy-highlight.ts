import type { StoredHighlight } from '@/files/pdf/highlights/types';
import { toHtml, toPlainText } from '@/files/pdf/selection/copy/serialize';

/**
 * Copy a highlight's text the same way as copying a selection from the document:
 * reflowed plain text plus HTML with paragraphs, lists, headings and emphasis.
 * Highlights without reflowed blocks (OCR, older highlights) are copied as plain text.
 */
export const copyHighlight = (highlight: StoredHighlight): Promise<void> => {
  const { blocks } = highlight;

  if (blocks === undefined || blocks.length === 0) {
    return navigator.clipboard.writeText(highlight.text.trim());
  }

  // The async clipboard API only supports a few formats, so Markdown is left out.
  return navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([toPlainText(blocks)], { type: 'text/plain' }),
      'text/html': new Blob([toHtml(blocks)], { type: 'text/html' }),
    }),
  ]);
};
