import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Turns on the work counters (`workSteps`) that tsdown strips from the build.
  define: { __TALATA_TEST__: 'true' },
  test: {
    include: ['test/**/*.test.ts'],
    // The machine is often shared with other work; 5 s is too tight for the
    // reference parser on large inputs under load.
    testTimeout: 30_000,
  },
});
