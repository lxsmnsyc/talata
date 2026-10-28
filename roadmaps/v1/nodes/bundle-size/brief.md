---
id: bundle-size
title: Bundle size check
status: todo
priority: should
type: feature
outline: false
milestone: m3-release
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
  - benchmark/size/**
shared:
  - package.json
  - pnpm-lock.yaml
  - roadmaps/v1/contracts/*.change-request.md
reserves: []
provides: []
depends_on:
  - on: perf-pass
    kind: hard
    why: measures the parser after optimization
---

# Bundle size check

## Goal

Measure the minified and gzipped size of talata against `mdast-util-from-markdown` with GFM, and add a size check to the benchmark package.

## Context

From the inline-core review: `src/inline/entities.ts` (2,125 named references) is 24.6 KB raw, 11.3 KB gzip, more than half of talata's gzip size at that point (browser build 47.9 KB / 19.5 KB gzip against 82.0 KB / 22.5 KB gzip for the reference stack). The reference's browser build decodes names through the DOM (`decode-named-character-reference/index.dom.js`) and ships no table. Measure a compact encoding and a DOM decoder under a `browser` export condition.

A bundler build of each entry point with esbuild is enough.

## Acceptance

- [ ] `pnpm --filter benchmark size` prints both sizes, and talata is smaller.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: one script.
