import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const PROXY: ProxyOptions = {
  target: 'https://kabal.intern.dev.nav.no',
  changeOrigin: true,
};

export default defineConfig({
  plugins: [tsconfigPaths(), react(), tailwindcss()],
  build: {
    sourcemap: true,
  },
  server: {
    port: 8061,
    proxy: {
      '/api': PROXY,
      '/debug': PROXY,
      '/collaboration': { ...PROXY, ws: true },
      '/arkivert-dokument': PROXY,
      '/kombinert-dokument': PROXY,
      '/nytt-dokument': PROXY,
      '/vedleggsoversikt': PROXY,
      '/smart-document-write-access': PROXY,
      '/version': PROXY,
      '/oauth': PROXY,
      '/feature-toggle': PROXY,
    },
  },
});
