import { Rotation } from '@embedpdf/models';
import { useCallback, useEffect, useState } from 'react';
import { getStorageKey } from '@/lib/storage-key';

const FEATURE = 'rotation';

const isValidRotation = (value: number): value is Rotation => Object.hasOwn(Rotation, value);

const readRotation = (key: string): Rotation | null => {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed = Number.parseInt(raw, 10);

    return isValidRotation(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const storeRotation = (key: string, rotation: Rotation): void => {
  try {
    if (rotation === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, rotation.toString(10));
    }
  } catch {
    // Ignore storage errors (e.g. quota exceeded, localStorage unavailable).
  }
};

const buildInitialRotations = (url: string, pageCount: number): Map<number, Rotation> => {
  const map = new Map<number, Rotation>();

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const key = getStorageKey(FEATURE, url, pageIndex.toString(10));
    const rotation = readRotation(key);

    if (rotation !== null && rotation !== 0) {
      map.set(pageIndex, rotation);
    }
  }

  return map;
};

interface UsePersistedRotationsResult {
  rotations: Map<number, Rotation>;
  handleRotate: (pageIndex: number) => void;
}

export const usePersistedRotations = (url: string, pageCount: number): UsePersistedRotationsResult => {
  const [rotations, setRotations] = useState<Map<number, Rotation>>(() => buildInitialRotations(url, pageCount));

  useEffect(() => {
    if (pageCount > 0) {
      setRotations(buildInitialRotations(url, pageCount));
    }
  }, [url, pageCount]);

  const handleRotate = useCallback(
    (pageIndex: number) => {
      setRotations((prev) => {
        const next = new Map(prev);
        const current: Rotation = next.get(pageIndex) ?? 0;
        const updated = ((current + 3) % 4) as Rotation;

        if (updated === 0) {
          next.delete(pageIndex);
        } else {
          next.set(pageIndex, updated);
        }

        const key = getStorageKey(FEATURE, url, pageIndex.toString(10));
        storeRotation(key, updated);

        return next;
      });
    },
    [url],
  );

  return { rotations, handleRotate };
};
