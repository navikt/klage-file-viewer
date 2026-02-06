import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useState } from 'react';
import {
  loadWithAutoTry,
  loadWithSubmittedPassword,
  type PdfLoadResult,
  PdfLoadResultType,
} from '@/files/pdf/pdf-loading';
import { getStoredPassword, removeStoredPassword, storePassword } from '@/files/pdf/pdf-password-storage';

export enum PasswordStatus {
  NONE = 0,
  NEEDED = 1,
  INCORRECT = 2,
}

export type PasswordState =
  | { status: PasswordStatus.NONE }
  | { status: PasswordStatus.NEEDED }
  | { status: PasswordStatus.INCORRECT; attempts: number };

interface UsePdfDocumentParams {
  data: Blob | null;
  commonPasswords: string[] | undefined;
  fileUrl: string;
}

interface UsePdfDocumentResult {
  pdfDocument: PDFDocumentProxy | null;
  pages: PDFPageProxy[];
  passwordState: PasswordState;
  pdfError: string | null;
  usedPassword: string | null;
  autoTryingPasswords: boolean;
  loadedData: Blob | null;
  submittedPassword: string | null;
  setSubmittedPassword: (password: string | null) => void;
}

export const usePdfDocument = ({ data, commonPasswords, fileUrl }: UsePdfDocumentParams): UsePdfDocumentResult => {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadedData, setLoadedData] = useState<Blob | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [passwordState, setPasswordState] = useState<PasswordState>({ status: PasswordStatus.NONE });
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null);
  const [usedPassword, setUsedPassword] = useState<string | null>(null);
  const [autoTryingPasswords, setAutoTryingPasswords] = useState(false);

  // Load PDF document from blob
  useEffect(() => {
    if (data === null) {
      setPdfDocument(null);
      setLoadedData(null);

      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    const loadPdf = async () => {
      setPdfError(null);

      const arrayBuffer = await data.arrayBuffer();

      const storedPassword = getStoredPassword(fileUrl);

      const result =
        submittedPassword !== null
          ? await loadWithSubmittedPassword(arrayBuffer, submittedPassword)
          : await loadWithAutoTry(arrayBuffer, commonPasswords, storedPassword, isCancelled, {
              onAutoTryStart: () => {
                if (!cancelled) {
                  setAutoTryingPasswords(true);
                }
              },
              onAutoTryEnd: () => {
                if (!cancelled) {
                  setAutoTryingPasswords(false);
                }
              },
            });

      if (cancelled) {
        return;
      }

      applyLoadResult(result, data);
    };

    const applyLoadResult = (result: PdfLoadResult, blob: Blob) => {
      switch (result.type) {
        case PdfLoadResultType.SUCCESS: {
          setPdfDocument(result.doc);
          setLoadedData(blob);
          setUsedPassword(result.usedPassword);
          setPasswordState({ status: PasswordStatus.NONE });

          if (result.usedPassword !== null) {
            storePassword(fileUrl, result.usedPassword);
          }

          break;
        }
        case PdfLoadResultType.PASSWORD_NEEDED: {
          setPasswordState({ status: PasswordStatus.NEEDED });
          setLoadedData(blob);
          removeStoredPassword(fileUrl);
          break;
        }
        case PdfLoadResultType.PASSWORD_INCORRECT: {
          setPasswordState((prev) => ({
            status: PasswordStatus.INCORRECT,
            attempts: prev.status === PasswordStatus.INCORRECT ? prev.attempts + 1 : 1,
          }));
          setLoadedData(blob);
          break;
        }
        case PdfLoadResultType.ERROR: {
          setPdfError(result.message);
          setLoadedData(blob);
          console.error('Error loading PDF:', result.message);
          break;
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [data, submittedPassword, commonPasswords, fileUrl]);

  // Cleanup: clear pages eagerly before destroying the document to prevent
  // ResizeObserver callbacks from calling render() on destroyed PDFPageProxy objects.
  useEffect(() => {
    return () => {
      if (pdfDocument !== null) {
        setPages([]);
        pdfDocument.destroy();
      }
    };
  }, [pdfDocument]);

  // Load pages from document
  useEffect(() => {
    if (pdfDocument === null) {
      setPages([]);

      return;
    }

    let cancelled = false;

    const loadPages = async () => {
      const loaded: PDFPageProxy[] = [];

      try {
        for (let i = 1; i <= pdfDocument.numPages; i++) {
          if (cancelled) {
            return;
          }

          const page = await pdfDocument.getPage(i);
          loaded.push(page);
        }
      } catch {
        // Document was destroyed while loading pages — discard partial results.
        return;
      }

      if (!cancelled) {
        setPages(loaded);
      }
    };

    loadPages();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  const setSubmittedPasswordStable = useCallback((password: string | null) => {
    setSubmittedPassword(password);
  }, []);

  return {
    pdfDocument,
    pages,
    passwordState,
    pdfError,
    usedPassword,
    autoTryingPasswords,
    loadedData,
    submittedPassword,
    setSubmittedPassword: setSubmittedPasswordStable,
  };
};
