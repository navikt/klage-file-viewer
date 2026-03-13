import { createReadStream, existsSync, statSync } from 'node:fs';
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
const NODE_MODULES = resolve(__dirname, 'node_modules');

const serveNodeModule = (res: ServerResponse, modulePath: string, contentType: string): void => {
  const filePath = resolve(NODE_MODULES, modulePath);

  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');

    return;
  }

  res.setHeader('Content-Type', contentType);
  createReadStream(filePath).pipe(res);
};

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

    // PDFium WASM from node_modules
    server.middlewares.use('/pdfium.wasm', (_req, res) => {
      serveNodeModule(res, '@embedpdf/pdfium/dist/pdfium.wasm', 'application/wasm');
    });

    // Tesseract worker script
    server.middlewares.use('/tesseract/worker.min.js', (_req, res) => {
      serveNodeModule(res, 'tesseract.js/dist/worker.min.js', 'application/javascript');
    });

    // Tesseract WASM core (multiple variants, auto-selected by CPU features)
    server.middlewares.use('/tesseract', (req, res) => {
      const filename = (req.url ?? '').replace(LEADING_SLASH_REGEX, '');
      serveNodeModule(res, `tesseract.js-core/${filename}`, 'application/javascript');
    });

    // Tesseract language data (proxied from jsdelivr)
    server.middlewares.use('/tesseract/lang', async (req, res) => {
      const lang = (req.url ?? '').replace(LEADING_SLASH_REGEX, '').replace('.traineddata.gz', '');
      const cdnUrl = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;

      try {
        const cdnRes = await fetch(cdnUrl);

        if (!cdnRes.ok) {
          res.statusCode = cdnRes.status;
          res.end(`Failed to fetch ${lang} language data`);

          return;
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(Buffer.from(await cdnRes.arrayBuffer()));
      } catch {
        res.statusCode = 502;
        res.end(`Failed to fetch ${lang} language data`);
      }
    });

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
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['warn', 'error', 'log'],
    },
  },
  define: {
    // Build-time constants injected by tsup during production builds (see tsup.config.ts).
    // Empty strings here so the dev server falls back to default CDN URLs.
    __PDFIUM_WASM_HASH__: JSON.stringify(''),
    __TESSERACT_CDN_URL__: JSON.stringify(''),
  },
  optimizeDeps: {
    include: ['@embedpdf/engines/pdfium-worker-engine', '@embedpdf/engines/pdfium-direct-engine'],
  },
  resolve: {
    alias: [
      { find: '@dev', replacement: resolve(__dirname, 'dev') },
      { find: '@', replacement: resolve(__dirname, 'src') },
      { find: '@package', replacement: resolve(__dirname, 'package.json') },
    ],
  },
});
