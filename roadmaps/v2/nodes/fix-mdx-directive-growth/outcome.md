# Outcome: fix-mdx-directive-growth

## Built

The growth fix did not land. The node lands the lazy-line and error-order fixes found on the way, and the coordinator's additions. Paths are under `packages/talata/src/`.

- `ext/mdx/prefixes.ts` `prefixEnd`: the place of a lazy line in a directive's content. The release fuzz found `>:::b[[[]]]\n>>{\n>\n` (reference 3:1, main 3:2).
  - Columns: a quote's space takes one column of a tab. The columns left (`virtual`) go to the next indent before spaces (`take`). Main counted columns again from the line start with whole tabs.
  - A line with nothing left after the directive's indent is lazy from its start when the next line is missing, or does not continue the containers above the directive and starts no container (`nextIsLazy`, `startsContainer`). micromark ends the content before such a line (its `nonLazyLine` check). With a next line that continues them, the place is after the prefixes.
  - A list item or a directive that takes the rest of the line at the end of the text (no columns left) makes the place the line start. A list item in a directive takes a tab that still has columns left.
  - The `afterSpace` rule of fix-mdx-reread-container now covers only a quote inside the directive at the end of the text. The rule above covers the quote outside.
- `ext/mdx/order.ts`: a container directive whose content is followed only by whitespace, line endings and quote markers runs to the end of the text (`blankEnd`), so an end-of-file error at the end of its content counts inside it. On main, `>{\n>:::x\n>}{\n><a b="\n>{">x\n` gives 5:6 and the reference 1:3.
- `ext/mdx/acorn.ts` `isEmpty`: returns at the first character that is not whitespace (a `charCodeAt` loop over the `\s` class), unless that character is `/`. Before, it ran two regular expression replaces over the whole expression at each `}`.
- `toSorted` (ES2023) replaced with `slice().sort()` in `mdx.ts` and `ext/mdx/esm.ts`. A grep of `src/` found no other post-ES2020 built-ins.
- Test `packages/talata/test/mdx-lazy-place.test.ts`:
  - 44 inputs: the fuzz case and its variants (label or none, `>` and `> `, tabs, deeper quotes, lists, nested directives), the error-order cases, and the two review inputs. Each runs with `[directive, mdx]` and all four extensions, with and without acorn, gfm off and on.
  - A generator (`MDX_LAZY_COUNT`, `MDX_LAZY_SEED`, `MDX_LAZY_LIMIT`): quotes outside the directive, a directive around, an indent, a label, quotes and lists inside, an open construct, and a lazy line from cut prefixes and tails.

## Proof

- Lazy line place and error order: `test/mdx-lazy-place.test.ts` fails on main 3196f33 (inputs with gfm off and on, and the generator) and passes on the branch.
  - Probe sets against the reference: 112,000 configurations (main 7440 differ, branch 0); next-line grid of 2450 (branch 0); lists inside directives at the end of the text, 960 (main 330, branch 0).
  - Replay `pnpm fuzz --seed 20261401 --start 125133 --count 1 --all --acorn`: 0 failures.
- Growth: not fixed. The evidence for the spike is below.

## What did not land, and why

The review removed the "doomed directive" shortcut:

- How it worked: when a failed construct opened a container directive after a paragraph whose text certainly fails, re-reads inside that directive treated `:::` lines as text. The paragraph's text error comes first in the reference's order, so the content was assumed not to matter.
- Unsound: a lazy line after the last `}x` makes the content matter.
  - `>{\n>:::x\n>}x\n>{\n>:::x\n><d\n>}x\ny\n`: reference and main 1:3, the shortcut "Unexpected character `}` after name".
  - `- {\n  :::x\n  }x\n  {\n  :::x\n  <d\n  }x\n:\n`: reference and main 1:4, the shortcut the same `}` error.
  - Both are now in the tests and match the reference.
- Partial: any head outside its plain set (`a. `, `*a* `, `` `a` ``, `&amp; `, `\* `, `[a](b) `, `a-b `) kept the input quadratic.

The growth test and the generator for the shortcut are removed with it. Evidence for the spike, `[directive, mdx]`, time ratio at 4x size:

- Main 3196f33, 1000 then 4000 units, best of 5:

  | Shape                                 | ms at n | ms at 4n | ratio |
  | ------------------------------------- | ------- | -------- | ----- |
  | `{a\n:::x\n}x\n`                      | 201     | 3126     | 15.6  |
  | same, acorn                           | 10.5    | 114      | 10.8  |
  | `> {a\n> :::x\n> }x\n`                | 299     | 4691     | 15.7  |
  | same, acorn                           | 10.8    | 115      | 10.7  |
  | `- a\n` + `  {a\n  :::x\n  }x\n`      | 229     | 3617     | 15.8  |
  | same, acorn                           | 11.6    | 116      | 10.0  |
  | `- {a\n  :::x\n  }x\n`                | 9.0     | 39       | 4.3   |
  | `[a]:\n{a\n:::x\n}x\n`                | 289     | 4608     | 15.9  |
  | same, then `:::\n` n times            | 233     | 3708     | 15.9  |
  | `{a\n:::x\n}x\n`, all four extensions | 233     | 3705     | 15.9  |

  On the built `dist`, the brief's shape takes 94 ms at 1000 units and 1290 ms at 4000 (13.7).

- Reference, 1000 then 4000 units: 2.5 (root), 3.1 (quote), 3.7 (definition first). With acorn the reference is quadratic: 22.3, 21.6, 24.8; it takes 5.9 s at 4000 units of the root shape.
- Profile on main, 4000 units: the directive's per-line continue takes 78 % inclusive (`walkTo` 27 % self, `isClosingFence` 18 %, `continue`, `continuesAfter`, `continuesNext` about 8 % each). Each unit's re-read opens one container directive inside the last, so line `k` continues `k/3` directives. In micromark the outer directive's content is a chunk tokenized later. The first paragraph's text throws in the same pass, before that chunk, so the reference never builds the nesting.
- With the shortcut (removed), the shapes ran at 3.8 to 4.9 alone. That is the target a sound fix should reach.
- With acorn, `isEmpty` took 93 % on main. Its early exit (kept) brings the root acorn shape on `dist` to 20 ms at 4000 units and 165 ms at 16000 (8.1). It stays quadratic in principle: each `}` hands acorn the code so far, as the reference does.

## Deviations

- The growth fix did not land (see above). The brief's acceptance (growth test under 5x) is not met; a spike decides the fix.
- The node lands fixes outside the brief's owned paths, all in talata/mdx, which is unreleased:
  - `src/ext/mdx/prefixes.ts`: the coordinator's lazy-line addition.
  - `src/ext/mdx/order.ts`: the end-of-quote order fix.
  - `src/ext/mdx/acorn.ts`: the `isEmpty` early exit.
  - `src/ext/mdx/esm.ts` and `src/mdx.ts`: `toSorted`.
  - `test/mdx-lazy-place.test.ts`: new.
- `reread.ts` and `flow.ts` (the owned paths) are unchanged from main.
- The lazy-place generator covers quotes outside the directive only. With list items or footnote definitions outside, 50,000 documents: main 3736 differ, the branch 178, all also on main (see Known, handled elsewhere).
- No changeset: talata/mdx is unreleased.

## Stubs left

- None.

## Gotchas

- `prefixEnd` now reads the next line (`nextIsLazy`). Its container rules are a small model of micromark's document tokenizer: quote marker, list and footnote indent, blank lines, new containers. Only the grids and the generator here check it.
- For the spike: an end-of-file error at the end of a directive's content depends on `blankEnd` in `order.ts`. Any shortcut that changes what is inside a directive has to keep where its content ends and what follows it. The two review inputs show a lazy line after the content can change the error.

## Known, handled elsewhere

These differ from the reference on main too:

- Lazy lines with list items or footnote definitions outside a directive: `- 1. :::b[x]\n      >{\n    >\n`, `>1. :::b\n>    >>\t<a b="\n>    >>\tb="\n>   > \n`.
- With acorn, the place in a text directive label across quote lines: `>:c[{{\n>}` (reference 2:2, talata 2:1).
- Error order:
  - `:{\n>:::x\n>{\n><}x\n:`: reference "Unexpected end of file in expression ... at 1:3", talata "Unexpected character `}` ... at 4:3".
  - `pnpm fuzz --all --acorn`, seed 20261503, document 344943: `"<\n>:::a\n><t\n>{...d}>]\n\""`.
- `pnpm fuzz --all`, seed 20261502, document 62984: `"* [X]  <><a-b></a-b></>\n{\n\t}t"` with gfm. A task list item with JSX text drops a space text node.

## Proposed learnings

- A shortcut that skips work because "the result is already fixed" must prove that nothing after the skipped part can change it, lazy lines and the end of the text included | the doomed directive missed a lazy line after its content | packages/talata/src/ext/mdx | yes (generator with lazy and trailing lines)
- Columns of a split tab are state that passes from one container to the next; do not count them again from the line start | `prefixEnd` counted whole tabs after a quote took one column | packages/talata/src/ext | yes (grids, generator)
- Compare a generator's failures with main's before treating one as a regression | most generator failures here were on main too | packages/talata/test | no

## Verification

- Fast check:
  - `pnpm --filter talata test` with the corpus linked: 41 files, 6801 tests. Two timing tests failed under load (`directive-growth.test.ts` "quote, unclosed" and `mdx-acorn.test.ts` "stays linear"); run alone, both files pass (26 tests).
  - `npx tsc --noEmit -p .` and `npx oxfmt --check`: clean.
  - `npx oxlint`: only the known `smoke.mjs` errors and the two `max-depth` warnings.
- Lazy-place generator, `MDX_LAZY_COUNT=1000000 MDX_LAZY_SEED=20261601`: pass.
- Re-read generator, `MDX_REREAD_COUNT=1000000 MDX_REREAD_SEED=20261602`: pass.
- `MDX_ACORN_TARGETED=1000000`: pass.
- `pnpm fuzz --count 1000000 --seed 20261603 --all --no-save`: 1,000,000 compared, 0 skipped, 0 failures (468 s).
- `pnpm fuzz --count 1000000 --seed 20261604 --all --acorn --no-save`: 1,000,000 compared, 0 skipped, 0 failures (563 s).
- Tree hashes, main vs branch: SHA-256 of `JSON.stringify` of the trees over the 142 corpus files and 100,000 documents (`generateDocument` with all features, every tenth `generatePathological`, seed 4242).
  - Configurations: no extensions, `[frontmatter, math, directive]`, and all four with and without acorn; gfm off and on.
  - All 16 pairs are equal, and no document differs. For example, random documents with all four extensions and gfm on: `1bb008ef12ad...`.

## Size

- Estimated S. The growth fix did not land. The lazy-line class, the order bug and the probes were L.
