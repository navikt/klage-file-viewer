import { useCallback, useState } from 'react';

enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
}

const STORAGE_KEY = 'klage-file-viewer-dev:theme';

const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const getSystemTheme = (): ThemeMode =>
  hasMatchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeMode.Dark : ThemeMode.Light;

const readStoredTheme = (): ThemeMode | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    if (value === ThemeMode.Light || value === ThemeMode.Dark) {
      return value;
    }
  } catch {
    // localStorage may be unavailable
  }

  return null;
};

const writeStoredTheme = (theme: ThemeMode): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable
  }
};

const INITIAL_THEME = readStoredTheme() ?? getSystemTheme();

const usePersistedTheme = () => {
  const [theme, setTheme] = useState<ThemeMode>(INITIAL_THEME);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === ThemeMode.Light ? ThemeMode.Dark : ThemeMode.Light;
      writeStoredTheme(next);

      return next;
    });
  }, []);

  return [theme, toggleTheme] as const;
};

export { ThemeMode, usePersistedTheme };
