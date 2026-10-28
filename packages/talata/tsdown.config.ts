import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/unified.ts'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  format: ['esm', 'cjs'],
  // Keep `exports.default` next to the named export, as the .d.cts says.
  cjsDefault: false,
  // Strips the `workSteps` test counters from the bundle.
  define: { __TALATA_TEST__: 'false' },
});
