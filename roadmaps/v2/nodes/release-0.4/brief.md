---
id: release-0.4
title: Docs and the 0.4 release
status: todo
priority: must
type: release
outline: false
milestone: m5-mdx
target:
from:
size: S
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: true
added: 2026-11-09
owns:
  - README.md
  - packages/talata/README.md
  - docs/migration.md
  - .changeset/**
shared:
  - packages/talata/package.json
reserves: []
provides: []
depends_on:
  - on: ext-mdx
    kind: hard
    why: documents and ships it
  - on: fix-mdx-reread-container
    kind: hard
    why: 0.4 ships with no known MDX tree mismatch
  - on: fix-directive-nested-growth
    kind: hard
    why: 0.4 ships without the cubic directive path
  - on: ext-mdx-acorn
    kind: hard
    why: documents and ships the acorn option
---

# Docs and the 0.4 release

## Goal

Document the `talata/mdx` subpath in `packages/talata/README.md`: usage with and without acorn, the unified plugin, the `remark-mdx` setup it replaces, and the differences from the reference (no `data.estree`). Add an MDX section to `docs/migration.md`. Update the size and speed tables, and add a minor changeset. The release workflow publishes 0.4.0 when the user merges the Version Packages pull request.

## Acceptance

- [ ] The 1,000,000-document fuzz with GFM, frontmatter, math, directive and `mdx({ acorn })` finds no difference.
- [ ] README and migration guide cover MDX, and the numbers come from merged main.
- [ ] A minor changeset exists.
- [ ] Full check passes.

## Sizing

S: docs, one long fuzz run and a changeset.
