import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';
import { useEffect, useRef, useState } from 'react';

interface UsePdfDocumentResult {
  doc: PdfDocumentObject | null;
  loading: boolean;
  error: string | null;
}

const noop = () => {
  // Intentional no-op for PdfTask callbacks where we don't need to handle the result.
};

const tryOpenDocument = (
  engine: PdfEngine,
  file: { id: string; content: ArrayBuffer },
  password?: string,
): Promise<PdfDocumentObject> =>
  new Promise((resolve, reject) => {
    const options = password !== undefined ? { password } : undefined;
    const task = engine.openDocumentBuffer(file, options);
    task.wait(resolve, reject);
  });

const isPasswordError = (err: unknown): boolean =>
  err instanceof Error && (err.message.includes('password') || err.message.includes('Password'));

const tryOpenWithPasswords = async (
  engine: PdfEngine,
  file: { id: string; content: ArrayBuffer },
  passwords: string[],
): Promise<PdfDocumentObject | null> => {
  for (const password of passwords) {
    try {
      return await tryOpenDocument(engine, file, password);
    } catch {
      // Try next password
    }
  }

  return null;
};

const closeDocument = (engine: PdfEngine, doc: PdfDocumentObject): void => {
  const closeTask = engine.closeDocument(doc);
  closeTask.wait(noop, noop);
};

/**
 * Attempt to open a PDF document, retrying with common passwords if the
 * initial open fails with a password error.
 */
const openDocumentWithPasswords = async (
  engine: PdfEngine,
  data: Blob,
  commonPasswords: string[] | undefined,
): Promise<PdfDocumentObject> => {
  const arrayBuffer = await data.arrayBuffer();
  const file = { id: crypto.randomUUID(), content: arrayBuffer };

  try {
    return await tryOpenDocument(engine, file);
  } catch (err) {
    if (isPasswordError(err) && commonPasswords !== undefined && commonPasswords.length > 0) {
      const doc = await tryOpenWithPasswords(engine, file, commonPasswords);

      if (doc !== null) {
        return doc;
      }
    }

    throw err;
  }
};

export const usePdfDocument = (
  engine: PdfEngine | null,
  data: Blob | null,
  commonPasswords?: string[],
): UsePdfDocumentResult => {
  const [doc, setDoc] = useState<PdfDocumentObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<PdfDocumentObject | null>(null);

  useEffect(() => {
    if (engine === null || data === null) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const openedDoc = await openDocumentWithPasswords(engine, data, commonPasswords);

        if (cancelled) {
          closeDocument(engine, openedDoc);

          return;
        }

        docRef.current = openedDoc;
        setDoc(openedDoc);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Kunne ikke åpne PDF-dokumentet');
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;

      if (docRef.current !== null) {
        const currentDoc = docRef.current;
        docRef.current = null;
        setDoc(null);
        closeDocument(engine, currentDoc);
      }
    };
  }, [engine, data, commonPasswords]);

  return { doc, loading, error };
};
