# Outcome: ext-math

## Built

- `packages/talata/src/ext/math/flow.ts` (rule `mathFlow`, priority 350), `packages/talata/src/ext/math/text.ts` (rule `mathText`, priority 100, takes the `singleDollarTextMath` flag), registered in `packages/talata/src/math.ts`.
- `packages/talata/test/math.test.ts`: 35 inputs from the reference tests, 90 more (containers, footnotes, GFM tables, CRLF, tabs, padding), `singleDollarTextMath: false` cases, and the benchmark corpus, each with and without GFM, 292 tests.
- `packages/talata/test/fuzz/ext-math.ts`: `ready: true`, with `block` and `inline` generators.

## Result

Not an experiment node.

## Deviations

- Priorities are the contract values (flow 350, text 100). No change.
- The main entry grew by 49 bytes gzip (32826 against 32777), 7 bytes minified. Within the 0.2 KB tolerance of GOAL.md, not "unchanged". Cause: chunk splitting once math imports core helpers.
- `test/ext-api.test.ts` ("stub extensions give the same tree as none") and `test/ext-api-bundle.test.ts` ("talata/math does not bundle the parser", under 5000 bytes) fail now. They assume the stub. Not edited, they are not owned by this node.

## Stubs left

- None for math.

## Gotchas

- Math text is a code span with another character; a fix in `code-span.ts` probably applies to `text.ts` too.
- `oxlint` reports errors in `.github/scripts/smoke.mjs` on this base. Not from this node.

## Proposed learnings

- Extension rules that copy a core rule should be re-checked when the core rule changes | the copy does not follow | packages/talata/src/ext | no

## Verification

- `pnpm fuzz --count 200000 --seed 8202 --no-save`: 200000 documents, 200000 compared, 0 skipped, 0 failures.
- `pnpm --filter talata test`: 5290 passed, 2 failed (the two stub tests above). `tsc --noEmit` clean. `oxfmt --check` clean. `oxlint`: only `.github/scripts/smoke.mjs` errors.

## Size

- Estimated M, actual M.
