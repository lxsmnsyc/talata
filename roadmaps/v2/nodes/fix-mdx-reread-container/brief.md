---
id: fix-mdx-reread-container
title: Container directives in re-read MDX lines
status: done
priority: must
type: fix
outline: false
milestone: m5-mdx
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-21
spent: 680000
owns:
  - packages/talata/src/core/**
  - packages/talata/src/ext/mdx/reread.ts
  - packages/talata/src/ext/mdx/flow.ts
  - packages/talata/src/ext/directive/container.ts
  - packages/talata/test/mdx-reread*.test.ts
shared:
  - roadmaps/v2/contracts/extension.change-request.md
reserves: []
provides: []
depends_on:
  - on: ext-mdx
    kind: hard
    why: changes the re-read code ext-mdx added
---

# Container directives in re-read MDX lines

## Goal

With `mdx()` and `directive()` on, a flow construct that fails on a later line has its lines read again (`src/ext/mdx/reread.ts`). When those lines hold a container directive opener (`:::x`) that is not closed among them, and the paragraph read before it has no syntax error, the tree misses the directive and its content. `fromMarkdown('[a]:\n{a\n:::x\n}x\n', { extensions: [directive(), mdx()] })` must give the same tree as `mdast-util-from-markdown` with `micromark-extension-directive` and `micromark-extension-mdx`.

## Context

Found by the ext-mdx review (see `roadmaps/v2/nodes/ext-mdx/outcome.md`, "Known gap"). The `--all` fuzz did not produce it; a generator for this shape (opener lines, middle lines, closers, trailing lines) finds it in about 3 of 100,000 documents. `reread.ts` cannot open a container, so it skips the lines up to the fence. The error case of this shape is already right (`{a\n:::x\n}x\n<`). The fix needs a way to open a container from the re-read of a leaf. If that is a core change, write it as an extension contract v5 section in `contracts/extension.change-request.md`.

## Acceptance

- [ ] `[a]:\n{a\n:::x\n}x\n` and its variants (in quotes, lists, with and without GFM, with nested content and a later closing fence) match the reference. Prove the failure on batch/v2 first.
- [ ] The targeted generator from ext-mdx, run for 1,000,000 documents, finds no difference.
- [ ] Output without MDX does not change; the 1,000,000-document `--all` fuzz finds no difference.
- [ ] Fast check passes.

## Sizing

M: a re-read path that opens a container, maybe a small core hook.
