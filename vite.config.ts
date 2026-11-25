import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repository-name>/.
export default defineConfig({
  base: '/the-human/',
  build: { target: 'es2022', chunkSizeWarningLimit: 800 }, // three.js alone is ~550 kB
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
