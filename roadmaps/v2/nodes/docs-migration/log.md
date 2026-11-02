# Log: docs-migration

- Branch `docs/docs-migration` reset to `origin/main`. `docs/` did not exist.
- Facts taken from `src/index.ts`, `src/unified.ts`, `src/frontmatter.ts`, `src/math.ts`, the reference `.d.ts` files and a probe run.
- Probe: `unified().use(talata).use(remarkGfm)` without `gfm: true` gives no table. `fromMarkdown(v, 'utf8', { gfm: true })` ignores the string and the options after it, with no error.
- The test reads `docs/migration.md`, runs each `js before` and `js after` pair and compares results. A `js check` block must run without throwing.
- Added devDependencies `remark-frontmatter`, `remark-math`, `remark-stringify` (needed by the guide's unified examples).
- Directive placeholder: HTML comment plus one paragraph in the section "What does not carry over" of `docs/migration.md`.
