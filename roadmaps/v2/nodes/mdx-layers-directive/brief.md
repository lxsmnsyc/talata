---
id: mdx-layers-directive
title: Container directives collect raw lines and parse in the chunk queue
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
  - packages/talata/src/ext/directive/**
  - packages/talata/src/ext/frontmatter/**
  - packages/talata/src/ext/mdx/order.ts
  - packages/talata/src/ext/mdx/inline.ts
  - packages/talata/test/frontmatter*.test.ts
  - .changeset/**
  - packages/talata/test/directive*.test.ts
shared:
  - packages/talata/test/layers-contract.test.ts
reserves: []
provides: []
depends_on:
  - on: mdx-layers-core
    kind: hard
    why: needs the chunk queue and nested document parse
---

# Container directives collect raw lines and parse in the chunk queue

## Goal

Port `talata/directive` to the layers: a container directive collects its raw lines (as micromark's `chunkDocument`) and its content is parsed as a nested document from the chunk queue. Remove the v2/v3 container workarounds that the layers make unneeded. Output with directives and without MDX stays identical to main, except where main differs from the reference (user, 2026-11-23): list each such input in the outcome and add a patch changeset. MDX errors throw at once in this node (`flowError`, `textError`, `record`), so `[directive, mdx]` stays correct until mdx-layers-flow.

## Acceptance

- [ ] Tree hashes with `[directive]` and `[frontmatter, math, directive]` over the corpus and 1,000,000 random documents equal main, except inputs where main differs from the reference, each listed in the outcome. The frontmatter `anywhere` in a container directive case matches the reference.
- [ ] Deep nested chains grow no faster than on main (directive growth tests).
- [ ] 1,000,000-document `--all` fuzz finds no new difference. Fast check passes.

## Sizing

L: rewrite of `container.ts` onto the chunk queue.
