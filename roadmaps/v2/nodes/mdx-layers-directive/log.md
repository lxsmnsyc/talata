# Log: mdx-layers-directive

- Collector, `state.document`, text labels through the queue, frontmatter and MDX order edits: about 160 directive tests failed, all with a container around the directive.
- Events of the reference showed why: the prefixes of the containers around interleave with the content's events. Ported the old `closeEnds` into `gaps.ts`, run per content line through a new `Spans.onLine`; the nested root became a tracked container. Plus the end rules for empty last lines and the end-only quote line. All directive suites pass.
- `[directive, mdx]`: the re-read needs the directive closed at its fence line (fence leaf rule); image labels parsed again in the MDX transform need `add` after `run` to run at once; lazy-line places in nested documents come from the spans in `flow.ts` `fail`.
- 18M tree comparison against main: one difference, where main was wrong. Fuzz `--all` and `--all --acorn` at 1M: 0 failures.
