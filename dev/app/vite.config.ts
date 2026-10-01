/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port and a relative build output.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
