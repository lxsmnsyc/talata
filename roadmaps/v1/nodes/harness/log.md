# Log: harness

- Copied the corpus from the main checkout into the worktree (git-ignored). Installed with `pnpm install --offline`.
- Extracted 24 GFM extension examples from cmark-gfm spec.txt into `fixtures/gfm-spec.json`.
- Replaced `READY` with `ready` flags; added `tree-diff.ts`, `diff.ts`, `gfm.test.ts`, `corpus.test.ts`.
- Added `benchmark/scripts/talata.js` and wired talata into bench.js and interleaved.js.
- Fast check passes.
