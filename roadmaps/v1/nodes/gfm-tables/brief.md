---
id: gfm-tables
title: GFM tables
status: todo
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
shared:
  - packages/talata/src/blocks/index.ts
  - packages/talata/src/blocks/paragraph.ts
  - packages/talata/test/parsers.ts
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

The header row is the open paragraph's last line; take it with `takeParagraph()`. Turn on `ready.gfm.table` when done.

GFM spec section Tables, and `mdast-util-gfm-table`.

## Acceptance

- [ ] GFM table examples and corpus files with tables give trees equal to the reference parser with GFM.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: one block rule with its own inline splitting.
