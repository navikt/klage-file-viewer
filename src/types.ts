export type FileType = 'PDF' | 'JPEG' | 'PNG' | 'TIFF' | 'XLSX' | 'JSON' | 'XML' | 'AXML' | 'DXML' | 'RTF';

export type VariantFormat = 'ARKIV' | 'SLADDET' | 'FULLVERSJON';

export type Skjerming = 'POL' | 'FEIL';

export interface FileVariant {
  filtype: FileType;
  hasAccess: boolean;
  format: VariantFormat;
  /** File size in bytes. */
  filstoerrelse?: number;
  skjerming: Skjerming | null;
}

export type FileVariants =
  | FileVariant
  | [FileVariant, FileVariant]
  | [FileVariant, FileVariant, FileVariant]
  | FileType;

export interface FileEntry {
  variants: FileVariants;
  /** Display title for this file */
  title: string;
  /** File source URL */
  url: string;
  /**
   * Identifies the file's marker highlights in `highlightStorage`, together with the variant format.
   * Files without an ID cannot be highlighted.
   */
  highlightsId?: string;
  /** Optional query parameters sent with the file request */
  query?: Record<string, string>;
  /** URL to open this file in a new tab */
  newTabUrl?: string;
  /** Optional download URL for this file */
  downloadUrl?: string;
}
