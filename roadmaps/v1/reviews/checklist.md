# Blindspot checklist

- Data and migrations: N/A. A pure function from text to tree.
- Compatibility: the reference parser's output is the contract, checked by tree equality in every test.
- Auth and permissions: N/A.
- Failure modes: talata must never throw on any input; the fuzzer checks this alongside equality.
- Concurrency: N/A. Synchronous and stateless.
- Limits: deep nesting (block quotes and lists 1,000 levels deep) and pathological inputs (long runs of `*` or `[`) must stay linear or close to it. Added to differential-fuzz's generator.
- Security: untrusted Markdown is the normal input. No regular expressions with backtracking in hot paths; the fuzzer includes pathological inputs.
- Observability: N/A for a library. The benchmark covers speed.
- Performance: baseline in `benchmark/BASELINE.md`, target in `GOAL.md`, measured by perf-pass.
- Testing: spec, GFM spec, corpus, differential fuzzing.
- Developer experience: README, the unified plugin, and a documented list of differences from the reference.
- Rollout: 0.x versions on npm.
- Cleanup: remove the `READY` flag once spec-green sets it.
- Coverage: mapped in `GOAL.md`.
- Dependencies: none at runtime. Dev only: the reference parser and spec fixtures.
