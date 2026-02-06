import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileViewerConfig } from '@/context';

export interface UseFileData {
  data: Blob | null;
  loading: boolean;
  refresh: () => void;
  error: string | undefined;
}

export const useFileData = (url: string | undefined, query?: Record<string, string>): UseFileData => {
  const { onFetchError } = useFileViewerConfig();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Blob | null>(null);
  const [error, setError] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const onFetchErrorRef = useRef(onFetchError);

  useEffect(() => {
    onFetchErrorRef.current = onFetchError;
  }, [onFetchError]);

  const getData = useCallback(async (fetchUrl: string | undefined, fetchQuery?: Record<string, string>) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError(undefined);

    if (fetchUrl === undefined) {
      setLoading(false);

      return;
    }

    try {
      const params = new URLSearchParams(fetchQuery);
      params.append('version', Date.now().toString());

      const response = await fetch(`${fetchUrl}?${params.toString()}`, { signal });

      if (response.ok) {
        const blob = await response.blob();
        setData(blob);
        setLoading(false);

        return;
      }

      const body = await response.text();
      const errorMessage = body.length > 0 ? body : `${response.status.toString(10)} ${response.statusText}`;

      setError(errorMessage);
      onFetchErrorRef.current?.({ url: fetchUrl, status: response.status, body });
      setLoading(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }

      const message = e instanceof Error ? e.message : 'Ukjent feil';
      setError(message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (url === undefined) {
      return;
    }

    getData(url, query);
  }, [url, query, getData]);

  const refresh = useCallback(() => getData(url, query), [getData, url, query]);

  return { data, loading, refresh, error };
};
