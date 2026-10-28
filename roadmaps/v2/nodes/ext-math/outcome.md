# Outcome: ext-math

## Built

- `packages/talata/src/ext/math/flow.ts` (rule `mathFlow`, priority 350), `packages/talata/src/ext/math/text.ts` (rule `mathText`, priority 100, takes the `singleDollarTextMath` flag), registered in `packages/talata/src/math.ts`.
- `packages/talata/test/math.test.ts`: 35 inputs from the reference tests, 90 more (containers, footnotes, GFM tables, CRLF, tabs, padding), `singleDollarTextMath: false` cases, and the benchmark corpus, each with and without GFM, 292 tests.
- `packages/talata/test/fuzz/ext-math.ts`: `ready: true`, with `block` and `inline` generators.

## Result

Not an experiment node.

## Deviations

- Priorities are the contract values (flow 350, text 100). No change.
- The main entry grew by 49 bytes gzip (32826 against 32777), 7 bytes minified. The limit is 0.5 KB over 0.1.1 (GOAL.md, changed 2026-10-28), so this is within it. Cause: chunk splitting once math imports core helpers.

## Stubs left

- None for math.

## Gotchas

- Math text is a code span with another character; a fix in `code-span.ts` probably applies to `text.ts` too.

## Proposed learnings

- Extension rules that copy a core rule should be re-checked when the core rule changes | the copy does not follow | packages/talata/src/ext | no
- `strip`, the closing-fence test and the exhausted cache in `src/ext/math/` are copies of core helpers. Export them from core and import them when core is next touched | the copies drift from the originals | packages/talata/src | no

## Verification

- `pnpm fuzz --count 200000 --seed 8202 --no-save`: 200000 documents, 200000 compared, 0 skipped, 0 failures.
- `pnpm --filter talata test`: 5291 passed after the rebase. `tsc --noEmit`, `oxlint` and `oxfmt --check` are clean (build first).

## Size

- Estimated M, actual M.
