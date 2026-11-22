---
id: fix-mdx-known-cases
title: Fix the remaining known MDX mismatches
status: dropped
priority: must
type: fix
outline: false
milestone: m5-mdx
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-23
owns:
  - packages/talata/src/ext/mdx/prefixes.ts
  - packages/talata/src/ext/mdx/order.ts
  - packages/talata/src/ext/mdx/reread.ts
  - packages/talata/src/ext/mdx/inline.ts
  - packages/talata/test/mdx-known*.test.ts
shared: []
reserves: []
provides: []
depends_on:
  - on: fix-mdx-directive-growth
    kind: hard
    why: edits the same prefixes.ts and order.ts code
---

# Fix the remaining known MDX mismatches

Dropped 2026-11-23: folded into mdx-layers-flow (design D). Its cases are that node's acceptance.

## Goal

Every input below gives the reference's tree or the same error message and place (`mdast-util-from-markdown` with `micromark-extension-mdx` 2.1.0 or `micromark-extension-mdxjs` 3.0.0, `mdast-util-mdx` 3.0.0, and the other extensions as listed). All are on main and were found by fix-mdx-directive-growth (see its outcome).

1. Lazy lines with list items or footnote definitions outside a directive: `- 1. :::b[x]\n      >{\n    >\n`, `>1. :::b\n>    >>\t<a b="\n>    >>\tb="\n>   > \n`.
2. Acorn error place in a text directive label across quote lines: `>:c[{{\n>}` (reference 2:2, talata 2:1).
3. Error order: `:{\n>:::x\n>{\n><}x\n:`; `"<\n>:::a\n><t\n>{...d}>]\n\""` (`--all --acorn` fuzz, seed 20261503, doc 344943); and the 21 of 300,000 documents of the doomed generator in `test/mdx-growth.test.ts` (`MDX_GROWTH_SEED=20261505`) that still differ.
4. A task list item with JSX text drops a space: `"* [X]  <><a-b></a-b></>\n{\n\t}t"` with gfm (`--all` fuzz, seed 20261502, doc 62984).

## Acceptance

- [ ] Each case fails on main in a test, then passes. Variants of each are in the tests.
- [ ] Extend the lazy-place generator (`test/mdx-lazy-place.test.ts`) with lists and footnote definitions outside the directive; it and the doomed generator run 1,000,000 documents with no difference.
- [ ] 1,000,000-document `--all` and `--all --acorn` fuzz find no difference. Output for inputs that already matched does not change (tree hashes, main vs branch). Fast check passes.

## Sizing

M: four small classes, but this area has found new classes on every run; budget for one or two more.
