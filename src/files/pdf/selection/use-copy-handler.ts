import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { useEffect } from 'react';
import type { TextSelection } from '@/files/pdf/selection/types';

export const useCopyHandler = (
  engine: PdfEngine | null,
  doc: PdfDocumentObject | null,
  selection: TextSelection | null,
): void => {
  useEffect(() => {
    if (engine === null || doc === null || selection === null || selection.ranges.length === 0) {
      return;
    }

    const handleCopy = (e: ClipboardEvent) => {
      // If there's a native browser text selection (e.g. in the search input), defer to browser
      const nativeSelection = window.getSelection();

      if (nativeSelection !== null && nativeSelection.toString().length > 0) {
        return;
      }

      // Build slices from our selection ranges
      const slices = selection.ranges.map((range) => ({
        pageIndex: range.pageIndex,
        charIndex: range.startCharIndex,
        charCount: range.endCharIndex - range.startCharIndex + 1,
      }));

      e.preventDefault();

      // Extract text asynchronously. Since we've already called preventDefault,
      // we need to set clipboard data synchronously or use the clipboard API.
      // Unfortunately, clipboardData must be set synchronously within the event handler.
      // So we use the task's sync result if available, or fall back to clipboard API.
      const task = engine.getTextSlices(doc, slices);

      task.wait(
        (texts) => {
          const text = texts.join('\n');

          // Use the async clipboard API since we can't set clipboardData after the event
          void navigator.clipboard.writeText(text);
        },
        () => {
          // Text extraction failed — nothing to copy
        },
      );
    };

    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('copy', handleCopy);
    };
  }, [engine, doc, selection]);
};
