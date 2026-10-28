# Log: differential-fuzz

- Branch feat/differential-fuzz. Worktree had no node_modules; `pnpm install --offline --frozen-lockfile` fixed it.
- Built random, features, check, generate, mutate, shrink, run, cli and fuzz.test under packages/talata/test/fuzz.
- First runs found a false difference: `#######\n-` is a setext heading (7 hashes is not ATX). Fixed `isAtx` in the support filter.
- Pathological inputs of 2000 repeats made 20k documents take 45 s (the reference is slow on them). Capped at 1000 and 3% of documents: 20k documents take 7 s, so 1M is about 6 minutes.
- `--all` run: generators for every feature produce text without crashing; talata differs, as expected.
- Corpus not downloaded in this worktree, so corpus mutation was not exercised. Spec examples are the seed set.
- No 1,000,000 run: the brief ties it to gfm-green.

## Review round 1

- Replay line now prints `--all`, `--no-gfm`, `--no-corpus`. Added `--no-corpus` and `RunOptions.corpus`; the smoke test uses it.
- Fixture replay uses all features; fixtures skipped under `supported` run as `it.fails`. Fixture names carry `-nogfm` and `-all`.
- Added negative controls (`check` takes an optional parser) and feature marker asserts.
- Fixed the 1,000,000 estimate to 10 to 15 minutes.
