# Outcome: differential-fuzz

## Built

All paths are under `packages/talata/test/fuzz/`.

- Command: `pnpm --filter talata fuzz --count N [--seed S] [--start I] [--no-gfm] [--all] [--max-failures K] [--shrink-ms MS] [--no-save] [--no-corpus]` (script `fuzz` in `packages/talata/package.json`, runs `node test/fuzz/cli.ts`; needs Node 22.15+ like `test/diff.ts`). `--no-corpus` uses spec examples only as mutation seeds. It prints the seed, minimized failures, a replay line with every option that changes generation or comparison (`--all`, `--no-gfm`, `--no-corpus`) and a summary (documents, compared, skipped by reason, failures, seconds). Exit 0 with no failure, 1 on a difference or a talata throw, 2 on bad arguments. Document I of seed S is rebuilt by `--seed S --start I --count 1`.
- `features.ts`: `Features` flags and `supported`, the features talata handles now (atx, thematicBreak on; everything else off). `allFeatures()` is what `--all` uses.
- `check.ts`: `check(value, gfm, features)` returns equal, skip, throw or diff. Talata runs first and a throw is always a failure. A document is skipped when the reference threw, or when the reference tree has a node type whose feature is off (an `html` node needs `html` at block level and `inline` under a phrasing parent; including setext headings, literal autolinks, task list items, and any `\` or `&` while `inline` is off). Differences come from `firstDiff` and `describeDiff`.
- `generate.ts`: a grammar of block constructs (paragraphs, ATX and setext headings, thematic breaks, indented and fenced code, HTML blocks, definitions, tables, footnote definitions, block quotes and lists with nesting, lazy lines, task items) and inline atoms (emphasis, code spans, links, images, references, autolinks, raw HTML, entities, escapes, strikethrough, literal autolinks), with random indentation, tabs, CRLF/CR/mixed line endings, BOM and NUL. Only the features that are on are generated. `generatePathological` makes deep nesting and long runs of `>`, `*`, `[`, backticks, `<`, `_`, `\` and others.
- `mutate.ts`: `mutate` (delete, duplicate, insert token, replace, move) and `sliceLines` for big files. Seeds are the CommonMark spec examples plus the corpus files when downloaded.
- `shrink.ts`: removes lines, then characters, in halving chunks, until nothing more goes or the time budget ends (5 s by default).
- `run.ts`: `runFuzz`, `documentAt`. About 3% pathological (`pathological: false` turns them off), 52% grammar, 25% grammar then mutation, 20% mutation of seeds.
- Fixtures: a failure is saved to `fuzz/fixtures/<hash>[-nogfm][-all].json` (`input`, `gfm`, `all`, `kind`, `seed`, `index`) unless `--no-save`. `fuzz.test.ts` replays every fixture with its stored options and all features (a fixture whose feature is still off is an expected failure, so it stays visible), runs 500 documents with a fixed seed, spec-example seeds and no pathological documents (timeout 60 s), checks that `check` reports a changed value and a position-only change, and tests the generator, mutator and shrinker.

## Deviations

- Added the `fuzz` script to `packages/talata/package.json`, outside the owned paths.
- Added `fixtures/.gitkeep` so the folder exists.

## Stubs left

- `supported` in `features.ts` lists only ATX headings, thematic breaks, paragraphs and text. Each node that lands a feature sets its flag to true in the same branch (blocks-container: blockquote, list, taskList; blocks-leaf: setext, code, html, definition; inline-core: inline; the GFM nodes: table, strikethrough, autolinkLiteral, footnote). If a node forgets, the fuzzer keeps skipping that feature, which hides bugs instead of raising false alarms.
- The 1,000,000-document run is not done. Run it once after gfm-green with every flag on: `pnpm --filter talata fuzz --count 1000000` (about 10 to 15 minutes at the speed the reviewer measured, 11 to 20 s per 20,000 documents on the shared machine, one process).
- Corpus mutation was not exercised here because the corpus is not downloaded in this worktree.

## Gotchas

- Until a flag is on, every document with that feature is skipped, so a green run only covers the supported part. The summary shows the skip counts by reason.
- `--all` makes talata differ on almost every document while the parser is partial.
- The support filter uses the reference tree, and it checks only node types plus the heading, link and task-item cases above. A feature whose output has the same node types as another (for example text that depends on escapes) is guarded by the `inline` flag through the `\` and `&` check.
- The reference parser is slow on long `[`, `![` and `*` runs; pathological sizes stop at about 1000 repeats to keep runs fast.
- `fuzz.test.ts` fixes seed 1 for the smoke run. When a node turns a flag on and the parser is wrong, that test fails in the node's own branch, which is intended.
- The CLI imports its modules dynamically after registering the resolve hook, as `test/diff.ts` does. Keep `src/` free of TypeScript-only runtime syntax.

## Proposed learnings

- Turn on the matching `supported` flag in `test/fuzz/features.ts` in the same branch that adds a feature | otherwise the fuzzer skips the feature | packages/talata/test/fuzz | no
- Keep fuzz inputs reproducible from a seed and a document index | a failure can then be replayed without saving the input | packages/talata/test/fuzz | yes (the determinism test)

## Verification

- `pnpm --filter talata test`: 6 files passed, 2 skipped; 131 passed, 1988 skipped. About 1.2 s.
- `npx tsc --noEmit -p packages/talata`: no errors. `npx oxlint`: clean. `npx oxfmt --check packages/talata/test/fuzz`: clean.
- `pnpm --filter talata fuzz --count 30000 --seed 5`: 19,900 compared, 10,100 skipped, 0 failures, 9.5 s. Other seeds, 20,000 documents each: 0 failures, about 7 s.
- `--all` run: failures found, minimized (`-`, `    b`, `www.`) and saved; fixtures removed afterward.
- A false difference found while building (`#######\n-` is setext) was fixed in the filter.

## Size

- Estimated M, actual M.
