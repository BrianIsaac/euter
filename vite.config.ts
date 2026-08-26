/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Copies the repository's `_headers` into the build output, where Cloudflare Pages reads it.
 *
 * @returns The plugin.
 */
function cloudflareHeaders(): Plugin {
  return {
    name: 'euter:cloudflare-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: readFileSync(new URL('./_headers', import.meta.url), 'utf8'),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflareHeaders()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
