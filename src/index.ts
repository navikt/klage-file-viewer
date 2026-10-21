export type { FetchErrorInfo, HttpFetchErrorInfo, NetworkFetchErrorInfo } from '@/context';
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
export type { KlageFileViewerHandle, KlageFileViewerProps } from '@/klage-file-viewer';
export { KlageFileViewer } from '@/klage-file-viewer';
export { ScaleSettings } from '@/scale/scale';
export type { FileEntry, FileType, FileVariant, FileVariants, Skjerming, VariantFormat } from '@/types';
