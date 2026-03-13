import { defineConfig } from 'tsup';

const pdfiumWasmHash = process.env.PDFIUM_WASM_HASH ?? '';
const tesseractCdnUrl = process.env.TESSERACT_CDN_URL ?? '';

export default defineConfig({
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  metafile: true,
  format: 'esm',
  entry: ['src/index.ts'],
  noExternal: [/^@embedpdf/],
  external: ['react', 'react-dom', /^@navikt\//, /^@opentelemetry\//],
  define: {
    __PDFIUM_WASM_HASH__: JSON.stringify(pdfiumWasmHash),
    __TESSERACT_CDN_URL__: JSON.stringify(tesseractCdnUrl),
  },
});
