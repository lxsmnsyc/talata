---
id: fix-directive-quote-end
title: Fix container directive end positions in block quotes
status: done
priority: must
type: fix
outline: false
milestone: m4-directive
target:
from:
size: S
spike: false
verify: cd packages/talata && pnpm fuzz --seed 20261301 --start 900612 --count 1 --all --no-save && pnpm fuzz --seed 20261301 --start 295834 --count 1 --all --no-save
exclusive: []
fulfilled_by:
spent: 204599
gate: false
added: 2026-11-02
owns:
  - packages/talata/src/ext/directive/**
  - packages/talata/test/fix-directive-quote-end*.test.ts
  - .changeset/fix-directive-quote-end.md
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-directive
    kind: hard
    why: fixes its container rule
---

# Fix container directive end positions in block quotes

## Goal

The release-0.3 fuzz run (`--seed 20261301 --count 1000000 --all`) found two inputs where a container directive in a block quote ends at a different position than in the reference (`mdast-util-from-markdown` with `micromark-extension-directive` 4.0.0 and `mdast-util-directive` 3.1.1). Both fail on main with and without GFM:

- `>:::b\n>+ >\n>\n>  ` (fuzz start 900612): `position.end.line` is 3 in the reference, 4 in talata.
- `>:::9\n>>>:::a{}\n>>>\n` (fuzz start 295834): the end column is 1 in the reference, 4 in talata.

## Context

Find the cause in `src/ext/directive/` and fix it there, not with a special case for these inputs. Do not edit core files. Read `roadmaps/v2/nodes/ext-directive/outcome.md` first: it explains the v3 hooks and the four workarounds (`isContainerStart`, `directiveScope`, `continuesNext`, `raiseIndentEnd`). The ends are likely set in `closeEnds`, `raiseIndentEnd` or `endContent`. Look for close cousins: other nesting depths, a list inside the quote, a blank or last line, and trailing spaces. Compare against the reference in the test.

## Acceptance

- [ ] The `verify` command reports 0 failures.
- [ ] `test/fix-directive-quote-end.test.ts` covers both inputs and their cousins against the reference, with and without GFM.
- [ ] A 1,000,000-document fuzz with `--all` and a new seed finds no difference.
- [ ] A patch changeset exists.
- [ ] Fast check passes.

## Sizing

S: two end-position bugs in one rule, with tests.
