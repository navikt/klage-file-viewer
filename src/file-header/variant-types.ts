import type { FileType, Skjerming, VariantFormat } from '@/types';

export interface ResolvedVariant {
  filtype: FileType;
  format: VariantFormat;
  hasAccess: boolean;
  skjerming: Skjerming | null;
  hasRedactedDocuments: boolean;
  hasAccessToArchivedDocuments: boolean;
  showRedacted: boolean;
  setShowRedacted: (showRedacted: boolean) => void;
}

/** Append `format=…` to a base URL when the variant supports toggling between redacted/unredacted. */
export const resolveVariantUrl = (
  baseUrl: string | undefined,
  variant: ResolvedVariant | undefined,
): string | undefined => {
  if (baseUrl === undefined || variant === undefined) {
    return baseUrl;
  }

  if (!variant.hasRedactedDocuments || !variant.hasAccessToArchivedDocuments) {
    return baseUrl;
  }

  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set('format', variant.format);

  // Return a path-relative URL to avoid origin mismatches in proxied environments.
  return `${url.pathname}${url.search}`;
};
