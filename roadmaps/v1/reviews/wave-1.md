# Wave 1 report (2026-10-28)

Nodes: harness (M, sonnet) and core-skeleton (L, opus). Both merged into main.

## harness

- Merged as e6a04df after two fix rounds: a unit test for `test/tree-diff.ts`, a stricter footnote check, and one corpus test per file (the single test timed out under load).
- Readiness flags are `ready.commonmark`, `ready.corpus` and `ready.gfm.*` in `test/parsers.ts`.
- The benchmark loads talata from `dist/`, so run `pnpm --filter talata build` before benchmarks.
- `benchmark/corpus` is git-ignored: each worktree needs a copy or the corpus tests skip.

## core-skeleton

- Merged after three rounds. The worker found the v1 contract draft wrong in 8 places and wrote a change request. Two review rounds probed it against the reference and closed 7 more gaps (paragraph split for tables, interruptible leaves, span-scoped inline resolve, setext start after definitions, list containers with a loop guard, end-of-file quote closing, line restore on failed starts).
- parser-core is frozen at v2. The user approved it at the gate.
- 34 of 45 examples in the three core sections match; the 11 left need later nodes and are listed in `test/core-sections.test.ts`.
- Two test files sit outside the owned paths (`test/core.test.ts`, `test/core-sections.test.ts`); accepted.

## Changes made by the curator

- Briefs updated to parser-core v2: blocks-leaf (setext uses `paragraph.start`), inline-core (`resolveSpan` for links), gfm-tables (`splitParagraph(1)`, `interruptible`), gfm-inline (strikethrough resolve scope), gfm-tasks-footnotes (footnote definitions are a container rule), spec-green (`ready` flags).
- `.claude/` ignored by git and oxlint, because agent worktrees live there.
- Merge policy switched to auto by the user.

## Calibration

- harness: estimated M, took 1 worker session plus 2 short fix rounds.
- core-skeleton: estimated L, took 1 long worker session plus 2 fix rounds and 2 review rounds. Contract nodes need a probing review against the reference before freezing.
