---
id: perf-pass
title: Reach the speed target
status: todo
priority: must
type: feature
outline: false
milestone: m3-release
target:
from:
size: L
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/test/perf-pass*.test.ts
shared:
  - packages/talata/src/**
  - packages/talata/package.json
  - pnpm-lock.yaml
  - packages/talata/test/fuzz/fixtures/**
  - roadmaps/v1/contracts/*.change-request.md
reserves: []
provides: []
depends_on:
  - on: gfm-green
    kind: hard
    why: measures the complete parser, so optimizations do not have to be redone
---

# Reach the speed target

## Goal

Profile talata on the benchmark corpus and optimize until it is at least 4 times faster than "mdast + gfm" on the README corpus and `node fs.md`, with every test still passing.

## Context

From the gfm-inline review: the literal-autolink transform still costs about 9% of GFM parse time on prose, mostly walking text nodes that cannot match. Let the inline rule flag the document when it rejects a `www.`, `://` or `@` candidate and run the transform only then. The mixed emphasis/strikethrough quadratic case: `*x* ` then `'~a~ a* '` repeated (670 ms at 56 KB).

From the gfm-tables review: on table-heavy documents 58% of the time is garbage collection from per-cell inline state (`createInlineState`, `state.inline`, a 2-element range array per cell in `src/gfm/table.ts:330`).

From the inline-core review: `failBracket` in `src/inline/link.ts` (~194-200) splices `state.delimiters` and becomes quadratic when a failed bracket sits under many delimiters (`'[*a '.repeat(n/8) + ' a*]'.repeat(n/8)`: 41 ms at 50 KB, 660 ms at 100 KB). Mark the bracket dead instead of splicing, add the input to the growth tests, and count splice lengths in `workSteps`. Keep the test hooks `emphasisPaths` and `workSteps` out of the public bundle.

Use the perf-pass skill: baseline, profile, several candidate optimizations measured side by side. Record before and after numbers in `benchmark/RESULTS.md`.

## Acceptance

- [ ] `pnpm --filter benchmark interleaved` meets the target on two runs.
- [ ] Every test still passes.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

L: measurable target, but how to reach it is unknown until the profile.
