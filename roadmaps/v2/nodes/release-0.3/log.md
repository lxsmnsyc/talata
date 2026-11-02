# Log: release-0.3

- Branch release/release-0.3 reset to origin/main (de06f21). No README directive coverage and no minor changeset existed.
- Added `.changeset/ext-directive.md` (minor), a Directives section and table row in `packages/talata/README.md`, and new size and speed tables.
- Did not touch `docs/migration.md` (PR #25). The README links to `#directives`.
- `pnpm --filter benchmark corpus` was needed first: the worktree had no corpus. It fetched 174 READMEs, so the table row now says 174 files, 1.5 MB (it said 139, 1.1 MB).
- Interleaved ran at load average 8 to 25 from other sessions. Ratios 24.0x, 22.0x, 23.2x. Absolute times are inflated.
- Fuzz `--seed 20261301 --count 1000000 --all`: 2 failures, both with directive containers in quotes (see outcome). Not fixed: out of scope for this node. Fixture files were deleted, not committed.

## Resume (after fix-directive-quote-end and fix-directive-nesting)

- Merged origin/main (f5ea091, 027839f, PR #25). Fast check: 6759 tests pass, tsc clean, oxlint 0 errors, oxfmt clean.
- Size and interleaved reran at load under 6. The README speed table and intro now say 17.4x, 18.3x, 21.2x (the first pass ran at load 8 to 25, which inflated the ratios). `talata/directive` is 19.4 KB gzip. Main entry is unchanged at 33.2 KB gzip.
- Fuzz seed 20261401, four chunks of 250,000 (`--start` 0, 250000, 500000, 750000), `--all`: 1,000,000 compared, 0 failures.
