---
id: ext-frontmatter
title: Frontmatter extension
status: todo
priority: must
type: feature
outline: false
milestone: m2-extensions
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-10-28
owns:
  - packages/talata/src/ext/frontmatter/**
  - packages/talata/src/frontmatter.ts
  - packages/talata/test/frontmatter*.test.ts
  - packages/talata/test/fuzz/ext-frontmatter.ts
shared:
  - roadmaps/v2/contracts/extension-frontmatter.change-request.md
reserves: []
provides: []
depends_on:
  - on: ext-api
    kind: contract
    via: extension
---

# Frontmatter extension

## Goal

`talata/frontmatter`: YAML (`---`) and TOML (`+++`) frontmatter at the start of the document, and custom matters through the reference option format. The tree has `yaml` and `toml` nodes. The tree equals `mdast-util-from-markdown` with `micromark-extension-frontmatter` and `mdast-util-frontmatter`, positions included, with and without GFM.

## Context

Build against `roadmaps/v2/contracts/extension.md`. Put the rules in `src/ext/frontmatter/` and export the factory from `src/frontmatter.ts`, which ext-api created as a stub. If the contract cannot express something this syntax needs, write `roadmaps/v2/contracts/extension-frontmatter.change-request.md` and adapt locally; do not edit core files.

Test inputs: the reference package's own test cases (copy the inputs from its repository's tests, with the license note), the benchmark corpus with the extension on, and the fuzz hook in `test/fuzz/ext-frontmatter.ts`. Interactions with GFM and with containers (block quotes, lists, footnotes) need cases of their own.

## Acceptance

- [ ] Every reference test input and every corpus file gives the reference's tree, with and without GFM.
- [ ] `cd packages/talata && pnpm fuzz --count 200000 --seed <any>` with this extension on finds no difference.
- [ ] The main entry size does not change (`pnpm --filter benchmark size`).
- [ ] Fast check passes.

## Sizing

S: one block rule at the document start.
