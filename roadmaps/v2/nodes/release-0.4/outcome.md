# Outcome: release-0.4

## Built

- `packages/talata/README.md`: an MDX section (usage, acorn and `acornOptions`, unified, the `remark-mdx` replacement, differences: no `data.estree`, `MdxError`, one known gap), a `talata/mdx` row in the extensions table, new speed and size tables, and the "not supported" bullet without MDX.
- `docs/migration.md`: an MDX section, the "what does not carry over" list updated.
- `README.md` (root): no change, the speedup range is still 17 to 21 times.
- Changesets: `mdx-subpath.md` and `mdx-acorn.md` (both minor) kept as they are.

## Deviations

- Acceptance 1 is not met: the fuzz found a difference (below). Not fixed, as the brief says.
- MDX code blocks in the migration guide are plain `js`, so `migration-examples.test.ts` does not run them.
- The speed table uses 192 files, 1.6 MB: `corpus` fetched more READMEs than before.

## Stubs left

- None.

## Gotchas

- Fuzz difference, seed 20261401, `--start 125133 --count 1 --all --acorn`: input `">:::b[[[]]]\n>>{\n>\n"`. The error is the same text, but the place differs: reference `3:1`, talata `3:2` ("Unexpected lazy line in expression in container ..."). A lazy-line error place with a quote and a container directive, the area the ext-mdx outcome calls the likeliest for new cases.
- Numbers may need a rerun after fix-mdx-directive-growth lands (`talata/mdx` size).
- Timing tests in `directive-growth` and `mdx-reread` fail under load above 8.

## Proposed learnings

- None.

## Verification

- Fast check: 7378 of 7381 tests pass with load up to 12 (3 timing tests in `directive-growth`), and 17 of 17 pass when run alone. tsc is clean, oxlint 0 errors (2 existing warnings), oxfmt clean.
- Fuzz: chunk `--start 0` 250,000 compared, 1 failure; chunk `--start 250000` 250,000 compared, 0 failures; the rest not run.
- Benchmarks at load 2.5 to 3.4: interleaved vs mdast + gfm 17.11x (READMEs), 18.28x (`fs.md`), 21.15x (`CHANGELOG_V22`). Size: main 94.8 KB, 33.4 KB gzip; `talata/mdx` 29.8 KB gzip.

## Size

- Estimated S, actual S.
