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

interface KlageFileViewerConfig extends Omit<Props, 'children'> {
  standalone: boolean;
  traceName: string | undefined;
  invertColors: boolean;
  setInvertColors: (value: boolean) => void;
  smoothScrolling: boolean;
  setSmoothScrolling: (value: boolean) => void;
  antiAliasing: boolean;
  setAntiAliasing: (value: boolean) => void;
}

const INVERT_COLORS_STORAGE_KEY = 'klage-file-viewer/settings/invertColorsInDarkMode';
const SMOOTH_SCROLLING_STORAGE_KEY = 'klage-file-viewer/settings/smoothScrolling';
const ANTI_ALIASING_STORAGE_KEY = 'klage-file-viewer/settings/antiAliasing';

const readInvertColorsSetting = (): boolean => {
  try {
    // If not explicitly set to 'false', we treat the setting as enabled.
    return localStorage.getItem(INVERT_COLORS_STORAGE_KEY) !== 'false';
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return true;
};

const readSmoothScrollingSetting = (): boolean => {
  try {
    // If not explicitly set to 'false', we treat the setting as enabled.
    return localStorage.getItem(SMOOTH_SCROLLING_STORAGE_KEY) !== 'false';
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return true;
};

const readAntiAliasingSetting = (): boolean => {
  try {
    // If not explicitly set to 'false', we treat the setting as enabled.
    return localStorage.getItem(ANTI_ALIASING_STORAGE_KEY) !== 'false';
  } catch {
    // Ignore errors (e.g. localStorage unavailable).
  }

  return true;
};

const DEFAULT_CONFIG: KlageFileViewerConfig = {
  standalone: false,
  traceName: undefined,
  theme: ThemeMode.Light,
  invertColors: true,
  setInvertColors: () => undefined,
  smoothScrolling: true,
  setSmoothScrolling: () => undefined,
  antiAliasing: true,
  setAntiAliasing: () => undefined,
};

const FileViewerConfigContext = createContext<KlageFileViewerConfig>(DEFAULT_CONFIG);

export const useFileViewerConfig = (): KlageFileViewerConfig => useContext(FileViewerConfigContext);

export interface KlageFileViewerProviderProps {
  /** When `true`, shows all fit options (fit-to-width, fit-to-page). When `false` (default), hides options that depend on a fixed container width. */
  standalone?: boolean;
  /** Optional name used as the `component.instance` attribute on OpenTelemetry spans. Useful for differentiating multiple instances of the viewer. */
  traceName?: string;
  theme: 'light' | 'dark';
  /** Called when a file fetch fails. */
  onFetchError?: (error: FetchErrorInfo) => void;
  /** Optional component rendered inside the error alert alongside the default reload button. */
  errorComponent?: React.ComponentType<{ refresh: () => void }>;
  /** Common passwords to automatically try when a PDF is password-protected. */
  commonPasswords?: string[];
}

interface Props extends KlageFileViewerProviderProps {
  children: ReactNode;
}

export const FileViewerProvider = ({
  standalone = false,
  traceName,
  onFetchError,
  errorComponent,
  commonPasswords,
  theme,
  children,
}: Props) => {
  const [invertColors, setInvertColorsState] = useState<boolean>(() => readInvertColorsSetting());
  const [smoothScrolling, setSmoothScrollingState] = useState<boolean>(() => readSmoothScrollingSetting());
  const [antiAliasing, setAntiAliasingState] = useState<boolean>(() => readAntiAliasingSetting());

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

  const setSmoothScrolling = useCallback((newValue: boolean) => {
    setSmoothScrollingState(newValue);

    try {
      localStorage.setItem(SMOOTH_SCROLLING_STORAGE_KEY, newValue ? 'true' : 'false');
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Could not save setting to localStorage', error);
      } else {
        console.warn('Could not save setting to localStorage');
      }
    }
  }, []);

  const setAntiAliasing = useCallback((newValue: boolean) => {
    setAntiAliasingState(newValue);

    try {
      localStorage.setItem(ANTI_ALIASING_STORAGE_KEY, newValue ? 'true' : 'false');
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Could not save setting to localStorage', error);
      } else {
        console.warn('Could not save setting to localStorage');
      }
    }
  }, []);

  const config = useMemo<KlageFileViewerConfig>(
    () => ({
      standalone,
      traceName,
      onFetchError,
      errorComponent,
      commonPasswords,
      theme,
      invertColors,
      setInvertColors,
      smoothScrolling,
      setSmoothScrolling,
      antiAliasing,
      setAntiAliasing,
    }),
    [
      standalone,
      traceName,
      onFetchError,
      errorComponent,
      commonPasswords,
      theme,
      invertColors,
      setInvertColors,
      smoothScrolling,
      setSmoothScrolling,
      antiAliasing,
      setAntiAliasing,
    ],
  );

  return <FileViewerConfigContext.Provider value={config}>{children}</FileViewerConfigContext.Provider>;
};
