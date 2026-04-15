import type { FileType, Skjerming, VariantFormat } from '@/types';

export interface ResolvedVariant {
  filtype: FileType;
  format: VariantFormat;
  hasAccess: boolean;
  skjerming: Skjerming | null;
  /** Whether the original variants included explicit format information (not just a plain FileType string). */
  hasExplicitFormat: boolean;
  hasRedactedDocuments: boolean;
  hasAccessToArchivedDocuments: boolean;
  showRedacted: boolean;
  setShowRedacted: (showRedacted: boolean) => void;
}

/** Append `format=…` to a base URL when the variant has explicit format information. */
export const resolveVariantUrl = (
  baseUrl: string | undefined,
  variant: ResolvedVariant | undefined,
): string | undefined => {
  if (baseUrl === undefined || variant === undefined || !variant.hasExplicitFormat) {
    return baseUrl;
  }

  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set('format', variant.format);

  // Return a path-relative URL to avoid origin mismatches in proxied environments.
  return `${url.pathname}${url.search}`;
};
