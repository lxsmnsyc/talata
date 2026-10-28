# Change request: extension v1 to v2

- From node: ext-directive
- Status: open

## Problem

The contract says the block and inline interfaces of parser-core v5 are enough for directives. They were not, in four places. Each was worked around in `src/ext/directive/` by reading internals of the block parser (`stack`, `containerIndex`, `closeTo`, `closeKeepsLineEnding`) through a cast, or by tricks on the rule objects. These break when the parser changes.

1. A directive container is not a document container for the reference: the content is parsed again as a document of its own. Blocks inside need to be closed from the directive's `continue` (closing fence line, last empty line), and the parser has no way to ask for that. Worked around with `closeTo` through a cast.
2. `attach` sets `closeKeepsLineEnding` for every new container. A directive is a flow construct for the reference, so blocks it closes must not keep their line ending. Worked around with an `isContainer` getter that answers false on its first read.
3. `continuesOverEnd` runs only when the tip is a leaf other than a paragraph. A directive that ends the document with a paragraph or container at the tip needs the same answer. Worked around by repeating the check in `container.ts`.
4. Inline rules keep module state per leaf (link brackets, strikethrough order, autolink caches). A rule that calls `parseInline` inside `parse` clobbers it: `~~:a[b]*~~*` and `[:a[[]]]()` come out wrong. Worked around by parsing text directive labels after all leaves, in a transform, with a marker in image `alt`.
5. Lazy-line rules read `state.paragraph` even when the container around it refuses lazy lines (`acceptsLazy: false`). Indented code and kind 7 HTML that follow such a directive need two wrapper block rules (`directiveCode`, `directiveHtml`).

## Proposed change

- `BlockState.closeOpenBlocks(depth, keepsLineEnding)`: closes the blocks above `depth`.
- `OpenBlock.startsContainer?: false`: a container that is not a container for `closeKeepsLineEnding`.
- Run `continuesOverEnd` for container and paragraph tips too, or expose it on `BlockState`.
- Make the per-leaf module state of the inline rules live on `InlineState`, so a nested `parseInline` is safe.
- When a container has `acceptsLazy: false` and does not match the line, set `state.paragraph` to undefined for that line.

## Affected nodes

ext-api (contract), ext-mdx (will need the same for JSX flow elements).

## Workaround in place

All five, in `packages/talata/src/ext/directive/`.

## Decision
