# Outcome: mdx-layers-core

## Built

Paths are under `packages/talata/src/`. Output for every input is the same as main.

- `core/spans.ts`: `SPAN_SIZE` (5) and `Spans { data, from, to, finalLineEnding }`, as the contract writes them.
- `core/chunks.ts`: `documentPass(depth)`, `textPass(depth, labels)`, `ChunkQueue`, and `createChunkQueue(state)`.
  - Each pass keeps its chunks in parallel arrays, so a text chunk allocates no object.
  - A pass is sorted (stable, by start) only when a start lower than the highest one so far was added.
  - Empty `ranges` take the highest start added before them in the pass, not the start of the chunk just before. See change request point 1.
  - `add` and `text` throw when `pass <= queue.pass`.
- `core/state.ts`: `DocumentState.queue`, one per parse. `createDocumentState` makes it. `InlineState` carries `queue` too, so an inline rule can call `state.queue.add(state.queue.pass + 1, start, run)`.
- `core/parse.ts`: `new BlockParser(state).run()`, then `state.queue.run()`, then transforms. `inlineNodes`, `inlineRanges` and `inlineIndents` are gone.
- `core/line.ts`: `Line.last`. The source sets it on its last line and on the empty line after a final line ending; spans set it on the last span when `finalLineEnding` is false. `createLine` sets it to false. `isLastLine(line)` is `line.last || line.endsContent || line.end === line.text.length`. The third test stays for lines made by `createLine` (talata/mdx). See change request point 2.
- `core/blocks.ts`:
  - `BlockState.depth`: 0 for the source.
  - `BlockState.end`: the source length, or the end of the last span.
  - `BlockState.mark(): FlowMark`, `commit(mark)`, `rewind(mark, rule)`, `document(node, spans)` and `OpenBlock.onLazyLine`, with the behavior of the contract.
  - `export interface FlowMark { readonly line: number }`.
  - `export function parseDocument(state, spans, depth)`.
  - `BlockParser(state, spans?, depth = 0)`. Its line source is `readSource` or `readSpans`. `continuesOverEnd(line, index)` reads the empty line at `source.lineStarts[index]`. For spans, that is the index of the last span plus 1.
  - The document layer is `processLine`, plus `processMarkedLine` while the tip is a marked leaf. The flow layer is `flowLine` (everything after the containers) and `attachStarted` (attach, then rules again after a container).
  - Lines are recorded only while a mark is open, 8 numbers each in one array: index, start, end, visual column, split-tab columns, matched, unmatched, flags (`last`, `endsContent`). `replay` walks the array with a cursor, so a rewind inside a replay only moves the cursor.
  - `mark()` holds the paragraph at the tip, or an interruptible leaf that matched the line (change request point 3). A rule that calls `mark()` and returns no block gets an internal error from `tryStart`.
  - A marked leaf that closes without `commit` or `rewind` closes as committed: the held leaf first, then the marked leaf (`closeTip`, then `endMark`). This happens when a container starts, after a lazy line (after `onLazyLine`), and at the end of the document.
- `test/layers-core.test.ts`: a regression test for change request point 1 (`1\n:::a[[foo]]\n[foo]:x` with `[directive]`, shrunk from document 3882; it fails with the contract's rule), a table on a lazy line, the `mark()` assertion, and `depth`, `end` and `Line.last` read by a rule inside a nested document. Also a probe leaf (`@N` marks and rewinds on the N-th line after it; `ok` commits) and a collector (`%%%` collects spans and calls `document`). Covered: held paragraph and table, lazy first line, setext in a replay, a rewind inside a replay, commit order with definitions, `onLazyLine`, a container start, end of file, linear chains, nested parse at depth 1, `finalLineEnding`, and definition order between passes.
- `test/layers-core-random.test.ts`: 20,000 generated documents, each with failing probes on lines where no later line could start a container. The tree equals the tree without the probe, in over 10,000 comparisons and over 5,000 rewinds.
- `test/layers-contract.test.ts`: `describeQueue('core', ...)` runs on `createChunkQueue` with `parseInline`, in place of the todo.

### What mdx-layers-directive and mdx-layers-flow can call

- On `BlockState` (rules): `depth`, `end`, `queue`, `mark()`, `commit(mark)`, `rewind(mark, rule)` and `document(node, spans)`. Also `inline(node, ranges, indents?)`, which now calls `queue.text(textPass(depth, 0), ...)`.
- On `OpenBlock`: `onLazyLine(state, line)`.
- From `core/blocks.ts`: `parseDocument`. From `core/chunks.ts`: `documentPass`, `textPass` and `ChunkQueue`. From `core/spans.ts`: `SPAN_SIZE` and `Spans`.
- On `InlineState`: `queue`, for text directive labels: `state.queue.add(state.queue.pass + 1, start, () => ...)`.
- `mark()` throws when a mark is already open. `commit` and `rewind` throw when given a mark that is not the open one. `start` must return the leaf after calling `mark()`, because the line is recorded when it returns.
- A nested document reads `line.index` as the source line index. Its root block is `root`, as at the source.

### What still runs through v5

- Every v2 to v5 hook works as before: `readLineAt`, `processLine(line, from)`, `inlineIndents`, `willClose`, `startsContainer`, `endContent` and `Line.endsContent`, `getBlock`, `getDepth`, `closeOpenBlocks`, `containerStartsOff`, `keepsLazyContainers`.
- talata/directive (container, scopes, labels) and talata/mdx (re-read, order, flow emulation) are unchanged. Nothing in `src/ext/` uses the new hooks.
- `readLineAt` with a mark open would go to `processMarkedLine`. No caller does that now. mdx-layers-flow removes `readLineAt`.

## Deviations

- `isLastLine` keeps `line.end === line.text.length` as a third test (change request point 2). Without it, talata/mdx lines made by `createLine` lose their last-line state until mdx-layers-flow.
- An empty-range chunk takes the highest start added before it, not the start of the chunk before it (change request point 1). With the contract's rule, `[directive]` fuzz seed 20261123 document 3882 differed from main and from the reference. A container directive label is queued in `start`, before the paragraph it interrupts closes, so text chunks do not always arrive sorted. With the highest start, the 1M comparison has no difference.
- `mark()` holds the lazy paragraph, or an interruptible leaf that matched the line, not any paragraph or interruptible leaf at the tip (change request point 3, from review).
- `processLine` keeps the fast path for a matched concrete leaf (`addLine`, no call to `flowLine`). This was added for speed and does not change behavior.
- No edits outside the owned paths, apart from the shared contract test.

## Stubs left

- None. The stub queue in the contract test stays as the contract's reference implementation, next to the real one.

## Gotchas

- `mark()` holds the paragraph at the tip (lazy or not), or an interruptible leaf (GFM table) only when it matched the line (`state.tip`). A table on a lazy line is not held: it closes with the containers that did not match, as micromark keeps those containers open for a lazy paragraph only (`> | a |\n> | - |\n<a\n> b>c` with `[mdx]` gives the tag at 3:1-4:2 in the reference). A held table therefore closes in `endMark` only after a line every container matched.
- In a replay, `flowLine` closes only down to the mark's container (`closeTo(max(matched, containerIndex))`), even when a lazy first line opens a paragraph after a held table. This is the contract's "never closes a container" rule.
- The first replayed line skips the candidates up to and including `rule` (`candidatesAfter`, by `indexOf` in the line's candidate list). Pass the registered rule object to `rewind`.
- `processMarkedLine` records a line with `unmatched` 0. A line where a container did not match ends the mark: it either starts a container or is lazy. So only the first record can have unmatched containers.
- Timing tests flake while the full suite runs at load 15: `directive-growth` "root, unclosed" and "root, closed inside first", `mdx-acorn` "stays linear", and the new `layers-core` "a chain of failures stays linear" (now best of 5, bound 8). All pass alone.
- The corpus suites now run in a worktree once `benchmark/corpus` is linked, about 6,930 tests.

## Proposed learnings

- When a queue claims chunks arrive in start order, assert it with the fuzz before relying on it | a label queued in `start` arrives before the paragraph it interrupts | packages/talata/src/core | yes (the 1M tree comparison found it; a unit test on `[directive]` document 3882 could pin it)

## Verification

Tree comparison: branch dist against main dist (3196f33), in one process, `JSON.stringify` equal, `MdxError` reason and place compared. Fuzz document generator `documentAt` with corpus seeds, features `allFeatures()` with each extension set.

- After the review fixes (`mark()` hold rule, `tryStart` assertion): corpus 16 configs and 250,000 documents per config (seed 4242), 0 differences; perf table below is from this build.
- Corpus (142 files): 16 configs, none, frontmatter, math, directive, mdx, `mdx({ acorn })`, all (`[frontmatter, math, directive, mdx]`), all with acorn, each with gfm off and on. 0 differences, on the final build.
- 1,000,000 random documents per config (16,000,000 in all, seed 20261123): 0 differences. 100,000 more per config on the final build (seed 777): 0 differences.
- `pnpm fuzz --all`, 1,000,000 documents (seed 20261124, 8 chunks): 0 failures, 7 reference timeouts skipped.
- `pnpm fuzz --all --acorn`, 1,000,000 documents (seed 20261125): 0 failures.
- Targeted generators at default counts in `pnpm --filter talata test`: pass. `MDX_REREAD_COUNT=1000000` (re-read generator): pass. `MDX_ACORN_TARGETED=1000000`: pass.
- Performance. perf-pass `bench.py`, 20 interleaved runs of a talata-only best-of-15 median per input, load under 4. Main against main measures the noise.

  | Input     | main vs main | branch vs main | bench.py verdict |
  | --------- | ------------ | -------------- | ---------------- |
  | readmes   | -0.3%        | -13.0%         | better           |
  | fs.md     | -0.4%        | +0.7%          | within noise     |
  | changelog | +0.0%        | -1.9%          | within noise     |

  Before the concrete-leaf fast path, fs.md was +2.7% (worse, under 3%).

- `pnpm --filter benchmark interleaved`: branch talata 35.3 / 10.4 / 24.8 ms, 16.7x / 17.8x / 21.1x faster than mdast + gfm. Main: 34.7 / 10.5 / 32.8 ms, 16.0x / 17.6x / 20.4x. The branch run started at load 7.
- Main entry (`pnpm --filter benchmark size`): 35,215 bytes gzip, 101,037 minified. Main: 33,367 bytes gzip, 94,758 minified (+1,848 gzip). Not a gate.
- Fast check: `pnpm --filter talata test`: 6,924 passed, 9 skipped, 1 todo, after rerunning the two `directive-growth` timing tests alone. `tsc --noEmit`: clean. `oxlint`: errors only in `.github/scripts/smoke.mjs`, plus the two `max-depth` warnings in `src/ext/directive/`. `oxfmt --check`: clean.

## Size

- Estimated L, actual L.
