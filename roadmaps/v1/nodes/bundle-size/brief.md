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
shared: []
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

A bundler build of each entry point with esbuild is enough.

## Acceptance

- [ ] `pnpm --filter benchmark size` prints both sizes, and talata is smaller.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: one script.
