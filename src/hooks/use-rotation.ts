import { useCallback, useEffect, useState } from 'react';
import { useStorageKey } from '@/lib/storage-key';
import type { RotationDegrees } from '@/types';

const VALID_ROTATIONS: readonly RotationDegrees[] = [0, 90, 180, 270];

const isValidRotation = (value: number): value is RotationDegrees => VALID_ROTATIONS.includes(value as RotationDegrees);

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
  const key = useStorageKey('rotation', url, pageNumber.toString(10));
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
