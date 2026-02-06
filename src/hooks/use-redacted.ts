import { useCallback, useEffect, useState } from 'react';
import { useStorageKey } from '@/lib/storage-key';
import type { FileVariants } from '@/types';

interface UseRedactedResult {
  showRedacted: boolean;
  setShowRedacted: (value: boolean) => void;
}

export const useRedacted = (url: string, variants: FileVariants): UseRedactedResult => {
  const key = useStorageKey('redacted', url);

  const [showRedacted, setShowRedactedState] = useState(() => readRedacted(key, variants));

  useEffect(() => {
    setShowRedactedState(readRedacted(key, variants));
  }, [variants, key]);

  const setShowRedacted = useCallback(
    (value: boolean) => {
      setShowRedactedState(value);
      storeRedacted(key, value);
    },
    [key],
  );

  return { showRedacted, setShowRedacted };
};

const getDefaultShowRedacted = (variants: FileVariants): boolean => {
  if (typeof variants === 'string') {
    return false;
  }

  if (Array.isArray(variants)) {
    return variants.some(({ format }) => format === 'SLADDET');
  }

  return variants.format === 'SLADDET';
};

const readRedacted = (key: string, variants: FileVariants): boolean => {
  try {
    const raw = sessionStorage.getItem(key);

    if (raw !== null) {
      return raw === 'true';
    }
  } catch {
    // Ignore storage errors.
  }

  return getDefaultShowRedacted(variants);
};

const storeRedacted = (key: string, value: boolean): void => {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // Ignore storage errors.
  }
};
