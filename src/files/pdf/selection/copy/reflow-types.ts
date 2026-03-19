// ---------------------------------------------------------------------------
// Intermediate document model
// ---------------------------------------------------------------------------

/**
 * Intermediate document model produced by geometry analysis.
 *
 * This structure captures the semantic layout of the selected text so that
 * multiple output formats (plain text, HTML, and future richer formats) can
 * be derived from the same analysis without re-reading the geometry.
 */
export interface ReflowBlock {
  /** Lines of styled spans. Each inner array is one line. */
  lines: ReflowSpan[][];
  role: BlockRole;
  /** Heading level 1–3. Only set when `role === 'heading'`. */
  headingLevel?: number | undefined;
  /** List flavour. Only set when `role === 'list-item'`. */
  listKind?: 'ordered' | 'unordered' | undefined;
  /** Text alignment detected from line geometry. */
  alignment: TextAlignment;
}

export type BlockRole = 'paragraph' | 'heading' | 'list-item';

export type TextAlignment = 'left' | 'center' | 'right';

/** Internal line representation with geometry fields used only during analysis. */
export interface InternalLine {
  spans: ReflowSpan[];
  text: string;
  fontSize: number | undefined;
  leftEdge: number | undefined;
  rightEdge: number | undefined;
}

/** Internal block with InternalLine — stripped before returning. */
export interface InternalBlock extends Omit<ReflowBlock, 'lines'> {
  lines: InternalLine[];
}

export interface ReflowSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface PageReflow {
  plain: string;
  html: string;
}

export const EMPTY_REFLOW: PageReflow = { plain: '', html: '' };

/**
 * Document-wide statistics used to produce consistent analysis across pages.
 *
 * Computed once from all selected page geometries and passed into each
 * per-page {@link analyzePageReflow} call.
 */
export interface DocumentStats {
  /** Maximum font size across all pages. */
  maxFontSize: number | undefined;
}

/** Get the full text of a line by concatenating its span texts. */
export const lineText = (line: ReflowSpan[]): string => line.map((s) => s.text).join('');
