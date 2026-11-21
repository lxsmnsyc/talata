# Outcome: fix-mdx-reread-container

## Built

The lines of a failed MDX flow construct (text after its last tag on a later line) are read again as flow, as micromark does. Paths are under `packages/talata/src/`.

- With `mdx()` and `directive()`, a container directive opener in those lines now opens a real container directive. Its content gets the lines after the opener, whether the directive closes among those lines or later, in quotes and lists.
- A construct in the lines read again that runs past them now takes the next lines (second class, added by the coordinator, wrong with plain `mdx()` too). Example: `<a b="\n{a">x\n>}x`.

Changes:

- `core/blocks.ts`:
  - New hook `BlockState.readLineAt(line, depth)`. It reads `line` again as a line on which the open blocks up to `depth` matched. `BlockParser.processLine(line, from = 0)` starts its continue loop at `from + 1`. The parser never calls it.
  - `OpenParagraph.inlineIndents?()`. `paragraphIndents` (`blocks/paragraph.ts`) uses it for a paragraph that is not the core's own, so a setext heading over a failed construct keeps the whitespace after the containers (`- {\n   }x\n  -`). No core paragraph has it.
  - Both are extension contract v5, proposed in `roadmaps/v2/contracts/extension.change-request.md`. Output without MDX is unchanged.
- `ext/mdx/reread.ts`:
  - `interruptAt(state, lines, from, base)` stops at three things:
    - the first container directive opener (`found.directiveAt`);
    - the first GFM table (`found.tableAt`, `found.tableEnd`);
    - the first construct still open at the end of the lines (`found.openAt`).
  - `probeConstruct` no longer reads source lines past the lines. `feedSourceLine` is removed, and `quoteMissing` with it (from `prefixes.ts`).
  - A setext underline line is a table body row.
  - A line that ends a span is no table header (`{\n{\n}\n-|\n}x`, `<a b="\n{"/>x\n<>\n-|\n}x`). Exception: a `-` or `=` with no paragraph text before it, only definitions or nothing. It is text, and can be a header (`[a]:\n{\n-\n-|\n}x`). The prefix rules run on a scratch paragraph to decide this.
  - The `bound` parameter and `found.openFenceSize` are gone.
- `ext/mdx/flow.ts`, `OpenMdxFlow`:
  - `raw`: for each line of the construct, its index, its start after the containers, its visual column and its split-tab columns.
  - `reread`: the re-read that used to be inline in `addLine`. `rereadAll` runs it for each block that takes over, in a loop, so a chain of directives does not recurse.
  - `handOver`: for a directive or a table, the block closes with the nodes before. The lines from the opener then go to `readLineAt` inside the containers around, with each container's `quoteLine` set to the line being read again.
    - A directive takes the lines up to its fence or the current line.
    - Table rows are read with `containerStartsOff` set (flow, where no container starts).
    - No flow construct starts on the header row (`textAt`): its tags and expressions were already found to end in text (`<a b="\n{">x\n-|\n\n}x`).
    - When the header row is the construct's own first line, that line is text and fails first, so only the header cells are queued, as before.
    - The lines after the fence or the table go to a new `OpenMdxFlow` (`base`), which reads them again as flow.
  - `waitFor`: for a construct still open at the end of the lines. The block keeps a scanner for it and reads the next lines through `continue`, as any open construct does: a lazy line or the end of the content throws the reference's error. When the construct ends, `addLine` reads all the lines again once.
  - `goOnAsParagraph`: when the re-read made nodes before the paragraph the block goes on as, the block closes with those nodes and a new block takes the paragraph. The block parser therefore sees those nodes: list item blank lines, definitions at the paragraph's start, and a setext underline or a table that takes the paragraph. This replaces `nodesBefore`, removed from `tags.ts` and `build.ts`.
  - Leaf blocks read again use `raw`, so fenced code keeps the whitespace after the containers.
  - A setext heading made in the re-read starts where its paragraph did, before definitions.
  - The old `fence`/`fenceSize` skip is gone.
- `ext/mdx/build.ts`:
  - The walk adds the children of a nodes marker through a queue per frame, not `splice`. `splice` was quadratic for many failed constructs in one container, already on batch/v2.
  - A list item whose children a marker put in or a drop took out is spread when a blank line lies between two of its final children. The list keeps its own value.
- `ext/mdx/order.ts`:
  - `throwWaiting` sweeps the sorted errors over the nested container contents and picks the same error as before. Comparing each waiting error with each container directive was quadratic on batch/v2 (`:::x\nb\n:::\na {\n\n` repeated: 13x time at 4x size). The fix made it reachable from the re-read.
  - A directive content that runs to the end of the text holds an error at the end of the text. This was wrong on batch/v2 too: `a <\n\n:::y\n>{\n>`.
- `ext/mdx/prefixes.ts`, `prefixEnd`: in a directive's content, a lazy line that ends right after a quote marker and one space is lazy from its start, as in micromark (`>:::z\n>>{\n> `: 3:1, was 3:3). With a tab, nothing after the marker, or more whitespace, the lazy line starts after the prefixes, as before.
- Tests, in `packages/talata/test/mdx-reread.test.ts`:
  - 86 inputs against the reference, with `[mdx]`, `[directive, mdx]` and `[frontmatter, math, directive, mdx]`, gfm on and off.
  - The targeted generator: `MDX_REREAD_COUNT` (default 3000), `MDX_REREAD_SEED`, `MDX_REREAD_LIMIT`, `MDX_REREAD_OUT`.
  - A growth test over 8 units.

## Proof

- base, batch/v2 0940869:
  - `cd packages/talata && NODE_ENV=production npx vitest run test/mdx-reread.test.ts` with the input `[a]:\n{a\n:::x\n}x\n`: 2 of 2 fail (gfm off and on). The reference has a `containerDirective` (3:1-5:1) holding the paragraph `}x`; talata gave the definition only.
  - The second class, `<a b="\n{a">x\n>}x` with `[mdx]`, gfm off and on: talata ends the paragraph at 2:6, the reference at 3:4.
  - Each generator form found differences there: 60 in 20,000 documents in the first form, and 40 in 50,000 once every document held a directive opener.
- Review fixes (coordinator, review of 0594622):
  - The regression, which passes on batch/v2 and failed on 0594622, now passes: `<a b="\n{">x\n-|\n\n}x`, `<a b="\n{">x\n|-\n\n}x`, `<a\n{\n-|\n\n}>x`, `<a\n{\n-|\n# }>x`, `<a b="\n{">x\n-\n-|\n}x`, `><a b="\n>{">x\n>-|\n>\n>}x`.
  - Three batch/v2 bugs are fixed: `- {\n   }x\n  -` and its variants, `>:::z\n>>{\n> `, and `{\n{\n}\n-|\n}x`.
- branch: the same test passes with all 86 inputs. Generator, 1,000,000 documents per seed, final code: seed 20261130, 0 differences.

## Deviations

- Outside the owned paths, all MDX-only and unreleased:
  - `src/ext/mdx/build.ts`: the queue walk, item spread, `nodesBefore` removed.
  - `src/ext/mdx/order.ts`: the `throwWaiting` sweep, and contents that run to the end of the text.
  - `src/ext/mdx/tags.ts`: `nodesBefore` and `nodesBeforeOf` removed.
  - `src/ext/mdx/prefixes.ts`: `quoteMissing` removed (no caller left); the lazy-line point after a quote marker and its space.
  - `src/blocks/paragraph.ts` (core, main entry): `paragraphIndents` falls back to `inlineIndents?.()`. A core paragraph takes its own path, so output without MDX is unchanged (hashes below).
- Beyond the brief, the generator found other re-read gaps, all present on batch/v2. They are fixed because each blocked a clean 1M run:
  - fenced code whitespace (`[a]:\n{\n-|-\n~~~\n  :::x\n}}\n}x\n`);
  - setext start (`[a]:\n{\n|\n-\n}x`);
  - list item spread (`- [a]:\n{\n\n  }}`, `- [a]:\n{\n  # y\n  }>\n  -`);
  - nodes lost or misordered before definitions (`[a]:\n{\n<>\n[b]:}x`, `[a]:\n{\n<b/>\n[b]:}<\n:`);
  - GFM tables after definitions dropped (`[a]:\n{\nb\n-|-\n-|-\n}x`), and `=` as a table row;
  - the error-order edge above.
- The generator is new; the ext-mdx worker did not leave one in its outcome. Each document has:
  - opener lines: none, a definition, a paragraph, a heading or a footnote;
  - then one of two shapes:
    - 65%: a construct start (`{`, `<a b={` ...), 1 to 4 middle lines with one container directive opener among them, a closer (`}x`, `}/>x`, `}x<` ...);
    - 35%: `<a b="`, 0 to 3 middle lines, and a line that ends the value and starts a construct when read again (`{a">x`, `<c d=">x` ...);
  - then 0 to 3 trailing lines (`}`, `>}x`, `- }x`, `">` ...).
  - In both shapes, closers with extra whitespace (` }x`, `\t}x`) and trailing table delimiter rows and underlines (`-|`, `|-`, `-`, `=`) put a table delimiter after a line read again, and an underline after an expression in a list item.

  The document goes at the root, in a quote, in a list, in an ordered list, in a quote and a list, or in a container directive, with 8% of the lines leaving the container. gfm is chosen at random.

- Merge with ext-mdx-acorn: the re-read code of `flow.ts` is restructured:
  - `addLine` now calls `rereadAll`;
  - the body of the old re-read is `reread`;
  - `probeConstruct` lost its `state` and `bound` parameters.

  The acorn branch's `esmInFailedLines` call and `addLine` condition need to move into `reread`, and will conflict textually.

- No changeset: `talata/mdx` is unreleased, and output without `mdx()` does not change.

## Stubs left

- None.

## Gotchas

- `readLineAt` must be called after the tip that calls it has closed, for lines up to the current one, in order. The outer `processLine` for the current line returns as soon as `addLine` returns.
- Lines read again do not pass through the containers around. `handOver` sets their `quoteLine` by hand; a new per-line field on containers needs the same.
- `raw` covers the construct's own lines only: the last `raw.length / 2` entries of `lines`. The interrupted paragraph's lines come before them.
- A failed construct now closes and opens blocks from `addLine` (`handOver`, `goOnAsParagraph`): the block that goes on is a new `OpenMdxFlow`, not `this`.
- While `waiting`, the block is the open construct of the parse (`pending`). It reads lines with the live scanner, not the probe; the lines are then read again with the probe, once.
- Growth tests that use units without errors do not cover `throwWaiting`. Keep an error-heavy unit in them.
- `handOver` sets `quoteLine` of the containers around by hand for each line it reads again, and puts it back after. Any other per-line state that containers keep is not updated for those lines.
- `endsSpan` in `reread.ts` runs the paragraph prefix rules on a scratch paragraph. Their only side effect, adding labels to `state.definitions`, happens again on the same lines when the nodes are made.

## Known, handled elsewhere

- Deep chains of unclosed container directives take cubic time (`':::x\n'.repeat(n) + 'a\n' + ':::\n'.repeat(n)`). It is a directive bug on batch/v2, not in the MDX re-read, and is handled by node `fix-directive-nested-growth` after this one lands.

## Proposed learnings

- Rerun growth tests with error-heavy units when a fix makes a new structure reachable | `throwWaiting` was quadratic on batch/v2, hidden while the re-read dropped directives | packages/talata/src/ext/mdx | yes (growth test)
- Emit nodes as blocks the block parser sees, not as insertions a later transform makes | list item spread and definition order were wrong while `nodesBefore` hid nodes from the core and from the directive transform | packages/talata/src/ext | no
- A construct that reads past what the block parser gave it should take those lines through the block parser, not read the source | the probe's own prefix check missed lists and lazy lines | packages/talata/src/ext/mdx | yes (fuzz)

## Verification

- Fast check:
  - `pnpm --filter talata test`, run alone: 35 files and 5212 tests pass, 1 file skipped (the corpus). With the benchmark corpus linked in (`benchmark/corpus`, git-ignored): 36 files, 6765 tests.
  - `npx tsc --noEmit -p .` and `npx oxfmt --check`: clean.
  - `npx oxlint`: only the known `smoke.mjs` errors and the two `max-depth` warnings.
  - Under load (load average 12 to 18), the growth tests in `mdx.test.ts` and `mdx-reread.test.ts` and two corpus tests can time out or fail their ratio. Alone they pass.
- Generator, 1,000,000 documents per seed: seed 20261130 on the final code, 0 differences. Before the review fixes, seeds 20261128 and 20261129 gave 0 differences each. Earlier seeds (20261122 to 20261125) found the classes listed above; each is fixed and in the inputs.
- Fuzz, `pnpm fuzz --count 1000000 --all --no-save`: seed 20261212 on the final code, 1,000,000 compared, 0 skipped, 0 failures (495.0 s). Before the review fixes, seed 20261211 gave 1,000,000 compared, 0 failures.
- Output without MDX: SHA-256 of the `fromMarkdown` trees over the 142 corpus files and 100,000 fuzz documents (`generateDocument`/`generatePathological`, seed 4242), gfm on and off, no extensions and `[frontmatter, math, directive]`. batch/v2 and the branch are equal: corpus `693e17a2...f26616`, all `e95cd511...a8d441`.
- Growth: best of 7 runs, 8000 then 32,000 repeats, machine under load. Time ratio at 4x size (quadratic would be 16):

  | Unit (`[directive, mdx]` unless noted)              | batch/v2 | branch |
  | --------------------------------------------------- | -------- | ------ |
  | `p\n{\n}x\n`                                        | 3.9      | 3.9    |
  | `{\n}x\n`                                           | 4.7      | 4.9    |
  | `[a]:\n{a\n:::x\nb\n:::\n}x\n`                      | 3.6      | 2.9    |
  | `{a\n:::x\n:::\n:::y\n:::\n}x\n`                    | 4.2      | 4.9    |
  | `:::x\nb\n:::\na {\n\n`                             | 13.2     | 5.2    |
  | `[a]:\n{a\n:::x\nb\n:::\n}x\n\n`                    | 15.6     | 4.1    |
  | `[a]:\n{\n-\|-\n-\|-\n}x\n\n`                       | 3.9      | 4.5    |
  | `[a]:\n{\n<b/>\n[b]:}<\n:\n\n`                      | 8.1      | 4.1    |
  | `<a b="\n{a">x\n>}x\n\n` (`[mdx]`)                  |          | 4.5    |
  | one construct past 20,000 to 80,000 lines (`[mdx]`) |          | 3.6    |

## Size

- Estimated M, actual L. The generator and the review found ten older classes and two quadratic paths, fixed here so the 1M runs are clean. The second class came in as a scope addition.
