import { getDocument, PasswordResponses, type PDFDocumentProxy } from 'pdfjs-dist';

// Password exception guards

const isPasswordException = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return (
    'code' in error &&
    (error.code === PasswordResponses.NEED_PASSWORD || error.code === PasswordResponses.INCORRECT_PASSWORD)
  );
};

const isIncorrectPasswordException = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'code' in error && error.code === PasswordResponses.INCORRECT_PASSWORD;
};

// Low-level PDF loading

const loadPdfDocument = async (arrayBuffer: ArrayBuffer, password?: string): Promise<PDFDocumentProxy> => {
  const params: { data: ArrayBuffer; password?: string } = { data: arrayBuffer.slice(0) };

  if (password !== undefined) {
    params.password = password;
  }

  const loadingTask = getDocument(params);

  return loadingTask.promise;
};

// Common password matching

interface CommonPasswordMatch {
  doc: PDFDocumentProxy;
  password: string;
}

const tryPasswords = async (
  arrayBuffer: ArrayBuffer,
  passwords: string[],
  isCancelled: () => boolean,
): Promise<CommonPasswordMatch | null> => {
  for (const password of passwords) {
    if (isCancelled()) {
      return null;
    }

    try {
      const doc = await loadPdfDocument(arrayBuffer, password);

      return { doc, password };
    } catch (e) {
      if (isPasswordException(e)) {
        continue;
      }

      throw e;
    }
  }

  return null;
};

// Load result discriminated union

export enum PdfLoadResultType {
  SUCCESS = 'success',
  PASSWORD_NEEDED = 'password-needed',
  PASSWORD_INCORRECT = 'password-incorrect',
  ERROR = 'error',
}

export type PdfLoadSuccess = { type: PdfLoadResultType.SUCCESS; doc: PDFDocumentProxy; usedPassword: string | null };
export type PdfLoadPasswordNeeded = { type: PdfLoadResultType.PASSWORD_NEEDED };
export type PdfLoadPasswordIncorrect = { type: PdfLoadResultType.PASSWORD_INCORRECT };
export type PdfLoadError = { type: PdfLoadResultType.ERROR; message: string };

export type PdfLoadResult = PdfLoadSuccess | PdfLoadPasswordNeeded | PdfLoadPasswordIncorrect | PdfLoadError;

// High-level loading strategies

/** Attempt to load a PDF with a user-submitted password. */
export const loadWithSubmittedPassword = async (arrayBuffer: ArrayBuffer, password: string): Promise<PdfLoadResult> => {
  try {
    const doc = await loadPdfDocument(arrayBuffer, password);

    return { type: PdfLoadResultType.SUCCESS, doc, usedPassword: password };
  } catch (e) {
    if (isIncorrectPasswordException(e)) {
      return { type: PdfLoadResultType.PASSWORD_INCORRECT };
    }

    if (isPasswordException(e)) {
      return { type: PdfLoadResultType.PASSWORD_NEEDED };
    }

    const message = e instanceof Error ? e.message : 'Kunne ikke laste PDF';

    return { type: PdfLoadResultType.ERROR, message };
  }
};

interface AutoTryCallbacks {
  onAutoTryStart: () => void;
  onAutoTryEnd: () => void;
}

/** Attempt to load without a password, then auto-try a stored password and common passwords if the PDF is locked. */
export const loadWithAutoTry = async (
  arrayBuffer: ArrayBuffer,
  commonPasswords: string[] | undefined,
  storedPassword: string | null,
  isCancelled: () => boolean,
  callbacks: AutoTryCallbacks,
): Promise<PdfLoadResult> => {
  try {
    const doc = await loadPdfDocument(arrayBuffer);

    return { type: PdfLoadResultType.SUCCESS, doc, usedPassword: null };
  } catch (e) {
    if (!isPasswordException(e)) {
      const message = e instanceof Error ? e.message : 'Kunne ikke laste PDF';

      return { type: PdfLoadResultType.ERROR, message };
    }
  }

  // PDF is password-protected — try stored password first, then common passwords automatically
  const passwordsToTry = buildPasswordList(storedPassword, commonPasswords);

  if (passwordsToTry.length > 0 && !isCancelled()) {
    callbacks.onAutoTryStart();

    try {
      const match = await tryPasswords(arrayBuffer, passwordsToTry, isCancelled);

      if (match !== null) {
        return { type: PdfLoadResultType.SUCCESS, doc: match.doc, usedPassword: match.password };
      }
    } finally {
      callbacks.onAutoTryEnd();
    }
  }

  return { type: PdfLoadResultType.PASSWORD_NEEDED };
};

/** Build a deduplicated list of passwords to try, with stored password first. */
const buildPasswordList = (storedPassword: string | null, commonPasswords: string[] | undefined): string[] => {
  const passwords: string[] = [];

  if (storedPassword !== null) {
    passwords.push(storedPassword);
  }

  if (commonPasswords !== undefined) {
    for (const password of commonPasswords) {
      if (!passwords.includes(password)) {
        passwords.push(password);
      }
    }
  }

  return passwords;
};
