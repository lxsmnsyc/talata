# Wave 3 report (2026-10-28)

Nodes: spec-green (M, gate), gfm-tables (M), gfm-inline (M), gfm-tasks-footnotes (M). All merged into main.

## Results

- spec-green: every CommonMark spec example and corpus file matches without GFM. The user approved the gate after one round. parser-core v4 frozen. A rough timing put talata 22 to 28 times faster than the reference without GFM.
- gfm-tables: clean first review (110k fuzzed documents, 147 hand cases). Merged after the user allowed fuzz fixtures in shared paths.
- gfm-inline: two rounds (a stack overflow on large input in the transform, an 11% transform cost on prose). The pre-checks were shown to be exact.
- gfm-tasks-footnotes: three rounds (a 314 MB leak from module state, two interaction bugs with gfm-inline, a lost indent in multi-line image footnote labels). It was the first node can-merge sent to auto merge.
- On main: 4927 tests pass, 2 expected fails (the lazy task check, routed to gfm-green). Every GFM flag is on; no corpus file or spec example waits on a feature.

## Contract

parser-core v5 is wording only: autolink positions, input-dependent resolve order, `quoteLine` for any prefix-token container, and GFM transforms allowed.

## Process

- The rtk hook rewrote `git` to `rtk git`, which a worktree guard refuses. A wrapper hook (`~/.claude/hooks/rtk-hook.sh`) now skips rtk for git in agent worktrees; workers commit on their own since gfm-tables.
- Shared paths now include `test/fuzz/fixtures/**` and `contracts/*.change-request.md`, so those files alone no longer send a node to the maintainer.
- Every module-level cache in a rule turned out to keep the last document alive at least once; workers should keep per-document state on the state or in a WeakMap.

## Routed

- gfm-green: lazy task check transform, reference hangs in the fuzzer (`![ \n^n]`), the mixed emphasis/strikethrough slow path, the 1,000,000-document run.
- perf-pass: transform pre-flag from the inline phase, per-cell GC on tables, failed-bracket splice.
- release: README quirks from spec-green, gfm-tables and gfm-inline.
