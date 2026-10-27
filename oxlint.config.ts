import config from '@lxsmnsyc/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [config],
  // Benchmark scripts are untyped Node scripts that are measured, not shipped.
  ignorePatterns: ['benchmark/**'],
  rules: {
    'new-cap': 'off',
    'no-underscore-dangle': 'off',
  },
});
