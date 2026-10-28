---
id: release
title: Docs and the 0.1 release
status: todo
priority: must
type: release
outline: false
milestone: m3-release
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added:
owns:
  - README.md
  - packages/talata/README.md
  - .changeset/**
shared:
  - package.json
  - packages/talata/package.json
  - pnpm-lock.yaml
reserves: []
provides: []
depends_on:
  - on: perf-pass
    kind: hard
    why: the README reports the final numbers
  - on: unified-plugin
    kind: hard
    why: the README documents the plugin
  - on: gfm-green
    kind: hard
    why: 0.1 claims GFM support
---

# Docs and the 0.1 release

## Goal

Write the README (usage, options, the unified plugin, differences from the reference, benchmark numbers) and a changeset for 0.1.0. The user creates the GitHub repository and publishes to npm.

## Context

Follow the plain-writing skill for docs and the changesets skill for the changeset.

## Acceptance

- [ ] README covers usage and numbers.
- [ ] A changeset exists for the 0.1.0 release.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: docs only.
