# Change request: extension v2 to v3

- From node: ext-directive
- Status: open

## Problem

The v2 hooks removed every cast to parser state from `src/ext/directive/`. Three things the reference does with a directive's content still have no hook. All three are worked around in the extension with guesses. The fuzzer still finds about 4 differences per million documents there.

1. Closing because a container starts outside. When a directive does not match a line and a container starts below it, `attach` sets `closeKeepsLineEnding` for every block it closes. Blocks inside the directive should keep their line ending only when every container between them and the outermost closing directive continues over an empty line (`- :::a\n  > ```\n  > b\n> c`: the code ends before the last line ending). `closeOpenBlocks` cannot be called at the right time: the directive's `continue` does not run on that line.
2. The containers around a block. Whether the next line continues the directive (micromark's `nonLazyLine`) depends on the quotes and list items around it. `BlockState` exposes `getDepth(block)` but no way to read the block at a depth, so the directive cannot ask its ancestors.
3. The last line of a content. When the directive's content ends on a line followed only by a final line ending, or by a lazy line, the reference parses that line as a last line without a line ending. Core blocks decide "last line" from `line.end === line.text.length`, so leaves and quotes inside treat it as an inner line. Examples: `>:::9\n>>$$\n>>\n` (math in a quote must end at the line start) and `>:::\t\n>- ;\n><a f="">\n` (kind 7 HTML must not keep the lazy list item open). Also: a table inside reads `state.unmatched` to decide whether the closing line was a lazy body row, which is wrong when the directive's content ended before that line.

## Proposed change

- `BlockState.willStartContainer(line): boolean`, or a hook on `OpenBlock`: `closing?(state, line, keepsLineEnding)` called on each open block before `attach` closes it, so a container can close its inner blocks with its own `keepsLineEnding`.
- `BlockState.getBlock(depth): OpenBlock | undefined`, read-only.
- `Line.endsContent?: boolean` (or `BlockState.contentEndsHere`), set by a container's `continue`. While true, `isEmptyLastLine`, the quote's end-only rule, `keepsLazyContainers` and list item `matchedEnd` treat the line as the last one without a line ending.

## Affected nodes

ext-directive, ext-mdx (JSX flow elements hold flow content the same way), release-0.3 (the fuzz acceptance).

## Workaround in place

1. `directiveEnd` in `src/ext/directive/container.ts`: a block rule with no triggers at priority 1 that starts nothing. On a line where open directives do not match, it closes the blocks inside them with `closeOpenBlocks` and the reference's answer. It reads the line to guess whether a container starts (`isContainerStart`).
2. The directive records the prefixes the containers around it consumed (indent before each quote marker and after the last, least seen) and replays them on the next line.
3. Case by case: a line that holds only the markers of the quotes inside closes the blocks inside keeping their line ending; `directiveHtml` (priority 399) runs the core HTML rule and turns `keepsLazyContainers` off; `directiveEnd` closes the content with `state.unmatched` off before a lazy line. Other leaves on such a line are not covered.

## Decision
