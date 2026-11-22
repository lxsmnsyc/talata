# Outcome: fix-directive-nested-growth

## Built

Deep chains of container directives are no longer cubic in the depth. They are now quadratic, as in the reference, and 20 to 35 times faster than the reference at depth 1600. The tree does not change. All edits are in `packages/talata/src/ext/directive/container.ts`:

- `continuesAfter` reads the next line through one walk per line (`walkTo`, `NextWalk`), which every directive that continues on the line shares. Each directive goes on from the depth where the directive around it stopped. The walk records:
  - the depths of block quotes;
  - the directives whose closing fence is the next line;
  - the first block that does not continue on the next line;
  - the first directive above that block.

  `hasQuoteBetween` and `isQuotedInDirective` are replaced by binary searches over those depths (`findBelow`, `findAbove`). The walk starts again when the line object, the line index, or the block at its deepest read depth changes.

- `depthOf` replaces `state.getDepth` (`lastIndexOf`) everywhere in the file. A directive keeps its depth in `openDepth`; other blocks keep theirs in a `WeakMap`. Each is checked with `getBlock`.
- `segmentKeeps` reads the blocks inside only up to the next directive, not the whole of `getInside`. Before, a container start that closed a deep chain was cubic through `willClose`.
- Test: `packages/talata/test/directive-growth.test.ts`.
  - 7 deep chains: root, quote and list, each closed and unclosed, plus the MDX input. Limit 24 at 4x depth (cubic is 64, quadratic 16).
  - 6 inputs of many short chains: closed inside first, closed outside first, quote and list, each closed and unclosed. Limit 6 at 4x size.
  - Each case also checks a small input against the reference.
  - `DIRECTIVE_GROWTH_N`, `DIRECTIVE_GROWTH_OUT` and `DIRECTIVE_GROWTH_REFERENCE` set the scale, the output file and timing of the reference.
- `.changeset/fix-directive-nested-growth.md`: a patch for talata.

## Proof

- base, batch/v2 6385e07:
  - Command: in `packages/talata`, `DIRECTIVE_GROWTH_N=200 DIRECTIVE_GROWTH_REFERENCE=1 DIRECTIVE_GROWTH_OUT=<file> NODE_ENV=production npx vitest run test/directive-growth.test.ts`, depth 200 then 800.
  - The 7 deep chains fail with talata ratios of 57 to 63 (cubic). The brief's input took 69.6 ms at depth 200 and 4407 ms at 800.
  - The reference grows 17.4 to 18.4 on the chains (quadratic) and 3.6 on the MDX input.
  - CPU profile at depth 800: `isClosingFence` 37 %, `getDepth` 22 %, `continuesAfter` 19 %, `continuesNext` 16 %. Each directive walked every container around it, for each line.
  - The short-chain inputs were already linear on base (3.3 to 4.8).
- branch, same command at default sizes (deep 400 then 1600, many 2000 then 8000):

  | Chain                               | talata ratio | reference ratio | talata ms at 4n | reference ms at 4n |
  | ----------------------------------- | ------------ | --------------- | --------------- | ------------------ |
  | deep root, closed (brief)           | 12.8         | 14.0            | 187             | 5121               |
  | deep root, unclosed                 | 15.1         | 18.6            | 183             | 4196               |
  | deep quote, closed                  | 15.1         | 19.2            | 276             | 9022               |
  | deep quote, unclosed                | 15.4         | 19.5            | 281             | 5972               |
  | deep list, closed                   | 13.5         | 19.0            | 203             | 6366               |
  | deep list, unclosed                 | 15.1         | 19.4            | 202             | 5053               |
  | `{a\n:::x\n}x\n` `[directive, mdx]` | 14.6         | 5.0             | 656             | 9.9                |
  | many, root, closed inside first     | 3.8          | 4.4             | 118             | 1403               |
  | many, root, closed outside first    | 4.2          | 4.1             | 83              | 794                |
  | many, quote, closed                 | 3.8          | 4.6             | 68              | 897                |
  | many, quote, unclosed               | 3.8          | 11.4            | 69              | 5240               |
  | many, list, closed                  | 4.4          | 4.1             | 84              | 801                |
  | many, list, unclosed                | 4.1          | 4.0             | 79              | 715                |
  - The brief's input at depth 800 now takes 59.7 ms (was 4407 ms).
  - Profile at depth 3200: the work left is constant per open directive per line (`isClosingFence` on the directive's own line, `walkTo`, `depthOf`, the core's `processLine`).

## Deviations

- The acceptance asks for growth under 5x per 4x size for nested chains. Inputs of many short chains meet it (3.8 to 4.4). One chain n levels deep cannot: the core's `processLine` asks every open container to continue on every line, and micromark does the same. For a single deep chain, the result is the brief's other bound, "at most as fast as the reference does": 12.8 to 15.4 against the reference's 14.0 to 19.5. Going lower would need a core change that lets a line skip containers that always continue.
- The `[directive, mdx]` input stays quadratic in talata (14.6) while the reference is linear (5.0). The reference reads the document as one expression that fails at the end. talata's MDX re-read nests one directive per unit before it throws the same error. The fix for that belongs in `src/ext/mdx/`, outside this node. At 1000 units the built `dist` takes 154 ms, against 9844 ms on base in the same run (the brief measured 6.3 s).
- No core change and no contract change. `core/blocks.ts` and `blocks/code-fenced.ts` are not edited.

## Stubs left

- None.

## Gotchas

- `depthOf` assumes that a block never opens again after it closes, and that it sits at one depth while open. Both hold for every block today. A block that is pushed twice would need `state.getDepth`.
- The `NextWalk` of a line uses the containers' state at the time each depth is first read. It stays valid only while the blocks under a directive do not change during that line's continue loop, which holds because a directive's `continue` changes only the blocks inside it. A new caller that changes outer blocks between continues needs to drop the walk (`walks.delete(source)`).
- A line read again with the parser's own `Line` object and the same index would reuse a stale walk. `readLineAt` forbids passing that line, and ext-mdx makes its own.

## Known, handled elsewhere

- A batch/v2 directive bug, found by the fuzz, needs its own fix node. Input: `"40.  :::a\n     :::c\n    >"` with gfm, from `--seed 20261222 --start 244072 --count 1 --all`. The inner `containerDirective` ends at line 2 in talata and at line 3 in the reference. The last line is indented too little to continue the list item and starts a quote. It is in released `talata/directive` 0.3.

## Proposed learnings

- Per-line work in a container must not depend on the depth of the containers around it; share one walk per line between nested containers | each directive walked the whole stack for the next line, and the chain was cubic | packages/talata/src/ext | yes (growth test over deep chains)
- A growth test for nesting compares with the reference's own growth, which is quadratic in the depth for any container | under 5x per 4x size is not reachable for a single deep chain | packages/talata/test | yes

## Verification

- Fast check, run alone, with the benchmark corpus linked in:
  - `pnpm --filter talata test`: 37 files and 6778 tests pass.
  - `npx tsc --noEmit -p .`: clean.
  - `npx oxlint`: only the known `smoke.mjs` errors and the two `max-depth` warnings.
  - `npx oxfmt --check`: clean.
- Tree hashes: SHA-256 of `JSON.stringify(parseTalata(...))` over the 142 corpus files and 100,000 documents (`generateDocument` with all features and `[frontmatter, math, directive, mdx]`, every tenth `generatePathological`, seed 4242, `documentSeed(4242, i)`). Each with no extensions, `[frontmatter, math, directive]` and `[frontmatter, math, directive, mdx]`, gfm off and on. batch/v2's `container.ts` and the branch give the same hashes: corpus `cbf62068...2aa5444`, all `c845b02e...2f3690e`.
- Fuzz, `pnpm fuzz --count 1000000 --all --no-save`:
  - Random seed (not kept), code before the lint edits: 1,000,000 compared, 0 skipped, 0 failures (598.8 s).
  - `--seed 20261222`, final code: 1,000,000 compared, 0 skipped, 1 failure (690.8 s), document 244072, `"40.  :::a\n     :::c\n    >"`. The inner directive ends on line 2 in talata and on line 3 in the reference. batch/v2 gives the same failure (replayed with batch/v2's `container.ts`), so this change does not cause it. It is not fixed here: fixing it changes the tree, and this node must keep the tree identical. See "Known, handled elsewhere".
- Speed, alternating runs of the built `dist` of base and branch, medians: the corpus with gfm and `[frontmatter, math, directive]`, 20 rounds, 51.6 ms base and 51.1 ms branch (0.991). Short directive chains, 30 rounds, 55.9 ms and 56.3 ms (1.008). No loss.

## Size

- Estimated S, actual S.

Landed as 056b425 on batch/v2.
