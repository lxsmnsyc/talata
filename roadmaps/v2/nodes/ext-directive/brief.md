---
id: ext-directive
title: Directive extension
status: todo
priority: must
type: feature
outline: false
milestone: m4-directive
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
spent: 409146
gate: false
added: 2026-10-28
owns:
  - packages/talata/src/ext/directive/**
  - packages/talata/src/directive.ts
  - packages/talata/test/directive*.test.ts
  - packages/talata/test/fuzz/ext-directive.ts
  - packages/talata/test/fuzz/ext.ts
  - packages/talata/test/parsers.ts
  - packages/talata/test/ext-api.test.ts
  - packages/talata/test/ext-api-bundle.test.ts
  - packages/talata/package.json
  - packages/talata/tsdown.config.ts
  - benchmark/size/size.mjs
  - pnpm-lock.yaml
shared:
  - roadmaps/v2/contracts/extension-directive.change-request.md
reserves: []
provides: []
depends_on:
  - on: core-hooks
    kind: hard
    why: rebuilds on the core hooks of extension contract v2
  - on: core-hooks-2
    kind: hard
    why: replaces the three guessed workarounds with the v3 hooks
  - on: ext-api
    kind: contract
    via: extension
---

# Directive extension

## Goal

`talata/directive`: text (`:name[label]{attrs}`), leaf (`::name`) and container (`:::name`) directives. The tree has `textDirective`, `leafDirective` and `containerDirective` nodes with `attributes`. The tree equals `mdast-util-from-markdown` with `micromark-extension-directive` 4.0.0 and `mdast-util-directive` 3.1.1, positions included, with and without GFM. This is the 0.3 feature.

## Context

Start from `main`, not from the old branch. A first build is on `feat/ext-directive` (c85cccf). It matched all 260 reference inputs, but it reads private block parser state through casts, parses text directive labels in a separate pass (`fixes.ts`, `scopes.ts`), and two 100,000-document fuzz runs failed once each (seed 77 without GFM, seed 5 with GFM, tabs or deep indent in a quote or list). Its change request, `roadmaps/v2/contracts/extension-directive.change-request.md` on that branch, lists what the casts work around. Port the parts that hold (syntax, entities, leaf, text, the tests and the fuzz hook) and rebuild the rest on the v2 hooks in `roadmaps/v2/contracts/extension.md`:

- The container rule closes inner blocks with `state.closeOpenBlocks(depth, { keepsLineEnding })` and `state.getDepth(this)`, and sets `startsContainer: false`. No casts to `stack`, `containerIndex`, `container` or `closeTo`.
- Inside a directive, CommonMark container starts work again: set `state.containerStartsOff = false` while a directive is open and restore the old value when it closes. Frontmatter no longer keeps a rule name list, so nothing else needs the rule name.
- Text directive labels parse in place with a nested `parseInline` from the rule's `parse`. Remove the separate label pass.
- `acceptsLazy: false` on the container now leaves `state.paragraph` undefined on a line it does not match.

0.2 removed the `talata/directive` subpath. Put it back: revert the directive parts of commit 361462c (subpath export and devDependencies in `package.json`, the `tsdown.config.ts` entry, `src/directive.ts`, `test/parsers.ts`, `test/fuzz/ext.ts`, `test/fuzz/ext-directive.ts`, the bundle and ext-api tests, `benchmark/size/size.mjs`, the lock file).

If the v2 contract still cannot express something, write `roadmaps/v2/contracts/extension-directive.change-request.md` and adapt locally. Do not edit core files. Read the Gotchas in `roadmaps/v2/nodes/core-hooks/outcome.md`.

Test inputs: the reference package's own test cases (inputs copied from its repository's tests, with the license note), the benchmark corpus with the extension on, and the fuzz hook. Interactions with GFM and with containers (block quotes, lists, footnotes) need cases of their own, including the two old fuzz failures.

## Acceptance

- [ ] Every reference test input and every corpus file gives the reference's tree, with and without GFM.
- [ ] `grep -rn "as unknown as" src/ext/directive` finds only casts to mdast node types.
- [ ] `cd packages/talata && pnpm fuzz --count 1000000 --seed <any> --all` (GFM, frontmatter, math and directive on) finds no difference.
- [ ] The main entry stays within the limit (`pnpm --filter benchmark size`, 33112 bytes gzip), and holds no directive code (`test/ext-api-bundle.test.ts`).
- [ ] Full check passes.

## Sizing

L: three rules, a container rebuilt on new hooks, the subpath wiring put back, and a 1,000,000-document fuzz run. Most code exists on `feat/ext-directive`.

## Resume (2026-11-02)

The first pass is on `feat/directive`, draft PR #20 (b508ea1). It met every criterion except the 1,000,000-document fuzz: 4 differences (seed 20261106, `--all`), all with a directive inside a quote or list item, next to a blank or last line. Its change request, `roadmaps/v2/contracts/extension-directive.change-request.md`, was accepted, and core-hooks-2 adds the three hooks. Resume on `feat/directive`: merge `main`, replace the workarounds (`directiveEnd`'s `isContainerStart` guess, the replayed prefixes, the case-by-case last-line handling in `directiveEnd` and `directiveHtml`) with the hooks, and rerun the fuzz. The remaining fuzz inputs are in `outcome.md` (Verification) on that branch. Release-0.3 adds the minor changeset.
