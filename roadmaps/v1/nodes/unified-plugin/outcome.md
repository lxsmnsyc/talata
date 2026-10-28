# Outcome: unified-plugin

## Built

- `packages/talata/src/unified.ts`: default export `talata`, a unified plugin. It sets `this.parser` to `fromMarkdown(String(document), options)`. Options are `{ gfm?: boolean }` (type `Options` re-exported). Use: `unified().use(talata, { gfm: true }).use(remarkRehype)...` in place of `remark-parse` plus `remark-gfm`. The doc comment says micromark and mdast extensions do not apply.
- `packages/talata/tsdown.config.ts`: second entry `src/unified.ts`. The build writes `dist/unified.{js,cjs,d.ts,d.cts}`.
- `packages/talata/package.json`: `exports["./unified"]` (import, require, default), optional peer dependency `unified ^11`, dev dependencies `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-stringify`. `pnpm-lock.yaml` updated.
- `packages/talata/test/unified.test.ts`: for 11 inputs and both `gfm` settings, HTML from `unified().use(talata, {gfm})...remarkRehype...rehypeStringify` equals the HTML from the `remark-parse` (plus `remark-gfm`) pipeline. It also compares the mdast trees (positions included), checks a file-like value goes through `String()`, and checks the no-options call.

## Deviations

- `package.json` is a shared path in the brief; the edits are only the export, the peer dependency and dev dependencies.
- The sandbox refused `git branch -m`, so the branch was made with `git switch -c feat/unified-plugin`. The old branch name `worktree-agent-a1bb62ea07e2dff40` still points at the same base commit and can be deleted.

## Stubs left

- The test input list covers paragraphs, ATX headings and thematic breaks only. Later nodes (spec-green) should grow it as parser support grows.

## Gotchas

- `unified` is only a type import in `src/unified.ts`; the built file has no runtime import of it.
- `unified().use(talata)` with no options means `gfm: false`, unlike `remark-parse`, which has no GFM either; GFM needs `{ gfm: true }`.
- `dist/` is not committed.

## Proposed learnings

- None.

## Verification

- `pnpm --filter talata test`: 151 passed, 1988 skipped.
- `npx tsc --noEmit -p packages/talata`: no errors.
- `npx oxlint`: no findings.
- `npx tsdown` in `packages/talata`: builds both entries.

## Size

- Estimated S, actual S.
