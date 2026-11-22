---
id: fix-mdx-directive-growth
title: Failed MDX constructs over directives grow linearly
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
owns:
  - packages/talata/src/ext/mdx/reread.ts
  - packages/talata/src/ext/mdx/flow.ts
  - packages/talata/test/mdx-growth*.test.ts
shared: []
reserves: []
provides: []
depends_on: []
---

# Failed MDX constructs over directives grow linearly

## Goal

With `[directive, mdx]`, `'{a\n:::x\n}x\n'.repeat(n)` grows about 14.6x per 4x size in talata (on merged main: 11 KB takes 106 ms, 44 KB takes 1295 ms, so about 180 KB blocks for 20 s) while the reference grows linearly. Untrusted MDX can block a parser this way, so 0.4 ships with the fix. The MDX re-read nests one container directive per unit before the parse throws. Make it grow under 5x per 4x size with the output unchanged.

## Acceptance

- [ ] Growth test (ratio at 4x size) fails on batch/v2 and passes on the branch.
- [ ] Targeted re-read generator and the 1,000,000-document `--all` fuzz find no difference. Fast check passes.

## Sizing

S: stop the re-read from opening nested directives once the result is known to throw, or reuse their state.
