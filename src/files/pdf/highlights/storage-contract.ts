import type { StoredHighlight as MarkerHighlight } from '@/files/pdf/highlights/types';

/** A document variant whose marker highlights are loaded or saved. */
export interface HighlightStorageDocument {
  /** The file's `highlightsId`. */
  id: string;
  /** The variant format (`query.format`), if any. Variants share the ID but can have different content. */
  format: string | undefined;
}

/**
 * Changes to a document's marker highlights. Highlights are never edited, and removal is permanent:
 * a removed ID is never added again. Applying changes repeatedly or in any order gives the same result.
 */
export interface HighlightChanges {
  /** New highlights. IDs that are already present or removed are ignored. */
  added: MarkerHighlight[];
  /** Permanently removed IDs. Removing an absent ID is harmless. */
  removedIds: string[];
}

/** A document variant's stored marker highlights. */
export interface HighlightStorageDocumentHighlights extends HighlightStorageDocument {
  highlights: MarkerHighlight[];
}

/**
 * What storage reports to the viewer, one listener per event. The first event is `snapshot` or `closed`.
 * Reporting a change several times, or a change that the snapshot already includes, is harmless.
 */
export interface HighlightStorageListeners {
  /**
   * All stored highlights. Replaces what the viewer has. Documents that are left out have no highlights.
   * Sent again after reconnecting, since changes may have been missed.
   */
  snapshot: (documents: HighlightStorageDocumentHighlights[]) => void;
  /** Highlights were added to a document, e.g. in another viewer. */
  added: (document: HighlightStorageDocument, highlights: MarkerHighlight[]) => void;
  /** Highlights were removed from a document. */
  removed: (document: HighlightStorageDocument, highlightIds: string[]) => void;
  /** The highlights are deleted and can no longer change, e.g. because the case is closed. The last event. */
  closed: () => void;
}

/**
 * Why storage refused to save changes. Other errors are treated as temporary, and the changes are kept as unsaved.
 * - `closed`: The highlights can no longer change. The document is shown without highlights.
 * - `too-large`: The changes are too large to save. They are undone.
 */
export type HighlightStorageErrorReason = 'closed' | 'too-large';

/** Reject `save` with this when retrying cannot help. */
export class HighlightStorageError extends Error {
  readonly reason: HighlightStorageErrorReason;

  constructor(reason: HighlightStorageErrorReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HighlightStorageError';
    this.reason = reason;
  }
}

/**
 * Where marker highlights are stored. See `applyHighlightChanges` in `@navikt/klage-file-viewer/highlights`
 * for the rules storage must follow, and `@navikt/klage-file-viewer/highlight-storage` for an HTTP adapter.
 */
export interface HighlightStorage {
  /**
   * Apply and store the whole batch atomically, and resolve with the changes that were actually applied,
   * including the IDs of highlights that were removed because another highlight covers them.
   * Every change is saved right away, so saves of the same document can overlap. Retrying is up to this function;
   * if it rejects, the changes stay visible and are shown as unsaved, and the user can save them again.
   * Reject with {@link HighlightStorageError} when retrying cannot help.
   */
  save: (document: HighlightStorageDocument, changes: HighlightChanges) => Promise<HighlightChanges>;
  /**
   * Report the stored highlights, then changes to them, including the viewer's own.
   * See {@link HighlightStorageListeners}. The highlights stay read-only until the first `snapshot`.
   * Returns an unsubscribe function.
   */
  subscribe: (listeners: HighlightStorageListeners) => () => void;
}
