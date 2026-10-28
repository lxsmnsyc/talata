---
id: ext-math
title: Math extension
status: active
priority: must
type: feature
outline: false
milestone: m2-extensions
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
  - packages/talata/src/ext/math/**
  - packages/talata/src/math.ts
  - packages/talata/test/math*.test.ts
  - packages/talata/test/fuzz/ext-math.ts
shared:
  - roadmaps/v2/contracts/extension-math.change-request.md
reserves: []
provides: []
depends_on:
  - on: ext-api
    kind: contract
    via: extension
---

# Math extension

## Goal

`talata/math`: Text math (`$x$`, `$$x$$` inline) and flow math (`$$` fences), including the `singleDollarTextMath` option. The tree has `inlineMath` and `math` nodes with the `data` fields `mdast-util-math` sets for hast. The tree equals `mdast-util-from-markdown` with `micromark-extension-math` and `mdast-util-math`, positions included, with and without GFM.

## Context

Build against `roadmaps/v2/contracts/extension.md`. Put the rules in `src/ext/math/` and export the factory from `src/math.ts`, which ext-api created as a stub. If the contract cannot express something this syntax needs, write `roadmaps/v2/contracts/extension-math.change-request.md` and adapt locally; do not edit core files.

Test inputs: the reference package's own test cases (copy the inputs from its repository's tests, with the license note), the benchmark corpus with the extension on, and the fuzz hook in `test/fuzz/ext-math.ts`. Interactions with GFM and with containers (block quotes, lists, footnotes) need cases of their own.

## Acceptance

- [ ] Every reference test input and every corpus file gives the reference's tree, with and without GFM.
- [ ] `cd packages/talata && pnpm fuzz --count 200000 --seed <any>` with this extension on finds no difference.
- [ ] The main entry size does not change (`pnpm --filter benchmark size`).
- [ ] Fast check passes.

## Sizing

M: block and inline rules plus their interaction with containers.
