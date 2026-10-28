# Log: perf-pass

- Incident: my first edits went to the main checkout (`/Users/alexis/Documents/GitHub/talata/packages/talata`) because I cd'd to the main path instead of the worktree. The orchestrator reverted them on main (8002ef9). I had also reverted them there once by hand with absolute paths, which was the same mistake. From then on all edits, builds and git ran in the worktree.
- failBracket: the splice moved every delimiter above the bracket. Now the bracket keeps its place and gets marker `DEAD_BRACKET` (0, in `src/core/inline.ts`). `onlyEmphasis` accepts it; the pair loops skip it because it has `canOpen` and `canClose` false. `unbalanced` in `autolink-literal.ts` must not see it as an open bracket, so it checks the marker of the cached bracket.
- No splice left, so `workSteps` has nothing to count for it. The growth test for the input passes, but it would also pass if the splice came back (the count would not change). The timings in `benchmark/RESULTS.md` are the proof.
- Test hooks `emphasisPaths` and `workSteps`: not in the public entry, checked below in the outcome.
- Dead ends: literal autolink flag (no corpus gain, see RESULTS.md); table cell state (noise-sized, not tried).
- Load was 2.4 to 3.0 at the start of each benchmark; another worker kept it near 5 to 6 in between.
