---
id: core-skeleton
title: Parser core: source, lines, block and inline frameworks
status: todo
priority: must
type: contract
outline: false
milestone: m1-commonmark
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added:
owns:
  - packages/talata/src/core/**
  - packages/talata/src/index.ts
  - packages/talata/src/blocks/paragraph.ts
  - packages/talata/src/blocks/heading-atx.ts
  - packages/talata/src/blocks/thematic-break.ts
  - packages/talata/src/inline/text.ts
  - packages/talata/src/blocks/index.ts
  - packages/talata/src/inline/index.ts
shared: []
reserves: []
provides: [parser-core]
depends_on: []
---

# Parser core: source, lines, block and inline frameworks

## Goal

Write the parser's frame and freeze `contracts/parser-core.md`: source and position handling, the line scanner, the block parser with its container stack and rule registry, the inline parser entry point and rule registry, and three simple blocks (paragraph, ATX heading, thematic break) with plain text inlines.

## Context

Profile of the reference parser (`benchmark/BASELINE.md`): most time goes to a per-character tokenizer and a second tokenizing pass over nested content. Talata's design: one pass over lines for blocks, plain index loops for inlines, mdast nodes built directly. Follow the CommonMark spec's appendix "A parsing strategy" for the block phase.

## Steps

- [ ] Source, `lineStarts` and `point()`, with tests that compare positions to the reference parser on inputs with tabs and `\r\n`.
- [ ] Line scanner and tab handling (partial tabs inside container prefixes).
- [ ] Block phase with the container stack, lazy continuation hooks, and closing blocks into mdast nodes.
- [ ] Inline phase entry and rule registry, with plain text and soft line breaks.
- [ ] Paragraph, ATX heading and thematic break rules, registered through `src/blocks/index.ts`.
- [ ] Update `contracts/parser-core.md` with the final TypeScript and set `status: frozen`.

## Acceptance

- [ ] Spec examples in the ATX headings, thematic breaks and paragraphs sections give trees equal to the reference parser, positions included (run them with a filtered test, `READY` stays false).
- [ ] Adding a block rule needs only a new file and one line in `src/blocks/index.ts`.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

L: new code, the design every other node builds on, and positions must match exactly.

## Notes for the worker

- Measure early with the benchmark on paragraphs-only input, so the frame is not already slow before rules are added.
