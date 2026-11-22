# Log: mdx-layers-contract

- Branch `contract/mdx-layers`, reset to `release/release-0.4` (853bc8f).
- Read GOAL, CLAUDE, the brief, the spike, the three implementation briefs, ext-mdx-estree, extension contract v5, and the outcomes of ext-mdx, ext-mdx-acorn, fix-mdx-reread-container and fix-directive-nested-growth.
- Read `core/blocks.ts`, `line.ts`, `parse.ts`, `registry.ts`, the core blocks, `gfm/table.ts`, `footnote.ts`, `ext/directive/container.ts`, `scopes.ts`, `labels.ts`, `text.ts`, `ext/frontmatter/matter.ts`, `ext/mdx/flow.ts`, `order.ts`, `inline.ts`, `chunks.ts`, `index.ts`. In micromark: `document.js`, `flow.js`, `content.js`, `subtokenize`, `postprocess.js`, `parse.js`, `directive-container.js`, `jsx-flow.js`, the frontmatter `syntax.js` and the mdxjs-esm `syntax.js`.
- Probes against the reference (scratch test, deleted):
  - Directive node ends: `:::x\n` 2:1, `> :::x\n>` 2:1, `> :::x\n> a\n` 2:4, `- :::x\n  a\n- b` 3:1. The end comes from the raw lines, including the kept line ending.
  - `::::x\n:::y\n[a]: b\n:::\n::::\n:z[:w[[a]]]`: link reference in the reference and in main. Labels add passes for definitions too.
  - frontmatter `anywhere` inside a directive: `yaml` in the reference, a thematic break and a heading on main. A main bug that design D fixes.
  - `- 1. :::b[x]\n      >{\n    >\n`: reference 3:1, talata 3:3. The nested document's end line sits at the source line start.
  - Order examples of `order.ts` and the spike: all match on main except `:{\n>:::x…` and the acorn seed 20261503 case. The rule (pass, start) picks the reference's error in all 13.
  - `40.  :::a\n     :::c\n    >` now matches (fixed before this branch).
- Checked that `micromark-extension-mdxjs-esm` keeps `definedModuleSpecifiers` on `parser`, so `esm.ts` `reparse` goes away with the queue.
- Found that `[directive, mdx]` would break between mdx-layers-directive and mdx-layers-flow as briefed: a nested flow error would throw during the queue while text errors still wait. Proposed giving the directive node `order.ts`, `inline.ts`, `chunks.ts` of mdx.
- Found that v5 directive `scopes.ts` queues hooks with empty ranges through `state.inline`. The queue keeps them in place (contract and stub test).
- Wrote the contract and `test/layers-contract.test.ts` (90 pass, 9 skipped with the node that turns them on, 2 todo). Checked that the 9 skipped fail on this branch.
- Fast check: the full run failed two timing tests under load (`directive-growth` quote unclosed, `mdx-acorn` stays linear). Both pass alone. tsc clean, oxlint only `smoke.mjs`, oxfmt clean.
- Review by a fresh agent: 15 findings, 14 applied to the contract (see outcome).
