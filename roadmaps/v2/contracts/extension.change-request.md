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
- Status: accepted (2026-11-21), copied into `extension.md` v4

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

Accepted 2026-11-21. Review added two more limit readers: list item content width and inline HTML line prefix (see `extension.md` v4).

# Change request: extension v4 to v5

- From node: fix-mdx-reread-container
- Status: accepted (2026-11-22), copied into `extension.md` v5

## Problem

With `mdx()` and `directive()`, a JSX flow construct or flow expression that fails on a later line (text after its last tag) is read again by micromark as flow. When those lines hold a container directive opener, the directive's content is a document of its own: block quotes, lists and every flow construct start in it, on the lines already read and on the lines after. `src/ext/mdx/reread.ts` emulates the flow re-read with leaf rules only, so it cannot open a container, and the tree missed the directive and its content (`[a]:\n{a\n:::x\n}x\n`, `roadmaps/v2/nodes/ext-mdx/outcome.md`, "Known gap"). Extensions cannot hand a line to the block parser: `BlockParser.processLine` is not on `BlockState`, and it always starts at the document.

## Proposed change

`core/blocks.ts`:

```ts
interface BlockState {
  // Reads `line` again as a line on which the open blocks up to `depth` matched and took
  // their prefixes: the blocks above `depth` are asked to continue, then rules start as on
  // any line. For a rule that reads its own lines again after they went through the
  // containers (a failed MDX flow construct). Call it from `addLine` of the tip, after
  // closing the tip, for lines up to the current one, in order; `line` must not be the
  // line the parser passed in.
  readLineAt(line: Line, depth: number): void;
}

interface OpenParagraph {
  // For a paragraph that is not the block parser's own (an extension's block that goes on
  // as one): the indents of its lines, as `paragraphIndents` returns them, for the rules
  // that take it (setext heading, table, definitions).
  inlineIndents?(): number[] | undefined;
}
```

`BlockParser.processLine(line, from = 0)` starts its continue loop at `from + 1` with `matched = from`; `readLineAt` calls it with `depth` and sets `BlockParser.line` (read by `willClose` and `endContent`) to `line` for the call. `paragraphIndents` (`blocks/paragraph.ts`) returns `paragraph.inlineIndents?.()` for a paragraph that is not an `OpenParagraphBlock`; it returned undefined, so a setext heading over a failed MDX construct lost the whitespace after the containers (`- {\n   }x\n  -`). No other change. The parser never calls `readLineAt` itself, and no core paragraph has `inlineIndents`, so output without MDX is unchanged (hash of the trees over the benchmark corpus and 100,000 fuzz documents, gfm on and off, no extensions and `[frontmatter, math, directive]`: equal on batch/v2 and on the branch).

## Affected nodes

- ext-mdx (code it changes): `OpenMdxFlow.handOver` in `src/ext/mdx/flow.ts` calls `readLineAt`; `OpenMdxFlow` has `inlineIndents`.
- ext-mdx-acorn: its ESM construct goes through the same failure re-read; nothing to change.
- No other extension uses it.

## Workaround in place

None: the hooks are in `packages/talata/src/core/blocks.ts` and `src/blocks/paragraph.ts` on the branch `fix/fix-mdx-reread-container`, used as written above.

## Decision

Accepted 2026-11-22 after a fresh review: no speed cost on the corpus, non-MDX output identical.

# Change request: extension v5 to v6

- From node: mdx-layers-flow
- Status: proposed

## Problem

`block-layers.md` (v3) says the block layers become extension contract v6: the v5 re-read hooks go, and the v2 and v3 hooks go once no extension uses them. After mdx-layers-flow, talata/mdx reads failed flow constructs again through `mark`, `commit`, `rewind` and `onLazyLine`. No extension calls the old hooks, except `getBlock` and `getDepth`, which `src/ext/directive/gaps.ts` still reads.

## Proposed change

Removed from `core/blocks.ts`, `core/line.ts` and `blocks/paragraph.ts` (done on `refactor/mdx-layers-flow`):

- v5: `BlockState.readLineAt`, `processLine(line, from)` (now `processLine(line)`), `OpenParagraph.inlineIndents` and its use in `paragraphIndents`.
- v3: `BlockState.endContent`, `Line.endsContent`.
- v2: `OpenBlock.startsContainer`, `BlockState.closeOpenBlocks`. A starting container always sets `closeKeepsLineEnding`.
- `isLastLine(line)` is `line.last`. No line comes from `createLine` without `last` any more (the table's header line for HTML is never a last line).

Kept: `getBlock`, `getDepth` (talata/directive), `OpenBlock.willClose`, now `willClose?(state, line)` without `keepsLineEnding` (nothing calls `closeOpenBlocks` any more). No extension uses it, but without its call in `attach` V8 inlines `attach` differently and the readmes benchmark input parses about 7% slower (bisected against main 6221c4a). Also kept: `containerStartsOff`, `opensContainer`, `openContainer`, `takeParagraph`, `splitParagraph`, `inline`, `isLastLine`, `keepsLazyContainers`, `interruptible`, the v4 `disable` lists and `indentLimit`.

Added: everything in `block-layers.md` Interface (v3 and its change requests).

The "Re-reading lines (v5)" section and the `endContent` text of v3 in `extension.md` go.

## Affected nodes

- ext-mdx-estree: builds on the v6 hooks; it uses none of the removed ones.
- No other extension used them. Their tests in `test/core-hooks.test.ts` and `test/core-hooks-2.test.ts` are removed; the `getBlock` and `getDepth` tests stay, and `willClose` has a new test.

## Workaround in place

None needed: the hooks are removed on the branch. Trees without MDX equal main 6221c4a (see `nodes/mdx-layers-flow/outcome.md`).
