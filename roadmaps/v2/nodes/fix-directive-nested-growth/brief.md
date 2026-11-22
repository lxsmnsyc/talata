---
id: fix-directive-nested-growth
title: Deep unclosed directive chains parse in linear time
status: done
priority: must
type: fix
outline: false
milestone: m5-mdx
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-22
spent: 330000
owns:
  - packages/talata/src/ext/directive/**
  - packages/talata/src/blocks/code-fenced.ts
  - packages/talata/src/core/blocks.ts
  - packages/talata/test/directive-growth*.test.ts
shared: []
reserves: []
provides: []
depends_on:
  - on: fix-mdx-reread-container
    kind: hard
    why: edits directive/container.ts and core/blocks.ts, which that node also changes
---

# Deep unclosed directive chains parse in linear time

## Goal

`':::x\n'.repeat(n) + 'a\n' + ':::\n'.repeat(n)` with `directive()` alone takes 31, 219 and 1470 ms at n = 200, 400 and 800 on batch/v2 (about 7x per doubling, cubic). With `[directive, mdx]`, `'{a\n:::x\n}x\n'.repeat(n)` takes 6.3 s at n = 1000. Make both grow linearly, or at most as fast as the reference (`micromark-extension-directive`) does, with the tree unchanged.

## Context

Found by the fix-mdx-reread-container review. A CPU profile at n = 800 points to `isClosingFence` (`blocks/code-fenced.ts:12`), `getDepth` (`core/blocks.ts:524`) and `continuesAfter` / `continuesNext` (`directive/container.ts:494`, `:600`): each line walks every open directive, and each walk does work in the depth. This is in the released `talata/directive` (0.3), so the fix needs a patch changeset.

## Acceptance

- [ ] Prove the growth on batch/v2 first with a growth test (time ratio at 4x size, not wall time).
- [ ] Nested chains, closed and unclosed, at the root, in quotes and lists, grow under 5x per 4x size. Compare with the reference's growth too.
- [ ] Output does not change: tree hashes over the corpus and 100,000 random documents with all extensions, gfm on and off, match batch/v2; the 1,000,000-document `--all` fuzz finds no difference.
- [ ] Fast check passes. Patch changeset for talata.

## Sizing

S: cache the depth or the open-directive scan per line.
