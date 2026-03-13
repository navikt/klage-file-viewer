import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDownloadFilename, parseDocumentRequest, parseDownloadRequest, resolveDocumentPath, scanDir } from './api';

const PORT = 5172;
const DIST_DIR = resolve(import.meta.dirname, 'dist');
const NODE_MODULES = resolve(import.meta.dirname, '../node_modules');

// --- Response helpers ---

const textResponse = (body: string, status: number): Response => new Response(body, { status });

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });

const serveFile = (filePath: string, contentType: string): Response => {
  if (!existsSync(filePath)) {
    return textResponse('Not found', 404);
  }

  return new Response(Bun.file(filePath), {
    headers: { 'Content-Type': contentType },
  });
};

const downloadResponse = (filePath: string, downloadFilename: string): Response => {
  if (!existsSync(filePath)) {
    return textResponse('File not found', 404);
  }

  return new Response(Bun.file(filePath), {
    headers: {
      'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFilename)}"`,
      'Content-Type': 'application/octet-stream',
    },
  });
};

// --- API route handlers ---

const handleApiFiles = (): Response => {
  try {
    return jsonResponse(scanDir(DIST_DIR, ['assets']));
  } catch {
    return jsonResponse([]);
  }
};

const handleApiDocument = (url: URL): Response => {
  const documentName = decodeURIComponent(url.pathname.replace('/api/document/', ''));
  const result = parseDocumentRequest(documentName, url.searchParams.get('format'));

  if (!result.ok) {
    return textResponse(result.message, result.status);
  }

  const filePath = resolveDocumentPath(DIST_DIR, result.documentName, result.format);

  return serveFile(filePath, 'application/pdf');
};

const handleApiDownload = (url: URL): Response => {
  const result = parseDownloadRequest({
    document: url.searchParams.get('document'),
    format: url.searchParams.get('format'),
    file: url.searchParams.get('file'),
  });

  if (!result.ok) {
    return textResponse(result.message, result.status);
  }

  if (result.kind === 'document') {
    const downloadFilename = buildDownloadFilename(result.document, result.format);
    const filePath = resolveDocumentPath(DIST_DIR, result.document, result.format);

    return downloadResponse(filePath, downloadFilename);
  }

  return downloadResponse(resolve(DIST_DIR, result.filename), result.filename);
};

/** Proxy Tesseract language data from jsdelivr. */
const proxyLangData = async (lang: string): Promise<Response> => {
  const cdnUrl = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
  const cdnRes = await fetch(cdnUrl);

  if (!cdnRes.ok) {
    return textResponse(`Failed to fetch ${lang} language data`, cdnRes.status);
  }

  return new Response(cdnRes.body, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
};

// --- Request handler ---

const handleRequest = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const { pathname } = url;

  // API routes
  if (pathname === '/api/files') {
    return handleApiFiles();
  }

  if (pathname.startsWith('/api/document/')) {
    return handleApiDocument(url);
  }

  if (pathname === '/api/download') {
    return handleApiDownload(url);
  }

  // PDFium WASM from node_modules
  if (pathname === '/pdfium.wasm') {
    return serveFile(resolve(NODE_MODULES, '@embedpdf/pdfium/dist/pdfium.wasm'), 'application/wasm');
  }

  // Tesseract worker script
  if (pathname === '/tesseract/worker.min.js') {
    return serveFile(resolve(NODE_MODULES, 'tesseract.js/dist/worker.min.js'), 'application/javascript');
  }

  // Tesseract WASM core (multiple variants, auto-selected by CPU features)
  if (pathname.startsWith('/tesseract/tesseract-core')) {
    return serveFile(
      resolve(NODE_MODULES, 'tesseract.js-core', pathname.slice('/tesseract/'.length)),
      'application/javascript',
    );
  }

  // Tesseract language data (proxied from jsdelivr)
  if (pathname.startsWith('/tesseract/lang/')) {
    const lang = pathname.slice('/tesseract/lang/'.length).replace('.traineddata.gz', '');

    return proxyLangData(lang);
  }

  // Static files from dist dir
  if (pathname !== '/') {
    const filePath = resolve(DIST_DIR, `.${pathname}`);

    try {
      if (statSync(filePath).isFile()) {
        return new Response(Bun.file(filePath));
      }
    } catch {
      // Fall through to index.html
    }
  }

  // SPA fallback
  return new Response(Bun.file(resolve(DIST_DIR, 'index.html')), {
    headers: { 'Content-Type': 'text/html' },
  });
};

// --- Start server ---

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.info(`Preview server ready at http://localhost:${PORT.toString(10)}/`);
