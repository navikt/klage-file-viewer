/** A selection range within a single page. */
export interface PageSelectionRange {
  pageIndex: number;
  startCharIndex: number;
  endCharIndex: number;
}

/** Full selection state (may span multiple pages). */
export interface TextSelection {
  ranges: PageSelectionRange[];
}

/** Cached glyph data for one page, transformed to screen coordinates. */
export interface ScreenGlyph {
  charIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isSpace: boolean;
  isEmpty: boolean;
}
