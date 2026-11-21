# Change request: extension v2 to v3

- From node: core-hooks-2
- Status: accepted (2026-11-02), copied into `extension.md` v3

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

Accepted. Copied into `extension.md` as version 3 after PR #22 merged.

---

# Change request: extension v3 to v4

- From node: mdx-core
- Status: open

## Problem

`micromark-extension-mdx` 2.1.0 builds on `micromark-extension-mdx-md` 2.0.0, which turns off the core constructs `autolink`, `codeIndented`, `htmlFlow` and `htmlText` with `disable: { null: [...] }`. An `Extension` cannot remove a core rule, so ext-mdx cannot match the reference. Turning off `codeIndented` also changes other rules: in micromark a flow construct limits its leading whitespace to 3 columns only while `codeIndented` is on. With it off, `    - a` is a list, `    # a` a heading, and `a\n    ---` a setext heading (checked against `mdast-util-from-markdown`). The same holds for block quotes, fences (open and close), block HTML, tables and footnote definitions.

## Proposed change

Paths are under `packages/talata/src/`. Tree output with no `disable` list does not change.

```ts
// ext/api.ts
interface Extension {
  // Core rules to leave out by name, as micromark's `disable.null` does. Block and inline names
  // overlap (`html`), so there are two lists. Applies to every registered rule, including rules
  // of other extensions, in any order. Unknown names are ignored.
  disable?: { block?: string[]; inline?: string[] };
}
```

Names: block `codeIndented` and `html`; inline `html` and `autolink`. Reference names map as `htmlFlow` to block `html`, `htmlText` to inline `html`.

```ts
// core/registry.ts
interface RuleSet {
  disableBlock?: string[];
  disableInline?: string[];
} // joined from all extensions
interface Registry {
  indentLimit: number;
} // 4, or Infinity when block codeIndented is off

// core/line.ts
interface Line {
  indentLimit: number;
} // copied from Registry.indentLimit
function createLine(text: string, indentLimit = 4): Line;
```

- Filtering happens once per registry in `createRegistry` (`select(rules, options, disabled)`). `index.ts` only collects the lists into the `RuleSet`. The registry cache already keys on the extension objects.
- Rules that refuse a line at 4 columns compare `line.indent >= line.indentLimit`: block quote, ATX and setext heading, thematic break, fenced code (open and close), block HTML, list item and list sibling, table, footnote definition start. The 4-column indent that continues a footnote definition is not a limit and stays.
- Extension rules that keep a literal 4 (math flow, directive leaf and container) keep the old limit. A rule that must match micromark with `codeIndented` off, such as the JSX flow rule of ext-mdx, uses `line.indentLimit`.

## Affected nodes

ext-mdx (sets `disable: { block: ['codeIndented', 'html'], inline: ['autolink', 'html'] }` and uses `line.indentLimit`), ext-mdx-acorn through it. Existing extensions are not affected.

## Workaround in place

None needed. Built and tested in `packages/talata/test/mdx-core.test.ts` against `mdast-util-from-markdown` with `{ disable: { null: [...] } }`.

## Decision

To be filled in by the orchestrator.
