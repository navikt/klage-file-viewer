export type RotationDegrees = 0 | 90 | 180 | 270;

export interface NewTabProps {
  url: string;
  id: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export interface PdfEntry {
  /** Display title for this PDF */
  title: string;
  /** PDF source URL */
  url: string;
  /** Optional query parameters sent with the PDF request */
  query?: Record<string, string>;
  /** New-tab link configuration */
  newTab?: NewTabProps;
  /** Optional extra content rendered in the sticky header (e.g. variant tags, redaction switches) */
  headerExtra?: React.ReactNode;
}
