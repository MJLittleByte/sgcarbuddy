import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // ../shared holds the /v1 contract and NEA normalisers used by both the app and the Worker.
  server: { fs: { allow: ['..'] } },
  // The map chunk (MapLibre, ~275 kB gzip) is lazy-loaded by Explore only.
  build: { target: 'es2022', outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1100 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
