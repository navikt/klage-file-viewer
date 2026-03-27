import { defineConfig } from 'tsdown';

const pdfiumWasmHash = process.env.PDFIUM_WASM_HASH ?? '';
const tesseractCdnUrl = process.env.TESSERACT_CDN_URL ?? '';

export default defineConfig({
  dts: true,
  sourcemap: true,
  clean: true,
  format: 'esm',
  entry: ['src/index.ts'],
  define: {
    __PDFIUM_WASM_HASH__: JSON.stringify(pdfiumWasmHash),
    __TESSERACT_CDN_URL__: JSON.stringify(tesseractCdnUrl),
  },
  deps: {
    neverBundle: ['react', 'react-dom', /^@navikt\//, /^@opentelemetry\//],
    alwaysBundle: [/^@embedpdf/],
  },
  target: false,
});
