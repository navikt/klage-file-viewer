import type { ReflowBlock } from '@/files/pdf/selection/copy/reflow';

/** A rectangle expressed as fractions (0–1) of the unrotated page. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HighlightSource = 'pdf' | 'ocr';

/**
 * A persisted "yellow marker" highlight.
 *
 * Stored as normalized rects rather than character indices: char indices
 * change when the flattened-forms document is swapped in, OCR text has none,
 * and rects render at any scale or rotation without waiting for the engine.
 */
export interface StoredHighlight {
  id: string;
  pageIndex: number;
  source: HighlightSource;
  /** One rect per visual line. */
  rects: NormalizedRect[];
  /** The highlighted text, as far as it could be determined. */
  text: string;
  /**
   * The text reflowed into paragraphs, lists and headings when it was highlighted,
   * so it can be copied like a normal selection. Missing for OCR and older highlights.
   */
  blocks?: ReflowBlock[];
  createdAt: number;
}

export type NewHighlight = Omit<StoredHighlight, 'id' | 'createdAt'>;
