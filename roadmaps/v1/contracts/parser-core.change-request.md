# Change request: parser-core v1 to v2

- From node: core-skeleton
- Status: open

## Problem

The brief asks core-skeleton to copy the final TypeScript into the contract and freeze it. Workers may not edit contracts, so the final interface is here. Building it against the reference parser showed these gaps in the v1 draft:

1. `partialTab` as "columns already consumed" gives wrong positions. In micromark, the columns left of a split tab sit at the offset after the tab: `>\t\tfoo` gives `code` at 1:3 (offset 2), not offset 1. The line model must move `start` past a split tab and count the columns not consumed yet.
2. `Transform` as a bare function cannot say it is GFM-only. "GFM rules and transforms register only when `options.gfm` is true" needs a flag on each entry.
3. `OpenBlock.children?: OpenBlock[]` cannot work: a closed child is an mdast node, not an open block. The core keeps the closed child nodes and passes them to `close`.
4. `close(state): Content` must run inline parsing later, after all definitions are known. Leaves need a way to schedule it: `state.inline(node, ranges)`.
5. Rules that cannot interrupt a paragraph must also not start under a lazy paragraph (`> a\n    b` stays a paragraph). Rules need to know whether the paragraph matched: `lazy`.
6. `Array<[start, end]>` allocates one array per line. Flat pairs in one `number[]` do the same job.
7. `ParagraphPrefixRule.consume` returning an array allocates per paragraph. It now pushes to an `out` list.
8. The repo's oxlint config enforces `import/prefer-default-export` and `class-methods-use-this`. Rule files export their rule as the default export.

## Proposed change

Replace the Interface section with the code below (paths under `packages/talata/src/`), and set `status: frozen`, `version: 2`.

```ts
// core/source.ts
type Position = NonNullable<Root['position']>;
type Point = Position['start'];
interface Source {
  text: string;          // leading BOM removed, NUL replaced by U+FFFD (as micromark does)
  lineStarts: number[];  // offset of the first character of each line; a final line ending starts one more, empty, line
  lastLine: number;      // cache for point()
}
function createSource(value: string): Source;
function point(source: Source, offset: number): Point; // 1-based line, 1-based column per UTF-16 unit, 0-based offset
function skipLineEnding(text: string, offset: number): number; // offset after the line ending at `offset`

// core/line.ts: one reused object per parse; rules must not keep it
interface Line {
  text: string;
  index: number;         // 0-based line index
  start: number;         // first character not consumed
  end: number;           // offset of the line ending, or end of text
  visualColumn: number;  // column of the current position, tab stops of 4; indentation only
  partialTab: number;    // columns of a split tab not consumed yet; they sit before `start`
  indent: number;        // visual columns of whitespace from the current position to `nonBlank`
  nonBlank: number;      // first character after `start` that is not a space or tab, or `end`
  blank: boolean;
}
function measureLine(line: Line): void;                       // recompute indent, nonBlank, blank
function consumeColumns(line: Line, columns: number): number; // consume whitespace columns, splitting a tab
function advanceLine(line: Line, offset: number): void;       // consume whole characters up to `offset`
function skipBlank(line: Line): void;

// core/state.ts
interface ParseOptions { gfm: boolean }
interface DocumentState {
  source: Source;
  options: ParseOptions;
  definitions: Set<string>;
  footnotes: Set<string>;
  rules: Registry;
}
function normalizeIdentifier(label: string): string;

// core/blocks.ts
interface BlockState extends DocumentState {
  container: OpenBlock;                  // innermost matched open container
  paragraph: OpenParagraph | undefined;  // open paragraph at the tip, matched or lazy
  lazy: boolean;                         // paragraph set but the line did not match all containers above it
  takeParagraph(): OpenParagraph | undefined; // runs prefix rules first; undefined when lazy or no line left
  inline(node: { children: PhrasingContent[] }, ranges: number[]): void; // parse after all blocks close
}
interface BlockRule {
  name: string;
  priority: number;              // lower runs first
  canInterruptParagraph: boolean; // false: not called while `paragraph` is set
  triggers?: string;             // ASCII first non-blank characters; leave out to run on every line
  gfm?: boolean;
  start(state: BlockState, line: Line): OpenBlock | undefined; // on failure leave `line` unchanged
}
interface OpenBlock {
  name: string;
  isContainer: boolean;
  acceptsLazy: boolean;
  continue(state: BlockState, line: Line): boolean; // containers consume their prefix
  addLine?(state: BlockState, line: Line): void;    // leaves that take more lines
  close(state: BlockState, children: RootContent[]): RootContent | undefined;
}
interface OpenParagraph extends OpenBlock {
  lines: number[]; // flat [start, end) pairs: content start to line end
}
interface ParagraphPrefixRule {
  name: string;
  priority: number;
  gfm?: boolean;
  consume(state: BlockState, paragraph: OpenParagraph, out: RootContent[]): void; // remove consumed pairs from the front of lines
}
function isParagraph(block: OpenBlock): block is OpenParagraph;

// core/inline.ts
interface Delimiter {
  marker: number; node: Text; start: number; end: number;
  canOpen: boolean; canClose: boolean; active: boolean;
}
interface InlineState extends DocumentState {
  ranges: number[];   // flat pairs; each pair but the last ends at a line ending
  range: number;      // index of the current pair's start (even)
  pos: number;        // cursor; a rule moves it past what it consumed
  end: number;        // end of the current range
  start: number;      // trigger offset of the current parse call
  run: number;        // start of plain text not yet in the pending text
  nodes: PhrasingContent[];
  text: string; textStart: number; textEnd: number; // pending text; textStart -1 when none
  delimiters: Delimiter[];
}
interface InlineRule {
  name: string;
  priority: number;
  triggers: string;   // ASCII characters
  gfm?: boolean;
  parse(state: InlineState): boolean; // text before the trigger is already pending
  resolve?(state: InlineState): void; // once per leaf after scanning, in priority order
}
function parseInline(state: DocumentState, ranges: number[]): PhrasingContent[];

// inline/text.ts (re-exported from inline/index.ts except takeRun and endRange)
function appendText(state: InlineState, value: string, start: number, end: number): void;
function takeRun(state: InlineState, upTo: number): void;
function flushText(state: InlineState): void;
function pushNode(state: InlineState, node: PhrasingContent): void;
function endRange(state: InlineState): void;

// core/transform.ts
interface Transform {
  name: string;
  gfm?: boolean;
  transform(tree: Root, state: DocumentState): void;
}
const transforms: Transform[];

// core/registry.ts
interface RuleSet {
  blockRules: BlockRule[];
  paragraphPrefixRules: ParagraphPrefixRule[];
  inlineRules: InlineRule[];
  transforms: Transform[];
}
interface Registry {
  blockByChar: BlockRule[][];             // per ASCII code, with untriggered rules merged in
  blockOther: BlockRule[];
  paragraphPrefixRules: ParagraphPrefixRule[];
  inlineByChar: (InlineRule[] | undefined)[];
  inlineResolvers: InlineRule[];
  transforms: Transform[];
}
function createRegistry(set: RuleSet, options: ParseOptions): Registry;

// core/parse.ts (default export)
function parse(value: string, options: ParseOptions, rules: Registry): Root;

// blocks/index.ts, inline/index.ts
const blockRules: BlockRule[];
const paragraphPrefixRules: ParagraphPrefixRule[];
const inlineRules: InlineRule[];
```

Add to Behavior:

- Block phase per line, after the CommonMark appendix: open blocks continue in order; if the deepest match is a leaf other than a paragraph, it gets `addLine`. Otherwise rules run on the first non-blank character until a leaf starts or none matches; a started container lets rules run again on the rest. Then a lazy paragraph takes the line if every unmatched container has `acceptsLazy`; else unmatched blocks close and the line goes to the matched paragraph or opens a new one.
- A leaf rule's `start` handles its whole first line; `addLine` only gets later lines.
- Rule files export their rule as the default export and add one line to `blocks/index.ts` or `inline/index.ts`.
- Block priorities: blockquote 100, ATX heading 200, fenced code 300, HTML 400, setext underline 500, thematic break 600, list item 700, indented code 800. GFM rules pick numbers between these.
- Inline: plain text, soft breaks and trailing-space hard breaks are built in. Trailing spaces and tabs before a range end are dropped. Before a line ending they become a `break` when there are 2 or more and no tab. A `break` node right before a line ending (a backslash break) is extended to the start of the next line. Soft line endings stay raw (`\r\n`, `\r`) in text values. Adjacent text merges into one node across line endings and `appendText` calls.

Add to Positions:

- A split tab: the next node starts at the offset after the tab (micromark keeps the tab's virtual spaces after it).
- A leading BOM is dropped before counting offsets. The root spans 1:1/0 to the end of the text.
- A paragraph ends at the end of its last line, trailing whitespace included; its last text node stops before that whitespace. ATX headings and thematic breaks end at the line end, trailing whitespace included.

## Affected nodes

Every node that builds on parser-core: blocks-leaf, blocks-container, inline-core, the GFM nodes, the extension nodes, perf-pass.

## Workaround in place

core-skeleton implements v2 as written above. The contract file still says v1.

## Decision

