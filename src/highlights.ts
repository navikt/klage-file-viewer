/** Helpers for storage servers and adapters. Free of React and browser APIs. */

export type { AppliedHighlightChanges } from '@/files/pdf/highlights/highlight-storage';
export {
  applyHighlightChanges,
  validateHighlightChanges,
  validateHighlights,
} from '@/files/pdf/highlights/highlight-storage';
export type {
  HighlightChanges,
  HighlightStorage,
  HighlightStorageDocument,
  HighlightStorageDocumentHighlights,
  HighlightStorageErrorReason,
  HighlightStorageListeners,
} from '@/files/pdf/highlights/storage-contract';
export { HighlightStorageError } from '@/files/pdf/highlights/storage-contract';
export type {
  HighlightSource as MarkerHighlightSource,
  NormalizedRect as MarkerHighlightRect,
  StoredHighlight as MarkerHighlight,
} from '@/files/pdf/highlights/types';
export type {
  ReflowBlock as MarkerHighlightBlock,
  ReflowSpan as MarkerHighlightSpan,
} from '@/files/pdf/selection/copy/reflow';
