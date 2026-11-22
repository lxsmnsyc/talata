# Log: fix-directive-nested-growth

## 2026-11-22: proof on batch/v2 (6385e07)

Command, in `packages/talata`, with the growth test of this node on batch/v2:

```sh
DIRECTIVE_GROWTH_N=200 DIRECTIVE_GROWTH_REFERENCE=1 DIRECTIVE_GROWTH_OUT=<file> \
  NODE_ENV=production npx vitest run test/directive-growth.test.ts
```

Best of 3 runs, depth 200 then 800 (time ratio at 4x size; quadratic is 16, cubic 64). Load average 4 to 5.

| Chain                               | talata ms (200, 800) | talata ratio | reference ratio |
| ----------------------------------- | -------------------- | ------------ | --------------- |
| root, closed (the brief's input)    | 69.6, 4407           | 63.3         | 17.8            |
| root, unclosed                      | 71.9, 4530           | 63.0         | 18.4            |
| quote, closed                       | 79.2, 4597           | 58.1         | 18.3            |
| quote, unclosed                     | 79.9, 4579           | 57.3         | 18.3            |
| list, closed                        | 77.3, 4549           | 58.9         | 17.4            |
| list, unclosed                      | 76.0, 4492           | 59.1         | 18.4            |
| `{a\n:::x\n}x\n` `[directive, mdx]` | 183.8, 11286         | 61.4         | 3.6             |

All 7 fail the test's limit. talata is cubic in the depth. The reference is quadratic in the depth for the chains: each line goes through every open container in micromark too. For the MDX input the reference reads the whole document as one expression and fails at its end, without nesting, so it is linear; talata nests one directive per unit before it throws the same error.

Profile: `node --cpu-prof` on the built `dist` (tsdown), root closed chain at depth 800, 1413 ms:

- `isClosingFence` 37 %, `getDepth` 22 %, `continuesAfter` 19 %, `continuesNext` 16 %.

The MDX input at 500 units gives the same four (28, 17, 23, 23 %). `continuesAfter` of each directive walks every container around it on the next line (`isClosingFence` and `continuesNext` per level) and calls `getDepth` (`lastIndexOf`) for itself: depth work per directive per line.

## 2026-11-22: fix

`ext/directive/container.ts` only:

- `continuesAfter` reads the next line through one walk per line (`walkTo`, `NextWalk`), shared by every directive that continues on the line: the outer directive reads the blocks below it, the next one goes on from there. The walk records the depths of quotes, of directives whose closing fence is the next line, the first block that does not continue, and the first directive after it. `hasQuoteBetween` and `isQuotedInDirective` become binary searches on those (`findBelow`, `findAbove`). The walk is reset when the line object, its index, or the block at its deepest read depth changes.
- `depthOf` replaces `state.getDepth` (`lastIndexOf`) in the file: the depth is kept on the directive (`openDepth`) or in a `WeakMap` for other blocks, checked with `getBlock`.
- `segmentKeeps` reads the blocks inside up to the next directive, not all of `getInside` (cubic when a container start closes a deep chain through `willClose`).

No core change, no contract change.

After the fix, profile at depth 3200 (root closed, `dist`): 297 ms, spread over `isClosingFence` (25 %, the directive's own fence check on its line), `walkTo`, `depthOf`, `processLine`: constant work per open directive per line. That is the core's continue loop, which every line runs over every open container, as micromark does.

Growth, same command, `DIRECTIVE_GROWTH_REFERENCE=1`, default sizes (deep: 400 then 1600; many: 2000 then 8000 units):

| Chain                               | talata ms (n, 4n) | talata ratio | reference ms (n, 4n) | reference ratio |
| ----------------------------------- | ----------------- | ------------ | -------------------- | --------------- |
| deep root, closed                   | 14.6, 187         | 12.8         | 366, 5121            | 14.0            |
| deep root, unclosed                 | 12.1, 183         | 15.1         | 225, 4196            | 18.6            |
| deep quote, closed                  | 18.3, 276         | 15.1         | 470, 9022            | 19.2            |
| deep quote, unclosed                | 18.2, 281         | 15.4         | 306, 5972            | 19.5            |
| deep list, closed                   | 15.0, 203         | 13.5         | 335, 6366            | 19.0            |
| deep list, unclosed                 | 13.3, 202         | 15.1         | 260, 5053            | 19.4            |
| `{a\n:::x\n}x\n` `[directive, mdx]` | 44.9, 656         | 14.6         | 2.0, 9.9             | 5.0             |
| many, root, closed inside first     | 31.2, 118         | 3.8          | 316, 1403            | 4.4             |
| many, root, closed outside first    | 19.4, 83          | 4.2          | 193, 794             | 4.1             |
| many, quote, closed                 | 18.1, 68          | 3.8          | 196, 897             | 4.6             |
| many, quote, unclosed               | 18.0, 69          | 3.8          | 459, 5240            | 11.4            |
| many, list, closed                  | 18.9, 84          | 4.4          | 196, 801             | 4.1             |
| many, list, unclosed                | 19.4, 79          | 4.1          | 177, 715             | 4.0             |

Depth 200 then 800, branch: root closed 5.2 and 59.7 ms (base 69.6 and 4407). At 800 then 3200: ratios 14.2 to 15.9.

batch/v2 on the "many" cases (2000, 8000): 3.3 to 4.8, already linear; only deep chains were cubic.

The `mdx re-read` input stays quadratic in talata (one directive nested per unit before the error) while the reference reads it as one failed expression, linear. Making talata linear there means not nesting the directives in the MDX re-read: `src/ext/mdx/`, outside this node. At 1000 units the built `dist` takes 154 ms (batch/v2: 9844 ms, same run, machine under load).

## 2026-11-22: checks

- Hashes: a scratch script (`hash-trees.tmp.test.ts`, not committed) hashed the trees over the corpus and 100,000 documents, seed 4242, three extension sets, gfm off and on. batch/v2's `container.ts` and the branch give the same hashes: corpus `cbf62068...2aa5444`, all `c845b02e...2f3690e`.
- Fuzz `--all`, 1,000,000 documents: a random seed gave 0 failures. Seed 20261222 gave 1 failure, document 244072, `"40.  :::a\n     :::c\n    >"` (the inner directive ends on line 2 instead of 3). batch/v2's `container.ts` gives the same failure. It is an older bug, left for a new node, because this node keeps the tree.
- Speed, alternating runs of the built `dist`, medians: the corpus with `[frontmatter, math, directive]` and gfm, 0.991 of base; short chains, 1.008.
- Fast check, run alone: 37 files and 6778 tests pass (corpus linked). tsc, oxlint (known noise only) and oxfmt are clean.
