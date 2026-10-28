---
id: gfm-tasks-footnotes
title: GFM task lists and footnotes
status: active
priority: must
type: feature
outline: false
milestone: m2-gfm
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/src/gfm/task-list.ts
  - packages/talata/src/gfm/footnote.ts
  - packages/talata/test/gfm-tasks-footnotes*.test.ts
shared:
  - packages/talata/src/blocks/index.ts
  - packages/talata/src/inline/index.ts
  - packages/talata/src/core/blocks.ts
  - packages/talata/src/blocks/list-item.ts
  - packages/talata/src/blocks/definition.ts
  - packages/talata/src/inline/link.ts
  - packages/talata/test/parsers.ts
  - packages/talata/test/fuzz/features.ts
  - packages/talata/test/corpus.test.ts
  - packages/talata/test/equivalence.test.ts
  - packages/talata/test/gfm.test.ts
reserves: []
provides: []
depends_on:
  - on: blocks-container
    kind: hard
    why: task markers change list items, and footnote definitions are containers
  - on: blocks-leaf
    kind: hard
    why: footnote definitions must take priority over link reference definitions
  - on: inline-core
    kind: hard
    why: footnote calls must take priority over link labels
---

# GFM task lists and footnotes

## Goal

Add task list items (`checked` on `listItem`) and footnotes (`footnoteDefinition` blocks and `footnoteReference` inlines), matching `mdast-util-gfm`.

## Context

Footnote definitions are a container: implement `TrackedContainer` and `closedAt`, and end like list items (parser-core v4).

Turn on `taskList` and `footnote` in `test/fuzz/features.ts` too, so the differential fuzzer covers them.

Use rule priorities to run before the CommonMark definition and link rules instead of editing them where possible. Footnote definitions are a container block rule that can interrupt paragraphs, not a paragraph prefix rule (parser-core v2). Footnote calls resolve only against `footnotes` in `DocumentState`. Turn on `ready.gfm.taskList` and `ready.gfm.footnote` when done.

GFM spec sections Task list items and footnotes as micromark-extension-gfm-footnote implements them.

## Acceptance

- [ ] Task list and footnote examples and the corpus give trees equal to the reference parser with GFM.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: one block-level and one inline addition.
