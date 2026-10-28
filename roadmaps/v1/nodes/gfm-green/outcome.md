# Outcome: gfm-green

## Built

Branch `feat/gfm-green`. Paths are under `packages/talata/`.

- Fuzz time limit, `test/fuzz/timed-check.ts` and `test/fuzz/check-worker.ts`. `createTimedCheck(ms)` runs `check` in a worker thread. The main thread waits on a shared flag with `Atomics.wait` and reads the reply with `receiveMessageOnPort`, so `runFuzz` stays synchronous. When the limit passes, the worker is replaced. A document whose reference parse ran past the limit is skipped as `reference timed out`. One whose talata parse did is a throw failure. Each round trip costs about 0.1 ms.
  - The CLI uses it with `--timeout-ms MS` (default 5000). It prints a replay line for up to 20 documents skipped for a `reference ...` reason.
  - `RunOptions.check` is the new hook, and `Report.skippedAt` lists those skipped documents.
  - The smoke test still runs in the test process.
  - `test/fuzz/fuzz.test.ts` checks that `[^n]: x\n\n![ \n^n]` is skipped with a 1 s limit and that the next document still runs.
  - Review round 1: a comparison that throws in the worker is a `throw` failure, `comparison threw: <message>`, not a timeout. For example, `'>'.repeat(12000) + ' a\n'` overflows the stack in tree-diff's recursive `walk`. A worker that exits during a check wakes the main thread and is reported as `fuzz worker died during the check`. An out-of-memory kill runs no JavaScript, so that case still waits for the limit and reads as a timeout. Replay lines carry `--timeout-ms` when it is not the default, and values below 1 exit with code 2.
- Lazy task check outside list items (`-\n[ ] a`, `> -\n> [ ] a`, `-\n[x]\n-|-`, `9.\r[ ] #`), in `src/gfm/task-list.ts`:
  - `taskListStart` records the line in a per-`Source` map when the innermost matched container is not a list item.
  - `paragraphClosed` moves the entry to the paragraph's content start after definitions. It is called from `src/blocks/paragraph.ts`, with GFM only. Only paragraphs get the check: setext headings and table headers keep `[ ]` in the reference.
  - The inline rule consumes the check without slicing a character.
  - The new `outsideChecks` transform sets `checked` on the paragraph's parent: the root, a block quote or a footnote definition. It is registered first in `src/core/transform.ts`.
- Emphasis before strikethrough is now linear and gives the same output as before. This is `resolveAttentionFirst` in `src/inline/emphasis.ts`, called from `src/gfm/strikethrough.ts`.
  - Top-level emphasis pairs ignore tildes, because micromark resolves attention first, so they pair as `pairList` does.
  - Inside a pair, tildes pair first (`pairTildeList`). Then the emphasis runs pair, separately inside each delete and outside them.
  - Leftover top-level runs become text, then the top-level tildes pair.
  - One `rebuild` builds emphasis, strong and delete nodes.
  - At 50 KB, `*x* ` + `~a~ a* ` went from 226 ms to 23 ms, and `*x* ~a~ ` + `*b ~c~ d* ` from 1.47 s to 12 ms. 200 KB takes 46 to 63 ms.
  - The old path stays behind `strikethroughPaths.mixed`, only so a test can compare the two.
- Tests:
  - `test/gfm-green.test.ts`: 23 lazy-task cases, 14 emphasis-first cases, 3,000 generated strings compared between the old and new paths, and 3 work-growth cases, each also compared with the reference.
  - The two `it.fails` cases in `test/gfm-tasks-footnotes.test.ts` moved to `gfm-green.test.ts`, where they pass.
- Fuzz found only one difference, `9.\r[ ] #` (the lazy task check). It is fixed and covered in `gfm-green.test.ts`. It was not saved as a fixture: a fixture replays under vitest, where the reference's development build throws on it (see Gotchas).

## Deviations

- The lazy task cases cannot be compared under vitest in the test process. Vitest resolves the `development` export condition, and `devlop`'s assert in mdast-util-gfm-task-list-item's `exitCheck` throws ("always in a paragraph, in a list item"). This is why the old `it.fails` cases failed. The published build that users get sets `checked` on the parent. These tests compare through the fuzz worker, which uses plain Node resolution (`execArgv: []`).
- `src/blocks/paragraph.ts`, a CommonMark file, calls `paragraphClosed` from `src/gfm/task-list.ts` when GFM is on. This costs one WeakMap lookup per paragraph close. The contract does not change, so I wrote no change request.
- The 1,000,000-document run ran after the merge, after the machine restart (see Verification).

## Stubs left

- None.

## Remaining differences from the reference

- None known. Every CommonMark and GFM spec example and every corpus file match, with and without GFM, and no fuzz run since the fixes found a difference.
- The reference hangs on `[^n]: x\n\n![ \n^n]` (a space before the line ending), and talata parses it. The fuzzer now skips such documents as `reference timed out`. The generator produced none in the 400,000 documents run here.

## Reference quirks for the release README

Cases where the reference differs from the spec, or behaves in a surprising way. Talata matches all of them except the hang.

- Task check outside list items. After an item whose marker line is empty, the next lazy paragraph loses `[ ]` and its parent gets `checked`, even when that parent is the root or a block quote (`-\n[ ] a`). The development build of the reference throws here instead.
- Setext headings and table headers in that position keep `[ ]`.
- `[^n]: x\n\n![ \n^n]` never finishes in micromark with GFM.
- Strikethrough and emphasis resolve in the order of the leaf's first `~` or `*`/`_` run (gfm-inline).
- Literal autolinks from the mdast transform have no position, and `www.` alone links to `http://www` (gfm-inline).
- Kind 7 HTML as a table header takes the delimiter row (`a\n<n>\n|-`). A table closed by a lazy line blocks a header on the next line. `a\n:-` is a one-column table (gfm-tables).
- From spec-green:
  - kind 7 HTML on a lazy line stays in the containers;
  - indented code on a lazy line is one line long;
  - fenced code trims one line ending from each end of its value;
  - an emphasis run next to a NUL keeps its whole value;
  - list items end at the closing event after a child that kept its line ending.

## Gotchas

- Under vitest the reference is its development build, with assertions. To compare an input whose published behavior differs, use `createTimedCheck` (see `checkPublished` in `test/gfm-green.test.ts`). A fuzz fixture of such an input would fail in `fuzz.test.ts`, which replays in process.
- `check-worker.ts` registers its own `.ts` resolve hook, because hooks are per thread. It must keep `execArgv: []`, or under vitest it inherits the `development` condition.
- The emphasis-first path depends on `pairList` keeping its `previous` chain intact for the `rest` output, which holds the tildes outside every pair. A change to how `pairList` unlinks delimiters must keep that chain intact.
- perf-pass: the general path `resolveMixed` now runs only for `emphasisPaths.mixedOnly` and `strikethroughPaths.mixed` (tests). It could be removed if those tests compare against fixed trees instead.

## Proposed learnings

- Check which export condition the reference loads in tests | vitest's `development` condition turns on devlop assertions that throw where the published build does not | packages/talata/test | yes (checkPublished through the worker)
- Give every reference call in long fuzz runs a time limit | micromark has inputs that never finish | packages/talata/test/fuzz | yes (fuzz time limit test)

## Verification

- `npx vitest run` in packages/talata, corpus present: 19 files, 4972 tests passed, 0 skipped. After review round 1: 4973 passed.
- `npx tsc --noEmit -p packages/talata`: no errors. `npx oxlint`: no findings. `npx oxfmt --check src test`: clean.
- GFM fuzz, 50,000 documents per seed: seeds 2101, 2202, 2303 (`--no-corpus`) and 2404 gave 0 failures and 0 skipped. Seed 1001, 20,000 documents before the fixes, gave 1 failure (`9.\r[ ] #`).
- Final runs, two processes at once, load average 6.4 to 8.7:
  - seed 3031, `--no-gfm`, 200,000 documents: 200,000 compared, 0 failures, 150 s;
  - seed 3032, GFM, with corpus mutation, 200,000 documents: 200,000 compared, 0 skipped, 0 failures, 225 s.
- Scratch fuzzers, not committed:
  - container prefixes combined with table, task, footnote, strikethrough and autolink lines, both modes: 120,000 documents, 0 differences;
  - 190,000 short `*_~[]` strings comparing the new emphasis-first path with the old one, and every fourth with the reference: 0 differences.
- 1,000,000-document run, 2026-10-28 after the restart, one process, load average under 4 at the start:

  ```sh
  pnpm --filter talata fuzz --count 1000000 --seed 20261028 --max-failures 10
  ```

  GFM on, corpus mutation on: 1,000,000 compared, 0 skipped (`reference timed out`), 0 failures, 546 s, exit code 0.

## Size

- Estimated S, actual S.
