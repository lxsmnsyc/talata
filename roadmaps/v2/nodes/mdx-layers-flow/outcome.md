# Outcome: mdx-layers-flow

## Built

Paths are under `packages/talata/src/`. talata/mdx reads failed flow constructs again through the flow layer of the core; nothing emulates the re-read any more.

- `ext/mdx/flow.ts` (1108 to about 230 lines): `createMdxFlow(js)` makes the rule. A JSX flow tag or flow expression that ends on its line is a plain concrete leaf. One that does not takes `state.mark()` and keeps its scanner:
  - `continue` feeds each line. `DONE`: `state.commit(mark)`, the leaf takes the line and closes on the next one. Text after the last tag: `addLine` calls `state.rewind(mark, rule)`, and the core reads the recorded lines again with the rules after `mdxFlow` on the first one.
  - `onLazyLine` throws the lazy-line error at `line.start`, or at the source line start when nothing is left after the prefixes, no split tab is left and no line ending follows (micromark closes the flow at the end of the line before).
  - `close` with the scanner still open (a container starts, or the document ends) feeds the end of file; after a final line ending that a container does not go on over, the empty line there is lazy first.
  - Syntax errors throw where met. Flow errors of the source throw during the block parse, flow errors of directive content in its document chunk, text errors in their text chunk. The first thrown is the reference's.
- `ext/mdx/esm.ts`: errors throw at once; the imported names are one list per parse, grown in queue order, so ESM in directive content sees every import of the source (micromark's `definedModuleSpecifiers`). `reparse`, the records, `startsEsm` and `opensDirective` are gone. ESM takes no mark (Deviations 3).
- `ext/mdx/inline.ts`: a text error throws, except during the tree build (`startBuild`), which parses image labels again; there it is dropped and the rest of the label is text, as before. `enterChunk` and the chunk chain are gone. With acorn, a place at the start of a line that a lookahead reached before maps after that line's container prefixes (`Scanner.lineStartAt`), as micromark ends the line ending there (`>:c[{{\n>}` gives 2:2).
- `ext/mdx/build.ts` and `tags.ts`: no nodes marker, no dropped paragraphs or nodes, no list spread fix for failed constructs, no `throwWaiting` or `reparse` call.
- `ext/mdx/index.ts`: the block rules bind acorn themselves; only inline rules and the transform are wrapped. `mdxFlowScope` and `mdxChunks` are gone.
- Deleted: `ext/mdx/reread.ts`, `prefixes.ts`, `order.ts`, `lookahead.ts`, `flow-scope.ts`, `chunks.ts`.
- Removed hooks (extension contract v6, `contracts/extension.change-request.md` "v5 to v6"): `readLineAt`, `processLine(line, from)`, `OpenParagraph.inlineIndents`, `startsContainer`, `endContent`, `Line.endsContent`, `closeOpenBlocks`. `isLastLine(line)` is `line.last`. `getBlock` and `getDepth` stay: `ext/directive/gaps.ts` reads them. `willClose` stays, as `willClose?(state, line)`, though nothing uses it: without its call in `attach`, V8 inlines `attach` differently and the readmes input parsed 7% slower (bisected against main 6221c4a, best-of-15 medians; restoring only that call brings it back to main). The removed hooks' tests in `test/core-hooks*.test.ts` are removed; `willClose` has a new one.

### Outside the owned paths (why)

Each is in `contracts/block-layers.change-request.md` ("v3 to v4").

- `core/blocks.ts` (owned) records per marked line the footnote indent line and the `quoteLine` of every open tracked block, and puts them back before each replayed line. A collector opened by a replayed line read the live line's values (`>[a]:\n{\n>:::x\n>1.\n>x\n>}x`).
- `gfm/footnote.ts`: `footnoteIndentLine(state)`, the getter the replay needs.
- `core/blocks.ts` (owned) `tryStartContainer` and `blocks/thematic-break.ts` (`isThematicBreak`): while a marked leaf is open only container rules run first, so the thematic break rule no longer came before the list item (`> <d b="\n> {a\n> "/>x\n- - -`). There, and only when the `thematicBreak` rule is enabled (micromark's list honours `disable.null`), no container starts on a `*` or `-` thematic break line. The list item rule itself is unchanged, so live lines are not scanned twice. Tests with the rule off: `test/core-hooks.test.ts`.
- `blocks/code-indented.ts`: a comment named `endContent`.

### Tests

- `test/mdx-growth.test.ts` (new): growth of `{a\n:::x\n}x\n` with the heads `''`, `a. `, `*a* `, `&amp; `, `[a] `, at the root, in a quote and in a list item (best of 5, ratio at 4x under 8: linear is 4, quadratic 16); with acorn, under 8 per 4x and faster than the reference (acorn stops at the first error near the start of the code, so each `}` costs little; the reference rebuilds the code from its events at each `}` and is quadratic); the shapes against the reference; a generator of failed constructs over directives with heads, quotes, lists, footnote definitions, lazy lines and tails (`MDX_GROWTH_COUNT`, `MDX_GROWTH_SEED`, `MDX_GROWTH_LIMIT`). The doomed generator of fix-mdx-directive-growth was never committed; this one stands in for it.
- `test/mdx-lazy-place.test.ts`: ported from `fix/mdx-directive-growth` (not on main), with its 44 inputs, the two regressions of that node's review, and its generator, now with list items and footnote definitions outside the directive (`MDX_LAZY_COUNT`).
- `test/layers-contract.test.ts` (shared): the two pending cases and `[F]:x\n"\n<s\r>"` run in "cases fixed by mdx-layers-flow"; the todo is a growth test. Nothing is skipped or todo any more.
- Known cases of `nodes/fix-mdx-known-cases/brief.md`: 1 in the contract test's `fixed` list and the lazy-place inputs; 2 and 4 in the contract test; 3 in the order examples of the contract test and the growth generator.

## Deviations

1. Replay facts and the list item guard (above, change request points 1 and 2).
2. The lazy-line place at the end of a document (change request point 4) is a talata/mdx rule in `onLazyLine`, not core behavior.
3. ESM takes no mark (change request point 3): micromark's ESM noks only on its first line, and acorn errors throw.
4. Edits outside the owned paths: `gfm/footnote.ts`, `blocks/thematic-break.ts`, `blocks/code-indented.ts` (comment), and the contract change requests.

## Stubs left

- None.

## Gotchas

- The rule passed to `rewind` must be the registered object: `createMdxFlow` closes over its own rule, so the acorn wrapper no longer copies block rules.
- Rebased onto main 6221c4a, which has fix-mdx-directive-growth (4bfb2ea): its `order.ts` and `prefixes.ts` edits are dropped with the files; `acorn.ts` (`isEmpty` early exit) and `mdx.ts` (no `toSorted`) are kept.
- `ext/directive/container.ts` still closes on its fence line "so an MDX re-read sees it close". The re-read is gone; the fence-line close stays (it is the contract now), only the comment's reason is stale.
- Timing tests flake under load. During this node the machine ran at load 25 to 220 from other sessions; every timing test passed alone.

## Proposed learnings

- When a replay reads container state, record what the document layer left per line, not only the line span | a collector opened in a replay read the live `quoteLine` | packages/talata/src/core | yes (re-read inputs and the lazy-place generator cover it)
- Rule order can stand in for a guard that micromark has inside a construct; a path that runs a subset of the rules loses it | list item on `- - -` while a marked leaf is open | packages/talata/src/core | yes

## Verification

Before the rebase, against main 3196f33: tree comparison of branch dist and main dist in one process (`JSON.stringify` equal, `MdxError` reason and place compared, fuzz generator `documentAt`, scratch `hash.mjs`).

- Corpus (142 files), 18 configs (none, frontmatter, math, directive, `[frontmatter, math, directive]`, mdx, `mdx({ acorn })`, all, all with acorn; gfm off and on): 0 differences.
- 1,000,000 random documents per config, seed 20261125: none and `[frontmatter, math, directive]`, gfm off and on: 1 difference, `[frontmatter, math, directive]` gfm document 62263, where the branch and its parent 968f607 both equal the reference (the text directive label pass order of mdx-layers-directive). mdx, acorn, all, all with acorn, gfm off and on (8,000,000): 0 differences.
- `pnpm fuzz --all`, 1,000,000 documents (seed 20261211): 0 failures; 62 reference timeouts at load 100 to 220, replayed with `--timeout-ms 60000`: 0 failures. `--all --acorn`, 1,000,000 (seed 20261212): 0 failures; 12 timeouts replayed: 0 failures.
- Targeted generators at 1,000,000 documents: re-read (`MDX_REREAD_COUNT`, seed 20261213), acorn (`MDX_ACORN_TARGETED` in 8 chunks of 125,000 through the new `MDX_ACORN_START`), lazy-place with lists and footnote definitions outside (`MDX_LAZY_COUNT`, seed 20261214), failed constructs over directives (`MDX_GROWTH_COUNT`, seed 20261215): all pass.

After the review fixes and the rebase onto main 6221c4a, against 6221c4a:

- Corpus, 16 configs: 0 differences. 300,000 documents for none and for mdx, gfm off and on (seeds 20261301, 20261304): 0 differences. 200,000 for mdx and for all with acorn, gfm off and on (seed 20261302): 0 differences.
- `pnpm fuzz --count 300000 --all --acorn` (seed 20261303, 8 chunks): 0 failures, 0 skipped.
- Known cases: all match the reference, each in a test (see Tests). `[F]:x\n"\n<s\r>"` with all four and acorn, gfm on and off: matches. With `disable: { block: ['thematicBreak'] }` (micromark `disable.null`), `- - -`, `* * *`, `a\n- - -` and the marked-leaf case match, with and without mdx.
- Growth, `[directive, mdx]`: the DoS of `{a\n:::x\n}x\n` was already gone on main 6221c4a, since mdx-layers-directive collects the directive content raw (0.4 ms at 1000 units, 0.9 ms at 4000). The 201 ms at 1000 and 3126 ms at 4000 of fix-mdx-directive-growth are 3196f33. On this branch, best of 3 at 1000, 4000 and 16000 units: root 0.8 / 2.7 / 9.2 ms; before the rebase (load about 40) `a. ` 1.9 / 7.3 / 28.0, `*a* ` 1.9 / 7.1 / 23.5, `&amp; ` 1.9 / 7.6 / 29.8, `[a] ` 1.8 / 7.2 / 27.5, quote 3.8 / 12.6 / 49.1, list item 11.7 / 39.0 / 150.2: about 4x per 4x. With acorn, after the rebase (main's `isEmpty` early exit): root 2.3 / 6.2 / 25.8 ms at 250, 1000 and 4000 units, linear; the reference 18.6 / 262 / 6011 ms, quadratic. The growth tests assert under 8 per 4x (linear 4, quadratic 16), so a quadratic fails them with room for load.
- Performance, perf-pass `bench.py`, interleaved, 20 runs of a talata-only best-of-15 median per input, load 3.5 to 3.9, against 6221c4a; `list` is `'- '.repeat(4000) + 'x'`:

  | Input     | main vs main | branch vs main | bench.py verdict |
  | --------- | ------------ | -------------- | ---------------- |
  | readmes   | -0.3%        | -1.7%          | within noise     |
  | fs.md     | +0.1%        | -2.5%          | within noise     |
  | changelog | -8.2%        | -6.6%          | within noise     |
  | list      | +0.0%        | -21.8%         | better           |

  The first guard in `list-item.ts` cost `list` 2x and readmes measured +7.3% (low spread); the guard moved to `tryStartContainer`. Removing the `willClose` call cost readmes about 7% (variants bisected against a byte-identical control build of main); it is kept.

- Size (`pnpm --filter benchmark size`, before the rebase): main entry 35,335 bytes gzip, `talata/mdx` 21,034 bytes gzip (3196f33: 33,367 and 29,818).
- Fast check with `NODE_ENV=production`: `pnpm --filter talata test` 6,972 passed, 10 timing tests failed while the suite ran at load 43 (`directive-growth`, `mdx-reread` and `layers-core` linear checks, and six `mdx-growth` shapes); those four files run alone: 66 of 66 pass. `tsc --noEmit` clean. `oxlint`: errors only in `.github/scripts/smoke.mjs`, plus the two `max-depth` warnings in `src/ext/directive/`. `oxfmt --check` clean.
- Not measured: `--all` fuzz throughput against main (the contract's 10% budget).

## Size

- Estimated L, actual L.
