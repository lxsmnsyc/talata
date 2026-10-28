---
id: bundle-size
title: Bundle size check
status: done
priority: must
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
# 2026-10-28: the user moved this node to run beside perf-pass instead of after it.
owns:
  - benchmark/size/**
  - packages/talata/src/inline/entities*.ts
shared:
  - packages/talata/package.json
  - packages/talata/tsdown.config.ts
  - benchmark/package.json
  - package.json
  - pnpm-lock.yaml
  - roadmaps/v1/contracts/*.change-request.md
reserves: []
provides: []
depends_on: []
---

# Bundle size check

## Goal

Measure the minified and gzipped size of talata against `mdast-util-from-markdown` with GFM, and add a size check to the benchmark package.

## Context

From the inline-core review: `src/inline/entities.ts` (2,125 named references) is 24.6 KB raw, 11.3 KB gzip, more than half of talata's gzip size at that point (browser build 47.9 KB / 19.5 KB gzip against 82.0 KB / 22.5 KB gzip for the reference stack). The reference's browser build decodes names through the DOM (`decode-named-character-reference/index.dom.js`) and ships no table. Measure a compact encoding and a DOM decoder under a `browser` export condition.

A bundler build of each entry point with esbuild is enough.

This node runs beside perf-pass, which may change other files under `src/`. Measure the current `main`, and make the script easy to rerun after perf-pass merges. Since the inline-core numbers above, the build has grown: on 2026-10-28 the unminified ESM chunk was 191.6 KB, 51.9 KB gzip. If talata is not smaller, shrink it here. You own `src/inline/entities*.ts`. A `browser` export condition in `packages/talata/package.json` and a second build entry in `tsdown.config.ts` are allowed; keep those edits small. Do not edit other `src/` files. If something there is the cause (for example the test hooks `emphasisPaths` and `workSteps` reaching the public bundle), say so in the outcome; perf-pass removes the hooks.

## Acceptance

- [ ] `pnpm --filter benchmark size` prints both sizes, and talata is smaller.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: one script.
