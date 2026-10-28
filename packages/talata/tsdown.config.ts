import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/unified.ts'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  format: ['esm', 'cjs'],
});
