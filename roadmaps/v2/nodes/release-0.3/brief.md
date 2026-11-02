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
  - on: fix-directive-quote-end
    kind: hard
    why: its 1,000,000-document fuzz must pass on the fixed code
  - on: fix-directive-nesting
    kind: hard
    why: same reason
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

Document the `talata/directive` subpath in `packages/talata/README.md` (usage, the unified plugin, the `remark-directive` plugin it replaces, differences from the reference), update the size and speed tables, and add a minor changeset. The release workflow publishes 0.3.0 when the user merges the Version Packages pull request.

## Context

The directive migration guide is in PR #25 (`docs/directive-migration`), written by the orchestrator. Do not edit `docs/migration.md`. If #25 has not merged when you finish, say so in the outcome. The README can link to the guide's `#directives` section.

The v3-to-v4 change request from ext-directive is accepted and deferred to core-hooks-3, so 0.3 ships with the workarounds. Do not change `src/ext/directive/`.

## Acceptance

- [ ] The 1,000,000-document fuzz run with GFM, frontmatter, math and directive finds no difference.
- [ ] README covers the directive subpath, and the numbers come from merged main.
- [ ] A minor changeset exists.
- [ ] Full check passes.

## Sizing

S: docs, one long fuzz run and a changeset.

## Paused (2026-11-02)

The first pass is on `release/release-0.3`, draft PR #26. Its fuzz (seed 20261301) found two directive differences, now node fix-directive-quote-end. Resume on that branch after the fix lands: merge `main`, rerun the 1,000,000-document fuzz with a new seed, and update the README numbers only if they changed.
