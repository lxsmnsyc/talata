---
name: parser-core
version: 1
status: draft
defined_by: core-skeleton
---

# Contract: parser-core

## Purpose

The internal interfaces every block rule, inline rule and GFM extension is built against: reading the source, positions, the block parser's container stack, paragraph takeover, the inline parser, shared document state, post-parse transforms, and rule registration. core-skeleton writes the exact TypeScript and copies it here when it is frozen.

## Interface

```ts
// src/core/source.ts
interface Source {
  text: string;
  lineStarts: number[]; // offset of the first character of each line
}
function createSource(text: string): Source;
// unist Point: 1-based line, 1-based column counting one per UTF-16 code unit
// (a tab is one column), 0-based offset. See "Positions" below.
function point(source: Source, offset: number): Point;

// src/core/line.ts: one line as the block parser sees it, without copying text
interface Line {
  start: number;          // offset of the first character not yet consumed
  end: number;            // offset of the line ending, excluding it
  visualColumn: number;   // column of `start` with tabs expanded to stops of 4; only for indentation rules
  indent: number;         // visual columns of whitespace after `start`
  partialTab: number;     // visual columns of a tab already consumed by a container prefix
  blank: boolean;
}

// src/core/state.ts: facts shared across the whole document
interface DocumentState {
  source: Source;
  options: ParseOptions;
  definitions: Set<string>; // normalized labels of link reference definitions
  footnotes: Set<string>;   // normalized labels of GFM footnote definitions
}
// normalizeIdentifier: collapse whitespace runs to one space, trim, then
// toLowerCase().toUpperCase(), as micromark-util-normalize-identifier does.
function normalizeIdentifier(label: string): string;

// src/core/blocks.ts
interface BlockState extends DocumentState {
  container: OpenBlock;           // innermost open container
  paragraph: OpenParagraph | undefined; // the open paragraph, if any
  takeParagraph(): OpenParagraph | undefined; // removes the open paragraph so a rule can convert it
}
interface BlockRule {
  name: string;
  priority: number;               // lower runs first; GFM rules use priorities that place them before the CommonMark rule they override
  canInterruptParagraph: boolean;
  start(state: BlockState, line: Line): OpenBlock | undefined;
}
interface OpenBlock {
  isContainer: boolean;
  acceptsLazy: boolean;           // a paragraph inside may continue lazily
  children?: OpenBlock[];         // containers only
  continue(state: BlockState, line: Line): boolean;
  addLine?(state: BlockState, line: Line): void; // leaf blocks only
  close(state: BlockState): Content; // builds the mdast node with its position
}
interface OpenParagraph extends OpenBlock {
  lines: Array<[start: number, end: number]>;
}
// Runs when a paragraph closes, before it becomes a node. Definitions use it
// to consume link reference definitions from the start of the paragraph.
interface ParagraphPrefixRule {
  name: string;
  priority: number;
  consume(state: BlockState, paragraph: OpenParagraph): Content[]; // may shorten paragraph.lines
}

// src/core/inline.ts
interface InlineState extends DocumentState {
  // ranges, cursor and delimiter stack; written by core-skeleton
}
interface InlineRule {
  name: string;
  priority: number;
  triggers: string;              // characters that can start this rule
  parse(state: InlineState): boolean;
}
function parseInline(state: DocumentState, ranges: Array<[start: number, end: number]>): PhrasingContent[];

// src/core/transform.ts: tree passes after inline parsing, in registration order
type Transform = (tree: Root, state: DocumentState) => void;

// src/blocks/index.ts, src/inline/index.ts, src/core/transform.ts
const blockRules: BlockRule[];
const paragraphPrefixRules: ParagraphPrefixRule[];
const inlineRules: InlineRule[];
const transforms: Transform[];

interface ParseOptions {
  gfm: boolean;
}
```

## Behavior

- Parsing has three phases: blocks (filling `definitions` and `footnotes`), inline parsing of every leaf after all blocks close, then `transforms`. So references and footnote calls resolve against definitions anywhere in the document.
- GFM rules and transforms register only when `options.gfm` is true. A rule overrides a CommonMark rule through `priority`, not by editing the CommonMark file. For example, footnote definitions run before link reference definitions, and footnote calls run before link labels.

## Positions

These are testable invariants. core-skeleton's position tests cover each one.

- Columns and offsets count UTF-16 code units. A tab is one column. `visualColumn` is only for indentation decisions.
- A line that starts inside a container prefix, after part of a tab was consumed, takes its starting column and offset from where the reference's tokenizer resumes (micromark `create-tokenizer.js`, `accountForPotentialSkip`).
- A `listItem` ends before trailing blank lines (mdast-util-from-markdown, list item exit).
- The `root` position starts at the first event and ends at the last. It is not always 1:1 to the end of the file.
- Nodes created by transforms (GFM autolink literals) have no `position` property, matching `mdast-util-find-and-replace`.

## Stub

core-skeleton ships paragraphs, ATX headings and thematic breaks on these interfaces, plus one test-only transform and one test-only paragraph prefix rule, so other nodes can test against working code.

## Changes

- v1: initial draft. Review findings added `DocumentState`, paragraph takeover, prefix rules, transforms, priorities and the position rules.
