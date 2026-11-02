# Outcome: core-hooks-2

## Built

Three hooks in `packages/talata/src/`. The v3 interface text is in `roadmaps/v2/contracts/extension.change-request.md`; `extension.md` is not edited.

1. `OpenBlock.willClose?(state: BlockState, keepsLineEnding: boolean): void`, declared in `core/blocks.ts`, called from `BlockParser.attach`.
   - When it runs: when `attach` adds a container with `startsContainer !== false` (block quote, list item, footnote definition). `startsContainer: false` blocks (the directive) do not trigger it.
   - What it is called on: each open block above `state.containerIndex` (the blocks `attach` is about to close), innermost first, before any of them closes. `keepsLineEnding` is always true, the value the parser would use.
   - What to do in it: close the blocks inside with your own answer, `state.closeOpenBlocks(state.getDepth(this), { keepsLineEnding })`. Pass `getDepth(this)` or less. The rest closes as before, with the parser's value for blocks you left open.
   - It does not run on lazy lines, blank lines or when a block closes for another reason. Use `continue` for those.
   - The name is not `closing`: fenced code and math flow have a boolean field `closing`.
2. `BlockState.getBlock(depth: number): OpenBlock | undefined`, `core/blocks.ts`. `stack[depth]`; 0 is the document; undefined out of range. Read only, the counterpart of `getDepth`.
3. `BlockState.endContent(block: OpenBlock, line: Line): void`, `core/blocks.ts`, called from a container's `continue` to say `line` is the last line of its content.
   - `Line.endsContent: number` (`core/line.ts`) is the index of the line on which `endContent` was last called, -1 at start. Read it only through `isLastLine(line)` (`core/line.ts`): `line.end === line.text.length || line.endsContent === line.index`.
   - Readers of `isLastLine` now: `isEmptyLastLine` (`blocks/code-indented.ts`, used by fenced code, HTML, math flow and extension leaves), the block quote's end-only rule (`blocks/blockquote.ts`, which also needs the quote line of the block around it, so a container is `TrackedContainer` with `quoteLine`), `keepsLazyContainers` in `processLine`, and `matchedEnd` of list items and footnote definitions. `matchedEnd` is now the end offset of the last line the block matched when that line was a last line, else -1 (it was a boolean and the item then ended at `text.length`).
   - Next line: if the block passed to `endContent` is not matched on the following line (it is deeper than the last matched block, or closed), `state.unmatched` is false for that line. A table inside then does not take the line as a lazy body row. This also covers indented code and task items.
   - Call it on every line that is the last of the content, before the blocks inside continue (the container's `continue` runs first, so it is in time). It is not reset: a call on one line does not affect another line.

Tests: `test/core-hooks-2.test.ts` (13 tests) with a test-only `:::x` container (no closing fence; content goes on as long as the containers around match, optional `willClose` and `endContent` behavior). Inputs from the change request: `- :::a\n  > ```\n  > b\n> c\n` (hook 1), `>:::9\n>>$$\n>>\n` and `>:::\t\n>- ;\n><a f="">\n` (hook 3; math with the math extension), a table case (`> :::x\n> | a |\n> | - |\nb\n| - |\n`, reference gives a table `b`), and list item `matchedEnd`. Each test runs a control rule without the hook call and expects a different tree. Expected trees were checked against `micromark-extension-directive` 4.0.0 with `mdast-util-directive` 3.1.1.

## Result

Not an experiment node. Hook 1 choice, measured with the A/B below:

- Option A, `OpenBlock.willClose` called from `attach`: chosen. Runs only on container starts and walks only the blocks `attach` closes. Branch against main, medians over 3 runs of 150 rounds, GFM on: readmes +2.27%, node fs.md +1.04%, CHANGELOG_V22 +2.58%, vite-config +2.08%. The main-against-main control in the same process: +0.37%, +0.34%, +0.75%, -0.66% (run medians). The rise is the sum of the three hooks, not `willClose` alone. Size cost of `willClose` about 30 bytes gzip.
- Option B, `BlockState.willStartContainer(line)`: not built, not measured. It needs a trial start of the container rules without side effects (list items call `openContainer`; rules move `line`), and an extension would call it on each line it does not match. That is a rule run per unmatched line in the hot path.

An earlier build of the same hooks (boolean `Line.endsContent`, a `line` argument in `willClose`) measured +0.6, +1.4, +0.5, +0.8% and 33229 bytes gzip, over the size limit; the final build cut 124 bytes and costs about 1.5 points of speed more.

A/B detail (final build; `uptime` load averages 1, 5, 15 min):

| run | before | after |
| --- | --- | --- |
| 1 | 3.47 4.80 4.88 | 4.43 5.57 5.25 |
| 2 | 4.43 5.57 5.25 | 3.14 5.36 5.53 |
| 3 | 3.14 5.36 5.53 | 4.73 5.26 5.43 |

The machine was never quiet (other sessions running), so single runs vary by up to 3.6% on the readmes (run 2); medians are below 3%. talata is 18.9x to 23.4x faster than "mdast + gfm" in every run.

## Deviations

- `willClose` has no `line` argument and `endContent` takes the line, differing from the brief's `closing?(state, line, keepsLineEnding)` proposal. A parser field for the line cost bytes against the size limit.
- `Line.endsContent` is a number, not a boolean, for the same reason (no per-line reset).
- Touched outside the owned globs: none. `src/blocks/**`, `src/core/**`, `src/gfm/**` only, plus `test/core-hooks-2.test.ts`.
- No changeset: internal refactor, tree output unchanged, extension interface not public.

## Stubs left

- None.

## Gotchas

- Main entry gzip is 33105 bytes (limit 33112): ext-directive and later nodes have 7 bytes of margin in the main entry. Any new core code must be paid for with cuts elsewhere or the limit raised by the orchestrator.
- `willClose` runs for every block above the container, so a directive nested in a directive is called too, innermost first. The outer one decides its `keepsLineEnding` from the containers between it and the outermost closing directive; it can ask `getBlock` for the blocks above it.
- `endContent` memory is one slot: a second call on a later line replaces the block. Two nested containers both ending their content on the same line (directive in directive) call it in order, outer first (continue order), so the memory holds the inner one. The next-line check then uses the inner block only. ext-directive must check this on nested directives, or call `endContent` only from the outermost directive that ends on the line.
- The reference's list end in a directive differs from the test rule's (the directive tracks list ends with `closedAt`); core does not know the directive.
- `frontmatter.test.ts` "stay linear with anywhere" is a timing test that fails now and then under load.
- Task list items (`state.unmatched` in `gfm/task-list.ts`) see `unmatched` false on the line after `endContent` too; no test covers it.

## Proposed learnings

- A hook that only an extension uses costs gzip bytes in the main entry; check `pnpm --filter benchmark size` after each core change | the limit is 33112 and the margin is single digits | packages/talata/src/core | yes, `bundle-size.test.ts` and the size script
- Read "last line" through `isLastLine(line)`, not `line.end === line.text.length` | containers can end their content before the end of the text | packages/talata/src | yes, a grep for `text.length` in `src/blocks`, `src/gfm`

## Verification

- Fast check: `pnpm --filter talata test` (5813 tests), `npx tsc --noEmit -p .`, `npx oxlint` (only `.github/scripts/smoke.mjs` errors, known), `npx oxfmt --check`: pass.
- `pnpm fuzz --count 1000000 --seed 20261103 --all --no-save` (packages/talata): 1000000 documents, 1000000 compared, 0 skipped, 0 failures, 766 s.
- Full check: fast check above, then `pnpm --filter benchmark interleaved` (talata 16.6x readmes, 17.6x fs.md, 19.2x CHANGELOG faster than "mdast + gfm", load 3 to 5) and `size` (33105 bytes): pass. `pnpm --filter benchmark corpus` was not re-run (it downloads); the corpus was copied from the main checkout.
- `pnpm --filter benchmark size`: main entry 33105 bytes gzip (main 33022, limit 33112).

## Size

- Estimated M, actual M. The size limit forced a second pass on the representation of hook 3.
