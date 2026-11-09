---
id: mdx-core
title: Extensions can turn off core rules (contract v4)
status: todo
priority: must
type: refactor
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
added: 2026-11-09
owns:
  - packages/talata/src/core/**
  - packages/talata/src/ext/api.ts
  - packages/talata/test/mdx-core*.test.ts
shared:
  - roadmaps/v2/contracts/extension.change-request.md
reserves: []
provides:
  - extension
depends_on: []
---

# Extensions can turn off core rules (contract v4)

## Goal

Add extension contract v4: an extension can turn off core rules by name, as micromark's `disable.null` does. `micromark-extension-mdx-md` 2.0.0 turns off `autolink`, `codeIndented`, `htmlFlow` and `htmlText`, and ext-mdx needs the same. With no extension that turns rules off, the tree output does not change and the speed stays within noise.

## Context

`Extension` in `packages/talata/src/ext/api.ts` has `blockRules`, `paragraphPrefixRules`, `inlineRules` and `transforms`, and no way to remove a core rule. The core rule names are `codeIndented` (`src/blocks/code-indented.ts`), `html` (block, `src/blocks/html.ts`), `html` (inline, `src/inline/html.ts`) and `autolink` (`src/inline/autolink.ts`). Block and inline names overlap, so take two lists, for example `disable?: { block?: string[]; inline?: string[] }`. Pick the shape that fits the registry build in `src/core/`, and do the filtering once per cached registry, not per parse.

Turning off `codeIndented` must also change the rules that check for indented code, such as the paragraph continuation and the lazy-line checks. Compare with the reference for each turned-off rule: `micromark` with `{ disable: { null: [...] } }` as an extension, through `mdast-util-from-markdown`.

Write the v4 section in a change request (`roadmaps/v2/contracts/extension.change-request.md`). The orchestrator freezes it into `contracts/extension.md` when this node lands.

## Acceptance

- [ ] An extension can turn off `codeIndented`, block `html`, inline `html` and `autolink`, alone or together, with and without GFM.
- [ ] `test/mdx-core.test.ts` compares against `mdast-util-from-markdown` with the same `disable` list. It covers indented lines after a paragraph, in lists and quotes, `<div>` and `<a>` lines, and `<https://x>`.
- [ ] Without `disable`, all existing tests pass and the 100,000-document fuzz with `--all` finds no difference.
- [ ] Fast check passes.

## Sizing

S: one new extension field, filtering in the registry build, and the checks that look ahead for indented code.
