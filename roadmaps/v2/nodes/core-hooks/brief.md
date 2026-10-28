---
id: core-hooks
title: Core hooks for container extensions
status: todo
priority: later
type: refactor
outline: true
milestone: m4-mdx
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-10-28
owns: []
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-api
    kind: hard
    why: extends the extension contract
---

# Core hooks for container extensions

## Goal

Give extensions supported hooks for what the first directive build had to reach through casts: closing containers up to a stack index, whether a closed container keeps its line ending, nested `parseInline` without clobbering per-leaf rule state, and a flag that stops container starts (frontmatter uses rule names for this today). Bump the extension contract to version 2.

## Notes

Outline. Inputs: `roadmaps/v2/contracts/extension-directive.change-request.md` on the branch `feat/ext-directive`, and the Proposed learnings in the ext-frontmatter and ext-math outcomes (core helpers that extensions copy).
