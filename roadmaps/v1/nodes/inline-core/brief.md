---
id: inline-core
title: Inline parsing: emphasis, links, code spans and the rest
status: done
priority: must
type: feature
outline: false
milestone: m1-commonmark
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/src/inline/**
shared:
  - packages/talata/src/inline/index.ts
reserves: []
provides: []
depends_on:
  - on: core-skeleton
    kind: contract
    via: parser-core
---

# Inline parsing: emphasis, links, code spans and the rest

## Goal

Add every CommonMark inline: backslash escapes, entity and numeric references, code spans, emphasis and strong emphasis (the delimiter run algorithm), links and images (inline, full, collapsed and shortcut references), autolinks, raw HTML, and hard line breaks.

## Context

Put links and images in `src/inline/link.ts`, so GFM footnote calls can take priority over it by registration. Reference links need `definitions` from blocks-leaf. Test them with a `DocumentState` whose `definitions` is filled by the test. The spec examples that need real definition parsing pass in spec-green.

Spec sections from Backslash escapes to Textual content. Emphasis and links share the delimiter stack, so they are in one node. Emphasis is a `resolve(state, bottom)` rule; a link calls `resolveSpan(state, bracketIndex + 1)` before moving nodes into itself, so delimiters never pair across a link boundary (parser-core v2 Behavior). `test/core.test.ts` has test-only `~~` and `[text](url)` rules showing the pattern. Entity decoding needs the HTML named character reference table; generate a compact table into `src/inline/entities.ts` from the WHATWG list, with no runtime dependency.

## Acceptance

- [ ] Spec examples from Backslash escapes to Textual content give trees equal to the reference parser.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

L: the delimiter algorithm and reference links are the second hardest part of CommonMark.

## Notes for the worker

- Keep the inline parser on index ranges into the source. Do not build intermediate strings for each line.
