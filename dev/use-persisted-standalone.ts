import { useCallback, useState } from 'react';

const STORAGE_KEY = 'klage-file-viewer-dev:standalone';

const readStoredStandalone = (): boolean | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  } catch {
    // localStorage may be unavailable
  }

  return null;
};

const writeStoredStandalone = (standalone: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, standalone ? 'true' : 'false');
  } catch {
    // localStorage may be unavailable
  }
};

const INITIAL_STANDALONE = readStoredStandalone() ?? true;

const usePersistedStandalone = () => {
  const [standalone, setStandalone] = useState(INITIAL_STANDALONE);

  const toggleStandalone = useCallback(() => {
    setStandalone((prev) => {
      const next = !prev;
      writeStoredStandalone(next);

      return next;
    });
  }, []);

  return [standalone, toggleStandalone] as const;
};

export { usePersistedStandalone };
