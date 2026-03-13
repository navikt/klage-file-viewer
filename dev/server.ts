import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDownloadFilename, parseDocumentRequest, parseDownloadRequest, resolveDocumentPath, scanDir } from './api';

const PORT = 5172;
const DIST_DIR = resolve(import.meta.dirname, 'dist');
const PDFIUM_WASM_PATH = resolve(import.meta.dirname, '../node_modules/@embedpdf/pdfium/dist/pdfium.wasm');

// --- Response helpers ---

const textResponse = (body: string, status: number): Response => new Response(body, { status });

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });

const downloadResponse = (filePath: string, downloadFilename: string): Response => {
  try {
    statSync(filePath);
  } catch {
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

  try {
    const stat = statSync(filePath);

    return new Response(Bun.file(filePath), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size.toString(10),
      },
    });
  } catch {
    return textResponse(`Variant "${result.format}" not found for document "${result.documentName}"`, 404);
  }
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

  const filePath = resolve(DIST_DIR, result.filename);

  return downloadResponse(filePath, result.filename);
};

// --- Request handler ---

const handleRequest = (req: Request): Response => {
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

  if (pathname === '/pdfium.wasm') {
    if (!existsSync(PDFIUM_WASM_PATH)) {
      return textResponse('pdfium.wasm not found', 404);
    }

    const stat = statSync(PDFIUM_WASM_PATH);

    return new Response(Bun.file(PDFIUM_WASM_PATH), {
      headers: {
        'Content-Type': 'application/wasm',
        'Content-Length': stat.size.toString(10),
      },
    });
  }

  // Static files from dist dir
  if (pathname !== '/') {
    const filePath = resolve(DIST_DIR, `.${pathname}`);

    try {
      const stat = statSync(filePath);

      if (stat.isFile()) {
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
