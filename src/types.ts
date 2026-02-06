export type RotationDegrees = 0 | 90 | 180 | 270;

export interface NewTabProps {
  url: string;
  id: string;
}

interface BaseFileEntry {
  /** Display title for this file */
  title: string;
  /** File source URL */
  url: string;
  /** Optional query parameters sent with the file request */
  query?: Record<string, string>;
  /** New-tab link configuration */
  newTab?: NewTabProps;
  /** Optional download URL for this file */
  downloadUrl?: string;
  /** Optional extra content rendered in the sticky header (e.g. variant tags, redaction switches) */
  headerExtra?: React.ReactNode;
}

export interface PdfFileEntry extends BaseFileEntry {
  type: 'pdf';
}

export interface ExcelFileEntry extends BaseFileEntry {
  type: 'excel';
}

export type FileEntry = PdfFileEntry | ExcelFileEntry;
