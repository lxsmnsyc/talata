---
milestones: [m1-extension-api, m2-extensions, m3-release, m4-mdx]
merge:
  mode: auto
  method: merge
  max_size: L
  exclude: [release]
branches:
release:
  publish: changesets
  paths: [packages/**]
  fence: merge
---

# Talata 0.2: frontmatter and math as subpaths

## Outcome

`talata` 0.2 is published on npm with two extensions in the same package, each behind its own subpath: `talata/frontmatter` and `talata/math`. `fromMarkdown(value, { gfm, extensions: [frontmatter(), math()] })` returns the same mdast tree, positions included, as `mdast-util-from-markdown` with the matching micromark and mdast extensions. The unified plugin takes the same `extensions` option. The main entry does not grow.

## Acceptance

- `pnpm --filter talata test` passes, including, for each extension, the reference package's own test inputs and the benchmark corpus with the extension on.
- The differential fuzzer runs 1,000,000 documents with GFM, frontmatter and math on, with no difference from the reference.
- `pnpm --filter benchmark size`: the `talata` entry holds no extension code and is within 0.5 KB gzip of 0.1.1 (32.6 KB). Shared helpers that extensions import cost a few bytes each in the main entry, through chunk splitting.
- `pnpm --filter benchmark interleaved`: talata stays at least 4 times faster than "mdast + gfm".

## Priorities

- must: needed for the 0.2 release.
- should: makes 0.2 more trustworthy, but 0.2 can ship without it.
- later: parked (MDX).

## Constraints

- References, the versions current on 2026-10-28:
  - frontmatter: `micromark-extension-frontmatter` 2.0.0 and `mdast-util-frontmatter` 2.0.1;
  - math: `micromark-extension-math` 3.1.0 and `mdast-util-math` 3.0.0;
  - directive: `micromark-extension-directive` 4.0.0 and `mdast-util-directive` 3.1.1.
- Extension factories take the same options as the reference's micromark extension, for example `frontmatter(['yaml', 'toml'])` and `math({ singleDollarTextMath })`.
- One package, one build, plain `import`/`require` exports per subpath, as in 0.1.1. No runtime dependencies other than `@types/mdast`.
- ES2020 output, runs in Node 20+ and browsers.
- micromark extensions still cannot plug into talata. The extension interface stays internal in 0.2: subpaths of this package use it, and it is not documented for third parties yet (`roadmaps/v1/GOAL.md`, Decisions).

## Non-goals

- HTML output (`roadmaps/v1/debate-html/debate.md`).
- A documented third-party extension API. It comes after these three extensions work without core changes.
- MDX in 0.2. It is the outline node ext-mdx.

## Verification

- Fast check (safe to run in parallel worktrees): `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check` (under 30 s, no shared resources)
- Full check: the fast check, then `pnpm --filter benchmark corpus && pnpm --filter benchmark interleaved && pnpm --filter benchmark size` (exclusive: benchmarks need a quiet machine).

## Numbered resources

- None.

## Hot files

- `packages/talata/package.json` exports, `packages/talata/tsdown.config.ts` entries, `test/fuzz/features.ts` and `test/fuzz/generate.ts`. ext-api adds every subpath entry, export and fuzz hook up front, pointing at stub modules, so each extension node then edits only its own `src/ext/<name>/`, `src/<name>.ts`, `test/<name>*.test.ts` and `test/fuzz/ext-<name>.ts`.

## Sources

- v1 roadmap and its decisions: `roadmaps/v1/GOAL.md`.

## Coverage

- "add frontmatter, math and directives as subpaths of talata" (user, 2026-10-28) -> ext-api, ext-frontmatter, ext-math, ext-directive
- "this includes mdx in the future" (user) -> ext-mdx (outline, later)
- v1 outline nodes ext-frontmatter, ext-math, ext-directive, ext-mdx -> moved here

## Decisions

- 2026-10-28: the user chose subpaths of the `talata` package for extensions, so they do not need separate npm packages. This includes MDX later.
- 2026-10-28: the user switched to auto-merge. The orchestrator merges every node pull request that passes review and CI, contract nodes included. Only the release, which publishes to npm, stays with the user.
- 2026-10-28: the main-entry size limit is 0.5 KB over 0.1.1, not 0.2 KB. ext-api's cache took 177 bytes, and each extension adds a few dozen through shared chunks (math: 49 bytes). The test that the main entry holds no extension code stays.
- 2026-10-28: directive is parked, and 0.2 ships frontmatter and math (the user's choice). The first directive build needed private parser state and had two fuzz failures. It returns after a core-hooks node, on the branch `feat/ext-directive`. The `talata/directive` stub is removed from 0.2.

## Gates

- release-0.2: the user merges the Version Packages pull request, which publishes to npm.
