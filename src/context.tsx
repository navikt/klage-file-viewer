import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export interface FetchErrorInfo {
  url: string;
  status: number;
  body: string;
}

export enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
}

export interface KlageFileViewerConfig {
  theme: 'light' | 'dark';
  invertColors: boolean;
  setInvertColors: (value: boolean) => void;
  /** Called when a file fetch fails. */
  onFetchError?: (error: FetchErrorInfo) => void;
  /** Optional component rendered inside the error alert alongside the default reload button. */
  errorComponent?: React.ComponentType<{ refresh: () => void }>;
}

const INVERT_COLORS_STORAGE_KEY = 'klage-file-viewer/settings/invertColorsInDarkMode';

const readInvertColorsSetting = (): boolean => {
  try {
    // If not explicitly set to 'false', we treat the setting as enabled.
    return localStorage.getItem(INVERT_COLORS_STORAGE_KEY) !== 'false';
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return true;
};

const DEFAULT_CONFIG: KlageFileViewerConfig = {
  theme: ThemeMode.Light,
  invertColors: true,
  setInvertColors: () => undefined,
};

const FileViewerConfigContext = createContext<KlageFileViewerConfig>(DEFAULT_CONFIG);

export const useFileViewerConfig = (): KlageFileViewerConfig => useContext(FileViewerConfigContext);

interface KlageFileViewerProviderProps {
  /** Called when a file fetch fails. */
  onFetchError?: (error: FetchErrorInfo) => void;
  /** Optional component rendered inside the error alert alongside the default reload button. */
  errorComponent?: React.ComponentType<{ refresh: () => void }>;
  theme: 'light' | 'dark';
  children: ReactNode;
}

export const FileViewerProvider = ({ onFetchError, errorComponent, theme, children }: KlageFileViewerProviderProps) => {
  const [invertColors, setInvertColorsState] = useState<boolean>(() => readInvertColorsSetting());

  const setInvertColors = useCallback((newValue: boolean) => {
    setInvertColorsState(newValue);

    try {
      localStorage.setItem(INVERT_COLORS_STORAGE_KEY, newValue ? 'true' : 'false');
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Could not save setting to localStorage', error);
      } else {
        console.warn('Could not save setting to localStorage');
      }
    }
  }, []);

  const config = useMemo<KlageFileViewerConfig>(
    () => ({ onFetchError, errorComponent, theme, invertColors, setInvertColors }),
    [onFetchError, errorComponent, theme, invertColors, setInvertColors],
  );

  return <FileViewerConfigContext.Provider value={config}>{children}</FileViewerConfigContext.Provider>;
};
