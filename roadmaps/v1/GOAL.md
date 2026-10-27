---
milestones: [m1-commonmark, m2-gfm, m3-release, m4-extensions]
merge:
  mode: maintainer
branches:
---

# Talata 0.1: remark-compatible mdast, several times faster

## Outcome

`talata` 0.1 is published on npm. `fromMarkdown(value, { gfm })` returns the same mdast tree as `mdast-util-from-markdown` (with `mdast-util-gfm` when `gfm` is set), positions included, for CommonMark and GitHub Flavored Markdown. A unified plugin lets remark use it in place of `remark-parse`. On the benchmark corpus it parses at least 4 times faster than `mdast-util-from-markdown` with GFM, and its bundle is smaller than that stack.

## Acceptance

- `pnpm --filter talata test` passes with every readiness flag on: every CommonMark spec example, every GFM spec example, and every file of the benchmark corpus give a tree equal to the reference parser's.
- The differential fuzzer runs 1,000,000 generated documents with no difference from the reference parser.
- `pnpm --filter benchmark interleaved` shows talata at least 4 times faster than "mdast + gfm" on the README corpus and on `node fs.md`.

## Priorities

- must: needed for the 0.1 release (milestones m1 to m3).
- should: makes 0.1 more trustworthy or smaller, but 0.1 can ship without it.
- could: extensions beyond CommonMark and GFM.
- later: parked.

## Constraints

- The reference is `mdast-util-from-markdown` 2.x with `micromark-extension-gfm` 3.x and `mdast-util-gfm` 3.x. Where it differs from the CommonMark spec, match the reference, and list the case in `packages/talata/README.md`.
- No runtime dependencies other than `@types/mdast`.
- ES2020 output, runs in Node 20+ and browsers.
- micromark extensions cannot plug into talata. Extensions are talata's own.

## Non-goals

- HTML output. Use `mdast-util-to-hast`.
- Serializing mdast back to Markdown.
- Streaming or incremental parsing in 0.1.

## Verification

- Fast check (safe to run in parallel worktrees): `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint` (under 30 s, no shared resources)
- Full check: the fast check, then `pnpm --filter benchmark corpus && pnpm --filter benchmark interleaved` (exclusive: benchmarks need a quiet machine).

## Numbered resources

- None.

## Hot files

- `src/blocks/index.ts` and `src/inline/index.ts` list the registered block and inline rules. Each feature node adds one registration line there, and its rule lives in its own file.
- spec-green, gfm-green and perf-pass may change any file under `src/`. They run one after another through hard dependencies, so their overlap with each other cannot conflict. Feature nodes in the same wave merge in the order `plan.py status` prints. In wave 2, blocks-container merges before blocks-leaf.

## Sources

- Benchmark and profile from 2026-10-27: `benchmark/BASELINE.md`.

## Coverage

- "mdast equivalence test over the corpus" -> harness
- "build the block parser" -> core-skeleton, blocks-leaf, blocks-container
- inline parsing -> inline-core
- GFM: tables, strikethrough, autolinks, task lists, footnotes -> gfm-tables, gfm-inline, gfm-tasks-footnotes
- speed target -> perf-pass
- remark compatibility -> unified-plugin
- micromark extensions (MDX, directives, math) are not portable -> ext-frontmatter, ext-math, ext-directive, ext-mdx

## Decisions

- The GitHub repository is not created yet. Branches stay local until the user publishes the repo.
- 2026-10-28: the user confirmed the plan: the 4x speed target, CommonMark plus GFM plus the unified plugin for 0.1, and maintainer merges. Execution has not started; wave 1 (core-skeleton, harness) starts when the user asks.

## Gates

- core-skeleton: the user reviews the parser-core contract before the parallel block and inline work starts.
- spec-green: the user reviews the remaining differences before GFM work starts.
- release: the user publishes to npm.
