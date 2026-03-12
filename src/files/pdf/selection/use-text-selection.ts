import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageSelectionRange, ScreenGlyph, TextSelection } from '@/files/pdf/selection/types';

interface SelectionAnchor {
  pageIndex: number;
  charIndex: number;
}

interface UseTextSelectionResult {
  selection: TextSelection | null;
  isSelecting: boolean;
  handlePointerDown: (pageIndex: number, charIndex: number, isDoubleClick: boolean) => void;
  handlePointerMove: (pageIndex: number, charIndex: number) => void;
  handlePointerUp: () => void;
  clearSelection: () => void;
  getPageSelectionRange: (pageIndex: number) => PageSelectionRange | null;
  /** Registry for page glyphs — each PdfPage registers its glyphs here for word selection. */
  glyphsRegistry: React.RefObject<Map<number, ScreenGlyph[]>>;
}

export const useTextSelection = (): UseTextSelectionResult => {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const anchorRef = useRef<SelectionAnchor | null>(null);
  const glyphsRegistry = useRef<Map<number, ScreenGlyph[]>>(new Map());

  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsSelecting(false);
    anchorRef.current = null;
  }, []);

  // Clear selection on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection !== null) {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selection, clearSelection]);

  const buildSelection = useCallback(
    (anchor: SelectionAnchor, current: { pageIndex: number; charIndex: number }): TextSelection => {
      // Determine forward vs backward
      const forward =
        anchor.pageIndex < current.pageIndex ||
        (anchor.pageIndex === current.pageIndex && anchor.charIndex <= current.charIndex);

      const startPage = forward ? anchor.pageIndex : current.pageIndex;
      const endPage = forward ? current.pageIndex : anchor.pageIndex;
      const startChar = forward ? anchor.charIndex : current.charIndex;
      const endChar = forward ? current.charIndex : anchor.charIndex;

      const ranges: PageSelectionRange[] = [];

      for (let pageIdx = startPage; pageIdx <= endPage; pageIdx++) {
        const glyphs = glyphsRegistry.current.get(pageIdx);
        const glyphCount = glyphs?.length ?? 0;

        if (glyphCount === 0) {
          continue;
        }

        const range = buildPageRange(pageIdx, glyphCount, startPage, endPage, startChar, endChar);
        ranges.push(range);
      }

      return { ranges };
    },
    [],
  );

  const expandToWord = useCallback((pageIndex: number, charIndex: number): { start: number; end: number } => {
    const glyphs = glyphsRegistry.current.get(pageIndex);

    if (glyphs === undefined || glyphs.length === 0) {
      return { start: charIndex, end: charIndex };
    }

    // Expand backward to word boundary
    let start = charIndex;
    while (start > 0) {
      const prev = glyphs[start - 1];
      if (prev === undefined || prev.isSpace || prev.isEmpty) {
        break;
      }
      start--;
    }

    // Expand forward to word boundary
    let end = charIndex;
    while (end < glyphs.length - 1) {
      const next = glyphs[end + 1];
      if (next === undefined || next.isSpace || next.isEmpty) {
        break;
      }
      end++;
    }

    return { start, end };
  }, []);

  const handlePointerDown = useCallback(
    (pageIndex: number, charIndex: number, isDoubleClick: boolean) => {
      if (charIndex < 0) {
        clearSelection();
        return;
      }

      if (isDoubleClick) {
        // Word selection
        const { start, end } = expandToWord(pageIndex, charIndex);
        anchorRef.current = { pageIndex, charIndex: start };
        setSelection({
          ranges: [{ pageIndex, startCharIndex: start, endCharIndex: end }],
        });
        setIsSelecting(false);
        return;
      }

      anchorRef.current = { pageIndex, charIndex };
      setSelection(null);
      setIsSelecting(true);
    },
    [clearSelection, expandToWord],
  );

  const handlePointerMove = useCallback(
    (pageIndex: number, charIndex: number) => {
      if (!isSelecting || anchorRef.current === null) {
        return;
      }

      if (charIndex < 0) {
        return;
      }

      const newSelection = buildSelection(anchorRef.current, { pageIndex, charIndex });
      setSelection(newSelection);
    },
    [isSelecting, buildSelection],
  );

  const handlePointerUp = useCallback(() => {
    if (!isSelecting) {
      return;
    }

    setIsSelecting(false);

    // If no movement occurred (click without drag), clear selection
    if (selection === null || selection.ranges.length === 0) {
      anchorRef.current = null;
    }
  }, [isSelecting, selection]);

  const getPageSelectionRange = useCallback(
    (pageIndex: number): PageSelectionRange | null => {
      if (selection === null) {
        return null;
      }

      return selection.ranges.find((r) => r.pageIndex === pageIndex) ?? null;
    },
    [selection],
  );

  return {
    selection,
    isSelecting,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    getPageSelectionRange,
    glyphsRegistry,
  };
};

const buildPageRange = (
  pageIdx: number,
  glyphCount: number,
  startPage: number,
  endPage: number,
  startChar: number,
  endChar: number,
): PageSelectionRange => {
  if (pageIdx === startPage && pageIdx === endPage) {
    return { pageIndex: pageIdx, startCharIndex: startChar, endCharIndex: endChar };
  }

  if (pageIdx === startPage) {
    return { pageIndex: pageIdx, startCharIndex: startChar, endCharIndex: glyphCount - 1 };
  }

  if (pageIdx === endPage) {
    return { pageIndex: pageIdx, startCharIndex: 0, endCharIndex: endChar };
  }

  return { pageIndex: pageIdx, startCharIndex: 0, endCharIndex: glyphCount - 1 };
};
