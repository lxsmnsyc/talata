# Outcome: perf-pass

## Built

Branch `feat/perf-pass`. Paths are under `packages/talata/` unless noted.

- `failBracket` in `src/inline/link.ts` no longer splices `state.delimiters`. It sets the bracket's marker to `DEAD_BRACKET` (new constant, 0, in `src/core/inline.ts`) and leaves it in place.
  - `onlyEmphasis` in `src/inline/emphasis.ts` accepts the marker, so the linear emphasis path still runs.
  - `unbalanced` in `src/gfm/autolink-literal.ts` ignores a cached bracket whose marker is dead.
  - Timings for `'[*a '.repeat(n/8) + ' a*]'.repeat(n/8)`: 100 KB 660 ms before, 17 ms after; 800 KB 120 ms. Doubling the size doubles the time.
- New growth case `failed brackets under delimiters` in `test/inline.test.ts`.
- `benchmark/RESULTS.md`: before and after numbers with the load of each run, and the two optional changes that were not kept.

## Deviations

- The test hooks `emphasisPaths` and `strikethroughPaths` are not exported from the entry points, so they are not public API. They are still plain objects in the bundle, and the 20 `workSteps.count++` increments are still in the hot loops of the bundle. Removing them needs a build-time define in `tsdown.config.ts`, which is outside this node. Left to bundle-size.
- The growth test cannot detect the splice returning: there is no splice left to count in `workSteps`, so the count would not change. The brief asked to count splice lengths. I did not add an artificial count. The 800 KB timing in `benchmark/RESULTS.md` is the evidence. A wall-time assertion would be flaky.
- Incident: my first edits landed in the main checkout (wrong cd). The orchestrator reverted them (8002ef9). Details in `log.md`.

## Stubs left

- None.

## Gotchas

- A dead bracket stays in `state.delimiters`. Code that scans the stack for `[` or `![` must compare the marker, not just the identity of a cached delimiter.
- The benchmark's speed ratio moves by about 20 percent between runs on this machine with a second worker running (16.0x to 19.8x on the READMEs). Compare ratios only from runs with the same load.

## Proposed learnings

- Do not splice a shared stack from the middle in a rule that can run once per input character; mark the entry inert | a splice costs the length of the tail | packages/talata/src/inline | no

## Verification

- Acceptance, all on the final code:
  - [x] `pnpm --filter benchmark interleaved` meets the target on three runs: READMEs 15.96x (load 2.38), 19.77x (3.01), 18.91x (2.74); `node fs.md` 16.02x, 19.70x, 19.63x. Target 4x.
  - [x] The `failBracket` input grows linearly: 15.5, 16.9, 24.1, 61.4, 120.1 ms for 50, 100, 200, 400, 800 KB.
  - [x] `benchmark/RESULTS.md` has before and after numbers with the load of each run.
  - [x] `pnpm --filter talata fuzz --count 200000 --seed 4041 --max-failures 10`: 200000 documents, 200000 compared, 0 skipped, 0 failures, 121.4 s.
  - [x] Fast check: `pnpm --filter talata test` 4974 passed, `tsc --noEmit` clean, `npx oxlint` clean, `oxfmt` applied.
- The last code change after the fuzz run was removing a redundant `!` in `autolink-literal.ts` (lint); tests and benchmark run 3 came after it. The fuzz ran on the same logic.

## Size

- Estimated M, actual S. The two optional changes were measured and dropped (see `benchmark/RESULTS.md`).
