import type { PdfPageGeometry, Rotation } from '@embedpdf/models';

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
 *
 * Flags are combined as a bitmask.
 */
export const GLYPH_FLAG_SPACE = 1 as const;
export const GLYPH_FLAG_EMPTY = 2 as const;

/** Check if a glyph flag has the given bit set. */
export const hasGlyphFlag = (flags: number, flag: number): boolean => (flags & flag) !== 0;

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
  /** Font weight 100–900 (400 = normal, 700 = bold). */
  fontWeight: number | undefined;
  /** Whether the font is italic. */
  italic: boolean | undefined;
  /** PostScript font name (e.g. "HOEPNL+Arial,Bold"). */
  fontName: string | undefined;
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
  /** Glyph flag bitmask: 0 = normal, 1 = space, 2 = empty. */
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
   * Indexed in PDFium's native char order (reading order), matching the
   * run `charStart` values — so a selection's char range slices it directly.
   */
  pageText: string | undefined;
  /**
   * The page width in screen coordinates (page.size.width × scale).
   *
   * Used by the reflow analysis to determine whether a line reaches the
   * right edge of the page (i.e. is word-wrapped vs explicitly short).
   * Without this, a page whose longest line is short (e.g. an address
   * block) would treat all lines as "full width" and merge them.
   */
  pageWidth: number | undefined;
  /**
   * The page height in screen coordinates (page.size.height × scale).
   *
   * For rotated pages (/Rotate 90°/270°), the cross-axis extent is the
   * page height rather than width. Used by reflow analysis alongside
   * `pageWidth` to pick the correct cross-axis page extent.
   */
  pageHeight: number | undefined;
  /**
   * Inherent PDF `/Rotate` attribute of the page (0, 1, 2, or 3).
   *
   * This is the rotation baked into the PDF page object — **not** the
   * user-applied rotation from the viewer UI. When non-zero, glyph
   * coordinates are in a rotated device space where text lines may be
   * vertical columns instead of horizontal rows.
   */
  pageRotation: Rotation | undefined;
}
