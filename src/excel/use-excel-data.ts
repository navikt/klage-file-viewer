import { useEffect, useState } from 'react';
import type { ExcelSheet, WorkerResponse } from './excel-worker-types';

export type { ExcelSheet } from './excel-worker-types';

export interface UseExcelDataResult {
  sheets: ExcelSheet[];
  parsing: boolean;
  parseError: string | undefined;
}

export const useExcelData = (data: Blob | null, workerSrc: string | undefined): UseExcelDataResult => {
  const [sheets, setSheets] = useState<ExcelSheet[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [worker, setWorker] = useState<Worker | null>(null);

  // Create and tear down the worker when the source URL changes.
  useEffect(() => {
    if (workerSrc === undefined) {
      return;
    }

    const instance = new Worker(workerSrc, { type: 'module' });
    setWorker(instance);

    return () => {
      instance.terminate();
      setWorker(null);
    };
  }, [workerSrc]);

  // Send the blob to the worker for parsing whenever it changes.
  useEffect(() => {
    if (data === null || worker === null) {
      setSheets([]);
      setParsing(false);
      setParseError(undefined);

      return;
    }

    let cancelled = false;

    setParsing(true);
    setParseError(undefined);

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      if (cancelled) {
        return;
      }

      const response = event.data;

      if (response.type === 'result') {
        setSheets(response.sheets);
        setParsing(false);
      } else if (response.type === 'error') {
        setParseError(response.message);
        setParsing(false);
      }
    };

    const handleError = (event: ErrorEvent) => {
      if (cancelled) {
        return;
      }

      setParseError(event.message || 'Ukjent feil i Excel-worker');
      setParsing(false);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    worker.postMessage({ type: 'parse', blob: data });

    return () => {
      cancelled = true;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
  }, [data, worker]);

  return { sheets, parsing, parseError };
};
