import { useCallback, useEffect, useState } from 'react';
import type { RotationDegrees } from '../types';

const VALID_ROTATIONS: readonly RotationDegrees[] = [0, 90, 180, 270];

const isValidRotation = (value: number): value is RotationDegrees => VALID_ROTATIONS.includes(value as RotationDegrees);

const getStorageKey = (url: string, pageNumber: number): string => {
  const encoded = new TextEncoder().encode(url).toBase64({ alphabet: 'base64url', omitPadding: true });

  return `klage-pdf-viewer/rotation/${encoded}/${pageNumber.toString(10)}`;
};

const readRotation = (key: string): RotationDegrees => {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return 0;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed === 'number' && isValidRotation(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed values.
  }

  return 0;
};

export const useRotation = (url: string, pageNumber: number) => {
  const key = getStorageKey(url, pageNumber);
  const [rotation, setRotationState] = useState<RotationDegrees>(() => readRotation(key));

  // Re-read from localStorage when the key changes (different page / url).
  useEffect(() => {
    setRotationState(readRotation(key));
  }, [key]);

  const setRotation = useCallback(
    (updater: (prev: RotationDegrees) => RotationDegrees) => {
      setRotationState((prev) => {
        const next = updater(prev);
        localStorage.setItem(key, JSON.stringify(next));

        return next;
      });
    },
    [key],
  );

  return { rotation, setRotation };
};
