# Outcome: mdx-layers-contract

## Built

- `roadmaps/v2/contracts/block-layers.md`, version 1, `status: draft`. It covers:
  - the interfaces: `Line.last`, `Spans` (`core/spans.ts`), `ChunkQueue`, `documentPass` and `textPass` (`core/chunks.ts`), and `parseDocument`;
  - on `BlockState`: `depth`, `end`, `queue`, `mark`, `commit`, `rewind` and `document`;
  - `OpenBlock.onLazyLine`;
  - the behavior of the document layer, the flow layer and rewind, the container directive collector and the chunk queue;
  - the order rule with nine checked examples, a table of where each block and extension fits, extension contract v6, a performance budget, the migration plan, and the spike points the code contradicts.
- `packages/talata/test/layers-contract.test.ts`:
  - a stub `ChunkQueue` written from the contract, with a suite `describeQueue` that the real queue must pass;
  - the pass formulas;
  - 13 order-rule examples: the rule picks the reference's error, and talata equals the reference with gfm off and on;
  - 17 collector node ends and 7 definition-order inputs against the reference;
  - 5 pending cases.
- Result: 90 pass, 9 skipped (each names the node that turns it on, and each fails on this branch), 2 todo (run `describeQueue` on the real queue; DoS growth).

## Deviations

- The brief asks for v6 to remove `readLineAt` and `inlineIndents`. The contract also lists the v2 and v3 hooks that no extension uses after the ports (`willClose`, `startsContainer`, `endContent`, `endsContent`, `getBlock`, `getDepth`, `closeOpenBlocks`). It proposes a fourth node, mdx-layers-cleanup (S), to remove them, because no implementation node owns `src/core/blocks.ts` after mdx-layers-core.
- Owned paths, proposed (I did not edit the briefs):
  - mdx-layers-core: confirmed. Add `test/layers-contract.test.ts` as shared.
  - mdx-layers-directive: add `src/ext/frontmatter/**`, `test/frontmatter*.test.ts`, `src/ext/mdx/order.ts`, `src/ext/mdx/inline.ts`, and `test/layers-contract.test.ts` as shared. Without the two mdx files, `[directive, mdx]` breaks between this node and mdx-layers-flow. Acceptance: tree hashes equal main except for inputs where main differs from the reference, listed in the outcome.
  - mdx-layers-flow: confirmed, plus `test/layers-contract.test.ts` as shared. The core hook removal goes to mdx-layers-cleanup, or its paths are added here.
- Review by a fresh agent: 15 findings. Applied:
  - replay `containerIndex` and `attach` without container closing;
  - what is recorded per line (`matched`, the adjusted `unmatched`, `last`), and what is recomputed;
  - `endsContent` kept until cleanup, and `isLastLine` reads it with `last`;
  - the exact mdx edit in the directive node; `chunks.ts` dropped from its paths;
  - empty-range chunks get start -1, a stable sort, and `children` still assigned;
  - lazy line right after the opener, and the fence checked before `indent`;
  - label depth, held tables and `endsInText`;
  - the record algorithm;
  - `containerStartsOff` not restored;
  - when spans share data.

  Not applied: the `build.ts` detail for `reparse`, which is mdx-layers-flow's design inside its own paths.

## Stubs left

- The stub queue in the contract test. mdx-layers-core adds `describeQueue('core', ...)` on `createChunkQueue`.

## Gotchas

- Two timing tests can fail under load in the full run (`directive-growth` "quote, unclosed", `mdx-acorn` "stays linear"). Both pass alone, as earlier outcomes noted.
- Positions of the collector come from its raw lines, not from its children. A nested document's last empty line sits at the source line start, before outer prefixes.
- v5 `scopes.ts` queues hooks through `state.inline` with empty ranges. While it exists, the queue must keep them in place.

## Proposed learnings

- Check every design claim about micromark positions against the reference with a probe before writing it into a contract | three spike claims were incomplete (end line place, node end, held leaf) | roadmaps/v2/contracts | yes (contract tests)

## Open questions for the user

1. Merge order between mdx-layers-directive and mdx-layers-flow. Option C (recommended): the directive node also makes MDX errors throw at once (`order.ts`, `inline.ts`), so every node stays green. Option B: stack the two branches and merge them together.
2. A fourth node, mdx-layers-cleanup (S), for removing the v2, v3 and v5 hooks from core. The alternative is adding the core paths to mdx-layers-flow.
3. mdx-layers-directive acceptance: allow tree hashes to differ from main where main is wrong against the reference (known: frontmatter `anywhere` inside a container directive). The released `talata/directive` 0.3 output then changes for those inputs. Does that need a changeset (patch)?
4. Performance gate: is "interleaved within 2% of main, best of 5, alternating" the noise bound you want?

## Verification

- `cd packages/talata && NODE_ENV=production npx vitest run test/layers-contract.test.ts`: 90 passed, 9 skipped, 2 todo. A copy with the skips turned on: those 9 fail, the rest pass.
- Fast check:
  - `NODE_ENV=production pnpm --filter talata test`: 5333 passed, 2 timing failures under load. Those two files alone: 26 of 26 pass.
  - `npx tsc --noEmit -p .`: no errors.
  - `npx oxlint`: errors only in `.github/scripts/smoke.mjs`.
  - `npx oxfmt --check`: clean.
- Plain-writing checker on the contract: no warnings other than long sentences in lists of names.

## Size

- Estimated M, actual M.
