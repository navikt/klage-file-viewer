import { type PdfDocumentObject, type PdfEngine, type PdfEngineError, PdfErrorCode } from '@embedpdf/models';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredPassword, removeStoredPassword, storePassword } from '@/files/pdf/password/pdf-password-storage';

export enum PasswordStatus {
  NONE = 'NONE',
  REQUIRED = 'REQUIRED',
  INCORRECT = 'INCORRECT',
}

export interface PasswordState {
  status: PasswordStatus;
}

interface UsePdfDocumentOptions {
  commonPasswords?: string[];
  fileUrl: string;
}

interface UsePdfDocumentResult {
  doc: PdfDocumentObject | null;
  loading: boolean;
  error: string | null;
  passwordState: PasswordState;
  usedPassword: string | null;
  autoTryingPasswords: boolean;
  submitPassword: (password: string) => void;
}

interface AutoPasswordResult {
  doc: PdfDocumentObject;
  password: string;
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

/** Type guard for PDFium engine errors (TaskError<PdfErrorReason>). */
const isPdfEngineError = (err: unknown): err is PdfEngineError =>
  err !== null &&
  typeof err === 'object' &&
  'reason' in err &&
  err.reason !== null &&
  typeof err.reason === 'object' &&
  'code' in err.reason;

const isPasswordError = (err: unknown): boolean => isPdfEngineError(err) && err.reason.code === PdfErrorCode.Password;

const getErrorMessage = (err: unknown): string => {
  if (isPdfEngineError(err)) {
    if (err.reason.code === PdfErrorCode.Password) {
      return 'Dokumentet er passordbeskyttet';
    }

    return err.reason.message;
  }

  if (err instanceof Error) {
    return err.message;
  }

  return 'Kunne ikke åpne PDF-dokumentet';
};

const closeDocument = (engine: PdfEngine, doc: PdfDocumentObject): void => {
  const closeTask = engine.closeDocument(doc);
  closeTask.wait(noop, noop);
};

const createFile = (content: ArrayBuffer): { id: string; content: ArrayBuffer } => ({
  id: crypto.randomUUID(),
  content,
});

type FirstOpenResult =
  | { status: 'success'; doc: PdfDocumentObject }
  | { status: 'password_required' }
  | { status: 'error'; message: string }
  | { status: 'cancelled' };

/** Attempt to open a PDF without a password, classifying the outcome. */
const tryFirstOpen = async (
  engine: PdfEngine,
  arrayBuffer: ArrayBuffer,
  isCancelled: () => boolean,
): Promise<FirstOpenResult> => {
  try {
    const doc = await tryOpenDocument(engine, createFile(arrayBuffer));

    if (isCancelled()) {
      closeDocument(engine, doc);

      return { status: 'cancelled' };
    }

    return { status: 'success', doc };
  } catch (err) {
    if (isCancelled()) {
      return { status: 'cancelled' };
    }

    if (isPasswordError(err)) {
      return { status: 'password_required' };
    }

    return { status: 'error', message: getErrorMessage(err) };
  }
};

/**
 * Try stored and common passwords in sequence, returning the first successful
 * result or `null` if none work.
 */
const tryAutoPasswords = async (
  engine: PdfEngine,
  arrayBuffer: ArrayBuffer,
  fileUrl: string,
  commonPasswords: string[] | undefined,
  isCancelled: () => boolean,
): Promise<AutoPasswordResult | null> => {
  const storedPw = getStoredPassword(fileUrl);

  if (storedPw !== null) {
    try {
      const doc = await tryOpenDocument(engine, createFile(arrayBuffer), storedPw);

      return { doc, password: storedPw };
    } catch {
      // Stored password did not work, remove it
      removeStoredPassword(fileUrl);
    }
  }

  if (commonPasswords === undefined) {
    return null;
  }

  for (const pw of commonPasswords) {
    if (isCancelled()) {
      return null;
    }

    try {
      const doc = await tryOpenDocument(engine, createFile(arrayBuffer), pw);

      storePassword(fileUrl, pw);

      return { doc, password: pw };
    } catch {
      // Try next password
    }
  }

  return null;
};

export const usePdfDocument = (
  engine: PdfEngine | null,
  data: Blob | null,
  options: UsePdfDocumentOptions,
): UsePdfDocumentResult => {
  const { commonPasswords, fileUrl } = options;

  const [doc, setDoc] = useState<PdfDocumentObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordState, setPasswordState] = useState<PasswordState>({ status: PasswordStatus.NONE });
  const [usedPassword, setUsedPassword] = useState<string | null>(null);
  const [autoTryingPasswords, setAutoTryingPasswords] = useState(false);
  const docRef = useRef<PdfDocumentObject | null>(null);
  const dataRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (engine === null || data === null) {
      return;
    }

    let cancelled = false;

    const handleSuccess = (openedDoc: PdfDocumentObject, password: string | null) => {
      docRef.current = openedDoc;
      setDoc(openedDoc);
      setUsedPassword(password);
      setPasswordState({ status: PasswordStatus.NONE });
      setLoading(false);
    };

    const run = async () => {
      setLoading(true);
      setError(null);
      setPasswordState({ status: PasswordStatus.NONE });
      setUsedPassword(null);

      const arrayBuffer = await data.arrayBuffer();

      if (cancelled) {
        return;
      }

      dataRef.current = arrayBuffer;

      const firstResult = await tryFirstOpen(engine, arrayBuffer, () => cancelled);

      if (firstResult.status === 'cancelled') {
        return;
      }

      if (firstResult.status === 'success') {
        handleSuccess(firstResult.doc, null);

        return;
      }

      if (firstResult.status === 'error') {
        setError(firstResult.message);
        setLoading(false);

        return;
      }

      // password_required — try stored and common passwords automatically
      setAutoTryingPasswords(true);

      const result = await tryAutoPasswords(engine, arrayBuffer, fileUrl, commonPasswords, () => cancelled);

      if (cancelled) {
        if (result !== null) {
          closeDocument(engine, result.doc);
        }

        return;
      }

      setAutoTryingPasswords(false);

      if (result !== null) {
        handleSuccess(result.doc, result.password);
      } else {
        setPasswordState({ status: PasswordStatus.REQUIRED });
        setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      dataRef.current = null;

      if (docRef.current !== null) {
        const currentDoc = docRef.current;
        docRef.current = null;
        setDoc(null);
        closeDocument(engine, currentDoc);
      }
    };
  }, [engine, data, commonPasswords, fileUrl]);

  const submitPassword = useCallback(
    async (password: string) => {
      if (engine === null || dataRef.current === null) {
        return;
      }

      setLoading(true);

      try {
        const openedDoc = await tryOpenDocument(engine, createFile(dataRef.current), password);

        storePassword(fileUrl, password);
        docRef.current = openedDoc;
        setDoc(openedDoc);
        setUsedPassword(password);
        setPasswordState({ status: PasswordStatus.NONE });
        setLoading(false);
      } catch (err) {
        if (isPasswordError(err)) {
          setPasswordState({ status: PasswordStatus.INCORRECT });
        } else {
          setError(getErrorMessage(err));
        }

        setLoading(false);
      }
    },
    [engine, fileUrl],
  );

  return { doc, loading, error, passwordState, usedPassword, autoTryingPasswords, submitPassword };
};
