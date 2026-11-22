# Change request: block-layers v1 to v2

- From node: mdx-layers-core
- Status: accepted

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

Accepted 2026-11-23 by the orchestrator after a fresh review of mdx-layers-core. All three points are in `block-layers.md` v2.

# Change request: block-layers v2 to v3

- From node: mdx-layers-directive
- Status: proposed

## Problem

A nested document parsed from its spans alone does not give the reference's tree. With the contract as written, `fix-directive-nesting.test.ts`, `fix-directive-quote-end.test.ts` and `directive.test.ts` had about 160 failures that main passes, and some `[directive, mdx]` cases regressed.

1. micromark's events of the content interleave with the prefixes of the containers around the directive. mdast-util-from-markdown's list walk back and micromark's lazy-line exits then treat a quote prefix or a footnote indent on a content line as a token inside the content's blocks. `>:::b\n>+ >\n>\n>  `: the reference ends the inner quote at 3:1 and the item at 3:2; a nested parse alone ends both at 2:5. The contract's `Spans` has no place for it.
2. The collector "takes the closing fence and closes on the next one". The talata/mdx re-read (`flow.ts` `handOver`) checks that the directive closed at its fence line; with the next-line close, the line after the fence went to the block parser instead of the re-read (`[a]:\n{a\n:::x\n:::\n|a|\n-|-\n}x\n` with `[directive, mdx]`).
3. An empty content line followed by a lazy line, or by the end of a document whose containers do not go on over it, is not content: micromark checks `nonLazyLine` before it starts the chunk. The content ends after the line ending before it, and the directive at that line after the prefixes. An empty last line that a quote matched only through its end-of-file rule (`endOnlyLine`) is not given to the directive. An empty last line that arrived empty ends the directive at the line start (`> :::x\n>` at 2:1); one that the directive's own indent emptied ends it after the indent (`:::x\n` at 2:2).
4. `ChunkQueue.add` and `ChunkQueue.text` after `run` returned queue a chunk nothing runs. talata/mdx parses image labels again in a transform (`build.ts` `labelNodes`); a text directive label there was lost (`![:c[<>]]()` with `[directive, mdx]` must throw).
5. `continuesOverEnd` shows the empty line at `source.lineStarts[index + 1]`, which in a nested document is the start of a real source line. `consumeQuotePrefix` read the character at `nonBlank` even when `nonBlank === end`, so a quote went on over that empty line when the source line starts with `>`.
6. A text directive label parsed in a later pass leaves the `alt` of an image around it without the label's text.

## Proposed change

1. `Spans.onLine?(state, line, k)`: called by the span line source for each line before the containers read it. It may change only the nested document's open blocks (their tracked-container fields) and its footnote indent state (`setFootnoteIndent`), never `line` or the shared parse state. `BlockState.spans` (read-only) gives a rule its document's spans, undefined for the source. The root of a nested document is a `TrackedContainer` (`blocks/blockquote.ts`), so the blocks inside link to it. talata/directive's `onLine` sets `root.quoteLine` on lines where a quote prefix or footnote indent around matched (`parentQuoteLine(state.container) === line.index` at the collector), records a footnote indent there (`setFootnoteIndent` in `gfm/footnote.ts`), and sets `closeEnd` and `closedAt` on the open containers inside as the old `closeEnds` did (`ext/directive/gaps.ts`).
2. Collector: on its closing fence line `continue` returns false and a rule (`directiveContainerFence`, priority 1) starts an empty leaf that takes the line, so the directive closes on the fence line. Node end and `finalLineEnding` stay as written.
3. Collector end rules as in point 3 above.
4. `ChunkQueue.add` and `ChunkQueue.text` once `run` returned run the chunk at once, in the caller's context (inside the transform or parse that added it, with `queue.pass` still the last pass run).
5. `consumeQuotePrefix` returns false when `nonBlank === end`.
6. A text directive label holds a marker text until its chunk runs; a talata/directive transform puts the label's text in the alts.

## Affected nodes

- mdx-layers-flow: talata/mdx `flow.ts` `fail` now places a lazy line or end of file in a nested document from its spans (`contentStart`), because `prefixes.ts` cannot see the containers around the directive. mdx-layers-flow replaces this with `onLazyLine`. The re-read keeps working through the fence leaf of point 2.
- mdx-layers-cleanup or mdx-layers-flow: no change; `onLine` and the tracked nested root stay.

## Workaround in place

All six points are on `refactor/mdx-layers-directive`, in `src/core/spans.ts`, `src/core/blocks.ts`, `src/core/chunks.ts`, `src/blocks/blockquote.ts`, `src/gfm/footnote.ts`, `src/ext/mdx/flow.ts` and `src/ext/directive/`.
