---
id: gfm-inline
title: GFM strikethrough and autolink literals
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
  - packages/talata/src/gfm/strikethrough.ts
  - packages/talata/src/gfm/autolink-literal.ts
  - packages/talata/src/gfm/autolink-literal-transform.ts
  - packages/talata/test/gfm-inline*.test.ts
shared:
  - packages/talata/src/inline/index.ts
  - packages/talata/src/core/transform.ts
  - packages/talata/test/parsers.ts
  - packages/talata/test/fuzz/features.ts
reserves: []
provides: []
depends_on:
  - on: inline-core
    kind: hard
    why: strikethrough shares the delimiter stack inline-core writes
---

# GFM strikethrough and autolink literals

## Goal

Add `~~strikethrough~~` (single and double tildes, as the reference does) and autolink literals (`www.`, `http://`, `https://` and email addresses) with the reference's trailing punctuation rules.

## Context

Turn on `strikethrough` and `autolinkLiteral` in `test/fuzz/features.ts` too, so the differential fuzzer covers them.

Strikethrough is a `resolve(state, bottom)` rule with `gfm: true`; links resolve their span first, so `~~[a~~](b)` keeps the outer `~~` as text (parser-core v2). GFM spec sections Strikethrough and Autolinks (extension). The reference's output is the spec. It finds autolink literals in a tree transform over merged text nodes with `findAndReplace`, ignoring `link` and `linkReference`, and the nodes it creates have no `position`. Implement it as a `Transform` first, matching node boundaries and missing positions exactly. Moving it into the inline pass is a later optimization for perf-pass. Turn on `ready.gfm.strikethrough` and `ready.gfm.autolinkLiteral` when done.

## Acceptance

- [ ] GFM strikethrough and autolink examples and the corpus give trees equal to the reference parser with GFM.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: two inline rules; autolink literal boundaries are fiddly.
