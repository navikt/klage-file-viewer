import { useMemo } from 'react';

const encoder = new TextEncoder();

/**
 * Build a namespaced storage key with a base64url-encoded URL segment.
 *
 * @param feature - Feature namespace (e.g. `"rotation"`, `"pdf-password"`).
 * @param url - The file URL to encode into the key.
 * @param suffix - Optional extra path segment appended after the feature.
 */
export const getStorageKey = (feature: string, url: string, suffix?: string): string => {
  const encoded = encoder.encode(url).toBase64({ alphabet: 'base64url', omitPadding: true });
  const base = `klage-file-viewer/${encoded}/${feature}`;

  return suffix === undefined ? base : `${base}/${suffix}`;
};

/**
 * Memoized React hook for {@link getStorageKey}.
 *
 * Returns a stable string reference as long as the arguments stay the same,
 * avoiding the base64 encoding on every render.
 *
 * @param feature - Feature namespace (e.g. `"rotation"`, `"pdf-password"`).
 * @param url - The file URL to encode into the key.
 * @param suffix - Optional extra path segment appended after the feature.
 */
export const useStorageKey = (feature: string, url: string, suffix?: string): string =>
  useMemo(() => getStorageKey(feature, url, suffix), [feature, url, suffix]);
