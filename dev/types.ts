// --- File type ---

type FileType = 'PDF' | 'XLSX' | 'JPEG' | 'PNG' | 'TIFF' | 'JSON';

// --- API response types ---

interface FlatFileInfo {
  type: 'file';
  filename: string;
}

interface DocumentVariantInfo {
  format: 'ARKIV' | 'SLADDET';
  filename: string;
}

interface DocumentInfo {
  type: 'document';
  name: string;
  variants: DocumentVariantInfo[];
}

type ApiFileInfo = FlatFileInfo | DocumentInfo;

// --- Internal selection model ---

interface SelectableItem {
  /** Unique key used for selection tracking */
  key: string;
  /** Display name (without extension) */
  displayName: string;
  /** File type for filtering chips */
  fileType: FileType;
  /** Whether this is a folder-based document with variants */
  isDocument: boolean;
}

interface FlatItem extends SelectableItem {
  isDocument: false;
  filename: string;
}

interface DocumentItem extends SelectableItem {
  isDocument: true;
  name: string;
  variants: DocumentVariantInfo[];
}

type AvailableItem = FlatItem | DocumentItem;

export type { ApiFileInfo, AvailableItem, DocumentItem, DocumentVariantInfo, FileType, FlatItem };
