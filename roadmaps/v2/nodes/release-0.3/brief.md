---
id: release-0.3
title: Docs and the 0.3 release
status: todo
priority: must
type: release
outline: false
milestone: m4-directive
target:
from:
size: S
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: true
added: 2026-11-02
owns:
  - README.md
  - packages/talata/README.md
  - .changeset/**
shared:
  - packages/talata/package.json
reserves: []
provides: []
depends_on:
  - on: ext-directive
    kind: hard
    why: documents and ships it
  - on: docs-migration
    kind: hard
    why: ships the guide and fills in its directive section
  - on: fix-footnote-spread
    kind: hard
    why: the release fuzz run needs main free of known differences
---

# Docs and the 0.3 release

## Goal

Document the `talata/directive` subpath in `packages/talata/README.md` (usage, the unified plugin, the `remark-directive` plugin it replaces, differences from the reference), fill in the directive placeholder in `docs/migration.md` if docs-migration has landed, update the size and speed tables, and add a minor changeset. The release workflow publishes 0.3.0 when the user merges the Version Packages pull request.

## Acceptance

- [ ] The 1,000,000-document fuzz run with GFM, frontmatter, math and directive finds no difference.
- [ ] README covers the directive subpath, and the numbers come from merged main.
- [ ] A minor changeset exists.
- [ ] Full check passes.

## Sizing

S: docs, one long fuzz run and a changeset.
