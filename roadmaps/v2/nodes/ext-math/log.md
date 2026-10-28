# Log: ext-math

- Math text (`src/ext/math/text.ts`) is `src/inline/code-span.ts` with `$` for the backtick: same padding strip, same split-tab handling, same "no closer" cache. micromark-extension-math ends the run with `previous` (no `$` right after a `$` unless an escape came between); the whole-run consumption of the rule gives the same result. `singleDollarTextMath: false` turns a run of one `$` into text.
- Math flow (`src/ext/math/flow.ts`) is `src/blocks/code-fenced.ts` with `$` fences of 2 or more, a meta that may not hold `$`, and the `math` node with `data`. Priority 350, can interrupt a paragraph. The meta goes through `decodeString` as the reference reads it as string content. It is not trimmed.
- Both files copy private helpers (`strip`, `trimLineEndings`, closing fence test) because core files may not change. They could move to a shared module in a later core change.
- The first fuzz run (20000 documents) and the 200000 run found 0 differences with no rule changes after the first draft.
- The shared tests `test/ext-api.test.ts` (stub extensions give the same tree) and `test/ext-api-bundle.test.ts` (subpath closure under 5000 bytes) assume the stubs. They fail for `talata/math` now. Not edited; the orchestrator decides.
- `pnpm --filter benchmark size`: main entry 32826 bytes gzip against 32777 on main (92646 against 92639 minified). The rise comes from chunk splitting: the helpers math imports become cross-chunk exports.
