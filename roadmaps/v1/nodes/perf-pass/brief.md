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

Use the perf-pass skill: baseline, profile, several candidate optimizations measured side by side. Record before and after numbers in `benchmark/RESULTS.md`.

## Acceptance

- [ ] `pnpm --filter benchmark interleaved` meets the target on two runs.
- [ ] Every test still passes.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

L: measurable target, but how to reach it is unknown until the profile.
