---
id: mdx-layers-contract
title: Contract for document, flow and chunk layers (design D)
status: done
priority: must
type: contract
outline: false
milestone: m5-mdx
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added: 2026-11-23
spent: 340000
owns:
  - roadmaps/v2/contracts/block-layers.md
  - packages/talata/test/layers-contract*.test.ts
shared: []
reserves: []
provides:
  - block-layers
depends_on: []
---

# Contract for document, flow and chunk layers (design D)

## Goal

Write `contracts/block-layers.md`, the interface for design D from `reviews/spike-mdx-reread.md`: talata's block parser split into a document layer (containers and laziness, decided once per line), a flow layer per container that reads leaf blocks from line spans and can mark and rewind, and a chunk queue that parses container directive content and paragraph text in micromark's pass order, where the first thrown error wins. The contract is checked against the real code in `packages/talata/src/core/` and `src/blocks/`, `src/ext/directive/container.ts` and `src/ext/mdx/`.

## Context

- Read the spike report first, then `contracts/extension.md` (v5) and the outcomes of ext-mdx, ext-mdx-acorn, fix-mdx-reread-container and fix-mdx-directive-growth.
- micromark's model: `document.js`, `flow.js`, `content.js`, `micromark-util-subtokenize`, `postprocess.js`, `micromark-extension-directive` `directive-container.js`, `micromark-extension-mdx-jsx` flow and expression.
- State for each interface: who calls it, when, what it returns, and the invariants (no line is re-decided by the document layer; rewind only inside one flow layer; chunk order rule with depth and label passes).
- Name the extension contract version this becomes (v6), which v5 hooks go away (`readLineAt`, `inlineIndents`), and what an extension writes for each existing extension (frontmatter, math, directive, mdx).
- Include a migration plan in three implementation nodes (mdx-layers-core, mdx-layers-directive, mdx-layers-flow) and confirm or change their owned paths.
- Contract tests: small, compile-only or stub-level tests in `test/layers-contract.test.ts` that the implementation must keep passing.

## Acceptance

- [ ] `contracts/block-layers.md` with `status: draft`, reviewed by a fresh agent against the code (findings applied).
- [ ] Performance budget stated: the main entry must stay within noise of main on `pnpm --filter benchmark interleaved`.
- [ ] The user reviews the contract before the implementation nodes start (gate).

## Sizing

M: a design document checked against code, plus contract tests.
