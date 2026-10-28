# Outcome: harness

## Built

All paths are under `packages/talata/test/` unless noted.

- `parsers.ts`: `READY` is replaced by `ready`, all flags false: `ready.commonmark`, `ready.corpus`, `ready.gfm.{table, strikethrough, autolinkLiteral, taskList, footnote}`. New exports: `gfmExamples`, `footnoteInputs`, `corpusFiles()`, type `GfmFeature`, type `GfmExample`.
- `fixtures/gfm-spec.json`: 24 examples from the extension sections of the cmark-gfm `test/spec.txt` (tables, task list items, strikethrough, autolinks extension, disallowed raw HTML). Each has `number`, `section`, `feature`, `markdown`, `html`. The file records the source URL and license (CC-BY-SA 4.0). `fixtures/extract-gfm-spec.mjs <spec.txt>` rebuilds it.
- `gfm.test.ts`: reference sanity checks (always run), then one talata group per feature, gated by `ready.gfm.<feature>`. The "disallowed raw HTML" examples (feature `tagfilter`) are gated by `ready.commonmark`. Footnotes have no spec examples, so `footnoteInputs` holds 8 hand-written inputs, gated by `ready.gfm.footnote`.
- `corpus.test.ts`: every `.md` file under `benchmark/corpus/{readmes,large}` parsed with gfm. A reference sanity test always runs; the per-file talata tests run when `ready.corpus` is on. Both skip when the corpus is not downloaded.
- `tree-diff.ts`: `firstDiff(expected, actual)`, `describeDiff(diff)`. Used by all talata comparison tests, so a failure prints the path and both values instead of a whole-tree diff. Missing keys and keys with value `undefined` are treated alike (same as `toEqual`).
- `diff.ts`: CLI. `node test/diff.ts <file.md> [--no-gfm]` from `packages/talata` prints `equal`, or the path and both values of the first differing node, or `talata threw: <message>`. Exit 0 equal, 1 differ or throw, 2 bad arguments. It registers a resolve hook (`module.registerHooks`) so Node can load the extensionless `.ts` imports in `src/`. Needs Node 22.15+ (Node 26 here). No `package.json` script was added.
- `equivalence.test.ts` and `spec.test.ts` use `ready.commonmark`; equivalence now compares through `firstDiff`.
- `benchmark/scripts/talata.js`: `loadTalata()` imports `talata`, probes `fromMarkdown` once, and returns undefined with a note on stderr if the import or the call throws.
- `benchmark/scripts/bench.js` adds pipeline `talata (gfm)`. `benchmark/scripts/interleaved.js` adds pipeline `talata` and prints "talata is Nx faster than mdast + gfm" per input. Both skip talata while `loadTalata()` returns undefined.

## Deviations

- None outside the owned paths. The cmark-gfm spec has no footnote section, so footnote rows are hand-written inputs, not spec examples.
- The `tagfilter` examples are not in the requested flag list; they ride on `ready.commonmark`.

## Stubs left

- All readiness flags are false. Nodes turn them on: the block and inline nodes and spec-green set `ready.commonmark`; spec-green or perf-pass set `ready.corpus`; each GFM node sets its own `ready.gfm.*` flag.

## Gotchas

- `benchmark` imports `talata` from its built `dist/`. Run `pnpm --filter talata build` before `pnpm --filter benchmark interleaved`, or talata is skipped with a note ("Cannot find module .../dist/index.js").
- `benchmark/corpus` is git-ignored and per worktree. A fresh worktree needs `pnpm --filter benchmark corpus` (the READMEs are copied from `node_modules`, so the set depends on the install). Corpus tests skip when it is missing.
- `diff.ts` runs `src/` through Node's type stripping. Avoid TypeScript-only runtime syntax in `src/` (enums, parameter properties, namespaces), or the CLI cannot load it.
- `fromMarkdown('# probe...')` in `loadTalata()` uses a table, so a talata with only block rules skips itself from the benchmark.

## Proposed learnings

- Compare trees with `firstDiff` and assert `describeDiff(...)` is undefined, not `toEqual` on whole trees | a failure then names the node path | packages/talata/test | no
- Keep `src/` free of TypeScript-only runtime syntax | `test/diff.ts` loads `src/` with Node type stripping | packages/talata/src | yes

## Verification

- `pnpm --filter talata test`: 3 files passed, 1 skipped; 5 tests passed, 2130 skipped (talata groups, flags off).
- `(cd packages/talata && npx tsc --noEmit -p .)`: clean.
- `npx oxlint`: clean. `npx oxfmt --check packages/talata/test benchmark/scripts`: clean.
- `node test/diff.ts` on a small file: prints "talata threw: ..." with the stub; with a temporary stub that edited one text value it printed `root.children[1].children[1].children[0].value`, reference "a", talata "b" (stub reverted).
- `loadTalata()` returns undefined with a note when `dist` is missing. The interleaved benchmark was not run.

## Size

- Estimated M, actual M.
