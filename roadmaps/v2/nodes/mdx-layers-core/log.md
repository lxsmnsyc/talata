# Log: mdx-layers-core

## 2026-11-23

- Branch `refactor/mdx-layers-core`, reset to `roadmap/design-d` (4864469).
- Read GOAL, CLAUDE, brief, block-layers v1, the spike, extension v5, the contract outcome, and the briefs of mdx-layers-directive and mdx-layers-flow.
- Built `core/spans.ts`, `core/chunks.ts` (queue in parallel arrays per pass, sorted only when an added start went down), `DocumentState.queue`, `Line.last`, and in `core/blocks.ts`: `processLine` split into the document layer (`processLine`, `processMarkedLine`) and the flow layer (`flowLine`, `attachStarted`), `mark`/`commit`/`rewind` with a flat record of 8 numbers per line and a replay loop, `onLazyLine`, `document`, `parseDocument`, `depth`, `end`.
- `isLastLine` keeps `line.end === line.text.length` as a third test: talata/mdx makes lines with `createLine` and never sets `last`. A line that ends the text is the last line of any document, so the test is never wrong.
- A marked leaf that closes without `commit` or `rewind` (container start, lazy line, end of document) closes as committed: the held leaf closes first, then the marked leaf. Done in `closeTip`.
- First tree comparison (branch dist vs main dist, same process, JSON equal): corpus 16 configs equal, 10k random per config equal.
- Perf, talata alone on the interleaved inputs (`bench.py`, 10 runs of best-of-15 medians): readmes -17%, fs.md +1.7% first, +1.0% after caching the last pass in the queue, changelog within noise.
- Tests: `test/layers-core.test.ts` (probe leaf that marks and rewinds or commits, collector that calls `document`), `test/layers-core-random.test.ts` (20k generated documents with failing probes inserted where no line could start a container: tree equals the tree without the probe; over 5000 rewinds, nested ones included). Contract test runs `describeQueue` on the real queue.
- 1M comparison found one difference with `[directive]` (seed 20261123 doc 3882): a container directive label is queued before the paragraph it interrupts closes, so the sort moved it after a v5 scope hook. Empty-range chunks now take the highest start so far. Change request written. Rerun: 16M documents, 0 differences.
- `--all` and `--all --acorn` fuzz, 1M each: 0 failures. Re-read and acorn targeted generators at 1M: pass.
- fs.md was +2.7% on the final build; a fast path for matched concrete leaves in `processLine` brought it to +1.0% (noise 0.3-0.8%).
