# Outcome: core-hooks

## Built

All seven hooks, in `packages/talata/src/`. Final names and where they live:

1. `core/blocks.ts`, on `BlockState`: `depthOf(block): number` (index among the open blocks, 0 is the document, -1 if not open) and `closeOpenBlocks(depth, { keepsLineEnding })`. It closes the open blocks above `depth`, innermost first, with `closeKeepsLineEnding` set to `keepsLineEnding` while they close, then restores the old value. Call it from a container's `continue` with `state.depthOf(this)` or less. After it, the loop in `processLine` carries on with the shorter stack.
2. `OpenBlock.startsContainer?: false`. `attach` sets `closeKeepsLineEnding = block.isContainer && block.startsContainer !== false`. Keep `isContainer: true`; the property is a plain field, no getter trick.
3. `continuesOverEnd` has no early return any more: it runs for any tip (leaf, paragraph or container) after a final line ending. It loops over the open blocks above the tip, not the tip. `state.closeKeepsLineEnding` is the answer while the document closes, so a container's or a paragraph's `close` can read it.
4. Per-leaf state on `InlineState` (option a, see Result): `brackets` (link bracket stack, type `Brackets` exported from `inline/link.ts`), `reached` (furthest range looked into, -1 at start), `attentionFirst` (`boolean | undefined`, strikethrough order), `task` (`TaskMark`, exported from `gfm/task-list.ts`). A rule may call `parseInline(state, ranges)` from `parse`. `reach`/`wasReached` in `inline/lines.ts` now read and write `state.reached`.
5. In `processLine`: when a lazy paragraph sits under a container with `acceptsLazy: false` that did not match, `state.paragraph` is undefined and `state.lazy` is false for that line. Rules that need no open paragraph start on it.
6. `BlockState.containerStartsOff: boolean` (writable) and `BlockRule.opensContainer?: boolean`. `tryStart` skips rules with `opensContainer` while the flag is on. Set on `blockquote`, `listItem`, `footnoteDefinition`. A container rule without `opensContainer` (directive) keeps starting. A rule may set the flag back to false.
7. Shared helpers, imported by math instead of copies: `strip(value, virtual, virtualEnd)` from `inline/code-span.ts`; `isClosingFence(line, marker, size)` and `trimLineEndings(raw)` from `blocks/code-fenced.ts`; new `inline/exhausted.ts` with `createExhausted()`, `failedStart(cache, state, size)` and `markFailed(cache, size, start, known)`. Code span and math text each own one cache.

Extensions moved onto the hooks:

- `src/ext/frontmatter/matter.ts`: the rule name list, `dropContainers` and the registry caches are gone. After an unclosed fence the rule sets `state.containerStartsOff = true`.
- `src/ext/math/flow.ts` and `text.ts`: no copies of `strip`, the closing-fence test, `trimLineEndings` or the exhausted cache.
- `grep "as unknown as" src/ext` still finds three casts. They build mdast nodes missing from `@types/mdast` (`yaml`, `math`, `inlineMath`); none touches parser state.

Tests: `test/core-hooks.test.ts` (23 tests): a test-only `:::` container (hooks 1, 2, 3), a `|` container with `acceptsLazy: false` (5), a rule that sets the flag (6), a `:name[label]` inline rule that calls `parseInline` on its label (4, expected trees from micromark-extension-directive 4.0.0 with GFM), and unit tests for the shared helpers (7). The nested-parse tests and the hook 3 and hook 5 tests fail without the changes.

Contract: `roadmaps/v2/contracts/extension.change-request.md` holds the version 2 interface; `extension.md` is not edited.

## Result

Not an experiment node. Hook 4 choice, measured (interleaved A/B against main, 150 rounds, GFM on, median; machine load 4 to 5 from other sessions, so about 1% noise): (a) state on `InlineState` -1.6% readmes, -0.9% node fs.md, -0.5% CHANGELOG, +1.0% vite-config. (b) save and restore around nested calls: +0.2, -0.4, +1.3, +0.8. Both inside the noise. Picked (a): same speed, no nesting counter, no per-module save code.

## Deviations

- Hook 7 helpers live in `inline/` and `blocks/`, not in `core/`: that is where the originals were. The new file is `inline/exhausted.ts`.
- Hook 4 moves only the state that changes output (brackets, reach, strikethrough order, task marker). The memos in `autolink-literal.ts`, `html.ts`, `code-span.ts` stay in module variables: they are caches keyed by the `InlineState` object, so a nested call costs a rescan and cannot give a wrong answer.
- Hook 1 takes `{ keepsLineEnding }` as an object as the brief says; it allocates one small object per call, which is rare.
- `src/ext/api.ts` is unchanged: the hooks are on the core types that extensions already import.
- No changeset: the extension interface is internal in 0.2 and tree output is unchanged.

## Stubs left

- None.

## Gotchas

- Hook 1: `closeOpenBlocks` pops blocks that were already matched on this line. The block calling it must still return true from `continue` (or false) as before; blocks above it are gone, so `state.container` may point to a closed block if you read it after.
- Hook 6 is for CommonMark containers only. Directive content is a document of its own for the reference, so its container start rules (quote, list, footnote) should start inside it. ext-directive sets `state.containerStartsOff = false` while inside a directive and restores the old value when it closes, instead of the `insideRules` copies.
- A leaf that is open takes the line before any start rule runs, so `startsContainer: false` only shows when a new container closes blocks of containers that did not match (`> ```\n> a\n:::`).
- A container with `acceptsLazy: false` now shows rules no paragraph on a line it does not match, so indented code and HTML kind 7 start there. That is what the directive needs; do not set `acceptsLazy: false` on a container that should keep lazy paragraph lines.
- `frontmatter.test.ts` "stay linear with anywhere" is a timing ratio and fails now and then under load (3.4 against 3); not related to this change.
- Main entry gzip 32861 -> 33022 bytes (+161); limit 33112 (32.6 KB + 0.5 KB). The next node has 90 bytes left before the size limit; the new tests and rules count against it.
- `pnpm --filter benchmark size` builds first; use `exec node size/size.mjs --no-build` to measure another build.

## Proposed learnings

- Per-leaf state that changes output lives on `InlineState`; module variables are only caches keyed by the state object | a rule may call `parseInline` from `parse` | packages/talata/src/inline, packages/talata/src/gfm | no
- A rule that ends blocks inside itself calls `closeOpenBlocks` and never reads `stack` or `closeTo` | those are private | packages/talata/src/ext | yes, a grep for `as unknown as { stack` in `src/ext`

## Verification

- Fast check: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check`: pass (5964 tests with the corpus; `frontmatter.test.ts` timing test failed under load in 3 runs, passed on rerun).
- `pnpm fuzz --count 1000000 --seed 20261102 --no-save` (GFM, frontmatter, math): 1000000 documents, 1000000 compared, 0 skipped, 0 failures, 1320 s.
- `pnpm --filter benchmark interleaved` (load 4.4): talata 19.75x (readmes), 19.21x (fs.md), 23.98x (CHANGELOG) faster than "mdast + gfm". Against main, no corpus group more than 1.0% slower (A/B above).
- `pnpm --filter benchmark size`: main entry 33022 bytes gzip (main 32861, limit 33112).
- The machine load stayed above 1 (other sessions), so the 3% check rests on the A/B medians and the minimums, which agree within 1.6%.

## Size

- Estimated M, actual M. Hook 4 needed an analysis of which state is a cache and which is semantic, and a second implementation to measure.
