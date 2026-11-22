# Log: mdx-layers-flow

- Branch `refactor/mdx-layers-flow` from `refactor/mdx-layers-directive` (968f607).
- `flow.ts` rewritten on `mark`/`commit`/`rewind`/`onLazyLine` (about 230 lines). Deleted `reread.ts`, `prefixes.ts`, `order.ts`, `lookahead.ts`, `flow-scope.ts`, `chunks.ts`; `esm.ts` lost `reparse` and the records; `build.ts` lost the nodes marker and dropped paragraphs; `inline.ts` throws at once except during the tree build.
- First run: 5 MDX test failures.
  - `> <d b="\n> {a\n> "/>x\n- - -`: only container rules run on a line where a container did not match the marked leaf; the list item started on `- - -`. micromark's list refuses a thematic break itself. Guard first in `list-item.ts`; after review moved to `tryStartContainer` (only on that path, only with `thematicBreak` on): the list item version scanned every live list line twice (`'- '.repeat(4000) + 'x'` 2x slower, no-extension fuzz +8 to 11%) and broke `disable: ['thematicBreak']`.
  - ` 2) >{\r\t`: a lazy line with nothing after the prefixes at the end points at the line start (2:1). A split tab left keeps the place after the tab (lazy-place generator: ` :::b\n> ><a\n> >\n\t` gives 4:2).
  - `>[a]:\n{\n>:::x\n>1.\n>x\n>}x`: the collector opened in a replay read the live `quoteLine`. The replay now records and restores `quoteLine` of tracked blocks and the footnote indent line.
- `>:c[{{\n>}` with acorn (known case 2): the directive's label scan reached line 2, so micromark's line ending ends after the quote prefix; the acorn place maps there (`Scanner.lineStartAt`).
- Task list case and `[F]:x\n"\n<s\r>"` already matched after the rewrite.
- Ported `test/mdx-lazy-place.test.ts` from `fix/mdx-directive-growth` (not merged into main) and added lists and footnote definitions outside the directive: 50,000 documents pass.
- New `test/mdx-growth.test.ts`: growth of the DoS shapes and a doomed-shape generator (the original doomed generator was never committed).
- Timing tests flake under the machine load (load 25 to 50 from other sessions); they pass alone.
- Non-MDX tree compare, 1M per config: one difference, `[frontmatter, math, directive]` gfm doc 62263 (seed 20261125), where the branch equals the reference: the label pass order from mdx-layers-directive.
- Review fixes: thematic break guard moved to `tryStartContainer`, only with `thematicBreak` on; rebased onto 6221c4a; readmes was +7% against 6221c4a, bisected to removing the `willClose` call in `attach` (a byte-identical control build of main measured +1%), so `willClose` stays.
