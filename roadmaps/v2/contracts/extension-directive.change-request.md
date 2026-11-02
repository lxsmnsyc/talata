# Change request: extension v3 to v4

- From node: ext-directive
- Status: open

The v2-to-v3 request from this node was accepted on 2026-11-02 and built by core-hooks-2 (PR #22). Its text is in git history (`git show origin/main:roadmaps/v2/contracts/extension-directive.change-request.md`). This file holds the next request. Nothing in it blocks 0.3: the directive works on v3 with the workarounds below, and the fuzz is clean (see `roadmaps/v2/nodes/ext-directive/outcome.md`).

## Problem

1. Whether the next line starts a container. micromark ends a directive's content without a line ending when the next line is lazy: the containers around it do not continue, and no container starts. The directive has to decide this on the current line, because the decision changes how blocks inside read that line (`endContent`). The containers around it can now be walked with `getBlock` (see Workaround), but v3 has no way to ask whether a container would start on the rest of the next line.
2. `state.unmatched` on the line after `endContent` is too broad. The core sets it to false for the whole line. That is right for blocks inside the content (a table there does not take the line as a lazy body row). It is wrong for blocks that start outside on that line: indented code at the document level then does not end with the lazy line (`2)  :::a\n\n    (\n   `, `>:::a\n>\n    ~\n3)`).
3. How a container around the directive continues. The lookahead reads `OpenList.item.size` (an exported class of `src/blocks/list.ts`) and copies the quote-marker and footnote-indent rules of `blockquote` and `footnoteDefinition`. The copy has to track any change in those rules.
4. Container ends. A container inside the directive can be given an end only through `closeEnd` and `closedAt`, and list items ignore `closeEnd`. A later `closedAt` from a new container overwrites the end that an earlier blank line gave.

## Proposed change

- `BlockState.startsContainer(line: Line): boolean`: whether a rule with `opensContainer` would start on `line` at its current position, with no side effects. It can run the container rules' start checks on a copy of the line, or each such rule can get a pure `matches(line)`.
- `OpenBlock.matchesNext?(state, line): boolean` on core containers: the check from their `continue` with no side effects. The directive then walks `getBlock(1..depth)` with it instead of copying the rules.
- A supported way to ask the blocks inside a container whether they continue over an empty line. `container.ts` sets `state.container` for a moment in `keepsFor`, `segmentKeeps` and `closeInside`, while it calls their `continue` with an empty line, then restores it. `container` is a public field and core does the same in `continuesOverEnd`, but it is not a contract hook. A `matchesNext`-style check that takes the parent as an argument would remove the write.
- `TrackedContainer.endAtLeast?(offset: number): void`: a container ends at `offset` or later. It replaces the write to the list item's `indentEnd`.
- Point 2: apply the next-line `unmatched` override only while blocks at or above the `endContent` block close, then restore the computed value before start rules run. In other words, do in core what `directiveScope` now does.

## Affected nodes

ext-directive (removes `isContainerStart`, `continuesNext` and the `unmatched` part of `directiveScope`), ext-mdx (JSX flow elements hold flow content in the same way).

## Workaround in place

1. `isContainerStart` in `src/ext/directive/container.ts` reads the next line for a quote marker, a list marker (not a thematic break) and, with GFM, `[^label]:` with no whitespace or brackets in the label.
2. `directiveScope`, a block rule with no triggers at priority 1 that starts nothing. On the line after `endContent` it closes the blocks inside the directive while `unmatched` is false, then sets `unmatched` back to true.
3. `continuesNext` in `container.ts` walks `getBlock(1..depth - 1)`: an `OpenList` needs `item.size` columns (blank lines continue), a quote needs `>` with under 4 columns of indent, a footnote definition needs 4 columns (blank lines continue), a directive consumes its own indent.
4. `raiseIndentEnd` in `container.ts` writes the list item's `indentEnd` field through an `'indentEnd' in block` check. It is used when a quote in the item ends on a blank line inside the directive (`>:::é\n>* >\n>\n>>`), so a later `closedAt` does not move the item's end. A `TrackedContainer` method, `endAtLeast?(offset)`, would replace it.

## Decision

<Filled in by the orchestrator.>
