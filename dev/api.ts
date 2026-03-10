import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Types ---

interface FlatFileInfo {
  type: 'file';
  filename: string;
}

interface DocumentVariantInfo {
  format: 'ARKIV' | 'SLADDET';
  filename: string;
}

interface DocumentInfo {
  type: 'document';
  name: string;
  variants: DocumentVariantInfo[];
}

type FileInfo = FlatFileInfo | DocumentInfo;

// --- Regex patterns ---

const PDF_REGEX = /\.pdf$/i;
const EXCEL_REGEX = /\.xlsx?$/i;
const IMAGE_REGEX = /\.(jpe?g|png|tiff?)$/i;
const JSON_REGEX = /\.json$/i;

// --- Variant helpers ---

const isVariantFilename = (filename: string): filename is 'ARKIV.pdf' | 'SLADDET.pdf' =>
  filename === 'ARKIV.pdf' || filename === 'SLADDET.pdf';

const getVariantFormat = (filename: string): 'ARKIV' | 'SLADDET' | null => {
  if (filename === 'ARKIV.pdf') {
    return 'ARKIV';
  }

  if (filename === 'SLADDET.pdf') {
    return 'SLADDET';
  }

  return null;
};

const isSupportedFilename = (filename: string): boolean =>
  PDF_REGEX.test(filename) || EXCEL_REGEX.test(filename) || IMAGE_REGEX.test(filename) || JSON_REGEX.test(filename);

// --- File scanning ---

/**
 * Scan a directory for supported files and document variant folders.
 *
 * @param dir - Absolute path to the directory to scan.
 * @param excludeDirs - Directory names to skip (e.g. `['assets']` for the Vite
 *   build output where the `assets` folder contains bundled JS/CSS).
 */
export const scanDir = (dir: string, excludeDirs: readonly string[] = []): FileInfo[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: FileInfo[] = [];
  const excluded = new Set(excludeDirs);

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excluded.has(entry.name)) {
        continue;
      }

      const dirPath = resolve(dir, entry.name);
      const children = readdirSync(dirPath, { encoding: 'utf-8' });
      const variantFiles = children.filter(isVariantFilename);

      if (variantFiles.length > 0) {
        const variants = variantFiles
          .map<DocumentVariantInfo | null>((child) => {
            const format = getVariantFormat(child);

            if (format === null) {
              return null;
            }

            return { format, filename: child };
          })
          .filter((v): v is DocumentVariantInfo => v !== null);

        if (variants.length > 0) {
          results.push({ type: 'document', name: entry.name, variants });
        }
      }
    } else if (entry.isFile() && isSupportedFilename(entry.name)) {
      results.push({ type: 'file', filename: entry.name });
    }
  }

  results.sort((a, b) => {
    const nameA = a.type === 'file' ? a.filename : a.name;
    const nameB = b.type === 'file' ? b.filename : b.name;

    return nameA.localeCompare(nameB, 'nb');
  });

  return results;
};

// --- Validation helpers ---

const hasPathTraversal = (name: string): boolean => name.includes('/') || name.includes('\\') || name.includes('..');

const isValidFormat = (format: unknown): format is 'ARKIV' | 'SLADDET' => format === 'ARKIV' || format === 'SLADDET';

// --- Request parsing ---

interface DocumentRequest {
  ok: true;
  documentName: string;
  format: 'ARKIV' | 'SLADDET';
}

interface RequestError {
  ok: false;
  status: number;
  message: string;
}

/**
 * Parse and validate a document request from a URL pathname and search params.
 *
 * @param documentName - Decoded document name from the URL path.
 * @param format - Raw `format` query parameter value.
 */
export const parseDocumentRequest = (documentName: string, format: unknown): DocumentRequest | RequestError => {
  if (documentName.length === 0) {
    return { ok: false, status: 400, message: 'Missing document name' };
  }

  if (hasPathTraversal(documentName)) {
    return { ok: false, status: 400, message: 'Invalid document name' };
  }

  if (!isValidFormat(format)) {
    return {
      ok: false,
      status: 400,
      message: 'Missing or invalid "format" query parameter. Expected "ARKIV" or "SLADDET".',
    };
  }

  return { ok: true, documentName, format };
};

interface DownloadDocumentRequest {
  ok: true;
  kind: 'document';
  document: string;
  format: 'ARKIV' | 'SLADDET';
}

interface DownloadFileRequest {
  ok: true;
  kind: 'file';
  filename: string;
}

/**
 * Parse and validate a download request from query parameters.
 */
export const parseDownloadRequest = (params: {
  document: string | null;
  format: string | null;
  file: string | null;
}): DownloadDocumentRequest | DownloadFileRequest | RequestError => {
  // Document variant download: ?document=<name>&format=ARKIV|SLADDET
  if (typeof params.document === 'string' && params.document.length > 0) {
    if (hasPathTraversal(params.document)) {
      return { ok: false, status: 400, message: 'Invalid document name' };
    }

    if (!isValidFormat(params.format)) {
      return { ok: false, status: 400, message: 'Missing or invalid "format" query parameter' };
    }

    return { ok: true, kind: 'document', document: params.document, format: params.format };
  }

  // Flat file download: ?file=<filename>
  if (typeof params.file !== 'string' || params.file.length === 0) {
    return { ok: false, status: 400, message: 'Missing "file" query parameter' };
  }

  if (hasPathTraversal(params.file)) {
    return { ok: false, status: 400, message: 'Invalid filename' };
  }

  return { ok: true, kind: 'file', filename: params.file };
};

/**
 * Build the download filename for a document variant.
 */
export const buildDownloadFilename = (document: string, format: 'ARKIV' | 'SLADDET'): string =>
  `${document} (${format}).pdf`;

/**
 * Resolve the file path for a document variant within a base directory.
 */
export const resolveDocumentPath = (baseDir: string, document: string, format: 'ARKIV' | 'SLADDET'): string =>
  resolve(baseDir, document, `${format}.pdf`);
