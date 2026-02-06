import { useEffect, useState } from 'react';
import type { ExcelSheet } from '@/files/excel/excel-types';
import { parseXlsx } from '@/files/excel/xlsx-parser';

interface UseExcelDataResult {
  sheets: ExcelSheet[];
  parsing: boolean;
  parseError: string | undefined;
}

export const useExcelData = (data: Blob | null): UseExcelDataResult => {
  const [sheets, setSheets] = useState<ExcelSheet[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (data === null) {
      setSheets([]);
      setParsing(false);
      setParseError(undefined);

      return;
    }

    let cancelled = false;

    setParsing(true);
    setParseError(undefined);

    data
      .arrayBuffer()
      .then(async (buffer) => {
        if (cancelled) {
          return;
        }

        const result = await parseXlsx(buffer);
        setSheets(result);
        setParsing(false);
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }

        const message = e instanceof Error ? e.message : 'Kunne ikke lese Excel-filen';
        setParseError(message);
        setParsing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data]);

  return { sheets, parsing, parseError };
};
