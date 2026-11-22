# Outcome: release-0.4

## Built

- `packages/talata/README.md`: the MDX section rewritten for 0.4 (`mdx()` and `mdx({ acorn })`, what acorn adds, `data.estree`, `acornOptions` with `onComment` and `onToken`, `MdxError`, compiling with `@mdx-js/mdx` 3.1.1, stringify note). The "one known gap" line and its fuzz claim are gone. New speed and size tables, new fuzz claim, HTML path speedup (about 8x).
- `docs/migration.md`: the MDX section has the `@mdx-js/mdx` example and notes on `data.estree`, `onComment` and stringify. The "no `data.estree`" notes are gone.
- `README.md` (root): speedup range 18 to 21 times.
- `.changeset/mdx-subpath.md`: "The main entry does not grow" now says "Its code is not in the main entry" (the main entry grew 33.1 to 35.4 KB gzip since 0.3 through the layered core). `.changeset/fix-directive-nested-growth.md`: "about 60 ms" is now "about 12 ms" (800 nested directives, best of 7).
- Every code example was run with node, including `compile` from `@mdx-js/mdx` with and without acorn.

## Numbers

- Speed (interleaved, 15 rounds, load 3.3 to 3.9, Apple M2, Node 26.12.1; corpus refetched by `pnpm --filter benchmark corpus`): READMEs (215 files, 1.8 MB) 17.94x, `fs.md` 17.98x, `CHANGELOG_V22` 21.30x faster than mdast + gfm. talata 54.1, 10.5, 24.9 ms.
- Size: main 101.4 KB, 35.4 KB gzip (reference 118.2 KB, 35.9 KB node; 82.5 KB, 23.8 KB browser). Subpaths gzip: frontmatter 1.3 KB, math 12.8 KB, directive 18.1 KB, mdx 21.9 KB.
- Fuzz: 1,000,000 documents `--all --acorn --seed 20261801` and 1,000,000 `--all --seed 20261802`, each in 4 chunks of 250,000: 0 failures, 0 skipped.

## Deviations

- `pnpm --filter benchmark corpus` writes through the `benchmark/corpus` symlink, so it replaced the gitignored corpus of the main worktree too.
- The suite has timing tests that fail in a full parallel run at load 4 to 17 (`directive-growth`: root closed, quote unclosed, list unclosed). Run alone they pass.

## Stubs left

- None.

## Gotchas

- Main entry size is up 2.3 KB gzip against 0.3 (33141 to 35390 bytes) from the layered core.

## Proposed learnings

- None.

## Verification

- `NODE_ENV=production pnpm --filter talata test`: 7829 tests, 7827 pass in the full run, the 2 timing failures pass alone (3 files, 35 tests, twice). tsc clean, oxlint 0 errors (2 existing `max-depth` warnings), oxfmt clean.

## Size

- Estimated S, actual S.
