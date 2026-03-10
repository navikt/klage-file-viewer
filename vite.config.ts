import { createReadStream, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { parse } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import {
  buildDownloadFilename,
  parseDocumentRequest,
  parseDownloadRequest,
  resolveDocumentPath,
  scanDir,
} from './dev/api';

const LEADING_SLASH_REGEX = /^\//;

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

const pdfListPlugin = (): Plugin => ({
  name: 'file-list-api',
  configureServer(server) {
    const publicDir = resolve(__dirname, 'dev/public');

    server.middlewares.use('/api/document/', (req, res) => {
      const parsed = parse(req.url ?? '', true);
      const pathname = parsed.pathname ?? '';
      const documentName = decodeURIComponent(pathname.replace(LEADING_SLASH_REGEX, ''));
      const result = parseDocumentRequest(documentName, parsed.query.format);

      if (!result.ok) {
        res.statusCode = result.status;
        res.end(result.message);

        return;
      }

      const filePath = resolveDocumentPath(publicDir, result.documentName, result.format);

      try {
        const stat = statSync(filePath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stat.size);
        createReadStream(filePath).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end(`Variant "${result.format}" not found for document "${result.documentName}"`);
      }
    });

    server.middlewares.use('/api/download', (req, res) => {
      const parsed = parse(req.url ?? '', true);
      const result = parseDownloadRequest({
        document: typeof parsed.query.document === 'string' ? parsed.query.document : null,
        format: typeof parsed.query.format === 'string' ? parsed.query.format : null,
        file: typeof parsed.query.file === 'string' ? parsed.query.file : null,
      });

      if (!result.ok) {
        res.statusCode = result.status;
        res.end(result.message);

        return;
      }

      if (result.kind === 'document') {
        const downloadFilename = buildDownloadFilename(result.document, result.format);
        const filePath = resolveDocumentPath(publicDir, result.document, result.format);

        sendFile(res, filePath, downloadFilename);

        return;
      }

      const filePath = resolve(publicDir, result.filename);

      sendFile(res, filePath, result.filename);
    });

    server.middlewares.use('/api/files', (_req, res: ServerResponse) => {
      try {
        const files = scanDir(publicDir);

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
  server: {
    warmup: {
      clientFiles: ['./main.tsx'],
    },
  },
  resolve: {
    alias: [
      { find: /^pdfjs-dist$/, replacement: resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.min.mjs') },
      { find: '@dev', replacement: resolve(__dirname, 'dev') },
      { find: '@', replacement: resolve(__dirname, 'src') },
      { find: '@package', replacement: resolve(__dirname, 'package.json') },
    ],
  },
});
