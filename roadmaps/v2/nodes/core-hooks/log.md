# Log: core-hooks

- Branch reset onto `origin/main` as asked. `brief.md` is already on main; not touched.
- Nothing of the seven hooks existed on main. Frontmatter had `dropContainers` and a name list; math had copies of `strip`, the closing-fence test, `trimLineEndings` and the exhausted cache.
- Hooks 1, 2, 3, 5, 6 are small changes in `core/blocks.ts`. Hook 6 is a rule flag (`opensContainer`, set on blockquote, listItem, footnoteDefinition) plus `state.containerStartsOff`; `tryStart` skips flagged rules. The old way swapped `state.rules`.
- Hook 3: removed the early return in `continuesOverEnd`. Still loops over the blocks above the tip only. No core block reads the answer with a container or paragraph tip, so built-in output is unchanged (full suite and fuzz agree).
- Hook 5: set `paragraph` undefined and `lazy` false when `allowsLazy` fails. No built-in container refuses lazy lines.
- Hook 4 analysis: only some module state changes output. Link brackets, strikethrough order, `reached` (lines.ts) and the task marker do. The autolink-literal, raw HTML and code span "exhausted" memos are caches keyed by the state object: a nested call makes the outer leaf rescan, never wrong. So option (a) moves only the first four onto `InlineState` (`brackets`, `reached`, `attentionFirst`, `task`); the caches stay.
- Option (b) built in a scratch copy: a `parseInline` nesting counter, and save/restore functions per module registered in `core/scopes.ts`, called only on nested calls.
- Benchmark, hook 4 (interleaved A/B, 150 rounds, gfm on, median, % vs main; machine load 4 to 5 from other sessions, so noise is about 1%):
  - readmes: a -1.6, b +0.2
  - node-fs: a -0.9, b -0.4
  - node-changelog: a -0.5, b +1.3
  - vite-config: a +1.0, b +0.8
  - Earlier runs, 60 to 80 rounds, flipped signs between 0 and 5% on both. The difference between a and b is inside the noise.
- Picked (a): same speed within noise, no nesting counter, no per-module save/restore code, state is visible on the object. Both pass the two nested cases.
- Test `frontmatter.test.ts` "stay linear with anywhere" is a timing ratio and fails sometimes under load (3.4 vs limit 3 at load 7); passes on rerun, also unrelated to this change.
- Sandbox blocked some compound shell commands; used Python for scratch-dir work.
- Ground truth for the two nested cases came from micromark-extension-directive 4.0.0 and mdast-util-directive 3.1.1 installed in the scratchpad (not in the repo).
- No changeset: the extension interface is internal and tree output is unchanged, so there is nothing for a changelog.
