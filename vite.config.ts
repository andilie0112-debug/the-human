import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repository-name>/.
export default defineConfig({
  base: '/the-human/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~550 kB
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        style: resolve(import.meta.dirname, 'style.html'),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
