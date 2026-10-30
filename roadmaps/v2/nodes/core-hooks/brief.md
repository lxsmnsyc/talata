---
id: core-hooks
title: Core hooks for container extensions
status: todo
priority: must
type: refactor
outline: false
milestone: m4-mdx
target:
from:
size: M
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: false
added: 2026-10-28
owns:
  - packages/talata/src/core/**
  - packages/talata/src/blocks/**
  - packages/talata/src/inline/**
  - packages/talata/src/gfm/**
  - packages/talata/src/ext/api.ts
  - packages/talata/src/ext/frontmatter/**
  - packages/talata/src/ext/math/**
  - packages/talata/test/core-hooks*.test.ts
shared:
  - roadmaps/v2/contracts/extension.change-request.md
reserves: []
provides:
  - extension
depends_on:
  - on: ext-api
    kind: hard
    why: extends the extension contract
---

# Core hooks for container extensions

## Goal

Give extensions supported hooks for every private parser state the first directive build reached through casts, so `src/ext/` holds no `as unknown as` on parser internals. Move frontmatter and math onto the hooks and onto shared core helpers. The tree output of talata, with and without extensions, does not change.

## Context

Inputs:

- `roadmaps/v2/contracts/extension-directive.change-request.md` on the branch `feat/ext-directive` (c85cccf). It lists five problems and the casts in `src/ext/directive/container.ts` that work around them. Read that file to see what each hook must replace.
- The Proposed learnings in `roadmaps/v2/nodes/ext-frontmatter/outcome.md` and `roadmaps/v2/nodes/ext-math/outcome.md`.

Hooks to add (names are a proposal; keep them if nothing better fits):

1. `BlockState.closeOpenBlocks(depth, { keepsLineEnding })` and `BlockState.depthOf(block)`: close the open blocks above a stack depth from inside a rule's `continue`. Replaces the casts to `stack`, `containerIndex`, `container` and `closeTo`.
2. `OpenBlock.startsContainer?: false`: a container whose start does not make the blocks it closes keep their line ending. Replaces the `isContainer` getter that answers false on its first read.
3. `continuesOverEnd` also runs when a container or a paragraph is at the tip, so extensions do not repeat the end-of-document check.
4. A nested `parseInline` from inside an inline rule's `parse` does not clobber the per-leaf state of other rules. Today that state is module-level, keyed by the owning `InlineState`: `src/inline/link.ts` (brackets, keys), `code-span.ts`, `html.ts`, `lines.ts`, `src/gfm/autolink-literal.ts`, `strikethrough.ts`. Either move it onto `InlineState` or save and restore it around a nested call. Pick the one with the lower cost in the interleaved benchmark and record both numbers in `log.md`. Cases that must pass: `~~:a[b]*~~*` and `[:a[[]]]()` with a test rule that parses its label in place.
5. When a container has `acceptsLazy: false` and does not match the line, `state.paragraph` is undefined for that line, so lazy-line rules (indented code, kind 7 HTML) do not continue a paragraph through it.
6. `BlockState.containerStartsOff`: a flag that stops container starts for the rest of the document. Frontmatter uses it in place of `dropContainers` and its rule name list in `src/ext/frontmatter/matter.ts`.
7. Export `strip`, the closing-fence test and the exhausted cache from core, and make `src/ext/math/` import them instead of its copies.

Add the new hooks to `src/ext/api.ts` types. Contracts are owned by the orchestrator: write the version 2 interface into `roadmaps/v2/contracts/extension.change-request.md`, and the orchestrator copies it into `extension.md`.

Do not rebuild directive here. Test each hook with a small rule defined in `test/core-hooks*.test.ts`. ext-directive then rebuilds on the hooks from its branch.

## Acceptance

- [ ] Each of the seven hooks has a test with a test-only extension rule.
- [ ] `src/ext/frontmatter/` has no rule name list and no `dropContainers`. `src/ext/math/` has no copies of core helpers.
- [ ] All existing tests pass unchanged, including the reference inputs and the corpus for GFM, frontmatter and math.
- [ ] `cd packages/talata && pnpm fuzz --count 1000000 --seed <any>` with GFM, frontmatter and math on finds no difference.
- [ ] `pnpm --filter benchmark interleaved`: no corpus file is more than 3% slower than on `main` at a load under 1, and talata stays at least 4 times faster than "mdast + gfm".
- [ ] `pnpm --filter benchmark size`: the main entry stays within 0.5 KB gzip of 0.1.1 (32.6 KB).
- [ ] Full check passes.

## Sizing

M: small changes across the block parser, the inline rules with per-leaf state, and two extensions. Hook 4 carries the speed risk, since it touches every inline rule that keeps state.
