---
id: ext-directive
title: Directive extension
status: todo
priority: later
type: feature
outline: false
milestone: m4-mdx
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-10-28
owns:
  - packages/talata/src/ext/directive/**
  - packages/talata/src/directive.ts
  - packages/talata/test/directive*.test.ts
  - packages/talata/test/fuzz/ext-directive.ts
shared:
  - roadmaps/v2/contracts/extension-directive.change-request.md
reserves: []
provides: []
depends_on:
  - on: core-hooks
    kind: hard
    why: the first build reached into private block parser state; it needs real hooks
  - on: ext-api
    kind: contract
    via: extension
---

# Directive extension

## Goal

`talata/directive`: Text (`:name[label]{attrs}`), leaf (`::name`) and container (`:::name`) directives. The tree has `textDirective`, `leafDirective` and `containerDirective` nodes with `attributes`. The tree equals `mdast-util-from-markdown` with `micromark-extension-directive` and `mdast-util-directive`, positions included, with and without GFM.

## Context

Build against `roadmaps/v2/contracts/extension.md`. Put the rules in `src/ext/directive/` and export the factory from `src/directive.ts`, which ext-api created as a stub. If the contract cannot express something this syntax needs, write `roadmaps/v2/contracts/extension-directive.change-request.md` and adapt locally; do not edit core files.

Test inputs: the reference package's own test cases (copy the inputs from its repository's tests, with the license note), the benchmark corpus with the extension on, and the fuzz hook in `test/fuzz/ext-directive.ts`. Interactions with GFM and with containers (block quotes, lists, footnotes) need cases of their own.

## Acceptance

- [ ] Every reference test input and every corpus file gives the reference's tree, with and without GFM.
- [ ] `cd packages/talata && pnpm fuzz --count 200000 --seed <any>` with this extension on finds no difference.
- [ ] The main entry size does not change (`pnpm --filter benchmark size`).
- [ ] Fast check passes.

## Sizing

M: block and inline rules plus their interaction with containers.

## Parked (2026-10-28)

A first build is on the branch `feat/ext-directive` (c85cccf). It matched all 260 reference inputs, but it reads private block parser state through casts, parses text directive labels in a separate pass, and two 100,000-document fuzz runs (seed 77 without GFM, seed 5 with GFM) each found one failure with tabs or deep indent in a quote or list. See `roadmaps/v2/contracts/extension-directive.change-request.md` on that branch. The user chose to ship 0.2 without it. Its container rule is named `directiveFence`; frontmatter's container list must include it when this lands.
