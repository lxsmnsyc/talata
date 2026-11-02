---
id: fix-directive-nesting
title: Fix directive spread and quote ends in deep nesting
status: active
priority: must
type: fix
outline: false
milestone: m4-directive
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-02
owns:
  - packages/talata/src/ext/directive/**
  - packages/talata/test/fix-directive-nesting*.ts
  - .changeset/fix-directive-nesting.md
shared:
  - roadmaps/v2/contracts/extension-directive.change-request.md
reserves: []
provides: []
depends_on:
  - on: fix-directive-quote-end
    kind: hard
    why: extends its spread rule and closeEnds guard
---

# Fix directive spread and quote ends in deep nesting

## Goal

The fresh review of fix-directive-quote-end (f5ea091) found two differences from the reference (`mdast-util-from-markdown` with `micromark-extension-directive` 4.0.0 and `mdast-util-directive` 3.1.1). Both fail on main:

1. GFM on: `> :::b\n> + [^1]: >\n> \n>  `. The list item has `spread: true` in the reference and `false` in talata. The rule in `src/ext/directive/spread.ts` (around line 105) looks only at the item's direct children. The reference's containerBalance does not count footnote definitions, so a quote inside a footnote definition inside the item must count the same as a direct quote child.
2. Both GFM modes: `> :::b\n> + :::c\n>   >\n> \n> :::`. The innermost block quote's `end.line` is 4 in the reference and 3 in talata. It also fails with `>   > a` and with a bare `>` on line 4. On a blank line inside the inner directive, the loop in `container.ts` `continue` / `closeEnds` (around lines 398 to 450) stops at the inner directive, so the inner directive's own `closeEnds` needs the same blank-line handling.

Also, in `closeEnds`, replace the single `state.getDepth(inner) >= 0` guard with one "still open" check at the top of the loop. Closed children stay linked through `openChild`, and the loop still sets their `closeEnd`.

## Context

Read `roadmaps/v2/nodes/fix-directive-quote-end/outcome.md` and `roadmaps/v2/nodes/ext-directive/outcome.md`. Fix at the cause. Do not edit core files. A deep-nesting generator found 218 differences in 5,139 inputs (quotes, lists, footnotes and directives nested 3 to 4 deep). Build a generator like it in the test, or as a script under `test/`, and get it to 0 differences.

## Acceptance

- [ ] Both inputs and their variants match the reference, with and without GFM, in `test/fix-directive-nesting.test.ts`.
- [ ] A deep-nesting generated set (at least 5,000 inputs: quote, list item, footnote definition and directive prefixes nested up to 4 deep, with blank, bare-marker and last-line endings) has 0 differences with and without GFM, except inputs that fail on main without the directive extension.
- [ ] A 1,000,000-document fuzz with `--all` and a new seed finds no difference.
- [ ] A patch changeset exists.
- [ ] Fast check passes, with `benchmark/corpus` present so the corpus suite runs.

## Sizing

S: two bugs in one extension, with tests and a generator.
