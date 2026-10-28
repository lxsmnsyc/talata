---
id: perf-pass
title: Reach the speed target
status: done
priority: must
type: feature
outline: false
milestone: m3-release
target:
from:
size: M
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: false
added:
# 2026-10-28: scope cut by the user. The speed target already holds (16.4x and 18.7x); see GOAL.md Decisions.
owns:
  - packages/talata/test/perf-pass*.test.ts
  - benchmark/RESULTS.md
shared:
  - packages/talata/src/**
  - packages/talata/test/inline.test.ts
  - packages/talata/package.json
  - pnpm-lock.yaml
  - packages/talata/test/fuzz/fixtures/**
  - roadmaps/v1/contracts/*.change-request.md
reserves: []
provides: []
depends_on:
  - on: gfm-green
    kind: hard
    why: measures the complete parser, so optimizations do not have to be redone
---

# Reach the speed target

## Goal

Keep talata at least 4 times faster than "mdast + gfm" on the README corpus and `node fs.md`, remove the known quadratic case, and record before and after numbers.

## Context

The target already holds on one run (GOAL.md Decisions, 2026-10-28): 16.4x on the READMEs, 18.7x on `node fs.md`, 21.1x on CHANGELOG_V22. This node no longer has to find speed. It has to make the slow inputs linear and keep the numbers honest.

Must do:

- `failBracket` in `src/inline/link.ts` (about lines 194 to 200) splices `state.delimiters` and becomes quadratic when a failed bracket sits under many delimiters: `'[*a '.repeat(n/8) + ' a*]'.repeat(n/8)` takes 41 ms at 50 KB and 660 ms at 100 KB. Mark the bracket dead instead of splicing, add the input to the growth tests, and count splice lengths in `workSteps`.
- Keep the test hooks `emphasisPaths` and `workSteps` out of the public bundle. The bundle-size node measures that bundle at the same time as this node runs.

Try, and keep only with a measured gain larger than the noise (perf-pass skill, side by side):

- Tables: 58% of the time on table-heavy documents is garbage collection from per-cell inline state (`createInlineState`, `state.inline`, a 2-element range array per cell in `src/gfm/table.ts`, about line 330).
- Literal autolinks: the transform costs about 9% of GFM parse time on prose, mostly walking text nodes that cannot match. Let the inline rule flag the document when it sees a `www.`, `://` or `@` candidate and run the transform only then.

Already done in gfm-green, do not redo: the mixed emphasis and strikethrough quadratic case.

Do not edit `src/inline/entities.ts` or the `exports` of `packages/talata/package.json`. The bundle-size node owns them in this wave.

Benchmarks need a quiet machine. Another worker runs at the same time, so run `interleaved` only when `uptime` shows a 1-minute load under 3, and note the load next to each number. Record before and after numbers in `benchmark/RESULTS.md`.

## Acceptance

- [ ] `pnpm --filter benchmark interleaved` meets the target on two runs, after the last code change.
- [ ] The `failBracket` input grows linearly in the growth tests.
- [ ] `benchmark/RESULTS.md` has before and after numbers, with the load for each run.
- [ ] `pnpm --filter talata fuzz --count 200000 --seed 4041 --max-failures 10` gives 0 failures after the last code change.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: one known quadratic fix, two optional measured changes and a results file.
