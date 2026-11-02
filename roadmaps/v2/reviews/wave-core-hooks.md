# Wave report: core-hooks

- core-hooks merged in PR #15 (0409119). Fresh review clean, no blocking or should-fix findings.
- Contract `extension` is now v2 and frozen: the change request is copied in and marked accepted.
- Benchmark: three interleaved A/B runs against main with a main-vs-main control, at load 2.4 to 3.2 on 8 cores. Worst result +2.2% (vite-config). node fs.md is slower in every run by 0.8% to 1.8%, against ±0.7% noise. The brief's "load under 1" was not met; the maintainer accepted the result.
- Size: main entry 33022 bytes gzip, 90 bytes under the limit. Only core changes count; directive code lives in its subpath.
- Spend: about 273k tokens (worker 201k, reviewer 72k).

Follow-ups:

- `npx oxlint` fails on main with 20 errors in `.github/scripts/smoke.mjs`. Not from this node. Needs a fix PR.
- Nits left for later: core imports the types `Brackets` and `TaskMark` from rule modules; a nested parse inside a code span or math scan makes the outer leaf rescan.
- ext-directive (later) is unblocked. It rebuilds on the hooks and sets `containerStartsOff = false` inside a directive instead of the `insideRules` copies (see the core-hooks outcome).
