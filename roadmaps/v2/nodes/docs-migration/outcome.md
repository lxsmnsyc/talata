# Outcome: docs-migration

## Built

- `docs/migration.md`: migration guide. Starting points: `mdast-util-from-markdown` alone and with GFM, frontmatter and math, `unified` with `remark-parse` (HTML output, frontmatter and math, `remark-stringify`). Then "What does not carry over", "Known differences" and "Check your output".
- `packages/talata/test/migration-examples.test.ts`: reads the guide, runs every `js before` / `js after` pair against the source and compares results. Runs the `js check` block. Also checks the claims about ignored options.
- `packages/talata/README.md`: one link line below the intro.

## Deviations

- Added devDependencies `remark-frontmatter` ^5.0.0, `remark-math` ^6.0.0 and `remark-stringify` ^11.0.0 to `packages/talata/package.json` and `pnpm-lock.yaml`. The examples run the real remark plugins.

## Stubs left

- Directive placeholder in `docs/migration.md`, section "What does not carry over". It is an HTML comment starting `<!-- directive:` and the paragraph after it. The last bullet of the list ("Directive.") also refers to it.
- release-0.3 replaces the paragraph with a before/after pair from `remark-directive` to `directive()`. It removes the bullet. It writes the pair as `js before` and `js after` blocks, so the test runs it.

## Gotchas

- Code fences in the guide use `js before`, `js after` and `js check`. Plain `js` blocks are not run. A block pair must define `tree`, `html` or `markdown` and use the string `value`.
- The test needs the built guide path `docs/migration.md` relative to `packages/talata/test`.

## Proposed learnings

- Docs examples live in fenced blocks that a test runs | keeps the guide true when options change | docs/ | yes

## Verification

- `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check`: see the final report of the worker.
- `check_prose.py docs/migration.md`: ok.

## Size

- Estimated M, actual M.
