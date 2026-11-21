---
id: fix-directive-list-indent
title: Nested container directive in a list item ends on the right line
status: done
priority: must
type: fix
outline: false
milestone: m5-mdx
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-22
spent: 30000
owns:
  - packages/talata/src/ext/directive/**
  - packages/talata/test/directive*.test.ts
shared: []
reserves: []
provides: []
depends_on:
  - on: fix-directive-nested-growth
    kind: hard
    why: edits directive/container.ts, which that node rewrote
---

# Nested container directive in a list item ends on the right line

## Goal

`"40.  :::a\n     :::c\n    >"` with `directive()` gives a tree different from `mdast-util-from-markdown` with `micromark-extension-directive` 4.0.0 and `mdast-util-directive` 3.1.1: the inner directive ends on line 2 instead of line 3. Make it match. The bug is on batch/v2 before fix-directive-nested-growth and is in the released `talata/directive` 0.3, so add a patch changeset.

## Context

Found by the 1,000,000-document `--all` fuzz in fix-directive-nested-growth (replay: `cd packages/talata && pnpm fuzz --seed 20261222 --start 244072 --count 1 --all`). The list item content starts at column 6, the directives are indented inside it, and the last line is a lazy `>` at a smaller indent.

## Acceptance

- [ ] Prove it on batch/v2 with a failing test against the reference.
- [ ] The input and variants (other list markers and widths, quotes, deeper nesting, lazy and blank last lines, with and without gfm and mdx) match the reference.
- [ ] 1,000,000-document `--all` fuzz finds no difference. Fast check passes. Patch changeset.

## Sizing

S: one end-of-content rule in the container directive.
