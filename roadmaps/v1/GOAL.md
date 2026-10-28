---
milestones: [m1-commonmark, m2-gfm, m3-release, m4-extensions]
merge:
  mode: auto
  method: merge
  max_size: L
  exclude: [release, hotfix, contract, gate]
branches:
release:
  publish: changesets
  paths: [packages/**]
  fence: merge
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
- CI workflows for tests (no fuzz) and releases, added 2026-10-28 by the user -> ci
- micromark extensions (MDX, directives, math) are not portable -> ext-frontmatter, ext-math, ext-directive, ext-mdx

## Decisions

- The GitHub repository is not created yet. Branches stay local until the user publishes the repo.
- 2026-10-28: the user chose a public repository, `lxsmnsyc/talata`, created and pushed when perf-pass merges. From then on, node branches are pushed and go through GitHub pull requests.
- 2026-10-28: the user confirmed the plan: the 4x speed target, CommonMark plus GFM plus the unified plugin for 0.1, and maintainer merges. Execution has not started; wave 1 (core-skeleton, harness) starts when the user asks.
- 2026-10-28: Talata stays in TypeScript. A Go version was considered and rejected: compiling Go to WebAssembly, a native addon or a separate process all add a boundary that costs about what the rewrite saves, and none fit the bundle-size goal. A native batch CLI may become a separate roadmap after 0.1, measured against Talata.
- 2026-10-28: the user switched merges to auto. With no remote, the orchestrator merges locally (`git merge --no-ff`) when `plan.py can-merge` allows it, after a clean fresh-context review and a passing fast check on the branch merged onto current main. Gated, contract, release and hotfix nodes still go to the user.

- 2026-10-28: tests run with `NODE_ENV=production` (the `test` script in `packages/talata/package.json`), so vitest resolves the reference's published build. Its development build throws an assertion on valid input such as `-\n[ ] a`. Running `npx vitest run` directly still picks the development build; use `pnpm --filter talata test`.
- 2026-10-28: gfm-green merged with the 1,000,000-document fuzz run pending for a quiet machine after a restart: `pnpm --filter talata fuzz --count 1000000 --seed 20261028 --max-failures 10` (12 to 20 minutes).
- 2026-10-28: the 1,000,000-document fuzz run passed: seed 20261028, GFM and corpus mutation on, 1,000,000 compared, 0 skipped, 0 failures, 546 s. The fuzz acceptance item is met.
- 2026-10-28: `pnpm --filter benchmark interleaved` before perf-pass, on a fresh build, load average about 2: talata is 16.4x faster than "mdast + gfm" on the README corpus (33.5 ms against 550.1 ms), 18.7x on `node fs.md` (10.0 ms against 186.7 ms) and 21.1x on CHANGELOG_V22 (24.8 ms against 522.8 ms). The speed target is met on one run; perf-pass needs a second run and still owns the quadratic and garbage collection fixes in its brief.
- 2026-10-28: extensions after 0.1, chosen by the user: first-party frontmatter, math and directives first. When those work without core changes, publish an experimental public rule API (`talata/extension`) with a test kit that compares an extension's output with its `mdast-util-*` counterpart. MDX stays a separate, later project. micromark extensions stay unsupported.
- 2026-10-28: the benchmark and README compare talata only with the remark/mdast stack and HTML renderers, not md4x (the user's call). md4x measured about 2x faster than talata at its own AST, which is not mdast and has no positions.
- 2026-10-28: HTML output stays a non-goal for 0.1 (`debate-html/debate.md`, decided by the orchestrator at the user's request). talata replaces mdast-util-from-markdown. The README shows the to-hast path for HTML: 6.5x to 7.5x faster than micromark's HTML, not byte-identical. A byte-identical `talata/html` is the parked outline node html-output.

## Gates

- core-skeleton: the user reviews the parser-core contract before the parallel block and inline work starts.
- spec-green: the user reviews the remaining differences before GFM work starts.
- release: the user publishes to npm.
