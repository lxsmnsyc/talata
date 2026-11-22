---
name: block-layers
version: 3
status: frozen
defined_by: mdx-layers-contract
---

# Contract: block layers (design D)

## Purpose

talata reads blocks the way micromark does, in three parts:

- a document layer decides the containers of each line once;
- a flow layer per container reads leaf blocks and can go back to a mark;
- a chunk queue runs the later passes (inline text, directive labels, the content of container directives) in micromark's order.

MDX gets exact re-reads and error order from this. Container directives get micromark's raw collector, and the DoS of `reviews/spike-mdx-reread.md` goes away, because nothing is parsed that micromark skips. This becomes extension contract v6. Paths are under `packages/talata/src/`.

## micromark's model, as the code has it

- `micromark/lib/initialize/document.js` walks the open containers for each line (`start`, `documentContinue`), then looks for new containers (`checkNewContainers`), unless all continued and the flow's current construct is `concrete` (line 140). A line where some container did not continue and none started is lazy: `parser.lazy[line] = true` (line 168). The line then goes to the flow (`flowStart`). After a lazy line, the containers that did not match exit unless a flow token is still open across the line start (`writeToChild`, lines 281-332).
- `initialize/flow.js` and `create-tokenizer` attempts: a construct that fails (`nok`) is undone and the flow reads the same chunks again with the next construct. The document layer is not asked again.
- A construct that interrupts a paragraph is tried as a check inside the paragraph's content (`content.js` `tokenizeContinuation`, `effects.interrupt`). While it runs over more lines, the paragraph is still open. If it fails, the paragraph goes on with those lines.
- `postprocess.js` loops `subtokenize` until nothing is left. Each call tokenizes, in event order, the tokens with a `contentType` that the call before spliced in, and jumps over what it splices (`micromark-util-subtokenize/index.js:66-71`).
- A container directive (`micromark-extension-directive/lib/directive-container.js`) is `concrete`. It collects raw `chunkDocument` tokens with `contentType: 'document'` until the first closing fence of at least its size, a lazy line (`nonLazyLine`) or the end of its flow. Up to `initialSize` columns of each content line go to its own indent. The last content line keeps its line ending unless the line after it is lazy (`lineAfter` exits the chunk before the line ending). Each content line resets `parser.lazy` for itself, so the nested document decides lazy lines on its own.
- `parser.defined`, `parser.gfmFootnotes` and the mdxjs-esm `parser.definedModuleSpecifiers` are per parse and grow in tokenizer order.

## Interface

```ts
// core/line.ts
interface Line {
  // ... v5 fields; `endsContent` stays until mdx-layers-cleanup
  /**
   * No line ending follows this line in its document: the last line of the
   * source, the last span of a nested document without a final line ending,
   * or the empty line after a final line ending. Set by the line source.
   * `isLastLine(line)` returns `line.last || line.endsContent ||
   * line.end === line.text.length` while talata/mdx builds lines with
   * `createLine` (which never sets `last`). mdx-layers-flow drops the
   * `createLine` users, then `endsContent` (v3), leaving `line.last`.
   */
  last: boolean;
}

// core/spans.ts (new)
/** Numbers per line in `Spans.data`: source line index, start, end, visual column, split-tab columns. */
export const SPAN_SIZE = 5;

/** Lines of a nested document, after the containers around took their prefixes. */
export interface Spans {
  data: number[];
  /** First and after-last line, counted in lines. A collector may share its parent's `data`. */
  from: number;
  to: number;
  /**
   * The last line keeps its line ending. The document then ends with one more
   * empty line at the start of the next source line, before any prefix
   * (`source.lineStarts[index + 1]`), as a source with a final line ending.
   */
  finalLineEnding: boolean;
}

// core/chunks.ts (new)
/** Pass of the content of a container directive at `depth` (1 or more directives around it). */
export function documentPass(depth: number): number; // 2 * depth - 1
/** Pass of text (paragraph, heading, table cell, leaf or container directive label) at `depth`, inside `labels` text directive labels. */
export function textPass(depth: number, labels: number): number; // 2 * depth + 1 + labels

export interface ChunkQueue {
  /** -1 while the block parser reads the source, then the pass of the running chunk. */
  readonly pass: number;
  /**
   * Inline parse of `ranges` into `node.children`, ordered by `ranges[0]`.
   * `BlockState.inline` calls it with `textPass(state.depth, 0)`. Empty
   * `ranges` (v5 scope hooks of talata/directive) take the highest start
   * added before them in that pass, or -1. The sort is stable.
   * `node.children` is assigned for empty ranges too (the hooks run in
   * its setter).
   */
  text(
    pass: number,
    node: { children: PhrasingContent[] },
    ranges: number[],
    indents?: number[],
  ): void;
  /** Any other chunk. `start` is the first offset it reads. `pass` must be above `this.pass`. */
  add(pass: number, start: number, run: () => void): void;
  /**
   * Runs passes in increasing order. In a pass, chunks run by start, equal
   * starts in the order added. A running chunk adds only to later passes.
   * Nothing is caught: the first error thrown ends the parse.
   */
  run(): void;
}

// core/state.ts
interface DocumentState {
  queue: ChunkQueue; // one per parse, shared by nested documents
}

// core/blocks.ts
interface BlockState {
  /** 0 for the source, d for the content of a container directive inside d - 1 others. */
  readonly depth: number;
  /** End offset of this document's last line: the source length, or the end of the last span. Look-ahead stops here. */
  readonly end: number;
  /**
   * From `BlockRule.start`, when the leaf it returns may still fail on a
   * later line (an MDX flow tag or expression that does not end on its line,
   * ESM). The lazy paragraph, or an interruptible leaf at the tip that
   * matched the line, comes off the stack without closing ("held"). The core
   * records this line, from where `tryStart` began, and every later line of
   * this flow layer with the facts listed under Flow layer, until
   * `commit` or `rewind`. The leaf must be concrete (no `interruptible`).
   */
  mark(): FlowMark;
  /**
   * From `continue` of the marked leaf, on the line where it succeeds. The
   * held leaf closes now (prefix rules, then its inline chunk), so its node
   * comes before the marked leaf's. Recording stops.
   */
  commit(mark: FlowMark): void;
  /**
   * From `addLine` of the marked leaf, on the line where it fails (its
   * `continue` returned true for that line). The marked leaf leaves the
   * stack without `close`, the held leaf is the tip again, and the recorded
   * lines are read again, this one included. On the first recorded line the
   * candidates up to and including `rule` are skipped. `processLine` returns
   * after `addLine` returns.
   */
  rewind(mark: FlowMark, rule: BlockRule): void;
  /**
   * From `close` of a container directive: queues `spans` as the document at
   * depth `this.depth + 1`, at `documentPass(this.depth + 1)`, ordered by the
   * first span's start. Its nodes go into `node.children` when it runs.
   * Queue nothing for empty content.
   */
  document(node: { children: RootContent[] }, spans: Spans): void;
}

/** Opaque to rules. */
interface FlowMark {
  readonly line: number;
}

interface OpenBlock {
  /**
   * Marked leaves: the line is lazy for this leaf (a container around it did
   * not match and no container started). Called before any leaf rule runs on
   * the line and before the leaf closes. `line.start` is after the prefixes
   * that matched. An MDX construct throws its lazy-line error here.
   */
  onLazyLine?(state: BlockState, line: Line): void;
}

// core/blocks.ts
/**
 * Parses `spans` as a document at `depth` with its own document and flow
 * layers. Definitions and footnotes go into the shared sets; text and nested
 * documents go to `state.queue`. Returns the children. Run by the chunk that
 * `BlockState.document` queued.
 */
export function parseDocument(state: DocumentState, spans: Spans, depth: number): RootContent[];
```

Who calls what, in one parse (`core/parse.ts`):

1. `BlockParser.run()` reads the source at depth 0, with `queue.pass === -1`. Leaves queue their text through `state.inline`, container directives their content through `state.document`.
2. `state.queue.run()` runs the later passes. A text chunk calls `parseInline`. A label found there is queued at `queue.pass + 1`. A document chunk calls `parseDocument`, which queues its own text and documents.
3. Transforms run on the finished tree, as in v5.

## Behavior

### Document layer

- Per line, in one place (`processLine`): the `continue` calls of the open containers, the container rules (`opensContainer: true`: block quote, list item, footnote definition), lazy and unmatched decisions, `closeAtNewContainer` and `TrackedContainer` updates, `endOnlyLine`. Each line of a document goes through it once. Nothing calls it again for a line (no `readLineAt`).
- Rule order on a line stays as today: candidates by priority, containers and leaves mixed. Exception: while the tip is a marked leaf and a container did not match, only container rules run first. If one starts, the marked leaf closes (its `close` may throw: end of file inside the construct). If none starts, the line is lazy: `onLazyLine`, then the leaf closes and the line goes on as any lazy line.
- Leaves that are not paragraphs and not `interruptible` are concrete. No container starts on a line where all containers matched them, as now (`processLine`, lines 386-390). The container directive collector is such a leaf.
- A nested document has its own `BlockParser` state (`stack`, `containerStartsOff`, `endOnlyLine`, `depth`, `end`, line source) and shares `source`, `options`, `rules`, `definitions`, `footnotes` and `queue`. Its root block is `root`. `Line.index` stays the source line index, so `source.lineStarts[line.index]` reads in `blockquote.ts`, `list-item.ts` and `footnote.ts` keep their meaning. With `finalLineEnding` the run ends with `continuesOverEnd` on the empty line at `source.lineStarts[last index + 1]`.

### Flow layer and rewind

- The flow layer of a container is its open leaf and its closed children (`children[containerIndex]`). Only the innermost container's flow is open. On a live lazy line that starts a block, the unmatched containers close and the block opens in the flow of the deepest matched container, as `attach` does today.
- `mark` sets `containerIndex` to the held leaf's container, or to the marked leaf's container when nothing is held. On a lazy first line this keeps the unmatched containers open, as `keepsLazyContainers` does now, and the marked leaf goes in the held paragraph's container. The marked leaf sets `keepsLazyContainers` too while it is pending.
- Recorded per line: the span (index, start, end, visual column, split-tab columns), `matched` (the deepest block whose `continue` returned true, as `processLine` computes it), `last`, and the `unmatched` value after the `contentEndsBlock` adjustment. Replay makes its own `Line` (never the parser's reused one) and calls `measureLine`. It sets `containerIndex` to the mark's, and computes `paragraph`, `lazy` (`matched` below the held paragraph and `allowsLazy`) and `tip` against the restored stack, as `processLine` does. It reads `unmatched` and `last` from the record.
- State that rules set from `start` (`containerStartsOff`, `TrackedContainer` fields) is not saved or restored. Containers do not start in a replay, and a leaf rule that sets `containerStartsOff` on a replayed line affects the lines after it, as it would live.
- Replay is the part of `processLine` after the container loop, run on each recorded line with rules that have `opensContainer` skipped, and with `attach` closing only the leaves above `containerIndex`. It never closes or opens a container: the container decisions of those lines stand, as in micromark. A block that the replayed first line starts goes into the same flow, even when that line was lazy, because micromark had kept the containers open while the construct was being tried.
- At most one mark is open per document. The record is one array. A mark keeps the index of its first line in it. A replay walks the array from the rewound mark's index to its end (the current live line). A rule in the replay may take a new mark: it keeps the index of the replayed line, and later replayed and live lines stay in the array. The array is cleared when no mark is open after a `commit` or after a replay ends. A replayed line that throws ends the parse.
- Between `mark` and `commit` or `rewind`, the flow emits no node and the marked leaf is the tip.
- Each rewind reads only the lines of the failed construct again, as micromark does, so a chain of failures stays linear (`{\n}x\n` repeated).

### Container directive collector

- `:::name[label]{attributes}` opens a concrete leaf (`isContainer: false`). The label goes to `state.inline` at the opening line.
- `continue`: first, a closing fence of at least the opening size, after fewer than `line.indentLimit` columns counted from where the containers left the line (not after `indent`), with only spaces and tabs after it: the leaf takes the line and closes on the next one. Only when there is no fence does it consume up to `indent` columns (the opener's own indent) and record the rest of the line as a span.
- An empty last line (`isEmptyLastLine`) is not content.
- It ends at its fence, at a lazy line (also right after the opener: then it has no content), when a container starts outside it, when its parent closes, or at the end of its document.
- `finalLineEnding` is true when the fence closes it or when `state.closeKeepsLineEnding` is true in `close`. A lazy line or the end of a text without a final line ending gives false.
- Node end, all from the reference (`test/layers-contract.test.ts`):
  - with a fence: the fence line's end;
  - with `finalLineEnding`: after the last line's line ending, at `source.lineStarts[index + 1]` (`:::x\n` ends at 2:1, `- :::x\n  a\n- b` at 3:1, `> :::x\n>` at 2:1);
  - otherwise: the end of the last content line, or of the opener when there is none (`> :::x\n> a\nb` ends at 2:4).

  The nested parse never changes it, so the containers around close in pass -1 with their final positions.

- `close` calls `state.document(node, spans)` and returns the node with the label paragraph as its first child. The content's nodes are appended when the chunk runs.

### Chunk queue and the order rule

The pass of each chunk, in `order.ts` numbering (one below the spike's trace):

| Chunk                                                       | Pass              | Start                   |
| ----------------------------------------------------------- | ----------------- | ----------------------- |
| Flow of the source (block parse)                            | -1                | not queued              |
| Content of a container directive at depth d (d ≥ 1)         | `documentPass(d)` | first span start        |
| Text at depth d: paragraph, heading, table cell, leaf label | `textPass(d, 0)`  | `ranges[0]`             |
| Container directive label, d = depth of its document        | `textPass(d, 0)`  | label start             |
| Text directive label inside a chunk of pass p               | p + 1             | first offset inside `[` |

- The rule is `order.ts`'s: sort by pass, then chunk start. Within a chunk the first error met wins, so the place component of `order.ts` is not needed.
- Since chunks run in this order and nothing catches, the first `MdxError` thrown is the reference's. Flow errors in the source throw during the block parse. Flow errors in directive content throw in their document chunk, and text errors in their text chunk.
- Definitions and footnote definitions are added when their paragraph closes, in the document that holds them, so text sees exactly the labels micromark had defined before it. `scopes.ts` is no longer needed.
- Leaves of one document close in document order, and only one leaf is open at a time (the held leaf closes in `commit`, before the marked one). So `text` chunks from one document arrive sorted by start, except a label queued from `start` before the paragraph it interrupts closes; the sort fixes that. A pass needs sorting only when chunks from different producers meet (labels and nested text in the same pass). Sort it once when it starts, and only if an added start was lower than the last.

Examples, each checked against the reference in `test/layers-contract.test.ts` (`[directive, mdx]`):

| Input                          | Chunks with errors (pass, start line)         | Reference throws at |
| ------------------------------ | --------------------------------------------- | ------------------- |
| `:::a\n<1\n:::\n<2`            | content flow (1, 2); source flow (-1, 4)      | 4:2                 |
| `a :b[<1] <2`                  | text (1, 1); label (2, 1, column 6)           | text error          |
| `:::x\nb <1\n:::\n:a[<2]`      | content text (3, 2); label (2, 4)             | label error         |
| `a <1\n:::x\n<2\n:::`          | text (1, 1); content flow (1, 3)              | text error          |
| `:::x\n<2\n:::\na <1`          | content flow (1, 2); text (1, 4)              | content error       |
| `:::x[<1]\n<2\n:::`            | container label (1, 1); content flow (1, 2)   | label error         |
| `:::x\n:::y[<1]\n:::\n<2\n:::` | the first `:::` closes x: source flow (-1, 4) | 4:2                 |
| `:{\n>:::x\n>{\n><}x\n:`       | text (1, 1); content flow (1, 3)              | 1:3                 |
| `'{a\n:::x\n}x\n'.repeat(3)`   | text (1, 1); nothing else runs                | 1:3                 |

## How each block and extension fits

| Block                                      | Layer                   | Notes                                                                                                                                                                      |
| ------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| block quote, list, list item, footnote def | document                | Unchanged. `TrackedContainer` state is set only by the document layer, never by a replay.                                                                                  |
| paragraph (+ definitions)                  | flow                    | Prefix rules run at close, in the document that holds it. Text chunk at `ranges[0]`.                                                                                       |
| ATX and setext heading, thematic break     | flow                    | Heading text is a text chunk. Setext takes the paragraph in replays too.                                                                                                   |
| fenced code, HTML                          | flow, concrete          | No chunk.                                                                                                                                                                  |
| indented code                              | flow                    | No chunk. Off with MDX.                                                                                                                                                    |
| GFM table                                  | flow, interruptible     | One text chunk per cell. A construct that starts on a body row marks and holds it. The held table gets no lines. A rewind gives them back as body rows. `endsInText` goes. |
| frontmatter                                | flow, concrete          | See below.                                                                                                                                                                 |
| math flow / math text                      | flow, concrete / inline | Unchanged.                                                                                                                                                                 |
| directive leaf                             | flow                    | Label through `state.inline`.                                                                                                                                              |
| directive container                        | flow, concrete          | Collector above, content through `state.document`.                                                                                                                         |
| directive text                             | inline                  | Label through `state.queue.add(state.queue.pass + 1, ...)`, parsed later with `parseLabel`.                                                                                |
| MDX flow tag / expression, ESM             | flow, concrete          | `mark` when the construct does not end on its line; `commit`, `rewind`, `onLazyLine`.                                                                                      |
| MDX text tag / expression                  | inline                  | Errors throw at once.                                                                                                                                                      |

What each extension writes for v6:

- frontmatter: the rule drops `state.container.name !== 'root'` and keeps the column-1 check (`line.start === source.lineStarts[line.index]`), which is the reference's `position.column === 1`. Its closing-fence look-ahead stops at `state.end`. Then `anywhere` matches inside directive content, as in the reference (`:::x\n---\na: b\n---\n:::` gives `yaml`; main gives a thematic break and a heading). Without `anywhere` nothing changes: a nested document never starts at line 0.
- math: no change.
- directive: `container.ts` becomes the collector, about 150 lines. `directiveScope`, `openDirectives`, `scopes.ts`, `inLabel`, `willClose`, `closeInside`, `segmentKeeps`, `keepsFor`, `continuesAfter` and the `NextWalk` go. `labels.ts` `queueLabel` stays for leaf and container labels. Text labels use the queue. `spread.ts` stays unless the tree hashes show it is not needed.
- mdx: `mdxFlow` and ESM take a mark on `MORE` and keep their scanner. On `DONE` they call `commit`. On text after the last tag they call `rewind(mark, rule)` from `addLine`. A lazy line throws from `onLazyLine`, and end of file throws from `close`. Errors throw where met.
- mdx, deleted: `reread.ts`, `prefixes.ts`, `order.ts`, `lookahead.ts`, `flow-scope.ts`, `chunks.ts`, `inline.ts` `enterChunk` and `failed`, in `flow.ts` the parts `reread`, `rereadAll`, `handOver`, `waitFor`, `goOnAsParagraph`, `raw`, `interrupted`, `deferred`, `heads`, `inner`, `pending`, the nodes marker (`talataMdxNodes`) and its queue in `build.ts`, and `esm.ts` `reparse`, because micromark's `definedModuleSpecifiers` grow in queue order.

### Extension contract v6

- Removed (v5): `BlockState.readLineAt`, `processLine(line, from)`, `OpenParagraph.inlineIndents` and its use in `paragraphIndents`.
- Removed once no extension uses them (v2 and v3, after mdx-layers-directive and mdx-layers-flow): `OpenBlock.willClose`, `OpenBlock.startsContainer`, `BlockState.endContent`, `Line.endsContent` (now `Line.last`), `BlockState.getBlock`, `BlockState.getDepth`, `BlockState.closeOpenBlocks`. Check with `grep` and drop their tests in `test/core-hooks*.test.ts`.
- Kept: `containerStartsOff`, `opensContainer`, `openContainer`, `takeParagraph`, `splitParagraph`, `inline`, `isLastLine`, `keepsLazyContainers`, `interruptible`, the v4 `disable` lists and `indentLimit`.
- Added: everything in Interface above.

## Performance budget

- Main entry: `pnpm --filter benchmark interleaved` within noise of main. Run main and the branch alternately, best of 5. A median over 2% slower on any of the three files is a failure. Report the main entry gzip size. It is not a gate.
- No allocation per line beyond today while no mark is open. Lines are recorded only between `mark` and `commit` or `rewind`.
- `BlockState.inline` costs what it does now (three pushes and one start) and allocates no chunk object. `queue.run` with only pass 1 does no sort.
- `[frontmatter, math, directive]` over the corpus: within 5% of main.
- Deep directive chains (`test/directive-growth.test.ts`): the ratio at 4x depth is no higher than main's, and time at depth 1600 at most 1.5 times main's. A collector with `indent` 0 and no container open between it and its document's root records no new numbers: its spans are a run of its document's own, so it shares that `data` through `from` and `to`. A chain of n directives then uses O(n) span memory, not O(n²).
- MDX: every shape in the spike table and the mdx-layers-flow brief grows under 5x per 4x size, or no faster than the reference. `--all` fuzz throughput within 10% of main.

## Migration plan

Three nodes, each with its tree hashes against the node before it.

1. **mdx-layers-core** (L). Adds `Line.last`, `Spans`, the line source for spans, `depth`, `end`, `parseDocument`, `core/chunks.ts` with `queue` replacing `inlineNodes`, `inlineRanges` and `inlineIndents`, the `mark`/`commit`/`rewind` record and replay, `onLazyLine` and `document`. Every v2 to v5 hook keeps working, so directive and MDX need no change. `endContent` sets `line.last`. Nothing in `src/ext/` uses the new hooks yet. `test/layers-core*.test.ts` tests them with rules made in the test: a leaf that marks and fails after k lines, and a collector that calls `document`.
   - Owned paths confirmed: `src/core/**`, `src/blocks/**`, `src/gfm/**`, `test/layers-core*.test.ts`.
   - Add `test/layers-contract.test.ts` as shared. Only to swap the stub queue for `core/chunks.ts` and turn on the tests marked for it.
2. **mdx-layers-directive** (L). The collector, `state.document`, text labels through the queue, deletion of the emulation. Once the queue orders the chunks, MDX errors must throw where met. Otherwise `[directive, mdx]` breaks between this node and the next: a flow error in directive content would throw during the queue, while an earlier text error still waits for `throwWaiting`. The edit: `flowError` and `textError` in `order.ts` throw at once, so `throwWaiting` has nothing left and its callers stay. `inline.ts` `record` throws. The files stay for mdx-layers-flow to delete.
   - Owned paths, corrected: `src/ext/directive/**`, `test/directive*.test.ts`, plus `src/ext/frontmatter/**` and `test/frontmatter*.test.ts` (the `root` check and `state.end`), plus `src/ext/mdx/order.ts` and `src/ext/mdx/inline.ts` (errors throw at once), plus `test/layers-contract.test.ts` as shared.
   - The re-read may still open a directive through `readLineAt`. It then opens a collector leaf, which should take the lines as fenced code left open does. Not tried: the node checks it with the re-read generator.
   - Acceptance, corrected: tree hashes equal main except for inputs where main differs from the reference. Each such input is listed in the outcome with the reference's tree. The `--all` fuzz has no new difference.
3. **mdx-layers-flow** (L). MDX on `mark`/`commit`/`rewind`/`onLazyLine` and the deletions listed above. The cases of `nodes/fix-mdx-known-cases/brief.md` pass (the skipped tests in `test/layers-contract.test.ts` turn on).
   - Owned paths confirmed: `src/ext/mdx/**`, `src/mdx.ts`, `test/mdx*.test.ts`, `test/fuzz/**`, plus `test/layers-contract.test.ts` as shared.
   - The removal of v2, v3 and v5 hooks needs `src/core/blocks.ts`, `src/core/line.ts`, `src/blocks/paragraph.ts` and `test/core-hooks*.test.ts`, which this node does not own. Proposed: a fourth node, **mdx-layers-cleanup** (S, after mdx-layers-flow), that owns them, deletes the hooks and their tests, and asks the orchestrator for extension contract v6. Or add those paths to mdx-layers-flow.

## Where the code contradicts the spike

- §2.2 "the flow layer keeps a mark (the number of nodes it has emitted …)". A construct that interrupts a paragraph or a table body is tried while that leaf stays open in micromark (`content.js` `effects.interrupt`). talata models this today with `interrupted`, `deferred` and `keepsLazyContainers` in `flow.ts`, and with `endsInText` in `lookahead.ts` for tables. The mark must hold that leaf. A node count alone is wrong.
- §2.2 "with the construct off at the first line only": only the candidates up to and including the failed rule are skipped on that line. Rules after it, such as ESM or another extension's rule on `<` or `{`, still run.
- §2.3 the collector also ends at a lazy line (`nonLazyLine`), and whether its last line keeps its line ending decides the nested document's end. The reference places a lazy-line error in that end line at the source line start: `- 1. :::b[x]\n      >{\n    >\n` throws at 3:1, talata at 3:3. The spike's span list has no such flag.
- §2.3 the node's end comes from the raw lines, not from the nested parse. The spike does not say this, and the containers around need it in pass -1.
- §2.4 the scheduler cannot live in `ext/mdx`: directive without MDX needs it for label and content definitions, so it goes in `core/chunks.ts`.
- §2 "Replaced" leaves out `esm.ts` `reparse` (`definedModuleSpecifiers` is per parse), `lookahead.ts`, `flow-scope.ts`, `chunks.ts`, `order.ts` `quietFlowErrors`, and in directive `scopes.ts` and `inLabel`.
- §1 cites `order.ts:175-185` for the key. In the current file it is lines 186-195. The spike's `flowError` (`flow.ts:100`) is defined in `order.ts:87`; `flow.ts:100` is `failWith`, which calls it. The cause given for the `:{\n>:::x…` case is still not confirmed. The design does not depend on it.
- A text directive label adds a pass for definitions too, not only for errors. `::::x\n:::y\n[a]: b\n:::\n::::\n:z[:w[[a]]]` gives a link reference in the reference, so a definition at depth 2 is known to a label at depth 0 with two labels around. main already matches. The queue gives it by construction.

## Decisions (user, 2026-11-23)

- Merge order: option C. mdx-layers-directive also makes MDX errors throw at once, so every node merges alone and stays green.
- Hook removal: mdx-layers-flow removes the old hooks from `src/core/blocks.ts`, `src/core/line.ts` and `src/blocks/paragraph.ts`.
- Released `talata/directive` 0.3 output may change where main differs from the reference. Each change is listed in the outcome and gets a patch changeset.
- Performance gate: measure main against main with perf-pass `bench.py` to get the noise; the branch passes when its gap is within that noise and never over 3%.

## Changes

- v2 (2026-11-23, from mdx-layers-core): empty text ranges take the highest start added before them; `isLastLine` keeps `line.end === line.text.length` until mdx-layers-flow; `mark` holds only the lazy paragraph or an interruptible leaf that matched the line. See `block-layers.change-request.md`.
- v3 (2026-11-23, from mdx-layers-directive): the six points under "Proposed change" of the v2 to v3 request in `block-layers.change-request.md` are part of this contract and win where the text above differs: `Spans.onLine` and read-only `BlockState.spans`, a `TrackedContainer` nested root, the collector closes on its fence line, the collector end rules for empty last lines, `ChunkQueue.add` and `text` after `run` run at once in the caller's context, `consumeQuotePrefix` stops at the line end, and text directive labels fill image alts through a transform.
