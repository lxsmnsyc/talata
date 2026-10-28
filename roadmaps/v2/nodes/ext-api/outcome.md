# Outcome: ext-api

## Built

- `packages/talata/src/ext/api.ts`: `Extension` type and `cachedExtension`.
- `Options.extensions` in `src/index.ts` (also used by `talata/unified`); registry cache keyed by (`gfm`, extension objects by identity), last 8 kept.
- Stub factories `frontmatter(options?)`, `math(options?)`, `directive()` in `src/frontmatter.ts`, `src/math.ts`, `src/directive.ts` with the reference option types; entries in `tsdown.config.ts` and `exports` in `package.json`.
- Test plumbing: `parseReference` and `parseTalata` take extension names; `test/fuzz/ext.ts` and `test/fuzz/ext-{frontmatter,math,directive}.ts` hooks (`ready: false`); `Features.extensions`.
- Six reference packages added as dev dependencies. `benchmark/size` prints exact main entry bytes and each subpath entry.
- `roadmaps/v2/contracts/extension.md`, version 1, frozen.
- Tests: `test/ext-api.test.ts`, `test/ext-api-bundle.test.ts` (fails if extension code is in the main or unified build).

## Result

Not an experiment node.

## Deviations

- Added `test/ext-api-dom.d.ts` (not in the owned list): katex types need a global `HTMLElement`.
- Edited `benchmark/size/size.mjs` (shared) and `test/fuzz/*` hot files as the brief asks.

## Stubs left

- The three factories return extensions with no rules. ext-frontmatter, ext-math and ext-directive replace them and set `ready` in their fuzz hooks.

## Gotchas

- Main entry gzip 32600 -> 32749 bytes (+149, limit +200). The extension nodes must not add to it.
- At equal priority talata runs the earlier extension first; micromark runs the later one first. Use distinct priorities.
- Container directive: implement `TrackedContainer`; its end must be the closing fence line.
- `pnpm install` is needed in a fresh worktree.

## Proposed learnings

- Extension factories return cached objects via `cachedExtension` | the registry cache compares by identity | packages/talata/src | yes

## Verification

- `pnpm --filter talata test`: 22 files passed, 4576 tests.
- `npx tsc --noEmit -p .`, `npx oxlint`, `npx oxfmt --check`: clean.
- `pnpm --filter benchmark size`: see Gotchas.

## Size

- Estimated M, actual M.
