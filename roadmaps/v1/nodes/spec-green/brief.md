---
id: spec-green
title: All CommonMark examples and the corpus match
status: done
priority: must
type: feature
outline: false
milestone: m1-commonmark
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added:
owns:
  - packages/talata/test/parsers.ts
  - packages/talata/test/spec-green*.test.ts
shared:
  - packages/talata/src/**
  - packages/talata/test/fuzz/features.ts
reserves: []
provides: []
depends_on:
  - on: blocks-leaf
    kind: hard
    why: fixes interactions between finished rules
  - on: blocks-container
    kind: hard
    why: fixes interactions between finished rules
  - on: inline-core
    kind: hard
    why: fixes interactions between finished rules
  - on: harness
    kind: hard
    why: needs the corpus tests to run
---

# All CommonMark examples and the corpus match

## Goal

Turn on `ready.commonmark` and `ready.corpus` and fix every remaining difference: all 652 CommonMark examples and every corpus file give trees equal to the reference parser without GFM.

## Context

Known cross-node differences found in wave 2 reviews; fix each and add it as a test:

- `- \`\`\`\n a\n- b`: the list item ends one column off.
- `> > \`\`\`\n> > a\n>`: code ends at 3:1, the reference at 2:6 (the end-of-file quote rule versus a lazy line).
- `> a\n<x>\n` and `- a\n<x>\n`: kind 7 HTML on a lazy line must stay inside the container, which continues over later lines (`> a\n<x>\n> c\n`). Needs core support.
- Replace the `lineIndents` WeakMap side table (`src/inline/lines.ts`, filled in `src/blocks/paragraph.ts`) with the parser-core v3 `indents` argument to `inline()`; keep the container line-ending tests green.
- From the fuzzer flag experiment (4000 documents per flag, seed 11): setext and definition gave 0 differences; turning on blockquote, list, code and html surfaced:
  - a trailing-space hard break inside a quote or list item ends one or more columns early (`>` \n>|`, `5.\n `  \r   r`), also with `\r` line endings and non-ASCII text;
  - fenced code value with `\r` line endings (` ~~~\r \n_` gives `"\n_"`, the reference `"_"`); `\ta\r*` gives a list, the reference a paragraph;
  - a trailing whitespace-only line at the end of a list item or quote extends its end by one line (`1)  ___\n    o\n   `, `>    *\n>     o\n>     `);
  - `    (\n3.` (the `tip` case above).
- Code spans, raw HTML and reference labels that span lines inside list items: `lines.ts` `linePrefix()` guesses the container prefix (see `contracts/parser-core-v3-inline-core.change-request.md`).

Turn on `blockquote`, `list`, `setext`, `code`, `html`, `definition` and `inline` in `test/fuzz/features.ts` and fix what the fuzzer finds. Implement the accepted parser-core v3 change (`BlockState.tip`, see `contracts/parser-core-v3.change-request.md`) so lists after indented code match the reference (`    a\n2. b`).

Differences left at this point come from interactions between rules: lazy continuation with lists, definitions inside containers, positions after container prefixes.

## Acceptance

- [ ] `pnpm --filter talata test` passes with `ready.commonmark` and `ready.corpus` on (GFM suites may still be skipped).
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: fixes spread over many files, each small.
