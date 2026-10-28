---
id: blocks-container
title: Container blocks: block quotes and lists
status: active
priority: must
type: feature
outline: false
milestone: m1-commonmark
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/src/blocks/blockquote.ts
  - packages/talata/src/blocks/list.ts
  - packages/talata/src/blocks/list-item.ts
shared:
  - packages/talata/src/blocks/index.ts
  - packages/talata/src/core/blocks.ts
reserves: []
provides: []
depends_on:
  - on: core-skeleton
    kind: contract
    via: parser-core
---

# Container blocks: block quotes and lists

## Goal

Add block quotes and lists: bullet and ordered lists, start numbers, tight and loose lists, list item indentation, lazy continuation, and the rules for when list items interrupt paragraphs.

## Context

Merges before blocks-leaf in wave 2, because blocks-leaf's cross cases depend on the container stack.

Spec sections: Block quotes, List items, Lists. These are the hardest part of CommonMark; the reference's `spread` fields on `list` and `listItem` must match exactly.

## Acceptance

- [ ] Spec examples in Block quotes, List items and Lists give trees equal to the reference parser, including `spread` and `start`.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

L: high uncertainty in the spec's edge cases.

## Notes for the worker

- If the container stack in `src/core/blocks.ts` needs to change, write a change request against parser-core instead of reshaping it alone.
