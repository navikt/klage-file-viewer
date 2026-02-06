import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileViewerConfig } from '@/context';
import { startAsyncSpan } from '@/telemetry';

interface UseFileData {
  data: Blob | null;
  loading: boolean;
  fetching: boolean;
  refresh: () => void;
  error: string | undefined;
}

export const useFileData = (url: string | undefined, query?: Record<string, string>): UseFileData => {
  const { onFetchError, traceName } = useFileViewerConfig();
  const [isFetching, setIsFetching] = useState(false);
  const [data, setData] = useState<Blob | null>(null);
  const [error, setError] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const onFetchErrorRef = useRef(onFetchError);
  const traceNameRef = useRef(traceName);

  useEffect(() => {
    onFetchErrorRef.current = onFetchError;
  }, [onFetchError]);

  useEffect(() => {
    traceNameRef.current = traceName;
  }, [traceName]);

  const getData = useCallback(async (fetchUrl: string | undefined, fetchQuery?: Record<string, string>) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setIsFetching(true);
    setError(undefined);

    if (fetchUrl === undefined) {
      setIsFetching(false);

      return;
    }

    await startAsyncSpan('KlageFileViewer.fetchFile', traceNameRef.current, async (span) => {
      span?.setAttribute('fetch.url', fetchUrl);

      try {
        const fetchUrlObj = new URL(fetchUrl, window.location.origin);

        const params = new URLSearchParams(fetchQuery);
        params.append('version', Date.now().toString());

        for (const [key, value] of params) {
          fetchUrlObj.searchParams.append(key, value);
        }

        const response = await fetch(fetchUrlObj.toString(), { signal });

        span?.setAttribute('http.status_code', response.status);

        if (response.ok) {
          const blob = await response.blob();
          span?.setAttribute('fetch.response_size', blob.size);
          setData(blob);
          setIsFetching(false);

          return;
        }

        const body = await response.text();
        const errorMessage = body.length > 0 ? body : `${response.status.toString(10)} ${response.statusText}`;

        span?.setAttribute('error.message', errorMessage);
        setError(errorMessage);
        onFetchErrorRef.current?.({ url: fetchUrl, status: response.status, body });
        setIsFetching(false);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return;
        }

        const message = e instanceof Error ? e.message : 'Ukjent feil';

        if (e instanceof Error) {
          span?.recordException(e);
        }

        span?.setAttribute('error.message', message);
        setError(message);
        setIsFetching(false);
      }
    });
  }, []);

  useEffect(() => {
    if (url === undefined) {
      return;
    }

    getData(url, query);
  }, [url, query, getData]);

  const refresh = useCallback(() => getData(url, query), [getData, url, query]);

  const loading = isFetching && data === null;
  const fetching = isFetching;

  return { data, loading, fetching, refresh, error };
};
