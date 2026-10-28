# Outcome: core-skeleton

## Built

All paths are under `packages/talata/src/`. The final interface is written out in full in `roadmaps/v1/contracts/parser-core.change-request.md` (v2).

- `core/source.ts`: `createSource` (drops a leading BOM, replaces NUL with U+FFFD, computes `lineStarts`), `point(source, offset)` (binary search with a forward cache), `skipLineEnding`, and the `Position` and `Point` types (mdast does not re-export unist's).
- `core/line.ts`: the reused `Line` object and `measureLine`, `consumeColumns` (splits tabs), `advanceLine`, `skipBlank`.
- `core/state.ts`: `ParseOptions`, `DocumentState` (with `rules: Registry`), `createDocumentState`, `normalizeIdentifier` (no regex).
- `core/blocks.ts`: the `BlockState`, `BlockRule`, `OpenBlock`, `OpenParagraph` and `ParagraphPrefixRule` types, `isParagraph`, and `BlockParser`. It runs the CommonMark appendix algorithm: continue the open blocks, try block starts (with an index by first character), lazy paragraph continuation, close unmatched blocks, open a paragraph. It also has `takeParagraph` (runs prefix rules first) and `inline(node, ranges)`, which defers inline parsing until all blocks close.
- Gate review round, all in `core/blocks.ts` unless noted:
  - `splitParagraph(count)` takes the last lines of the open paragraph and closes the rest (table headers).
  - `OpenBlock.interruptible`: block rules run before `addLine` on a matched leaf (table bodies).
  - `OpenBlock.canContain` and `BlockState.openContainer` let a list item open its list in the same start, and close a list that cannot hold the new block. A container that consumed nothing stops the start loop, so it cannot loop forever.
  - `OpenParagraph.start` (in `blocks/paragraph.ts`) keeps the first content offset for setext headings after definitions.
  - The core saves and restores `start`, `visualColumn` and `partialTab` around each failed `start`.
- `core/inline.ts`: `InlineState`, `InlineRule` (optional `resolve(state, bottom)`), `Delimiter`, `parseInline(state, ranges)`, `resolveSpan(state, bottom)` and `nodeIndex(state, node)`. The scan loop calls rules only on trigger characters. A leaf ends with `resolveSpan(state, 0)` and `mergeText`.
- `inline/text.ts`: built-in text handling: `appendText`, `takeRun`, `flushText`, `pushNode`, `endRange`. It covers soft breaks (raw line ending kept), trailing-space hard breaks, dropped trailing whitespace, and extending a break that sits right before a line ending. `mergeText(nodes)` joins adjacent text nodes, such as unpaired delimiter runs. `inline/index.ts` re-exports `appendText`, `flushText`, `mergeText`, `pushNode`, `nodeIndex` and `resolveSpan`.
- `core/transform.ts`: the `Transform` type (an object with `gfm?`) and the `transforms` registry.
- `core/registry.ts`: `RuleSet`, `Registry` and `createRegistry(set, options)`. It filters GFM rules, sorts stably by priority and builds the per-character indexes.
- `core/parse.ts` (default export `parse(value, options, rules)`): runs blocks, then inline, then transforms. The root spans 1:1/0 to the end of the text.
- `blocks/paragraph.ts` (default export `openParagraph`), `blocks/heading-atx.ts` (priority 200), `blocks/thematic-break.ts` (priority 600), registered in `blocks/index.ts`. `inline/index.ts` has an empty `inlineRules`.
- `index.ts`: `fromMarkdown(value, { gfm })` caches one registry per option set.
- Tests: `test/core.test.ts` and `test/core-sections.test.ts`. They cover source and line units, positions compared to the reference (tabs, CRLF, lone CR, BOM, NUL, hard breaks, astral characters), and a test-only block quote container compared to the reference (`>\t\tfoo`-style split tabs, lazy lines, interrupts, nesting). They also hold the test-only paragraph prefix rule and transform the contract's Stub section asks for. There are also test-only rules for the review gaps: a table (`splitParagraph`, `interruptible`), a setext underline (`paragraph.start`), a `+` list (`openContainer`, `canContain`), a container that consumes nothing (the loop guard), and a greedy failing rule (line restore). `~~` and `[text](url)` inline rules are compared with the GFM reference on `~~[a~~](b)`, `[~~a~~](b)` and similar inputs.

## Deviations

- The contract is not edited (the orchestrator's rule beats the brief's last step). The final TypeScript is in `contracts/parser-core.change-request.md`: v1 to v2, status open. It includes the gate review round (problems 9 to 15). The main changes:
  - `partialTab` now counts the columns of a split tab not consumed yet, and `start` sits after that tab (this is what micromark does).
  - Ranges and paragraph lines are flat `number[]` pairs.
  - `Transform` is an object with a `gfm` flag.
  - `OpenBlock` gains `name`. Its `children` field is gone; `close(state, children)` gets the closed child nodes instead.
  - `BlockState` gains `lazy` and `inline()`.
  - `BlockRule` gains `triggers` and `gfm`.
  - Prefix rules push their nodes to an `out` list.
- Two new test files under `packages/talata/test/`, outside the owned paths. They are new files, so they should not conflict with harness. `test/core-sections.test.ts` imports `specExamples` and `specText` from `test/parsers.ts` but not the readiness flag (harness renames it). `test/parsers.ts` is untouched.
- The brief's spec acceptance holds for 34 of the 45 examples in the three sections. The other 11 need other nodes and are listed in `test/core-sections.test.ts` with the node that unlocks each: 48, 69, 225 indented code; 59 setext; 57, 60, 61 lists; 56, 65, 66, 76 escapes or emphasis. Each node should delete its numbers from that list.

## Stubs left

- `paragraphPrefixRules`, `inlineRules` and `transforms` are empty. Definitions come with blocks-leaf (or whichever node owns them), inline rules with inline-core, and the autolink transform with gfm-inline.
- The block quote in `test/core.test.ts` is test-only. blocks-container replaces it with the real rule; the test can then use the registered one.

## Gotchas

- When a rule's `start` returns undefined, the core restores `start`, `visualColumn` and `partialTab`. It does not undo other side effects. A leaf's `start` handles its whole first line, and `addLine` only gets later lines. A leaf that returns true from `continue` (fenced code closing fence) still gets that line through `addLine`.
- `takeParagraph()` removes the paragraph and runs prefix rules first, so setext calls it before it knows the result. On undefined (lazy, no paragraph, or definitions took every line), return undefined. On a paragraph, return a block. `splitParagraph` and `openContainer` also commit you to returning a block.
- Lists: the list container should return true from `continue` unless a different list marker starts the line. A thematic break or a new paragraph then closes it through `canContain`. The item rule opens the list with `openContainer` when `state.container` is not a matching list.
- Links: call `resolveSpan(state, bracketIndex + 1)` before moving nodes into the link, then `mergeText` on the children. That keeps delimiters from pairing across the link boundary, and keeps every delimiter left on the stack a direct child of `state.nodes`.
- A nested container at the end of the file: see the Positions note in the change request (`> > a\n> `). Check `line.blank && line.end === line.text.length && line.start > source.lineStarts[line.index]` in `continue`.
- A rule with `canInterruptParagraph: false` is not called at all while `state.paragraph` is set, lazy or not. Indented code relies on this for `> a\n    b`. Setext must check `!state.lazy` itself (or rely on `takeParagraph` returning undefined).
- The block parser decides "matched leaf" by `name !== 'paragraph'` and finds paragraphs by `name === 'paragraph'`. Do not reuse that name.
- Containers set their own end positions. The reference ends a block quote at the end of its last prefix line (`> a\n>  \n` ends at 2:4), or at its last child when that is later (lazy lines). See `TestQuote` in `test/core.test.ts`.
- Inline: before a rule's `parse` runs, the core has already moved the text before the trigger into the pending text. Use `pushNode` or `appendText` to emit; text merges into one node across both. A rule that crosses lines (code spans, links) moves `state.range` and `state.pos` and handles the line endings it skips.
- The repo's oxlint config enforces `prefer-default-export` and `class-methods-use-this`. A rule file exports its rule as `export default`. Methods that do not use `this` are class fields that point at module functions (see `continue` in `blocks/heading-atx.ts`).
- vitest `toEqual` ignores undefined properties, so a missing `position` is not caught by `toEqual` alone. Transforms that must omit `position` need an explicit check.

## Proposed learnings

- A rule file exports one default rule and adds one line to `blocks/index.ts` or `inline/index.ts` | keeps hot files to one-line merges and satisfies the lint config | packages/talata/src/blocks, packages/talata/src/inline | no
- Measure positions against the reference before writing a rule. Trailing whitespace, split tabs and BOM differ from what the spec suggests | every position bug found here came from assuming spec behavior | packages/talata/src | yes (compare trees with positions)
- Random-string fuzz restricted to the node types built so far finds edge cases cheaply | 300k strings ran in 15 s | packages/talata/test | yes

## Verification

- `pnpm --filter talata test`: 104 passed, 1956 skipped (the readiness-gated suites).
- `(cd packages/talata && npx tsc --noEmit -p .)`: no errors (run as `npx tsc --noEmit -p packages/talata` because of a sandbox quirk).
- `npx oxlint`: no findings.
- A scratch fuzz of 300k random documents, compared with the reference on supported node types: no differences. After the gate round, 150k more: no differences.
- Rough timing in vitest (not the benchmark suite): 345 KB of headings, paragraphs and breaks parsed in 12 ms, against 264 ms for mdast-util-from-markdown.

## Size

- Estimated L, actual L.
