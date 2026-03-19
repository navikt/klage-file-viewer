import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { useEffect, useRef } from 'react';
import { analyzePageReflow, EMPTY_REFLOW, type PageReflow } from '@/files/pdf/selection/copy/analyze-reflow';
import { buildOriginalSlice } from '@/files/pdf/selection/copy/build-original-slice';
import { escapeHtml, paragraphsToHtml, paragraphsToPlain } from '@/files/pdf/selection/copy/formatters';
import type { PageSelectionRange, ScreenPageGeometry, TextSelection } from '@/files/pdf/selection/types';

/**
 * When our custom PDF selection changes, extract the selected text from the
 * engine and place it inside a hidden DOM element with a real browser
 * Selection. This gives us native Ctrl+C and correct context menus.
 *
 * Also intercepts the `copy` event as a fallback for when the browser
 * selection gets lost.
 *
 * Uses page geometry to detect paragraph boundaries and line structure:
 *  - Lines separated by a gap significantly larger than the typical line
 *    spacing are joined with a double newline (paragraph break).
 *  - Short lines (headings, list items, last line of a paragraph) keep a
 *    single newline.
 *  - Full-width lines that wrap to the next line are joined with a space.
 */
export const useCopyHandler = (
  engine: PdfEngine | null,
  doc: PdfDocumentObject | null,
  selection: TextSelection | null,
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>,
): React.RefObject<HTMLDivElement | null> => {
  const hiddenRef = useRef<HTMLDivElement | null>(null);
  const htmlRef = useRef<string>('');

  useEffect(() => {
    const el = hiddenRef.current;

    if (el === null) {
      return;
    }

    if (engine === null || doc === null || selection === null || selection.ranges.length === 0) {
      el.textContent = '';
      htmlRef.current = '';

      return;
    }

    // When runs have been reordered visually, the geometry's pageText is
    // already in visual order and we can extract selected text directly
    // without calling the engine (which uses original char indices).
    // For pages without reordering we fall back to engine.getTextSlices.
    const canUseLocalText = selection.ranges.every((range) => {
      const geo = geometryRegistry.current.get(range.pageIndex);

      return geo?.visualToOriginal !== undefined && geo.pageText !== undefined;
    });

    if (canUseLocalText) {
      const pageResults = selection.ranges.map((range) => {
        const geo = geometryRegistry.current.get(range.pageIndex);

        if (geo === undefined || geo.pageText === undefined) {
          return EMPTY_REFLOW;
        }

        const rawText = geo.pageText.slice(range.startCharIndex, range.endCharIndex + 1);

        return reflowPage(rawText, range, geo);
      });

      el.textContent = pageResults.map((r) => r.plain).join('\n\n');
      htmlRef.current = pageResults.map((r) => r.html).join('');
      selectHiddenElement(el);
    } else {
      // Build slices — translate visual indices back to original when needed.
      const slices = selection.ranges.map((range) => {
        const geo = geometryRegistry.current.get(range.pageIndex);

        return buildOriginalSlice(range, geo);
      });

      const task = engine.getTextSlices(doc, slices);

      task.wait(
        (texts) => {
          const pageResults = texts.map((text, i) => {
            const range = selection.ranges[i];

            if (range === undefined) {
              return { plain: text, html: `<p>${escapeHtml(text)}</p>` };
            }

            const geo = geometryRegistry.current.get(range.pageIndex);

            if (geo === undefined) {
              return { plain: text, html: `<p>${escapeHtml(text)}</p>` };
            }

            return reflowPage(text, range, geo);
          });

          el.textContent = pageResults.map((r) => r.plain).join('\n\n');
          htmlRef.current = pageResults.map((r) => r.html).join('');

          selectHiddenElement(el);
        },
        () => {
          el.textContent = '';
          htmlRef.current = '';
        },
      );
    }

    const handleMouseDown = (e: MouseEvent): void => {
      if (el.textContent === null || el.textContent.length === 0) {
        return;
      }

      if (e.button === 2) {
        // Intercept right-click to move the selection under the mouse
        // so the native context menu includes the "Copy" option.
        el.style.setProperty('position', 'fixed');
        el.style.setProperty('top', `${e.clientY}px`);
        el.style.setProperty('left', `${e.clientX}px`);
        el.style.setProperty('z-index', '2147483647');
      } else {
        el.style.setProperty('position', 'absolute');
        el.style.setProperty('top', '-9999px');
        el.style.setProperty('left', '-9999px');
        el.style.setProperty('z-index', 'auto');
      }
    };

    // Fallback: intercept the copy event and set clipboard data synchronously.
    const handleCopy = (e: ClipboardEvent): void => {
      const text = el.textContent;

      if (text.length === 0) {
        return;
      }

      // If there's a native browser text selection elsewhere (e.g. search input), defer.
      const nativeSelection = window.getSelection();
      const nativeText = nativeSelection?.toString() ?? '';

      if (nativeText.length > 0 && nativeText !== text) {
        return;
      }

      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
      e.clipboardData?.setData('text/html', htmlRef.current);

      // biome-ignore lint/suspicious/noConsole: temporary debug logging for verifying copy output
      console.groupCollapsed('[copy] clipboard data set');
      // biome-ignore lint/suspicious/noConsole: temporary debug logging
      console.log('text/plain:', text);
      // biome-ignore lint/suspicious/noConsole: temporary debug logging
      console.log('text/html:', htmlRef.current);
      // biome-ignore lint/suspicious/noConsole: temporary debug logging
      console.groupEnd();
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [engine, doc, selection, geometryRegistry]);

  return hiddenRef;
};

/** Analyse text and produce both plain and HTML representations. */
const reflowPage = (rawText: string, range: PageSelectionRange, geo: ScreenPageGeometry): PageReflow => {
  const paragraphs = analyzePageReflow(rawText, range, geo);
  const plain = paragraphsToPlain(paragraphs);
  const html = paragraphsToHtml(paragraphs);

  // biome-ignore lint/suspicious/noConsole: temporary debug logging for verifying copy output
  console.groupCollapsed(
    `[copy] reflowPage (page ${String(range.pageIndex)}, chars ${String(range.startCharIndex)}–${String(range.endCharIndex)})`,
  );
  // biome-ignore lint/suspicious/noConsole: temporary debug logging
  console.log('paragraphs:', paragraphs);
  // biome-ignore lint/suspicious/noConsole: temporary debug logging
  console.log('plain:', plain);
  // biome-ignore lint/suspicious/noConsole: temporary debug logging
  console.log('html:', html);
  // biome-ignore lint/suspicious/noConsole: temporary debug logging
  console.groupEnd();

  return { plain, html };
};

/** Create a real browser Selection over the hidden element's text content. */
const selectHiddenElement = (el: HTMLElement): void => {
  const browserSelection = window.getSelection();

  if (browserSelection === null) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(el);
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
};
