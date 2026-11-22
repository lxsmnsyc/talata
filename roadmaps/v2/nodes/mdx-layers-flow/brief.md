---
id: mdx-layers-flow
title: MDX flow constructs rewind instead of emulating the re-read
status: todo
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
  - packages/talata/src/ext/mdx/**
  - packages/talata/src/mdx.ts
  - packages/talata/test/mdx*.test.ts
  - packages/talata/test/fuzz/**
  - packages/talata/src/core/blocks.ts
  - packages/talata/src/core/line.ts
  - packages/talata/src/blocks/paragraph.ts
  - packages/talata/test/core-hooks*.test.ts
shared:
  - packages/talata/test/layers-contract.test.ts
reserves: []
provides: []
depends_on:
  - on: mdx-layers-core
    kind: hard
    why: needs flow-layer mark and rewind
  - on: mdx-layers-directive
    kind: hard
    why: directive content must parse in the chunk queue for the error order
---

# MDX flow constructs rewind instead of emulating the re-read

## Goal

Port `talata/mdx` to the layers: a failed JSX flow tag or flow expression rewinds its flow layer and the lines are read again for real; errors are thrown in chunk-queue order, and the first one wins. Delete `reread.ts`, `prefixes.ts`, `order.ts`, the re-read half of `flow.ts`, and the v5 hooks `readLineAt` and `inlineIndents` (contract v6). This takes over the goals of fix-mdx-directive-growth (the DoS) and fix-mdx-known-cases.

## Acceptance

- [ ] Every input in the existing MDX tests and generators still matches the reference.
- [ ] Every case listed in `nodes/fix-mdx-known-cases/brief.md` and the two regressions in `nodes/fix-mdx-directive-growth/outcome.md` match the reference.
- [ ] `'{a\n:::x\n}x\n'.repeat(n)` with `[directive, mdx]`, with heads `a. `, `*a* `, `&amp; `, `[a] `, and in quotes and lists, grows under 5x per 4x size (with acorn: no faster than the reference).
- [ ] 1,000,000-document `--all` and `--all --acorn` fuzz and every targeted generator (re-read, acorn, lazy-place) run 1,000,000 documents with no difference.
- [ ] `[F]:x\n"\n<s\r>"` with `--all --acorn` matches the reference (fuzz seed 20261201, document 587638; main fails it too).
- [ ] Output without MDX equals main. Fast check and full check pass.

## Sizing

L: MDX flow on rewind, error order from the queue, deletions.
