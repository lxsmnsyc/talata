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
  - packages/talata/test/spec-green*.test.ts
shared:
  - packages/talata/src/**
  - packages/talata/test/fuzz/features.ts
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

Turn on `blockquote`, `list`, `setext`, `code`, `html`, `definition` and `inline` in `test/fuzz/features.ts` and fix what the fuzzer finds. Implement the accepted parser-core v3 change (`BlockState.tip`, see `contracts/parser-core-v3.change-request.md`) so lists after indented code match the reference (`    a\n2. b`).

Differences left at this point come from interactions between rules: lazy continuation with lists, definitions inside containers, positions after container prefixes.

## Acceptance

- [ ] `pnpm --filter talata test` passes with `ready.commonmark` and `ready.corpus` on (GFM suites may still be skipped).
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: fixes spread over many files, each small.
