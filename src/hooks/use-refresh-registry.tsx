import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useFileViewerConfig } from '@/context';
import { startSpan } from '@/telemetry';

type RefreshFn = () => void;

interface RefreshRegistry {
  /** Register a refresh function for a given file URL. Returns an unregister function. */
  register: (url: string, refresh: RefreshFn) => () => void;
  /** Call the registered refresh function for the given file URL. Resolves to `true` if a refresh was triggered. */
  reloadFile: (url: string) => Promise<boolean>;
  /** Call all registered refresh functions. Resolves to the number of refreshes triggered. */
  reloadAll: () => Promise<number>;
}

const RefreshRegistryContext = createContext<RefreshRegistry | null>(null);

/**
 * Provides a {@link RefreshRegistry} to descendant components.
 *
 * Loaded file sections register their `refresh` (from `useFileData`) on mount
 * and unregister on unmount. The parent can then trigger a reload for a specific
 * file by URL, or reload all files at once.
 */
export const RefreshRegistryProvider = ({ children }: { children: React.ReactNode }) => {
  const { traceName } = useFileViewerConfig();
  const traceNameRef = useRef(traceName);

  useEffect(() => {
    traceNameRef.current = traceName;
  }, [traceName]);

  const registryRef = useRef<Map<string, RefreshFn>>(new Map());

  const register = useCallback((url: string, refresh: RefreshFn): (() => void) => {
    registryRef.current.set(url, refresh);

    return () => {
      // Only delete if the current entry is still the one we registered.
      if (registryRef.current.get(url) === refresh) {
        registryRef.current.delete(url);
      }
    };
  }, []);

  const reloadFile = useCallback(async (url: string): Promise<boolean> => {
    return startSpan('KlageFileViewer.reloadFile', traceNameRef.current, (span) => {
      span?.setAttribute('reload.url', url);

      const refresh = registryRef.current.get(url);

      if (refresh === undefined) {
        span?.setAttribute('reload.found', false);

        return false;
      }

      span?.setAttribute('reload.found', true);
      refresh();

      return true;
    });
  }, []);

  const reloadAll = useCallback(async (): Promise<number> => {
    return startSpan('KlageFileViewer.reloadAll', traceNameRef.current, (span) => {
      const count = registryRef.current.size;
      span?.setAttribute('reload.count', count);

      for (const refresh of registryRef.current.values()) {
        refresh();
      }

      return count;
    });
  }, []);

  const value = useRef<RefreshRegistry>({ register, reloadFile, reloadAll }).current;

  return <RefreshRegistryContext value={value}>{children}</RefreshRegistryContext>;
};

/** Access the nearest {@link RefreshRegistry} provided by {@link RefreshRegistryProvider}. */
export const useRefreshRegistry = (): RefreshRegistry => {
  const context = useContext(RefreshRegistryContext);

  if (context === null) {
    throw new Error('useRefreshRegistry must be used within a RefreshRegistryProvider');
  }

  return context;
};

/** Register a refresh function for a file URL. Automatically unregisters on unmount. */
export const useRegisterRefresh = (url: string, refresh: RefreshFn) => {
  const { register } = useRefreshRegistry();

  useEffect(() => register(url, refresh), [register, url, refresh]);
};
