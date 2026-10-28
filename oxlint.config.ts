import config from '@lxsmnsyc/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [config],
  // Benchmark scripts are untyped Node scripts that are measured, not shipped.
  // Agent worktrees under .claude/ hold other branches' work in progress.
  ignorePatterns: ['benchmark/**', '.claude/**'],
  rules: {
    'new-cap': 'off',
    'no-underscore-dangle': 'off',
  },
});
