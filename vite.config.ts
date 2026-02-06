import { createReadStream, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const pdfListPlugin = (): Plugin => ({
  name: 'file-list-api',
  configureServer(server) {
    const publicDir = resolve(__dirname, 'dev/public');

    server.middlewares.use('/api/download', (req, res) => {
      const parsed = parse(req.url ?? '', true);
      const filename = parsed.query.file;

      if (typeof filename !== 'string' || filename.length === 0) {
        res.statusCode = 400;
        res.end('Missing "file" query parameter');

        return;
      }

      // Prevent path traversal.
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        res.statusCode = 400;
        res.end('Invalid filename');

        return;
      }

      const filePath = resolve(publicDir, filename);

      try {
        const stat = statSync(filePath);

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end('File not found');
      }
    });

    server.middlewares.use('/api/files', (_req, res) => {
      try {
        const files = readdirSync(publicDir)
          .filter((file) => file.endsWith('.pdf') || file.endsWith('.xlsx') || file.endsWith('.xls'))
          .sort((a, b) => a.localeCompare(b, 'nb'));

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
      '@': resolve(__dirname, 'src'),
    },
  },
});
