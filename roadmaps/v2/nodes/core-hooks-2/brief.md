---
id: core-hooks-2
title: Core hooks for directive content
status: todo
priority: must
type: refactor
outline: false
milestone: m4-directive
target:
from:
size: M
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: false
added: 2026-11-02
owns:
  - packages/talata/src/core/**
  - packages/talata/src/blocks/**
  - packages/talata/src/gfm/**
  - packages/talata/test/core-hooks-2*.test.ts
shared:
  - roadmaps/v2/contracts/extension.change-request.md
reserves: []
provides:
  - extension
depends_on:
  - on: core-hooks
    kind: hard
    why: extends the v2 hooks in the same files
---

# Core hooks for directive content

## Goal

Add the three block-side hooks that `roadmaps/v2/contracts/extension-directive.change-request.md` asks for, so a container extension can hold flow content the way micromark does without guessing. The tree output of talata, with and without the 0.2 extensions, does not change.

## Context

Read the change request first: its Problem section has the cases, with inputs, and its Workaround section shows what the directive does today (code on `origin/feat/directive`, `packages/talata/src/ext/directive/container.ts`). Hooks to add (names are a proposal; keep them if nothing better fits, and follow the ts-style naming rules: no `<noun>Of`, a plain read is `get<Noun>`):

1. A way for a container to close its inner blocks with its own `keepsLineEnding` when a container starts outside it on a line where it does not match. Either `OpenBlock.closing?(state, line, keepsLineEnding)`, called on each open block before `attach` closes it, or `BlockState.willStartContainer(line)`. Pick the one with less cost in the hot path.
2. `BlockState.getBlock(depth): OpenBlock | undefined`, read-only, the counterpart of `getDepth`.
3. A flag a container's `continue` sets to say "this line is the last line of my content" (`Line.endsContent` or `BlockState.contentEndsHere`). While set, `isEmptyLastLine`, the block quote's end-only rule, `keepsLazyContainers`, list item `matchedEnd` and the table's `state.unmatched` lazy-row check treat the line as the last one without a line ending.

Test each hook with a small test-only container rule in `test/core-hooks-2*.test.ts`, using the inputs from the change request where they fit, and compare against the reference where a reference construct exists (`micromark-extension-directive` is a devDependency on `feat/directive`, not on main; use test-only rules and expected trees instead). Do not touch `src/ext/directive/`; ext-directive moves onto the hooks after this lands.

Write the v3 interface into `roadmaps/v2/contracts/extension.change-request.md`. The orchestrator copies it into `extension.md`.

## Acceptance

- [ ] Each of the three hooks has a test with a test-only rule.
- [ ] All existing tests pass unchanged, including the reference inputs and the corpus for GFM, frontmatter and math.
- [ ] `cd packages/talata && pnpm fuzz --count 1000000 --seed <any> --all` finds no difference.
- [ ] Interleaved A/B against `main` (with a main-against-main control run for noise): no corpus file slower by more than 3%, and talata stays at least 4 times faster than "mdast + gfm". Record `uptime` with the numbers.
- [ ] `pnpm --filter benchmark size`: the main entry stays within the limit (33112 bytes gzip).
- [ ] Full check passes.

## Sizing

M: three hooks in the block parser, each with a test. Hook 3 touches several block rules and carries the most risk.
