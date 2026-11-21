# Outcome: fix-directive-list-indent

## Built

- `packages/talata/src/ext/directive/container.ts`, `walkTo`: a container directive now checks whether a container starts on the next line with `next.indent < next.indentLimit`, not `next.indent < 4`. With `mdx()`, micromark has no indented code and lifts the 3-column limit (`indentLimit` is Infinity, contract v4), so `    >` at the root starts a block quote. Before the fix, the outer directive took that line as lazy and ended its content one line early. The inner directive then lost its last line ending: it ended at 2:10 instead of 3:1.
- The bug shows only with `mdx` in the extensions. Without MDX, `indentLimit` is 4 and output does not change.
- Test: `packages/talata/test/directive-list-indent.test.ts`, 1665 inputs against the reference, with `[directive]`, `[directive, mdx]` and `[frontmatter, math, directive, mdx]`, gfm off and on. The inputs cover:
  - the brief's input;
  - six list markers and widths (`40.  `, `1. `, `1)    `, `- `, `*     `, `10. `);
  - every indent under the item's on the last line;
  - eight last lines: `>`, `> b`, `- b`, `1. b`, `[^a]: b`, `b`, empty, `:::`;
  - one to three nested directives, with and without a final line ending;
  - the same in a block quote, and with text in the inner directive.
- `.changeset/fix-directive-list-indent.md`: a patch for talata.

## Proof

- base, batch/v2 fd1dbbc: `cd packages/talata && npx vitest run test/directive-list-indent.test.ts`. The 4 runs with `mdx` fail, with 121 inputs (gfm off) and 151 (gfm on) different from the reference. The 2 runs without `mdx` pass. The brief's input: inner `containerDirective` 2:6-2:10 in talata, 2:6-3:1 in the reference.
- branch: the same command passes, 6 of 6.

## Deviations

- None. The brief describes the input as needing only `directive()`, but it differs only with `mdx` on: the fuzz ran with `--all`, which includes MDX.

## Stubs left

- None.

## Gotchas

- An extension check of the form "could a container or flow construct start at this indent" must use `line.indentLimit`, not 4. The literal 4 stays only for the directive's own fences and for the footnote continuation indent (contract v4).

## Proposed learnings

- Compare an indent with `line.indentLimit` wherever the rule asks whether a CommonMark construct could start | `walkTo` kept a literal 4, and MDX (no indented code) ended directive content one line early | packages/talata/src/ext | yes (run growth and fixture tests with `mdx` in the extensions)

## Verification

- Fast check, run alone, with the benchmark corpus linked in:
  - `pnpm --filter talata test`: 38 files and 6784 tests pass.
  - `npx tsc --noEmit -p .`: clean.
  - `npx oxlint`: only the known `smoke.mjs` errors and the two `max-depth` warnings.
  - `npx oxfmt --check`: clean.
- Fuzz, `pnpm fuzz --count 1000000 --all --no-save --seed 20261223`: 1,000,000 compared, 0 skipped, 0 failures (653.3 s).
- The original failure, `--seed 20261222 --start 244072 --count 1 --all`, now passes.

## Size

- Estimated S, actual S.

Landed as e52e314 on batch/v2. Changeset dropped by the orchestrator: the bug shows only with `talata/mdx`, which is unreleased.
