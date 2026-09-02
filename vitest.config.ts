import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'scripts/**/*.test.ts',
      // Production gameplay/audio QA matrix — see PROD_QA_LOG.md.
      'tests/**/*.test.ts',
    ],
  },
});
