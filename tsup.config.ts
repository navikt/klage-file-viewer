import { defineConfig } from 'tsup';

export default defineConfig([
  {
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    metafile: true,
    format: 'esm',
    entry: ['src/index.ts'],
    external: ['react', 'react-dom', 'pdfjs-dist', /^@navikt\//],
  },
  {
    entry: { 'excel-worker': 'src/excel/excel-worker.ts' },
    format: 'esm',
    minify: true,
    splitting: false,
    dts: false,
    sourcemap: false,
    clean: false,
    noExternal: [/.*/],
  },
]);
