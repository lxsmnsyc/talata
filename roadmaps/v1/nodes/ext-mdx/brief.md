---
id: ext-mdx
title: MDX extension
status: dropped
priority: later
type: feature
outline: true
milestone: m4-extensions
target:
from:
size: XL
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns: []
shared: []
reserves: []
provides: []
depends_on:
  - on: spec-green
    kind: hard
    why: extensions build on the finished core
---

# MDX extension

## Goal

MDX syntax (JSX, expressions, ESM), matching `mdast-util-mdx`. Needs a JavaScript expression parser; split before starting.

## Notes

Outline. Break into a full brief when `plan.py refine` lists it.

Moved to `roadmaps/v2/nodes/ext-mdx` on 2026-10-28, as a subpath of `talata`.
