---
id: gfm-green
title: All GFM examples and the corpus match
status: todo
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
owns: []
shared:
  - packages/talata/src/**
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

Remaining differences come from GFM rules interacting with each other or with CommonMark rules.

## Acceptance

- [ ] `pnpm --filter talata test` passes with all suites enabled.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: integration fixes.
