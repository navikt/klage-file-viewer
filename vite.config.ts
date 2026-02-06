import { createReadStream, readdirSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { parse } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const PDF_REGEX = /\.pdf$/i;
const EXCEL_REGEX = /\.xlsx?$/i;
const IMAGE_REGEX = /\.(jpe?g|png|tiff?)$/i;
const JSON_REGEX = /\.json$/i;
const LEADING_SLASH_REGEX = /^\//;

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

const scanPublicDir = (publicDir: string): FileInfo[] => {
  const entries = readdirSync(publicDir, { withFileTypes: true });
  const results: FileInfo[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dirPath = resolve(publicDir, entry.name);
      const children = readdirSync(dirPath);
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
    } else if (entry.isFile()) {
      const filename = entry.name;

      if (
        PDF_REGEX.test(filename) ||
        EXCEL_REGEX.test(filename) ||
        IMAGE_REGEX.test(filename) ||
        JSON_REGEX.test(filename)
      ) {
        results.push({ type: 'file', filename });
      }
    }
  }

  results.sort((a, b) => {
    const nameA = a.type === 'file' ? a.filename : a.name;
    const nameB = b.type === 'file' ? b.filename : b.name;

    return nameA.localeCompare(nameB, 'nb');
  });

  return results;
};

const hasPathTraversal = (name: string): boolean => name.includes('/') || name.includes('\\') || name.includes('..');

const isValidFormat = (format: unknown): format is 'ARKIV' | 'SLADDET' => format === 'ARKIV' || format === 'SLADDET';

const sendFile = (res: ServerResponse, filePath: string, downloadFilename: string): void => {
  try {
    const stat = statSync(filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(filePath).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('File not found');
  }
};

const handleDocumentDownload = (res: ServerResponse, publicDir: string, document: string, format: unknown): void => {
  if (hasPathTraversal(document)) {
    res.statusCode = 400;
    res.end('Invalid document name');

    return;
  }

  if (!isValidFormat(format)) {
    res.statusCode = 400;
    res.end('Missing or invalid "format" query parameter');

    return;
  }

  const downloadFilename = `${document} (${format}).pdf`;
  const filePath = resolve(publicDir, document, `${format}.pdf`);

  sendFile(res, filePath, downloadFilename);
};

const handleFlatFileDownload = (res: ServerResponse, publicDir: string, filename: unknown): void => {
  if (typeof filename !== 'string' || filename.length === 0) {
    res.statusCode = 400;
    res.end('Missing "file" query parameter');

    return;
  }

  if (hasPathTraversal(filename)) {
    res.statusCode = 400;
    res.end('Invalid filename');

    return;
  }

  const filePath = resolve(publicDir, filename);

  sendFile(res, filePath, filename);
};

const pdfListPlugin = (): Plugin => ({
  name: 'file-list-api',
  configureServer(server) {
    const publicDir = resolve(__dirname, 'dev/public');

    // Serve a document variant from a folder: /api/document/<name>?format=ARKIV|SLADDET
    server.middlewares.use('/api/document/', (req, res) => {
      const parsed = parse(req.url ?? '', true);
      const pathname = parsed.pathname ?? '';

      // pathname is relative to the mount point, e.g. "/My Document" or "/My%20Document"
      const documentName = decodeURIComponent(pathname.replace(LEADING_SLASH_REGEX, ''));

      if (documentName.length === 0) {
        res.statusCode = 400;
        res.end('Missing document name');

        return;
      }

      // Prevent path traversal.
      if (documentName.includes('/') || documentName.includes('\\') || documentName.includes('..')) {
        res.statusCode = 400;
        res.end('Invalid document name');

        return;
      }

      const format = parsed.query.format;

      if (typeof format !== 'string' || (format !== 'ARKIV' && format !== 'SLADDET')) {
        res.statusCode = 400;
        res.end('Missing or invalid "format" query parameter. Expected "ARKIV" or "SLADDET".');

        return;
      }

      const filePath = resolve(publicDir, documentName, `${format}.pdf`);

      try {
        const stat = statSync(filePath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stat.size);
        createReadStream(filePath).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end(`Variant "${format}" not found for document "${documentName}"`);
      }
    });

    server.middlewares.use('/api/download', (req, res) => {
      const parsed = parse(req.url ?? '', true);
      const { file: filename, document, format } = parsed.query;

      // Document variant download: /api/download?document=<name>&format=ARKIV|SLADDET
      if (typeof document === 'string' && document.length > 0) {
        handleDocumentDownload(res, publicDir, document, format);

        return;
      }

      // Flat file download: /api/download?file=<filename>
      handleFlatFileDownload(res, publicDir, filename);
    });

    server.middlewares.use('/api/files', (_req, res: ServerResponse) => {
      try {
        const files = scanPublicDir(publicDir);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(files));
      } catch {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify([]));
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), pdfListPlugin()],
  root: 'dev',
  resolve: {
    alias: {
      '@dev': resolve(__dirname, 'dev'),
      '@': resolve(__dirname, 'src'),
      '@package': resolve(__dirname, 'package.json'),
    },
  },
});
