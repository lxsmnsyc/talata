# Change request: parser-core v4 to v5

- From node: gfm-tasks-footnotes
- Status: accepted

## Problem

Two reference behaviors do not fit v4 cleanly. Both were checked against mdast-util-from-markdown 2.1.0 with micromark-extension-gfm 3.0.0.

1. The task check needs to know which paragraph is the first content of the flow that starts after a list item marker. When the marker line is empty (`-\n[ ] a`), that flow goes on into a lazy line outside the item. The reference then consumes `[ ]` and sets `checked: false` on the paragraph's parent, whatever it is: the root (`-\n[ ] a`), a block quote (`> -\n> [ ] a`) or a list item. No rule can write a field on the root node: it is built in `core/parse.ts` after inline parsing, and only a `Transform` sees it. Block quote nodes are built in `blocks/blockquote.ts`. Paragraph opening has no hook either.
2. The footnote definition indent is a token in micromark. The walk back that places container ends stops at it, like a block quote prefix (subtokenize), but mdast-util-from-markdown's `prepareList` skips quote prefixes and stops at this indent. `TrackedContainer.quoteLine` does not tell the two apart.

## Proposed change

- Document in the contract that a container whose prefix is a token (footnote definitions, later container directives) sets `quoteLine` on lines where its prefix matched.
- Either let GFM nodes register a `Transform` in `core/transform.ts` for the lazy task check (set `checked` on the paragraph's parent, drop `[ ]`), or accept the difference and list it in `packages/talata/README.md`.

## Affected nodes

- gfm-tasks-footnotes, gfm-green (remaining differences), ext-directive (container directives have the same indent question).

## Workaround in place

- `src/gfm/task-list.ts`: an observer block rule `taskListStart` (priority 900, trigger `[`, never starts a block) records where the flow after an empty marker line has its first content. Paragraphs whose parent is a list item get the check. Root, block quote and footnote parents do not (`it.fails` cases in `test/gfm-tasks-footnotes.test.ts`).
- `src/gfm/footnote.ts` exports `footnoteIndentAt(state, lineStart)`, which list items call to apply the `prepareList` rule. Footnote definitions set `quoteLine` on lines where their indent matched.

## Decision
