---
id: blocks-leaf
title: Leaf blocks: setext headings, code, HTML and definitions
status: active
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
  - packages/talata/src/blocks/heading-setext.ts
  - packages/talata/src/blocks/code-indented.ts
  - packages/talata/src/blocks/code-fenced.ts
  - packages/talata/src/blocks/html.ts
  - packages/talata/src/blocks/definition.ts
shared:
  - packages/talata/src/blocks/index.ts
  - packages/talata/src/blocks/paragraph.ts
  - packages/talata/src/core/blocks.ts
reserves: []
provides: []
depends_on:
  - on: core-skeleton
    kind: contract
    via: parser-core
---

# Leaf blocks: setext headings, code, HTML and definitions

## Goal

Add setext headings, indented code, fenced code (with info string and meta), the seven kinds of HTML blocks, and link reference definitions, each as its own block rule.

## Context

Setext headings take over the open paragraph with `takeParagraph()`, called before the rule knows the result, and start at `paragraph.start` so a heading after definitions starts before them. `test/core.test.ts` has a test-only setext rule (parser-core v2). Link reference definitions are a `ParagraphPrefixRule` that fills `definitions`. Merge after blocks-container and test the cross cases: a setext underline inside a list or quote, a definition inside a list or quote, lazy continuation.

Spec sections: Setext headings, Indented code blocks, Fenced code blocks, HTML blocks, Link reference definitions. Definitions also feed the inline parser's reference map (see the contract). mdast nodes: `heading`, `code` (with `lang` and `meta`), `html`, `definition`.

## Acceptance

- [ ] Spec examples in those five sections give trees equal to the reference parser.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

L: five rules, HTML block start conditions and definition parsing are fiddly.
