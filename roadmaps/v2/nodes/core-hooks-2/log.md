# Log: core-hooks-2

- Branch `refactor/core-hooks-2` reset onto `origin/main`. None of the three hooks existed.
- Hook 1 name: `OpenBlock.willClose`. `closing` clashes with a boolean field on fenced code and math flow, so the first run threw "closing is not a function".
- Hook 1 option A (`willClose` on open blocks, called from `attach`): runs only when the starting block is a container with `startsContainer !== false` and only walks the blocks above `containerIndex`. No cost on other lines. A/B cost: see outcome. Chosen.
- Hook 1 option B (`BlockState.willStartContainer(line)`): not built. It must try the container start rules on the line without side effects (list items call `openContainer`, rules move `line`), and a directive would call it on every line it does not match. That is a trial start per unmatched line in the hot path, so A is cheaper by design. I did not measure B.
- `willClose(state, keepsLineEnding)` has no `line` argument: a `this.line` field on the parser cost bytes, and the extension's `continue` had the line before. The size limit decided this (see below).
- Hook 2 `getBlock(depth)` is `stack[depth]`.
- Hook 3: `Line.endsContent` (number: the index of the line, -1 for none; a boolean needed a reset per line and a second field) read through `isLastLine(line)` by `isEmptyLastLine`, the quote end-only rule, `keepsLazyContainers`, list item and footnote `matchedEnd`. Set through `BlockState.endContent(block, line)`, not by writing the field, because the table case is about the next line: the core remembers line index and block, and on the next line, if that block is deeper than the matched one, `unmatched` is false. A plain field cannot say which block ended the content.
- Dead end: `matchedEnd` as a boolean made list items end at `text.length` (5:1) when `endsContent` was set. Reference ends the item at the line end (4:5). It is now an offset, -1 for none.
- Dead end: my first `checkContentEnd` cleared the memo on the same line it was set. It now waits for a later line.
- The quote end-only rule needs the container to look like a tracked container (`quoteLine`); the test rule has those fields.
- Expected trees in `test/core-hooks-2.test.ts` were checked against `micromark-extension-directive` 4.0.0 with `mdast-util-directive` 3.1.1 (installed in another worktree, run from a scratch script). Test-only rules do not track list ends like the directive, so one list end differs from the reference (2:5 against 3:1); the test keeps the value of the rule.
- Not tested: the task list `unmatched` use; the change reaches it through the same field.
- Changeset: none. Internal refactor, tree output unchanged, extension interface not public.
- Size: the first version put the main entry at 33229 bytes gzip (limit 33112; main 33022). Cuts that worked: `Line.endsContent` as a line index (no reset per line, no `contentEndsLine` field), no `this.line` field and no `line` in `willClose`, `isLastLine` helper shared by five readers, inline `keepsLineEnding` flag in `attach`, no clearing of the memo (the line index check is enough). Final 33105. The `willClose` loop alone costs about 30 bytes, the next-line `unmatched` check about 21.
- Tried and dropped: `getLastEnd(line)` helper (no gain); 0 as the "no end" sentinel for `matchedEnd` (no gain); a separate `checkContentEnd` and `notifyClosing` method (more bytes).
- Next node has 7 bytes of size margin.

## Review round (size gate dropped)

- Review item 2 (`unmatched` on the line after `endContent`): a block that closed gives depth -1, which does not change `unmatched`. That is right: when the block closed, the blocks inside it closed with it, so nothing is left that a lazy row could belong to. Docs fixed ("deeper than the last matched block"); no code change.
- Item 3: `contentEndsBlock` is checked for undefined before use, no non-null assertion (line 0 matched `index - 1`).
- Item 4: `tablesOf` renamed `getTableTypes`. Item 5: the 5813 test count needs `benchmark/corpus`; 4828 without it.
- The user dropped the size gate. Rebuilt build 1 (boolean `Line.endsContent`, reset per line in `run`, `line` argument in `willClose`, `this.line`, `contentEndsLine`) and compared it with build 2 (size-cut, committed in the first push) in one process with main and a main copy as control. 3 runs, 150 rounds, GFM on. Medians of the three runs, percent against main:

| file          | control | build 2 | build 1 |
| ------------- | ------- | ------- | ------- |
| readmes       | +0.23   | +3.05   | +1.05   |
| node fs.md    | +0.40   | +0.83   | +2.39   |
| CHANGELOG_V22 | +0.75   | +0.93   | +0.45   |
| vite-config   | +0.62   | +3.23   | +1.30   |

- Per run, build 2: readmes 4.26, 0.09, 3.05; fs 0.37, 0.83, 2.31; CHANGELOG 0.55, 0.93, 2.11; vite 3.00, 3.23, 3.89. Build 1: readmes -0.38, 1.05, 2.79; fs 1.01, 2.39, 3.80; CHANGELOG -0.32, 0.45, 2.51; vite 1.30, 1.21, 2.68. Control: readmes 0.23, -1.08, 2.48; fs -0.80, 0.40, 2.57; CHANGELOG -0.51, 0.75, 1.83; vite 0.24, 0.62, 2.08.
- `uptime` load averages (1, 5, 15 min) before and after: run 1 3.65 6.34 6.79 and 5.24 7.08 7.40; run 2 5.24 7.08 7.40 and 4.06 5.08 6.32; run 3 4.06 5.08 6.32 and 3.45 3.75 5.32. Run 3 was quieter and shows the control at +2%: the noise is about 2 to 3 points.
- Kept build 1: lower on 3 of 4 files, with the largest gap on readmes and vite-config. Size 33141 bytes gzip (informational; build 2 was 33105).
