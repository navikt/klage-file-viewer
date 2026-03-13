import { defineConfig } from 'tsup';

const pdfiumWasmHash = process.env.PDFIUM_WASM_HASH ?? '';

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
  },
});
