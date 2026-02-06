import { useCallback, useEffect, useState } from 'react';
import { KlageFileViewerFitMode } from '@/hooks/use-initial-scale';
import { clamp } from '@/lib/clamp';
import {
  KLAGE_FILE_VIEWER_SCALE_MODE_KEY,
  KLAGE_FILE_VIEWER_SCALE_VALUE_KEY,
  MAX_SCALE,
  MIN_SCALE,
} from '@/scale/constants';

const ALL_MODE_VALUES: Set<string> = new Set(Object.values(KlageFileViewerFitMode));

const DEFAULT_MODE = KlageFileViewerFitMode.NONE;
const DEFAULT_CUSTOM_SCALE = 100;

const isValidMode = (value: string): value is KlageFileViewerFitMode => ALL_MODE_VALUES.has(value);

const readMode = (): KlageFileViewerFitMode => {
  try {
    const raw = localStorage.getItem(KLAGE_FILE_VIEWER_SCALE_MODE_KEY);

    if (raw !== null && isValidMode(raw)) {
      return raw;
    }
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return DEFAULT_MODE;
};

const readCustomScale = (): number => {
  try {
    const raw = localStorage.getItem(KLAGE_FILE_VIEWER_SCALE_VALUE_KEY);

    if (raw !== null) {
      const parsed = Number.parseFloat(raw.trim());

      if (Number.isFinite(parsed)) {
        return clamp(Math.round(parsed), MIN_SCALE, MAX_SCALE);
      }
    }
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return DEFAULT_CUSTOM_SCALE;
};

const persistMode = (mode: KlageFileViewerFitMode): void => {
  try {
    localStorage.setItem(KLAGE_FILE_VIEWER_SCALE_MODE_KEY, mode);
  } catch (error) {
    if (error instanceof Error) {
      console.warn('Could not save scale mode to localStorage', error);
    } else {
      console.warn('Could not save scale mode to localStorage');
    }
  }
};

const persistCustomScale = (scale: number): void => {
  try {
    localStorage.setItem(KLAGE_FILE_VIEWER_SCALE_VALUE_KEY, scale.toString(10));
  } catch (error) {
    if (error instanceof Error) {
      console.warn('Could not save custom scale to localStorage', error);
    } else {
      console.warn('Could not save custom scale to localStorage');
    }
  }
};

interface UseScaleSettingsResult {
  scaleMode: KlageFileViewerFitMode;
  setScaleMode: (mode: KlageFileViewerFitMode) => void;
  customScale: number;
  setCustomScale: (scale: number) => void;
}

/**
 * Manages scale mode and custom scale value as React state backed by localStorage.
 *
 * - `scaleMode` is one of the {@link KlageFileViewerFitMode} values.
 * - `customScale` is the numeric scale percentage, only relevant when mode is `CUSTOM`.
 * - Both values are persisted to localStorage on change and read on initial mount.
 * - Changes made in other tabs are synced via the `storage` event.
 */
export const useScaleSettings = (): UseScaleSettingsResult => {
  const [scaleMode, setScaleModeState] = useState<KlageFileViewerFitMode>(readMode);
  const [customScale, setCustomScaleState] = useState<number>(readCustomScale);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KLAGE_FILE_VIEWER_SCALE_MODE_KEY) {
        const newValue = event.newValue;

        if (newValue !== null && isValidMode(newValue)) {
          setScaleModeState(newValue);
        } else {
          setScaleModeState(DEFAULT_MODE);
        }
      }

      if (event.key === KLAGE_FILE_VIEWER_SCALE_VALUE_KEY) {
        const newValue = event.newValue;

        if (newValue !== null) {
          const parsed = Number.parseFloat(newValue.trim());

          if (Number.isFinite(parsed)) {
            setCustomScaleState(clamp(Math.round(parsed), MIN_SCALE, MAX_SCALE));
          }
        }
      }
    };

    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setScaleMode = useCallback((mode: KlageFileViewerFitMode) => {
    setScaleModeState(mode);
    persistMode(mode);
  }, []);

  const setCustomScale = useCallback((scale: number) => {
    const clamped = clamp(Math.round(scale), MIN_SCALE, MAX_SCALE);
    setCustomScaleState(clamped);
    persistCustomScale(clamped);
  }, []);

  return { scaleMode, setScaleMode, customScale, setCustomScale };
};
