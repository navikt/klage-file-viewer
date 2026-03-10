import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  metafile: true,
  format: 'esm',
  entry: ['src/index.ts'],
  noExternal: [/^pdfjs-dist/],
  external: ['react', 'react-dom', /^@navikt\//, /^@opentelemetry\//],
  esbuildOptions(options) {
    options.alias = {
      'pdfjs-dist': resolve('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs'),
    };
  },
});
