# Outcome: core-hooks-2

## Built

Three hooks in `packages/talata/src/`. The v3 interface text is in `roadmaps/v2/contracts/extension.change-request.md`; `extension.md` is not edited.

1. `OpenBlock.willClose?(state: BlockState, line: Line, keepsLineEnding: boolean): void`, declared in `core/blocks.ts`, called from `BlockParser.attach`.
   - When it runs: when `attach` adds a container with `startsContainer !== false` (block quote, list item, footnote definition). `startsContainer: false` blocks (the directive) do not trigger it.
   - What it is called on: each open block above `state.containerIndex` (the blocks `attach` is about to close), innermost first, before any of them closes. `keepsLineEnding` is always true, the value the parser would use.
   - What to do in it: close the blocks inside with your own answer, `state.closeOpenBlocks(state.getDepth(this), { keepsLineEnding })`. Pass `getDepth(this)` or less. The rest closes as before, with the parser's value for blocks you left open.
   - It does not run on lazy lines, blank lines or when a block closes for another reason. Use `continue` for those.
   - The name is not `closing`: fenced code and math flow have a boolean field `closing`.
2. `BlockState.getBlock(depth: number): OpenBlock | undefined`, `core/blocks.ts`. `stack[depth]`; 0 is the document; undefined out of range. Read only, the counterpart of `getDepth`.
3. `BlockState.endContent(block: OpenBlock): void`, `core/blocks.ts`, called from a container's `continue` to say the current line is the last line of its content.
   - `Line.endsContent: boolean` (`core/line.ts`) is true after `endContent` on this line and reset for each line. Read it through `isLastLine(line)` (`core/line.ts`): `line.end === line.text.length || line.endsContent`.
   - Readers of `isLastLine` now: `isEmptyLastLine` (`blocks/code-indented.ts`, used by fenced code, HTML, math flow and extension leaves), the block quote's end-only rule (`blocks/blockquote.ts`, which also needs the quote line of the block around it, so a container is `TrackedContainer` with `quoteLine`), `keepsLazyContainers` in `processLine`, and `matchedEnd` of list items and footnote definitions. `matchedEnd` is now the end offset of the last line the block matched when that line was a last line, else -1 (it was a boolean and the item then ended at `text.length`).
   - Next line: if the block passed to `endContent` is not matched on the following line (it is deeper than the last matched block), `state.unmatched` is false for that line. A table inside then does not take the line as a lazy body row. This also covers indented code and task items.
   - Call it on every line that is the last of the content, before the blocks inside continue (the container's `continue` runs first, so it is in time). It is not reset: a call on one line does not affect another line.

Tests: `test/core-hooks-2.test.ts` (13 tests) with a test-only `:::x` container (no closing fence; content goes on as long as the containers around match, optional `willClose` and `endContent` behavior). Inputs from the change request: `- :::a\n  > ```\n  > b\n> c\n` (hook 1), `>:::9\n>>$$\n>>\n` and `>:::\t\n>- ;\n><a f="">\n` (hook 3; math with the math extension), a table case (`> :::x\n> | a |\n> | - |\nb\n| - |\n`, reference gives a table `b`), and list item `matchedEnd`. Each test runs a control rule without the hook call and expects a different tree. Expected trees were checked against `micromark-extension-directive` 4.0.0 with `mdast-util-directive` 3.1.1.

## Result

Not an experiment node. Hook 1 choice, measured with the A/B below:

- Option A, `OpenBlock.willClose` called from `attach`: chosen. Runs only on container starts and walks only the blocks `attach` closes. Final build against main, medians over 3 runs of 150 rounds, GFM on: readmes +1.05%, node fs.md +2.39%, CHANGELOG_V22 +0.45%, vite-config +1.30%. The main-against-main control in the same process: +0.23%, +0.40%, +0.75%, +0.62%. The rise is the sum of the three hooks, not `willClose` alone.
- Option B, `BlockState.willStartContainer(line)`: not built, not measured. It needs a trial start of the container rules without side effects (list items call `openContainer`; rules move `line`), and an extension would call it on each line it does not match. That is a rule run per unmatched line in the hot path.

Two builds were compared in the same process with main and the control (details in `log.md`): build 1 (boolean `Line.endsContent`, `line` argument in `willClose`; kept) and build 2 (size-cut: `Line.endsContent` as a line index, no `line` argument; dropped). Build 2 medians: readmes +3.05%, fs.md +0.83%, CHANGELOG +0.93%, vite-config +3.23%. The user dropped the size gate, so the build that is faster on average was kept.

A/B detail (final build; `uptime` load averages 1, 5, 15 min):

| run | before         | after          |
| --- | -------------- | -------------- |
| 1   | 3.65 6.34 6.79 | 5.24 7.08 7.40 |
| 2   | 5.24 7.08 7.40 | 4.06 5.08 6.32 |
| 3   | 4.06 5.08 6.32 | 3.45 3.75 5.32 |

The machine was never quiet (other sessions running; load 3 to 7), so single runs vary by up to 3.8% (the control too: +2.6%). Medians of build 1 are below 3%. talata is 16.7x to 24.4x faster than "mdast + gfm" in every run.

## Deviations

- Files outside the owned globs: none. `src/blocks/**`, `src/core/**`, `src/gfm/**` only, plus `test/core-hooks-2.test.ts`.
- No changeset: internal refactor, tree output unchanged, extension interface not public.
- `matchedEnd` of list items and footnote definitions changed from a boolean to an end offset (-1 for none).

## Stubs left

- None.

## Gotchas

- Main entry gzip is 33141 bytes, 29 over the 33112 in the brief. The user dropped the size gate; the test that keeps extension code out of the main entry stays.
- `willClose` runs for every block above the container, so a directive nested in a directive is called too, innermost first. The outer one decides its `keepsLineEnding` from the containers between it and the outermost closing directive; it can ask `getBlock` for the blocks above it.
- `endContent` memory is one slot: a second call on a later line replaces the block. Two nested containers both ending their content on the same line (directive in directive) call it in order, outer first (continue order), so the memory holds the inner one. The next-line check then uses the inner block only. ext-directive must check this on nested directives, or call `endContent` only from the outermost directive that ends on the line.
- The reference's list end in a directive differs from the test rule's (the directive tracks list ends with `closedAt`); core does not know the directive.
- `frontmatter.test.ts` "stay linear with anywhere" is a timing test that fails now and then under load.
- Task list items (`state.unmatched` in `gfm/task-list.ts`) see `unmatched` false on the line after `endContent` too; no test covers it.

## Proposed learnings

- Read "last line" through `isLastLine(line)`, not `line.end === line.text.length` | containers can end their content before the end of the text | packages/talata/src | yes, a grep for `text.length` in `src/blocks`, `src/gfm`

## Verification

- Fast check: `pnpm --filter talata test` (5813 tests with `benchmark/corpus` present or copied in; 4828 without it, because the corpus tests are skipped), `npx tsc --noEmit -p .`, `npx oxlint` (only `.github/scripts/smoke.mjs` errors, known), `npx oxfmt --check`: pass.
- `pnpm fuzz --count 1000000 --seed 20261103 --all --no-save` (packages/talata), run on build 2: 1000000 documents, 0 failures, 766 s. After the review round (build 1, no change in hook logic beyond the size cuts), `--count 100000 --seed 20261104 --all --no-save`: 100000 compared, 0 failures, 54 s.
- Full check: fast check above, then `pnpm --filter benchmark interleaved` (talata 16.6x readmes, 17.6x fs.md, 19.2x CHANGELOG faster than "mdast + gfm", load 3 to 5) and `size` (33141 bytes, informational): pass. `pnpm --filter benchmark corpus` was not re-run (it downloads); the corpus was copied from the main checkout.
- `pnpm --filter benchmark size`: main entry 33141 bytes gzip (main 33022; informational).

## Size

- Estimated M, actual M. The size limit forced a second pass on the representation of hook 3.
