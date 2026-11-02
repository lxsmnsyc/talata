---
id: fix-footnote-spread
title: Fix list spread inside a quote in a footnote
status: todo
priority: must
type: fix
outline: false
milestone: m4-directive
target:
from:
size: S
spike: false
verify: cd packages/talata && pnpm fuzz --seed 20261105 --start 312807 --count 1 --all --no-save
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-02
owns:
  - packages/talata/src/gfm/footnote*.ts
  - packages/talata/src/blocks/**
  - packages/talata/test/fix-footnote-spread*.test.ts
shared: []
reserves: []
provides: []
depends_on: []
---

# Fix list spread inside a quote in a footnote

## Goal

`[^a]:>7.\n    >\n    >` with GFM gives a list item with `spread: false`; the reference (`mdast-util-from-markdown` with `mdast-util-gfm`) gives `spread: true`. The path is `root.children[0].children[0].children[0].children[0].spread`. Fix talata so it matches. The bug is on `main` without any extension: the 1,000,000-document fuzz of core-hooks-2 found it (seed 20261105, start 312807, `--all`), and the same input fails on main.

## Context

Find the cause first and fix it at the cause, not with a special case for this input. Look for close cousins (other containers in a footnote, deeper nesting, a list directly in the footnote) and add them to the test. Compare against the reference in the test; do not reason from the spec alone.

## Acceptance

- [ ] The `verify` command reports 0 failures.
- [ ] `test/fix-footnote-spread.test.ts` covers the input and its cousins against the reference.
- [ ] A 1,000,000-document fuzz with `--all` and a new seed finds no difference.
- [ ] A patch changeset exists (changed behavior of a shipped feature).
- [ ] Fast check passes.

## Sizing

S: one bug in the block parser, with tests.
