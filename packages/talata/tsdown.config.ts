import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';

const shared = {
  platform: 'neutral',
  target: 'es2020',
  // Keep `exports.default` next to the named export, as the .d.cts says.
  cjsDefault: false,
  // Strips the `workSteps` test counters from the bundle.
  define: { __TALATA_TEST__: 'false' },
} as const;

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts', 'src/unified.ts'],
    dts: true,
    format: ['esm', 'cjs'],
  },
  {
    // The `browser` export condition: the same code, but named references are
    // decoded through the DOM instead of a 2,125-entry table.
    ...shared,
    entry: { index: 'src/index.ts', unified: 'src/unified.ts' },
    outDir: 'dist/browser',
    dts: false,
    clean: false,
    format: ['esm'],
    alias: {
      './entities': fileURLToPath(new URL('src/inline/entities.browser.ts', import.meta.url)),
    },
  },
]);
