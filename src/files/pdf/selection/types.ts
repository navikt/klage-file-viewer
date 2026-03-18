import type { PdfPageGeometry } from '@embedpdf/models';

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

/**
 * Re-export the engine's geometry types under local aliases so the rest of the
 * selection code doesn't need to import from `@embedpdf/models` directly.
 */
export type PageGeometry = PdfPageGeometry;

/**
 * Glyph flag values used in {@link PdfGlyphSlim.flags}.
 *
 * These match the values produced by EmbedPDF's `buildRunsFromGlyphs`:
 *  - 1 = space character
 *  - 2 = empty / zero-size glyph
 */
export const GLYPH_FLAG_SPACE = 1 as const;
export const GLYPH_FLAG_EMPTY = 2 as const;

/**
 * A {@link PageRun} whose glyph positions have been scaled to screen
 * coordinates. Used for hit-testing and selection-rect building in the
 * overlay layer.
 */
export interface ScreenRun {
  /** Bounding rectangle of the run in screen coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  /** Index of the first character in this run (within the page). */
  charStart: number;
  /** Glyphs belonging to this run, in screen coordinates. */
  glyphs: ScreenRunGlyph[];
  /** Font size shared by all glyphs in this run. */
  fontSize: number | undefined;
}

/**
 * A single glyph within a {@link ScreenRun}, scaled to screen coordinates.
 * Includes both loose bounds (for selection rects) and optional tight bounds
 * (for hit-testing, matching Chrome/PDFium behaviour).
 */
export interface ScreenRunGlyph {
  /** Loose-bounds X (from FPDFText_GetLooseCharBox). */
  x: number;
  /** Loose-bounds Y. */
  y: number;
  /** Loose-bounds width. */
  width: number;
  /** Loose-bounds height. */
  height: number;
  /** Glyph flag: 0 = normal, 1 = space, 2 = empty. */
  flags: number;
  /** Tight-bounds X (from FPDFText_GetCharBox). Used for hit-testing. */
  tightX: number | undefined;
  /** Tight-bounds Y. */
  tightY: number | undefined;
  /** Tight-bounds width. */
  tightWidth: number | undefined;
  /** Tight-bounds height. */
  tightHeight: number | undefined;
}

/**
 * Screen-space page geometry: an array of {@link ScreenRun}s whose positions
 * have been scaled for the current zoom level. This is the primary data
 * structure consumed by the selection overlay and text-selection hook.
 */
export interface ScreenPageGeometry {
  runs: ScreenRun[];
  /**
   * The full text content of the page, indexed by character position.
   *
   * When present, `expandToWordBoundary` uses this to detect proper word
   * boundaries (letters vs punctuation) instead of relying solely on glyph
   * flags (which only distinguish spaces and empty glyphs).
   *
   * Fetched via `engine.getTextSlices` alongside the page geometry.
   * May be `undefined` if text extraction failed or is still pending.
   *
   * When runs have been reordered visually, this string is remapped to
   * match the visual character order.
   */
  pageText: string | undefined;
  /**
   * Maps visual (reordered) character indices back to original engine
   * character indices.  `visualToOriginal[visualIdx] = originalIdx`.
   *
   * Present only when the page's runs were reordered from their
   * content-stream order to visual reading order.  When `undefined`,
   * the content-stream order already matches visual order and indices
   * are identical.
   */
  visualToOriginal: number[] | undefined;
}
