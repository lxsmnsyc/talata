# Change request: block-layers v1 to v2

- From node: mdx-layers-core
- Status: open

## Problem

Three points of the contract do not hold with the code as it is.

1. `ChunkQueue.text`: "Empty `ranges` (v5 scope hooks of talata/directive) take the start of the chunk added before them in that pass". Text chunks do not always arrive sorted. A container directive queues its label from `start`, and the paragraph it interrupts closes after that, in `attach`. The queue then gets label (start L), paragraph (start P < L), scope hook. With the hook keyed to the chunk before it (P), the sort puts the label after the hook, and the label sees the scope of the directive's content. `[directive]`, gfm off, fuzz seed 20261123 document 3882 (`... - ... \n  :::\ta[\]tab [foo]]\n ... \n-    [foo]: x ...`): the label gives a `linkReference` where main and the reference give text. The same arrival order happens in design D, where the collector queues its label at the opening line too.
2. `isLastLine(line)` returns `line.last || line.endsContent`. talata/mdx (`flow.ts`, `reread.ts`) makes lines with `createLine` and never sets `last`, so it would lose every last line until mdx-layers-flow. A line that ends the text is the last line of any document (no span ends after it), so the old test is never wrong.

3. `BlockState.mark`: "The paragraph or interruptible leaf at the tip, the one `attach` would close, comes off the stack without closing". On a lazy line that holds a GFM table too, and keeps the containers that did not match open for it. micromark keeps the containers of a lazy line open only for a lazy paragraph (its content is still open across the line start). With a probe rule, gfm on: `> | a |\n> | - |\n@1\n> x` gave blockquote(table, paragraph "@1\nx"); it must give blockquote(table), paragraph "@1\n> x". Reference evidence: `> | a |\n> | - |\n<a\n> b>c` with `[mdx]` has the tag at 3:1-4:2, outside the quote.

## Proposed change

1. In `ChunkQueue.text`: "Empty `ranges` take the highest start added before them in that pass, or -1." A hook then runs after every chunk added before it. It still sorts before later chunks with higher starts, and `describeQueue` passes unchanged. Also: "Text chunks arrive sorted except a label queued from `start` before the paragraph it interrupts closes; the sort fixes that."
2. `isLastLine(line)` returns `line.last || line.endsContent || line.end === line.text.length` until mdx-layers-flow removes the `createLine` users; then `line.last || line.end === line.text.length` or `line.last` alone.

3. In `BlockState.mark`: "The lazy paragraph, or an interruptible leaf that matched the line, comes off the stack without closing ("held")." A paragraph at the tip that matched the line is held too, as before. In code: `state.paragraph === tip || (state.tip === tip && tip.interruptible)`.

## Affected nodes

- mdx-layers-directive: its collector queues the label at the opening line; the sort orders it after the interrupted paragraph. Once `scopes.ts` goes, no empty-range chunk is left.
- mdx-layers-flow: a JSX flow tag or expression after a table on a lazy line closes the table and its containers first (point 3). It may drop the third test of `isLastLine` when no extension line comes from `createLine` without `last`.

## Workaround in place

The three changes are in `src/core/chunks.ts`, `src/core/line.ts` and `src/core/blocks.ts` (`mark`) on `refactor/mdx-layers-core`. Tree comparison against main, 1,000,000 documents per extension set with gfm off and on: no difference.

## Decision
