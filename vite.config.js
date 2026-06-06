import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// Builds only the Svelte popup. Background/content/inject/pipeline scripts are
// plain self-contained classic scripts copied verbatim by scripts/build.js,
// because content scripts (MV3) and page-injected scripts run as classic
// scripts and must not be wrapped as ES modules.
export default defineConfig({
  root: fileURLToPath(new URL('./src/popup', import.meta.url)),
  publicDir: false,
  plugins: [svelte()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/popup/popup.html', import.meta.url)),
      output: {
        entryFileNames: 'assets/popup.[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
});
