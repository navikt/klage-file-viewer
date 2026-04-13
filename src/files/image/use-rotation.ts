import { useCallback, useEffect, useState } from 'react';
import { getStorageKey } from '@/lib/storage-key';

/** Quarter-turn rotation: 0 = 0°, 1 = 90° CCW, 2 = 180°, 3 = 270° CCW. */
type Rotation = 0 | 1 | 2 | 3;

const FEATURE = 'rotation';

const isValidRotation = (value: number): value is Rotation => value >= 0 && value <= 3;

const readRotation = (key: string): Rotation => {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return 0;
    }

    const parsed = Number.parseInt(raw, 10);

    return isValidRotation(parsed) ? parsed : 0;
  } catch {
    return 0;
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
    // Ignore storage errors.
  }
};

interface UseRotationResult {
  rotation: Rotation;
  handleRotate: () => void;
}

/**
 * Manages a single rotation state persisted to localStorage.
 * Each call to `handleRotate` advances the rotation 90° counter-clockwise.
 */
export const useRotation = (url: string): UseRotationResult => {
  const key = getStorageKey(FEATURE, url, '0');
  const [rotation, setRotation] = useState<Rotation>(() => readRotation(key));

  useEffect(() => {
    setRotation(readRotation(key));
  }, [key]);

  const handleRotate = useCallback(() => {
    setRotation((prev) => {
      const next = ((prev + 3) % 4) as Rotation;
      storeRotation(key, next);

      return next;
    });
  }, [key]);

  return { rotation, handleRotate };
};
