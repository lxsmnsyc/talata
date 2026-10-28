---
id: differential-fuzz
title: Differential fuzzer against the reference parser
status: done
priority: should
type: feature
outline: false
milestone: m3-release
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
  - packages/talata/test/fuzz/**
shared: []
reserves: []
provides: []
depends_on:
  - on: harness
    kind: hard
    why: reuses the difference printer the harness adds
---

# Differential fuzzer against the reference parser

## Goal

Generate random Markdown (from a grammar of block and inline constructs, plus mutations of corpus files), compare talata with the reference parser, and shrink any failing input to a minimal case saved as a fixture.

## Context

Spec examples and the corpus cover common cases; the fuzzer finds rare interactions. It can be built before the parser is complete. Include pathological inputs (deep nesting, long runs of `*` and `[`) and check that talata never throws. Run it in earnest after gfm-green.

## Acceptance

- [ ] `pnpm --filter talata fuzz --count N` runs N documents and prints minimized failures.
- [ ] A 1,000,000-document run finds no differences once gfm-green is done.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: generator and shrinker, no parser changes.
