import { useEffect, useState } from 'react';

export type JsonData = string | number | boolean | null | JsonObject | JsonArray;

export interface JsonObject {
  [key: string]: JsonData;
}

export type JsonArray = JsonData[];

interface UseJsonData {
  json: JsonData | undefined;
  parsing: boolean;
  parseError: string | undefined;
}

export const useJsonData = (data: Blob | null): UseJsonData => {
  const [json, setJson] = useState<JsonData | undefined>(undefined);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (data === null) {
      setJson(undefined);
      setParsing(false);
      setParseError(undefined);

      return;
    }

    let cancelled = false;

    const parse = async () => {
      setParsing(true);
      setParseError(undefined);

      try {
        const parsed: JsonData = await data.json();

        if (!cancelled) {
          setJson(parsed);
          setParsing(false);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Ukjent feil ved lesing av JSON';
          setParseError(message);
          setParsing(false);
        }
      }
    };

    parse();

    return () => {
      cancelled = true;
    };
  }, [data]);

  return { json, parsing, parseError };
};
