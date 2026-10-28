---
id: gfm-tables
title: GFM tables
status: active
priority: must
type: feature
outline: false
milestone: m2-gfm
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/src/gfm/table.ts
  - packages/talata/test/gfm-tables*.test.ts
shared:
  - packages/talata/src/blocks/index.ts
  - packages/talata/src/blocks/paragraph.ts
  - packages/talata/test/parsers.ts
  - packages/talata/test/fuzz/features.ts
  - packages/talata/test/corpus.test.ts
  - packages/talata/test/equivalence.test.ts
  - packages/talata/test/gfm.test.ts
reserves: []
provides: []
depends_on:
  - on: blocks-leaf
    kind: hard
    why: the table header converts the open paragraph, which blocks-leaf's paragraph takeover code finishes
  - on: blocks-container
    kind: hard
    why: tables inside lists and quotes need the container stack
---

# GFM tables

## Goal

Add GFM tables: delimiter row, alignment, escaped pipes, and rows that end the table, producing `table`, `tableRow` and `tableCell` with `align`.

## Context

Table body rows never continue lazily; check `BlockState.unmatched` (parser-core v4). The 23 corpus files waiting on GFM are listed in `test/corpus.test.ts` (`gfmWaiting`); remove the ones you unblock.

Turn on `table` in `test/fuzz/features.ts` too, so the differential fuzzer covers it.

The header row is the open paragraph's last line; take it with `splitParagraph(1)`, which leaves earlier lines to close as a paragraph and returns undefined under a lazy paragraph. Mark the open table `interruptible`, so any block start ends the body; body rows are never lazy. `test/core.test.ts` has a test-only table that shows both (parser-core v2). Turn on `ready.gfm.table` when done.

GFM spec section Tables, and `mdast-util-gfm-table`.

## Acceptance

- [ ] GFM table examples and corpus files with tables give trees equal to the reference parser with GFM.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: one block rule with its own inline splitting.
