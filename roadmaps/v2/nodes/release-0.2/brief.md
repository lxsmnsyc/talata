---
id: release-0.2
title: Docs and the 0.2 release
status: done
priority: must
type: release
outline: false
milestone: m3-release
target:
from:
size: S
spike: false
verify:
exclusive: [benchmark]
fulfilled_by: 63728b7
gate: true
added: 2026-10-28
owns:
  - README.md
  - packages/talata/README.md
  - .changeset/**
shared:
  - packages/talata/package.json
reserves: []
provides: []
depends_on:
  - on: ext-frontmatter
    kind: hard
    why: documents and ships it

  - on: ext-math
    kind: hard
    why: documents and ships it
---

# Docs and the 0.2 release

## Goal

Document the frontmatter and math subpaths and the `extensions` option in `packages/talata/README.md` (usage, options, the unified plugin, which `remark-*` plugin each one replaces, differences from the reference), update the size and speed tables, and add a minor changeset. The release workflow publishes 0.2.0 when the user merges the Version Packages pull request.

## Acceptance

- [ ] The 1,000,000-document fuzz run with GFM, frontmatter and math finds no difference.
- [ ] README covers each subpath, and the numbers come from merged main.
- [ ] A minor changeset exists.
- [ ] Full check passes.

## Sizing

S: docs, one long fuzz run and a changeset.
