# Outcome: mdx-layers-directive

## Built

Paths are under `packages/talata/src/`.

- `ext/directive/container.ts` (987 to 338 lines) is the collector of the contract. `:::name[label]{attributes}` opens a concrete leaf (`isContainer: false`, name `containerDirective`) that records its content lines as spans and calls `state.document(node, spans)` in `close`. The label is queued at the opening line with `queueLabel`.
  - A collector with no prefix to take (indent 0, no container between it and its document's root) shares its document's span `data` through `from` and `to`; any line that differs copies the run so far. A chain of n directives uses O(n) span memory.
  - The node end follows the contract: the fence line's end; `lineStarts[index + 1]` with `finalLineEnding`; else the end of the last content line or of the opener.
- `ext/directive/gaps.ts` (new): the old `closeEnds` and `continuesNext`, run through `Spans.onLine` on each content line where a quote prefix or footnote indent of a container around matched. See Deviations 1.
- `ext/directive/text.ts` and `labels.ts`: a text directive label goes to `state.queue.add(queue.pass + 1, labelStart, ...)` (`queueTextLabel`). Its children hold a marker text until the chunk runs; the transform `labelAlts` puts the label's text into the `alt` of images around it.
- Deleted: `scopes.ts`, `directiveScope`, `openDirectives`, `inLabel`, `willClose`, `closeInside`, `segmentKeeps`, `keepsFor`, `continuesAfter`, the `NextWalk`. `spread.ts` stays: without it 72 directive tests fail.
- `ext/frontmatter/matter.ts`: no `root` check; the closing fence look-ahead stops at `state.end`, and the "no closing fence from here" cache is used only while the document runs to the end of the text. `anywhere` now matches in directive content as in the reference.
- `ext/mdx/order.ts`: `flowError` throws at once (quiet lines still drop); `textError` throws at once until `throwWaiting` ran for the parse, then drops the error. `ext/mdx/inline.ts`: `record` goes through `textError`; after a dropped error the rest of the leaf or label is text (the `failed` set). So errors throw in the reference's order, except in the tree build: `build.ts` `labelNodes` parses image labels again without the `!`, and what it meets there is not an error of the reference (main dropped it as a waiting error after `throwWaiting`). `throwWaiting` stays for mdx-layers-flow to delete.

### Outside the owned paths (why)

All needed to keep main's trees; each is in `contracts/block-layers.change-request.md` (v2 to v3).

- `core/spans.ts`: optional `Spans.onLine(state, line, k)`, called by the span line source before the containers read each line.
- `core/blocks.ts`: the root of a nested document is a `TrackedContainer` (`blocks/blockquote.ts`); `readSpans` calls `onLine`; `BlockState.spans` (read-only) is the document's spans, undefined for the source.
- `core/chunks.ts`: `add` and `text` after `run` returned run the chunk at once, in the caller's context (talata/mdx parses image labels again in a transform).
- `blocks/blockquote.ts`: `consumeQuotePrefix` no longer reads the character at `end` on a blank line. In a nested document the empty line after a final line ending starts a real source line.
- `gfm/footnote.ts`: `setFootnoteIndent(state, lineStart)`, so a footnote indent around a directive counts in its content.
- `ext/mdx/flow.ts` `fail`: in a nested document the lazy line or end of file is placed from the spans (`contentSpans`, `contentStart`), because `prefixes.ts` cannot see the containers around the directive.
- `test/directive.test.ts`, `test/frontmatter.test.ts`: new cases (owned).
- `test/layers-contract.test.ts` (shared): the two order examples marked for mdx-layers-flow pass and run now; the frontmatter case and the two "lazy line at the end of directive content" cases move to a `fixed` list. Two cases stay pending for mdx-layers-flow (`>:c[{{\n>}` with acorn, the task list JSX space).

### Output changes against main (released 0.3), each matching the reference

Found by the 18,000,000-document comparison and the frontmatter tests; patch changeset `.changeset/directive-content-documents.md`.

- `:e[:b[[^1]]]\n:::y\n:::x\n[^1]:` (gfm) and `:e[:b[[a]]]\n:::y\n:::x\n[a]: u` (gfm off or on): main resolved the reference in the inner label to the definition two directives deep; the reference and the branch give text (the definition's pass runs after the label's start). Shrunk from seed 20261123, `[directive]` gfm, document 345266.
- `:::x\n---\na: b\n---\n:::` with `frontmatter({ anywhere: true })`: main gave a thematic break and a heading; the reference and the branch give `yaml`.

## Deviations

1. The nested documents need the prefixes of the containers around them. micromark's content events interleave with those prefixes, so a quote prefix or footnote indent on a content line is a token for the blocks inside (list walk back, lazy-line exits). The collector records on which content lines one matched (`parentQuoteLine(state.container) === line.index`, `footnoteIndentAt`) and what follows its last line (`NEXT_NONE`, `NEXT_LATER`, `NEXT_STARTS`, inherited at a document end); `onLine` sets `root.quoteLine` and the old `closeEnds` rules. Change request point 1.
2. The collector closes on its fence line, not the line after: `continue` returns false there and the rule `directiveContainerFence` (priority 1) starts an empty leaf that takes the line. The MDX re-read (`handOver`) checks that the directive closed at its fence. Change request point 2.
3. Collector end rules the contract does not have (change request point 3): an empty last content line before a lazy line, or before a document end that its containers do not go on over, is not content (the directive ends at that line after the prefixes, `finalLineEnding` true); an empty last line that a quote matched only through its end-of-file rule is not taken; an empty last line that arrived empty ends the directive at the line start.
4. `ChunkQueue.add` after `run`, the blockquote blank-line read and the image alt marker (change request points 4 to 6).

## Stubs left

- None. `order.ts` `throwWaiting`, `containerDepth` and the quiet lines stay for mdx-layers-flow.

## Gotchas

- `state.document` runs the content in a later pass, so the collector's node gets its content children only during `queue.run`. Transforms see the full tree; nothing in pass -1 may read a directive's children (the containers around use the node's position only).
- The MDX re-read still works through `readLineAt` with collectors: a directive opened by a re-read takes lines as fenced code does and closes at its fence through the fence leaf. `MDX_REREAD_COUNT=1000000` passes.
- In a nested document `line.index` is the source line index and `source.lineStarts[line.index]` is before the prefixes around. `continuesOverEnd` reads an empty line at the start of the next source line, which may hold text: read only up to `line.end`.
- `fail` in `flow.ts` and the collector (`documentSpans`) read `state.spans`. mdx-layers-flow can drop the `flow.ts` part with `onLazyLine`.
- `MDX_LAZY_COUNT` does not exist on this branch; the lazy cases are in the soft-asserted MDX test lists, which pass.
- The full suite at load above 7 flakes the timing tests (`directive-growth`, as noted by mdx-layers-core). They pass alone.
- Without `NODE_ENV=production` the reference's dev build asserts on some MDX inputs (`mdx-reference`, `mdx` fuzz failures, `mdx-reread` inputs). Same on main; run the suite with `NODE_ENV=production`.

## Proposed learnings

- A nested document is not its spans alone: the parent's prefix tokens between spans change the inner positions | `>:::b\n>+ >\n>\n>  ` item end 3:2, not 2:5 | packages/talata/src/ext/directive | yes (fix-directive-* suites cover it)

## Verification

Tree comparison: branch dist against main dist (3196f33), in one process, `JSON.stringify` equal, `MdxError` reason and place compared, fuzz generator `documentAt`.

- Corpus (142 files): 18 configs (none, frontmatter, math, directive, `[frontmatter, math, directive]`, mdx, `mdx({ acorn })`, all, all with acorn; gfm off and on): 0 differences.
- 1,000,000 random documents per config, 18,000,000 in all (seed 20261123): 1 difference, `[directive]` gfm document 345266, where the branch matches the reference and main does not (listed above).
- `pnpm fuzz --all`, 1,000,000 documents (seed 20261124, 8 chunks): 0 failures, 0 skipped.
- `pnpm fuzz --all --acorn`, 1,000,000 documents (seed 20261125): 0 failures, 0 skipped.
- `MDX_REREAD_COUNT=1000000` and `MDX_ACORN_TARGETED=1000000`: pass.
- Directive growth (`DIRECTIVE_GROWTH_OUT`, same load, branch then main): deep chains at 4x depth 13.4 to 15.7 (main 13.8 to 15.4), time at depth 1600 167 to 260 ms (main 204 to 297 ms); many chains 4.6 to 5.1 (main 3.8 to 4.7, all under the 6 bound); `mdx re-read` 3.2 (main 14.8), 1.1 ms at n 1600 (main 685 ms).
- Performance, perf-pass `bench.py`, interleaved, main against main for the noise, load 2.7 to 3.5. Main entry, 20 runs of a talata-only best-of-15 median per input:

  | Input     | main vs main | branch vs main | bench.py verdict |
  | --------- | ------------ | -------------- | ---------------- |
  | readmes   | -0.1%        | -12.9%         | better           |
  | fs.md     | +0.3%        | +0.8%          | within noise     |
  | changelog | +0.9%        | -3.0%          | within noise     |

  `[frontmatter, math, directive]` over the corpus, gfm on, 15 runs of best-of-15: main against main +0.1%, branch -1.7%, within noise. (Median-of-7 runs at a load spike were noisy: +3.4% and +5.4% with main against main at -3.5% and -10.6%.)

- Fast check with `NODE_ENV=production`: `pnpm --filter talata test` 6,947 passed, 2 skipped, 1 todo, at load 4 (at load 8 four `directive-growth` timing tests failed; they pass alone). `tsc --noEmit` clean. `oxlint`: errors only in `.github/scripts/smoke.mjs`, plus the two `max-depth` warnings in `src/ext/directive/`. `oxfmt --check` clean.

## Size

- Estimated L, actual L (the gap rules of Deviations 1 to 3 were not in the estimate).
