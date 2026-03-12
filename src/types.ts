export type FileType = 'PDF' | 'JPEG' | 'PNG' | 'TIFF' | 'XLSX' | 'JSON' | 'XML' | 'AXML' | 'DXML' | 'RTF';

export type VariantFormat = 'ARKIV' | 'SLADDET';

export type Skjerming = 'POL' | 'FEIL';

export interface FileVariant {
  filtype: FileType;
  hasAccess: boolean;
  format: VariantFormat;
  skjerming: Skjerming | null;
}

export type FileVariants = FileVariant | [FileVariant, FileVariant] | FileType;

export interface FileEntry {
  variants: FileVariants;
  /** Display title for this file */
  title: string;
  /** File source URL */
  url: string;
  /** Optional query parameters sent with the file request */
  query?: Record<string, string>;
  /** URL to open this file in a new tab */
  newTabUrl?: string;
  /** Optional download URL for this file */
  downloadUrl?: string;
}
