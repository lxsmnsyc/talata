# Change request: extension v1 to v2

- From node: core-hooks
- Status: open

## Problem

The directive build (branch `feat/ext-directive`, `roadmaps/v2/contracts/extension-directive.change-request.md`) reached private parser state through casts to `stack`, `containerIndex`, `container` and `closeTo`, and through tricks on rule objects. Frontmatter kept a list of rule names, and math kept copies of core helpers. Version 2 adds supported hooks for each. The tree output of talata, with and without extensions, does not change.

All paths are under `packages/talata/src/`.

## Proposed interface

Block side, `core/blocks.ts`:

```ts
interface BlockState {
  // Index of `block` among the open blocks (0 is the document), or -1.
  depthOf(block: OpenBlock): number;
  // Closes the open blocks above `depth`, innermost first; the block at `depth` becomes the tip.
  // `closeKeepsLineEnding` is `options.keepsLineEnding` while they close, then its old value.
  // Call it from a container's `continue`. Pass `state.depthOf(this)` or less.
  closeOpenBlocks(depth: number, options: { keepsLineEnding: boolean }): void;
  // True: rules with `opensContainer` do not start for the rest of the document.
  // Writable: a rule may set it back to false.
  containerStartsOff: boolean;
}

interface BlockRule {
  // True for rules that start CommonMark containers (blockquote, listItem, footnoteDefinition).
  // They are skipped while `containerStartsOff`.
  opensContainer?: boolean;
}

interface OpenBlock {
  // Containers: false when starting this block does not make the blocks it closes
  // keep their line ending (`closeKeepsLineEnding`). For constructs that are flow for the reference.
  startsContainer?: false;
}
```

Behavior changes without new names:

- `continuesOverEnd` runs for every tip after a final line ending, not only for a leaf other than a paragraph. `state.closeKeepsLineEnding` is then true in `close` of a tip container or paragraph, and of the containers above, when every open block above the tip continues over the empty line.
- When a lazy line meets a container with `acceptsLazy: false`, `state.paragraph` is undefined and `state.lazy` is false for that line. Rules that need no paragraph (indented code, HTML kind 7) start on it. No built-in container refuses lazy lines, so built-in output is the same.

Inline side, `core/inline.ts`:

- The per-leaf state of the built-in rules that changes output lives on `InlineState`, not in module variables: `brackets` (link bracket stack), `reached` (furthest range looked into), `attentionFirst` (strikethrough order) and `task` (task list marker). A rule's `parse` may call `parseInline` on sub-ranges (`parseInline(state, ranges)`) and the outer leaf is unaffected.
- Module state that stays (autolink literal, raw HTML and code span "exhausted" memos, link `keysFor`) is a cache keyed by the `InlineState` object. A nested call can only make the outer leaf rescan, never give a wrong answer.

Shared helpers extensions import instead of copying:

- `strip(value, virtual, virtualEnd)` from `inline/code-span.ts`: code span and inline math padding.
- `isClosingFence(line, marker, size)` and `trimLineEndings(raw)` from `blocks/code-fenced.ts`.
- `createExhausted()`, `failedStart(cache, state, size)`, `markFailed(cache, size, start, known)` from `inline/exhausted.ts`: the "no closer up to the end of the leaf" cache of code span and inline math. Each rule creates its own cache.

## Affected nodes

ext-directive (rebuilds on the hooks), ext-mdx (JSX flow elements need the same hooks), ext-api (contract text).

## Decision

Open. The orchestrator copies this into `extension.md` as version 2.
