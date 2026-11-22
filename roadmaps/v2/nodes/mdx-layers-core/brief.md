---
id: mdx-layers-core
title: Split the block parser into document and flow layers
status: active
priority: must
type: refactor
outline: false
milestone: m5-mdx
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-23
owns:
  - packages/talata/src/core/**
  - packages/talata/src/blocks/**
  - packages/talata/src/gfm/**
  - packages/talata/test/layers-core*.test.ts
shared:
  - packages/talata/test/layers-contract.test.ts
reserves: []
provides: []
depends_on:
  - on: mdx-layers-contract
    kind: contract
    via: block-layers
---

# Split the block parser into document and flow layers

## Goal

Implement the document layer, the flow layer with mark and rewind, and the chunk queue from `contracts/block-layers.md` in `src/core/`, with core blocks and GFM ported. Extensions keep working through the v5 interface until their own node moves them. Output for every input stays identical to main, and speed stays within noise.

## Acceptance

- [ ] Tree hashes over the corpus and 1,000,000 random documents with every extension set, gfm on and off, equal main.
- [ ] 1,000,000-document `--all` and `--all --acorn` fuzz: no difference from the reference that main does not also have.
- [ ] `pnpm --filter benchmark interleaved`: gap to main within the noise measured by perf-pass `bench.py` (main vs main), never over 3%; main entry size reported.
- [ ] Contract tests and fast check pass.

## Sizing

L: core refactor behind an unchanged output.
