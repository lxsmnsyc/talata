---
id: gfm-green
title: All GFM examples and the corpus match
status: active
priority: must
type: feature
outline: false
milestone: m2-gfm
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/test/gfm-green*.test.ts
shared:
  - packages/talata/src/**
  - packages/talata/test/fuzz/**
  - packages/talata/test/parsers.ts
  - packages/talata/test/gfm-tasks-footnotes.test.ts
  - packages/talata/test/fuzz/fixtures/**
  - roadmaps/v1/contracts/*.change-request.md
reserves: []
provides: []
depends_on:
  - on: gfm-tables
    kind: hard
    why: fixes interactions between finished GFM rules
  - on: gfm-inline
    kind: hard
    why: fixes interactions between finished GFM rules
  - on: gfm-tasks-footnotes
    kind: hard
    why: fixes interactions between finished GFM rules
---

# All GFM examples and the corpus match

## Goal

Every GFM example and every corpus file gives a tree equal to the reference parser with GFM enabled.

## Context

The reference parser can hang: `[^n]: x\n\n![ \n^n]` (space before the line ending) never finishes in micromark with GFM (talata: 1.4 ms). The fuzzer parses synchronously with no time limit, so give the reference call a timeout (a worker thread or child process) and count such documents as skipped with a reason before the 1,000,000-document run.

From gfm-tasks-footnotes: when a list item's marker line is empty, the reference takes the next lazy line as the item's first content even outside the item: `-\n[ ] a`, `> -\n> [ ] a` and `-\n[x]\n-|-` drop `[ ]` and set `checked: false` on the root or the block quote. Match it with a GFM transform (two `it.fails` cases in `test/gfm-tasks-footnotes.test.ts`). Also `![\n^a]` (a footnote call whose label starts on the next line) is not a call in talata.
From gfm-inline: when emphasis comes before the first `~` and a tilde pair is possible, emphasis takes its general path (`*x* ` then many `~a~ a* `: 0.3 s at 50 KB, the reference 13 s); hand to perf-pass if not fixed here.

Every GFM flag in `test/fuzz/features.ts` must be on.

Remaining differences come from GFM rules interacting with each other or with CommonMark rules.

## Acceptance

- [ ] `pnpm --filter talata test` passes with all suites enabled.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: integration fixes.
