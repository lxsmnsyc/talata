---
id: spec-green
title: All CommonMark examples and the corpus match
status: todo
priority: must
type: feature
outline: false
milestone: m1-commonmark
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added:
owns:
  - packages/talata/test/parsers.ts
shared:
  - packages/talata/src/**
reserves: []
provides: []
depends_on:
  - on: blocks-leaf
    kind: hard
    why: fixes interactions between finished rules
  - on: blocks-container
    kind: hard
    why: fixes interactions between finished rules
  - on: inline-core
    kind: hard
    why: fixes interactions between finished rules
  - on: harness
    kind: hard
    why: needs the corpus tests to run
---

# All CommonMark examples and the corpus match

## Goal

Turn on `ready.commonmark` and `ready.corpus` and fix every remaining difference: all 652 CommonMark examples and every corpus file give trees equal to the reference parser without GFM.

## Context

Differences left at this point come from interactions between rules: lazy continuation with lists, definitions inside containers, positions after container prefixes.

## Acceptance

- [ ] `pnpm --filter talata test` passes with `READY = true` for the CommonMark and corpus suites (GFM suites may still be skipped).
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: fixes spread over many files, each small.
