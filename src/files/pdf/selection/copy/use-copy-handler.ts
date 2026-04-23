import type { PageTextSlice, PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { useEffect, useRef } from 'react';
import { type ReflowBlock, reflowSelection } from '@/files/pdf/selection/copy/reflow';
import { toHtml, toMarkdown, toPlainText } from '@/files/pdf/selection/copy/serialize';
import type { ScreenPageGeometry, TextSelection } from '@/files/pdf/selection/types';

const LINE_BREAK = /\r\n|\r|\n/;

/**
 * When our custom PDF selection changes, extract the selected text and place
 * it inside a hidden DOM element with a real browser Selection. This gives us
 * native Ctrl+C and correct context menus, and the `copy` event is intercepted
 * as a fallback for when the browser selection gets lost.
 *
 * Text content is taken from PDFium's native char-index extraction (the cached
 * `pageText`, or `engine.getTextSlices` when it has not been cached) — the same
 * approach as EmbedPDF's selection plugin, which keeps soft-broken characters
 * intact. `reflowSelection` then reconstructs paragraphs and lists from that
 * text using the geometry purely for line-join decisions (it never re-derives
 * characters from glyph positions). We slice the cached `pageText`
 * synchronously when available so the clipboard `copy` event sees the text
 * immediately, and fall back to the engine only for un-cached pages.
 */
export const useCopyHandler = (
  engine: PdfEngine | null,
  doc: PdfDocumentObject | null,
  selection: TextSelection | null,
  geometryRegistry: React.RefObject<Map<number, ScreenPageGeometry>>,
): React.RefObject<HTMLDivElement | null> => {
  const hiddenRef = useRef<HTMLDivElement | null>(null);
  const htmlRef = useRef<string>('');
  const markdownRef = useRef<string>('');

  useEffect(() => {
    const el = hiddenRef.current;

    if (el === null) {
      return;
    }

    if (engine === null || doc === null || selection === null || selection.ranges.length === 0) {
      el.textContent = '';
      htmlRef.current = '';
      markdownRef.current = '';

      return;
    }

    const commit = (): void => {
      const blocks = combineBlocks(pageBlocks);

      el.textContent = toPlainText(blocks);
      htmlRef.current = toHtml(blocks);
      markdownRef.current = toMarkdown(blocks);
      selectHiddenElement(el);
    };

    // Reflow the cached page text synchronously where available; defer pages
    // whose text has not been fetched yet to the engine (raw text only).
    const pageBlocks: (ReflowBlock[] | null)[] = selection.ranges.map((range) => {
      const geo = geometryRegistry.current.get(range.pageIndex);

      if (geo?.pageText === undefined) {
        return null;
      }

      const rawText = geo.pageText.slice(range.startCharIndex, range.endCharIndex + 1);

      return reflowSelection(rawText, geo, range);
    });

    const engineJobs = selection.ranges
      .map((range, index) => ({ range, index }))
      .filter(({ index }) => pageBlocks[index] === null);

    if (engineJobs.length === 0) {
      commit();
    } else {
      const slices: PageTextSlice[] = engineJobs.map(({ range }) => ({
        pageIndex: range.pageIndex,
        charIndex: range.startCharIndex,
        charCount: range.endCharIndex - range.startCharIndex + 1,
      }));

      const task = engine.getTextSlices(doc, slices);

      task.wait(
        (texts) => {
          engineJobs.forEach(({ index }, sliceIndex) => {
            pageBlocks[index] = rawTextToBlocks(texts[sliceIndex] ?? '');
          });

          commit();
        },
        () => {
          el.textContent = '';
          htmlRef.current = '';
          markdownRef.current = '';
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
      e.clipboardData?.setData('text/markdown', markdownRef.current);
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

/** Flatten the per-page blocks, marking each page's first block as gap-separated. */
const combineBlocks = (pages: (ReflowBlock[] | null)[]): ReflowBlock[] => {
  const all: ReflowBlock[] = [];

  for (const blocks of pages) {
    if (blocks === null) {
      continue;
    }

    blocks.forEach((block, index) => {
      all.push(all.length > 0 && index === 0 ? { ...block, gapBefore: true } : block);
    });
  }

  return all;
};

/** Convert engine-fallback raw text (no geometry) into plain paragraph blocks. */
const rawTextToBlocks = (text: string): ReflowBlock[] => {
  const blocks: ReflowBlock[] = [];
  let blankPending = false;

  for (const raw of text.split(LINE_BREAK)) {
    if (raw.trim() === '') {
      blankPending = true;
      continue;
    }

    blocks.push({
      kind: 'paragraph',
      spans: [{ text: raw.trim(), bold: false, italic: false }],
      level: 0,
      headingLevel: 0,
      gapBefore: blocks.length > 0 && blankPending,
    });
    blankPending = false;
  }

  return blocks;
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
