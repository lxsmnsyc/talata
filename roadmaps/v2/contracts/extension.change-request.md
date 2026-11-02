# Change request: extension v2 to v3

- From node: core-hooks-2
- Status: proposed. The orchestrator copies the interface below into `extension.md` as version 3.

## Problem

`roadmaps/v2/contracts/extension-directive.change-request.md` (accepted 2026-11-02) lists three things a container extension needs to hold flow content the way micromark does, without guessing: closing its inner blocks when a container starts outside it, reading the containers around it, and marking the last line of its content. Version 3 adds one hook for each. The tree output of talata, with and without the 0.2 extensions, does not change.

All paths are under `packages/talata/src/`.

## Proposed interface

Block side, `core/blocks.ts`:

```ts
interface OpenBlock {
  // Containers. Called on each open block that a starting container closes, before any of them
  // closes, innermost first, with keepsLineEnding true. Starting containers are those with
  // startsContainer !== false (block quote, list item, footnote definition, directive does not).
  // The block may close the blocks inside itself with its own answer:
  //   state.closeOpenBlocks(state.getDepth(this), { keepsLineEnding })
  // Pass getDepth(this) or less. A block already closed by an earlier call is not called.
  // Not called on other lines (lazy lines, blank lines, closing fences): use continue there.
  willClose?(state: BlockState, line: Line, keepsLineEnding: boolean): void;
}

interface BlockState {
  // The open block at depth (0 is the document), or undefined. Read-only counterpart of getDepth.
  getBlock(depth: number): OpenBlock | undefined;
  // Called from a container's continue: the current line is the last line of its content.
  // For the rest of this line isLastLine(line) is true, and the core remembers the block for the next line.
  endContent(block: OpenBlock): void;
}

interface Line {
  // True after endContent on this line. For blocks inside, the line is the last line of the
  // document and has no line ending. Reset for every line.
  endsContent: boolean;
}

// core/line.ts. True when line.end is the end of the text, or line.endsContent is true.
function isLastLine(line: Line): boolean;
```

Behavior while `isLastLine(line)` is true because of `endContent`, in place of `line.end === line.text.length`:

- `isEmptyLastLine(line)` (`blocks/code-indented.ts`): fenced code, HTML and math (flow) end before the line.
- The block quote's end-only rule (`blocks/blockquote.ts`): a quote matches a line with nothing left after an outer quote prefix, and sets `endOnlyLine`.
- `keepsLazyContainers` in `processLine`: a block that interrupts a lazy paragraph closes the containers that did not match, as on a last line.
- `matchedEnd` of list items and footnote definitions: it is now the end offset of the last line the block matched when that line was a last line (or `endContent` was called), or -1. It was a boolean, and the block then ended at `text.length`; it ends at that line's end instead, which is the same offset for a real last line.

Behavior on the line after `endContent`, when the block that called it does not match that line (an outer block failed): `state.unmatched` is false for that line, so a table inside does not take it as a lazy body row (`table.ts`), and indented code and task items treat it as not lazy either. When the block matches the line, nothing changes.

No other names change. `startsContainer`, `closeOpenBlocks`, `getDepth` and `containerStartsOff` of version 2 stay.

## Affected nodes

ext-directive (replaces `directiveEnd`, `directiveHtml`, the prefix replay and `isContainerStart` with the hooks), ext-mdx (JSX flow elements hold flow content the same way).

## Decision

Pending. The orchestrator accepts it by copying it into `extension.md`.
