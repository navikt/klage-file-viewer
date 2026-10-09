import { useCallback, useEffect, useState } from 'react';
import { VARIANT_FORMATS } from '@/file-header/variant-types';
import { useStorageKey } from '@/lib/storage-key';
import type { VariantFormat } from '@/types';

/** The redacted variant is preferred until the user picks another one. */
const DEFAULT_FORMAT: VariantFormat = 'SLADDET';

/** The user's preferred variant format, persisted per file URL in `sessionStorage`. */
export const useVariantFormat = (url: string): [VariantFormat, (format: VariantFormat) => void] => {
  const key = useStorageKey('variant-format', url);

  const [format, setFormatState] = useState(() => readFormat(key));

  useEffect(() => {
    setFormatState(readFormat(key));
  }, [key]);

  const setFormat = useCallback(
    (newFormat: VariantFormat) => {
      setFormatState(newFormat);
      storeFormat(key, newFormat);
    },
    [key],
  );

  return [format, setFormat];
};

const readFormat = (key: string): VariantFormat => {
  try {
    const raw = sessionStorage.getItem(key);

    return VARIANT_FORMATS.find((format) => format === raw) ?? DEFAULT_FORMAT;
  } catch {
    return DEFAULT_FORMAT;
  }
};

const storeFormat = (key: string, format: VariantFormat): void => {
  try {
    sessionStorage.setItem(key, format);
  } catch {
    // Ignore storage errors.
  }
};
